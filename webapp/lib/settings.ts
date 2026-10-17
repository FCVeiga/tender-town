/**
 * Settings data: platform agents (agent_settings) and scopes (lib/scopes.ts) —
 * each scope's instructions, context documents, search and agents.
 */
import { readFile } from 'fs/promises';
import path from 'path';
import { getSupabaseServerClient } from '@/lib/supabase';
import { getPlatformLanguage } from '@/lib/language';
import { SCOPE_AGENT_KEYS, getScope, getViewScopes } from '@/lib/scopes';

export const DOC_KINDS = [
  { kind: 'presentation', label: 'Commercial presentations', hint: 'Decks, one-pagers, brochures' },
  { kind: 'reference', label: 'Contracts & project references', hint: 'Contracts, reference letters, case studies' },
  { kind: 'cv', label: 'Team CVs', hint: 'Your bid team' },
] as const;
export type DocKind = (typeof DOC_KINDS)[number]['kind'];

export type AgentSetting = {
  agent_key: string; enabled: boolean; instructions: string | null; prompt_override: string | null;
  default_prompt?: string | null; status: string | null; error: string | null; updated_at: string | null;
};
export type ScopeDoc = { id: string; kind: string; name: string; size_bytes: number | null; chars: number | null; uploaded_at: string };

/** Platform agents' settings, plus every agent's default prompt (synced by the pipeline). */
export async function getAgentDefaults() {
  const { data } = await getSupabaseServerClient().from('agent_settings').select('*');
  return new Map(((data || []) as AgentSetting[]).map((a) => [a.agent_key, a]));
}

/** `workspaceId` set: that workspace's files on a shared scope. Omit it for a custom scope's own files. */
export async function getScopeDocs(scopeId: string, workspaceId?: string | null): Promise<ScopeDoc[]> {
  let q = getSupabaseServerClient().from('company_documents').select('id, kind, name, size_bytes, chars, uploaded_at')
    .eq('scope_id', scopeId).order('uploaded_at', { ascending: false });
  q = workspaceId ? q.eq('workspace_id', workspaceId) : q.is('workspace_id', null);
  const { data } = await q;
  return (data || []) as ScopeDoc[];
}

/** Agents shown under "Working Agents": the scope agents that are on for the viewer. */
export async function workingAgentKeys(): Promise<Set<string>> {
  const db = getSupabaseServerClient();
  const { scopes } = await getViewScopes();
  const { data: scoped } = scopes.length
    ? await db.from('scope_agent_settings').select('scope_id, agent_key, enabled').in('scope_id', scopes.map((s) => s.id))
    : { data: [] as any[] };
  const keys = new Set<string>();
  for (const key of SCOPE_AGENT_KEYS) {
    const on = scopes.some((s) => (scoped || []).find((r: any) => r.scope_id === s.id && r.agent_key === key)?.enabled ?? true);
    if (on) keys.add(key);
  }
  return keys;
}

/** Is an agent on? Scope agents need the scope; platform agents don't. */
export async function isAgentEnabled(key: string, scopeId?: string) {
  const db = getSupabaseServerClient();
  if (SCOPE_AGENT_KEYS.includes(key) && scopeId) {
    const { data } = await db.from('scope_agent_settings').select('enabled').eq('scope_id', scopeId).eq('agent_key', key).maybeSingle();
    return data?.enabled ?? true;
  }
  const { data } = await db.from('agent_settings').select('enabled').eq('agent_key', key).maybeSingle();
  return data?.enabled ?? true;
}

/**
 * The agent's system prompt: the scope's fine-tuned version (scope agents) or
 * the platform's (platform agents) when there is one, else the file in
 * agents/; with the scope's name and the platform language filled in.
 */
export async function agentPrompt(key: string, file: string, scopeId?: string, companyName?: string) {
  const db = getSupabaseServerClient();
  const scope = scopeId ? await getScope(scopeId) : (await getViewScopes()).scopes[0] ?? null;
  const [{ data }, fallback, language] = await Promise.all([
    SCOPE_AGENT_KEYS.includes(key) && scope
      ? db.from('scope_agent_settings').select('prompt_override').eq('scope_id', scope.id).eq('agent_key', key).maybeSingle()
      : db.from('agent_settings').select('prompt_override').eq('agent_key', key).maybeSingle(),
    readFile(path.join(process.cwd(), 'agents', file), 'utf8'),
    getPlatformLanguage(),
  ]);
  return (data?.prompt_override || fallback).replaceAll('{company_name}', companyName || scope?.name || 'your organisation').replaceAll('{language}', language.name);
}

const BRIEF_CHARS = { context: 30_000, docs: 160_000 };

/** A workspace that arrived through "find a tender" is scored as that company, not the shared scope. */
export async function namedCompany(scopeId: string, workspaceId: string | null) {
  if (!workspaceId) return undefined;
  const { data } = await getSupabaseServerClient().from('company_documents').select('text_content')
    .eq('scope_id', scopeId).eq('workspace_id', workspaceId).eq('name', 'Company note').limit(1).maybeSingle();
  const line = String(data?.text_content || '').split('\n')[0].trim();
  return line ? line.slice(0, 80) : undefined;
}

/**
 * What the agents know for a scope: its instructions (the default scope falls
 * back on agents/company_brief.md while it has none), plus — for the Tender
 * Evaluation and Proposal Manager agents — the text of its context documents.
 */
export async function companyBrief({ withDocuments, scopeId, workspaceId }: { withDocuments: boolean; scopeId: string; workspaceId?: string | null }) {
  const db = getSupabaseServerClient();
  const scope = await getScope(scopeId);
  const shared = !!(scope?.isDefault || scope?.catalog);
  let docs: { kind: string; name: string; text_content: string | null }[] = [];
  if (withDocuments && (!shared || workspaceId)) {
    let q = db.from('company_documents').select('kind, name, text_content').eq('scope_id', scopeId).order('kind');
    q = shared && workspaceId ? q.eq('workspace_id', workspaceId) : q.is('workspace_id', null);
    const { data } = await q;
    docs = data || [];
  }
  // The onboarding note is this workspace's company. It replaces the shared scope's own brief.
  const ownCompany = docs.some((d) => d.name === 'Company note' && d.text_content);
  const instructions = ownCompany ? '' : (scope?.instructions?.trim()
    || (scope?.isDefault ? await readFile(path.join(process.cwd(), 'agents', 'company_brief.md'), 'utf8') : ''));
  const parts = ownCompany
    ? ['# The company']
    : [`# Scope: ${scope?.name ?? 'Untitled'}`, instructions.slice(0, BRIEF_CHARS.context) || '(No scope instructions yet.)'];
  if (docs.length) {
    let budget = BRIEF_CHARS.docs;
    for (const k of DOC_KINDS) {
      const items = (docs || []).filter((d: any) => d.kind === k.kind && d.text_content);
      if (!items.length) continue;
      parts.push(`\n## ${k.label} (${items.length})`);
      // Share the budget evenly so one long deck can't crowd out the CVs.
      const share = Math.floor(budget / Math.max(1, items.length));
      for (const d of items) {
        const body = String(d.text_content).slice(0, Math.min(share, 40_000));
        parts.push(`\n### ${d.name}\n${body}`);
        budget -= body.length;
      }
    }
  }
  return parts.join('\n');
}
