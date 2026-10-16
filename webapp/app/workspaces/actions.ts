'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { readFile } from 'fs/promises';
import path from 'path';
import { getSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { AGENTS, agentByKey } from '@/lib/agents';
import { DOC_KINDS } from '@/lib/settings';
import { PLATFORM_AGENT_KEYS, SCOPE_AGENT_KEYS, getEditableScope, getViewableScope, replacesCatalogPick, workspaceScopeUse } from '@/lib/scopes';
import { getContext, getMembership, getWorkspaceContext, getMyWorkspaces, getPersonalAccount, isPlatformAdmin } from '@/lib/accounts';
import { randomBytes } from 'crypto';
import { siteOrigin } from '@/lib/auth';
import { getT } from '@/lib/i18n/server';
import { newsReportAllowance } from '@/lib/newsQuota';
import { planIncludes } from '@/lib/plans';
import { fileText } from '@/lib/fileText';
import {
  friendlyError, parseSearchScope, tuneJson, tunePrompt, validateDocumentsConfig, validatePrompt, validateSearchConfig,
} from '@/lib/configAgent';

export type FormState = { ok: boolean; message: string; link?: string } | null;
const BUCKET = 'company-files';
const MAX_BYTES = 50 * 1024 * 1024;
const FILE_TYPES = /\.(pdf|docx|pptx|xlsx|txt|md|csv)$/i;
const db = () => getSupabaseServerClient();
const NOT_YOURS_MESSAGE = 'Only this workspace’s admins can change it (on a plan that allows customizing).';
const notYours = async () => ({ ok: false, message: (await getT())(NOT_YOURS_MESSAGE) });

/** The signed-in user and a scope they may configure (null otherwise). */
async function own(scopeId: string) {
  const user = await getCurrentUser();
  if (!user) return null;
  const scope = await getEditableScope(scopeId);
  return scope ? { user, scope } : null;
}

const refresh = (scopeId?: string) => {
  revalidatePath('/workspaces');
  if (scopeId) revalidatePath(`/workspaces/scopes/${scopeId}`);
};

/* ---------------- Scopes ---------------- */

/** New scope in a workspace — admins, within the owner's plan's number of scopes. */
export async function createScope(workspaceId: string) {
  const ctx = await getWorkspaceContext(workspaceId);
  if (!ctx) redirect('/workspaces');
  if (!ctx.canCustomize) redirect('/settings/account?plan=1');
  const use = await workspaceScopeUse(ctx.workspace.id);
  if (!ctx.isDefault && use.custom + use.pickIds.length >= ctx.plan.scopes) redirect('/settings/account?plan=1');
  const { data, error } = await db().from('scopes').insert({ owner_id: (await getCurrentUser())!.id, workspace_id: ctx.workspace.id, name: 'New scope', active: true })
    .select('id').single();
  if (error || !data) throw new Error(error?.message || 'Could not create the scope.');
  revalidatePath('/', 'layout');
  redirect(`/workspaces/scopes/${data.id}`);
}

export async function setScopeActive(scopeId: string, active: boolean): Promise<{ error?: string }> {
  const o = await own(scopeId);
  const t = await getT();
  if (!o) return { error: t(NOT_YOURS_MESSAGE) };
  if (o.scope.catalog) return { error: t('Switch this scope on from the workspace.') };
  if (o.scope.isDefault && !active) return { error: t('Turn on another scope before switching off the default.') };
  await db().from('scopes').update({ active, updated_at: new Date().toISOString() }).eq('id', scopeId);
  revalidatePath('/', 'layout');
  return {};
}

/** Turn a shared catalog scope on or off for this workspace. Uses a scope slot on every plan, including Free. */
export async function setCatalogPick(workspaceId: string, scopeId: string, on: boolean): Promise<{ error?: string; upgrade?: boolean }> {
  const ctx = await getWorkspaceContext(workspaceId);
  const t = await getT();
  if (!ctx?.isAdmin) return { error: t(NOT_YOURS_MESSAGE) };
  const { data: scope } = await db().from('scopes').select('id, catalog, active').eq('id', scopeId).maybeSingle();
  if (!scope?.catalog || !scope.active) return { error: t(NOT_YOURS_MESSAGE) };
  if (!on) {
    await db().from('workspace_scope_picks').delete().eq('workspace_id', workspaceId).eq('scope_id', scopeId);
    revalidatePath('/', 'layout');
    return {};
  }
  const use = await workspaceScopeUse(workspaceId);
  if (use.pickIds.includes(scopeId)) return {};
  const limit = ctx.isDefault ? 1000 : ctx.plan.scopes;
  const replacing = replacesCatalogPick(limit, use.custom, use.pickIds.length);
  if (!replacing && use.custom + use.pickIds.length >= limit) return { upgrade: true };
  if (replacing) {
    const { error: removed } = await db().from('workspace_scope_picks').delete().eq('workspace_id', workspaceId).neq('scope_id', scopeId);
    if (removed) return { error: removed.message };
  }
  const { error } = await db().from('workspace_scope_picks').upsert(
    { workspace_id: workspaceId, scope_id: scopeId }, { onConflict: 'workspace_id,scope_id', ignoreDuplicates: true });
  if (error) return { error: error.message };
  revalidatePath('/', 'layout');
  return {};
}

/** Hide or show the shared default scope for this workspace. Only while another scope of theirs is on. */
export async function setShowDefault(workspaceId: string, show: boolean): Promise<{ error?: string }> {
  const ctx = await getWorkspaceContext(workspaceId);
  const t = await getT();
  if (!ctx?.isAdmin) return { error: t(NOT_YOURS_MESSAGE) };
  if (!show) {
    const [{ count }, use] = await Promise.all([
      db().from('scopes').select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId).eq('active', true).eq('is_default', false).eq('catalog', false),
      workspaceScopeUse(workspaceId),
    ]);
    if (!count && !use.pickIds.length) return { error: t('Turn on another scope before switching off the default.') };
  }
  const { error } = await db().from('workspaces').update({ show_default: show }).eq('id', workspaceId);
  if (error) return { error: error.message };
  revalidatePath('/', 'layout');
  return {};
}

export async function saveScope(_prev: FormState, form: FormData): Promise<FormState> {
  const scopeId = String(form.get('scope') || '');
  const o = await own(scopeId);
  if (!o) return notYours();
  const t = await getT();
  const name = String(form.get('name') || '').trim().slice(0, 120);
  const instructions = String(form.get('instructions') || '').trim().slice(0, 30_000);
  if (!name) return { ok: false, message: t('Give the scope a name.') };
  await db().from('scopes').update({ name, instructions: instructions || null, updated_at: new Date().toISOString() }).eq('id', scopeId);
  revalidatePath('/', 'layout');
  return { ok: true, message: t('Saved — the scope’s agents use it from their next run.') };
}

export async function deleteScope(_prev: FormState, form: FormData): Promise<FormState> {
  const scopeId = String(form.get('scope') || '');
  const o = await own(scopeId);
  if (!o) return notYours();
  const t = await getT();
  if (o.scope.isDefault) return { ok: false, message: t('This is the platform’s default scope (what visitors see) — it can’t be deleted.') };
  if (o.scope.catalog) return { ok: false, message: t('This scope is shared with every account — it can’t be deleted.') };
  if (String(form.get('confirm') || '').trim() !== o.scope.name) return { ok: false, message: t('Type {name} to confirm.', { name: o.scope.name }) };
  const { data: docs } = await db().from('company_documents').select('storage_path').eq('scope_id', scopeId);
  if (docs?.length) await db().storage.from(BUCKET).remove(docs.map((d: any) => d.storage_path));
  await db().from('scopes').delete().eq('id', scopeId);
  revalidatePath('/', 'layout');
  redirect(`/workspaces/${o.scope.workspaceId}`);
}

/* ---------------- Scope context (documents) ---------------- */

/**
 * Who may add context files. A custom scope: its workspace admins. A shared scope:
 * an admin of the workspace the files belong to. The files never land on the shared row.
 */
async function docAccess(scopeId: string, workspaceId?: string | null) {
  const scope = await getViewableScope(scopeId);
  if (!scope) return null;
  if (scope.isDefault || scope.catalog) {
    if (!workspaceId) return null;
    const member = await getMembership(workspaceId);
    if (!member || member.role !== 'admin') return null;
    return { workspaceId };
  }
  if (workspaceId || !scope.editable) return null;
  return { workspaceId: null as string | null };
}

/** Step 1 of an upload: a one-time URL the browser sends the file to, straight to storage. */
export async function createCompanyUpload(scopeId: string, kind: string, filename: string, size: number, workspaceId?: string | null) {
  const t = await getT();
  const access = await docAccess(scopeId, workspaceId);
  if (!access) return { error: t('not your scope') };
  if (!DOC_KINDS.some((k) => k.kind === kind)) return { error: t('unknown document type') };
  if (!FILE_TYPES.test(filename)) return { error: t('use PDF, Word, PowerPoint, Excel or text files') };
  if (size > MAX_BYTES) return { error: t('files up to 50 MB') };
  const safe = filename.normalize('NFKD').replace(/[^\w.\-]+/g, '_').slice(-120);
  const folder = access.workspaceId ? `${scopeId}/ws/${access.workspaceId}` : scopeId;
  const storagePath = `${folder}/${kind}/${crypto.randomUUID()}-${safe}`;
  const { data, error } = await db().storage.from(BUCKET).createSignedUploadUrl(storagePath);
  if (error || !data) return { error: error?.message || t('could not start the upload') };
  return { path: storagePath, url: data.signedUrl };
}

/** Step 2: read the uploaded file's text for the agents and list it. */
export async function registerCompanyDocument(scopeId: string, kind: string, storagePath: string, name: string, size: number, workspaceId?: string | null) {
  const t = await getT();
  const access = await docAccess(scopeId, workspaceId);
  if (!access) return { error: t('not your scope') };
  const folder = access.workspaceId ? `${scopeId}/ws/${access.workspaceId}` : scopeId;
  if (!DOC_KINDS.some((k) => k.kind === kind) || !storagePath.startsWith(`${folder}/${kind}/`)) return { error: t('unknown upload') };
  const { data: blob, error } = await db().storage.from(BUCKET).download(storagePath);
  if (error || !blob) return { error: error?.message || t('upload not found') };
  let text = '';
  try { text = (await fileText(name, Buffer.from(await blob.arrayBuffer()))).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim(); }
  catch { /* stored anyway; listed as unreadable */ }
  const { error: insertError } = await db().from('company_documents').insert({
    scope_id: scopeId, workspace_id: access.workspaceId, kind, name: name.slice(0, 300), storage_path: storagePath, size_bytes: size,
    text_content: text.slice(0, 400_000) || null, chars: text.length,
  });
  if (insertError) return { error: insertError.message };
  refresh(scopeId);
  return { ok: true, chars: text.length };
}

export async function deleteCompanyDocument(id: string) {
  const { data } = await db().from('company_documents').select('storage_path, scope_id, workspace_id').eq('id', id).maybeSingle();
  if (!data?.scope_id || !(await docAccess(data.scope_id, data.workspace_id))) return;
  await db().storage.from(BUCKET).remove([data.storage_path]);
  await db().from('company_documents').delete().eq('id', id);
  refresh(data.scope_id);
}

/* ---------------- Search Agent (per scope) ---------------- */

/** The scope's search scope: saved as written, then parsed by the Config Agent into its search configuration. */
export async function saveSearchScope(_prev: FormState, form: FormData): Promise<FormState> {
  const scopeId = String(form.get('scopeId') || '');
  const o = await own(scopeId);
  if (!o) return notYours();
  const tr = await getT();
  const text = String(form.get('scope') || '').trim().slice(0, 8000);
  const now = new Date().toISOString();
  if (!text && o.scope.searchConfig?.mode === 'generic') return { ok: true, message: tr('Nothing to change — this scope uses the generic ranking.') };
  if (!text) {
    await db().from('scopes').update({ search_scope: null, search_config: null, search_status: null, search_error: null, updated_at: now }).eq('id', scopeId);
    refresh(scopeId);
    return { ok: true, message: tr('Cleared — this scope searches with the built-in EUDI Wallet configuration.') };
  }
  try {
    const { data: triage } = await db().from('agent_settings').select('default_prompt').eq('agent_key', 'triage').maybeSingle();
    const config = await parseSearchScope(text, triage?.default_prompt || '');
    await db().from('scopes').update({ search_scope: text, search_config: config, search_status: 'applied', search_error: null, search_parsed_at: now, updated_at: now }).eq('id', scopeId);
    refresh(scopeId);
    return { ok: true, message: 'ted_phrases' in config
      ? tr('Applied — {ted} TED phrases, {web} web and {news} news queries, from the next run.', { ted: config.ted_phrases.length, web: config.web_queries.length, news: config.news_queries.length })
      : tr('Applied from the next run.') };
  } catch (e) {
    const message = friendlyError(e);
    await db().from('scopes').update({ search_scope: text, search_status: 'error', search_error: message, updated_at: now }).eq('id', scopeId);
    refresh(scopeId);
    return { ok: false, message: tr('Saved your text, but the Config Agent couldn’t apply it: {message}. The previous configuration stays in use.', { message }) };
  }
}

/* ---------------- Agents: scope agents and platform agents ---------------- */

async function defaultPrompt(key: string) {
  const { data } = await db().from('agent_settings').select('default_prompt').eq('agent_key', key).maybeSingle();
  if (data?.default_prompt) return data.default_prompt as string;
  const file = agentByKey(key).prompt;  // webapp agents can read their own file
  return file?.startsWith('webapp/') ? readFile(path.join(process.cwd(), file.slice(7)), 'utf8') : null;
}

/** Where an agent's settings live: the scope's row, or the workspace agents' (platform admins only). Null when not allowed. */
async function target(key: string, scopeId: string | null) {
  const user = await getCurrentUser();
  if (!user || !AGENTS.some((a) => a.key === key)) return null;
  if (SCOPE_AGENT_KEYS.includes(key)) {
    if (!scopeId || !(await getEditableScope(scopeId))) return null;
    return {
      read: () => db().from('scope_agent_settings').select('*').eq('scope_id', scopeId).eq('agent_key', key).maybeSingle(),
      write: (v: Record<string, any>) => db().from('scope_agent_settings').upsert({ scope_id: scopeId, agent_key: key, ...v, updated_at: new Date().toISOString() }),
    };
  }
  if (!PLATFORM_AGENT_KEYS.includes(key) || !(await isPlatformAdmin())) return null;
  return {
    read: () => db().from('agent_settings').select('*').eq('agent_key', key).maybeSingle(),
    write: (v: Record<string, any>) => db().from('agent_settings').upsert({ agent_key: key, ...v, updated_at: new Date().toISOString() }),
  };
}

export async function setAgentEnabled(key: string, enabled: boolean, scopeId: string | null = null) {
  const t = await target(key, scopeId);
  if (!t) return;
  if (key === 'news_report' && enabled && (await newsReportAllowance()).block === 'plan') return;
  const plan = (await getContext())?.plan;
  if (key === 'tender_evaluation' && enabled && !planIncludes(plan?.evaluationsPerMonth)) return;
  if (key === 'proposal_manager' && enabled && !planIncludes(plan?.proposalsPerMonth)) return;
  await t.write({ enabled });
  revalidatePath('/', 'layout');
}

/** Fine-tuning in plain language → the Config Agent rewrites the agent's prompt (for that scope, or the platform). */
export async function saveAgentTuning(_prev: FormState, form: FormData): Promise<FormState> {
  const key = String(form.get('agent') || '');
  const scopeId = String(form.get('scopeId') || '') || null;
  const agent = AGENTS.find((a) => a.key === key && a.fineTune);
  const t = agent && await target(key, scopeId);
  if (!agent || !t) return notYours();
  const tr = await getT();
  const instructions = String(form.get('instructions') || '').trim().slice(0, 6000);
  if (!instructions) {
    await t.write({ instructions: null, prompt_override: null, status: null, error: null });
    refresh(scopeId ?? undefined);
    return { ok: true, message: tr('Back to the default configuration.') };
  }
  const base = await defaultPrompt(key);
  if (!base) return { ok: false, message: tr('This agent’s default configuration hasn’t been synced yet — it is after the next pipeline run.') };
  const { data: row } = await t.read();
  try {
    // From the agent's current configuration, so hand edits made in "Open config" are kept.
    const current = row?.prompt_override || base;
    const { prompt, note } = key === 'tender_documents'
      ? await tuneJson(agent.name, agent.role, current, instructions).then((r) => ({ prompt: JSON.stringify(r.config, null, 2), note: r.note }))
      : await tunePrompt(agent.name, agent.role, base, current, instructions);
    await t.write({ instructions, prompt_override: prompt, status: 'applied', error: null });
    refresh(scopeId ?? undefined);
    return { ok: true, message: note ? tr('Applied. {note}', { note }) : tr('Applied — the agent uses its new configuration from its next run.') };
  } catch (e) {
    const message = friendlyError(e);
    await t.write({ instructions, status: 'error', error: message });
    refresh(scopeId ?? undefined);
    return { ok: false, message: tr('Saved your text, but the Config Agent couldn’t apply it: {message}. The agent keeps its current configuration.', { message }) };
  }
}

/** "Open config" → Save: the configuration as edited by hand becomes the one the agent runs on. */
export async function saveAgentConfig(_prev: FormState, form: FormData): Promise<FormState> {
  const key = String(form.get('agent') || '');
  const scopeId = String(form.get('scopeId') || '') || null;
  // Browsers submit textareas with CRLF line breaks; the prompts use LF.
  const config = String(form.get('config') || '').replace(/\r\n?/g, '\n');
  const tr = await getT();
  if (!AGENTS.some((a) => a.key === key && (a.fineTune || a.key === 'search'))) return { ok: false, message: tr('This agent has no editable configuration.') };
  const now = new Date().toISOString();
  if (key === 'search') {
    if (!scopeId || !(await own(scopeId))) return notYours();
    let parsed;
    try { parsed = validateSearchConfig(JSON.parse(config)); }
    catch (e: any) { return { ok: false, message: tr('Not saved: {reason}.', { reason: e instanceof SyntaxError ? tr('that isn’t valid JSON') : e.message }) }; }
    await db().from('scopes').update({ search_config: parsed, search_status: 'applied', search_error: null, search_parsed_at: now, updated_at: now }).eq('id', scopeId);
    refresh(scopeId);
    return { ok: true, message: tr('Saved — this scope’s Search and Triage Agents use it from the next run.') };
  }
  const t = await target(key, scopeId);
  if (!t) return notYours();
  const base = await defaultPrompt(key);
  if (!base) return { ok: false, message: tr('This agent’s default configuration hasn’t been synced yet.') };
  let value = config;
  try {
    if (key === 'tender_documents') value = JSON.stringify(validateDocumentsConfig(JSON.parse(config)), null, 2);
    else validatePrompt(base, config);
  } catch (e: any) { return { ok: false, message: tr('Not saved: {reason}.', { reason: e instanceof SyntaxError ? tr('that isn’t valid JSON') : e.message }) }; }
  const same = key === 'tender_documents' ? JSON.stringify(JSON.parse(value)) === JSON.stringify(JSON.parse(base)) : value.trim() === base.trim();
  await t.write({ prompt_override: same ? null : value, status: same ? null : 'applied', error: null });
  refresh(scopeId ?? undefined);
  return { ok: true, message: same ? tr('Matches the default — the agent runs on its default configuration.') : tr('Saved — the agent uses this configuration from its next run.') };
}

/** Back to the built-in configuration (and no fine-tuning). */
export async function resetAgentConfig(key: string, scopeId: string | null = null) {
  if (key === 'search') {
    if (!scopeId || !(await own(scopeId))) return;
    await db().from('scopes').update({ search_scope: null, search_config: null, search_status: null, search_error: null }).eq('id', scopeId);
  } else {
    const t = await target(key, scopeId);
    if (!t) return;
    await t.write({ instructions: null, prompt_override: null, status: null, error: null });
  }
  refresh(scopeId ?? undefined);
}

/* ---------------- Workspaces ---------------- */

/** Make a workspace the one the whole site shows (any workspace the user is in). */
export async function switchWorkspace(workspaceId: string, next?: string) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (await getMembership(workspaceId)) await db().from('profiles').update({ current_workspace_id: workspaceId }).eq('id', user.id);
  revalidatePath('/', 'layout');
  redirect(next && next.startsWith('/') && !next.startsWith('//') ? next : '/');
}

/** A new workspace of your own (Teams: unlimited; other plans: one). You're its admin; the site switches to it. */
export async function createWorkspace(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const t = await getT();
  if (!user) return { ok: false, message: t('Log in first.') };
  const name = String(form.get('name') || '').trim().slice(0, 80);
  if (name.length < 2) return { ok: false, message: t('Give the workspace a name.') };
  const account = await getPersonalAccount(user.id);
  if (!account) return { ok: false, message: t('Your account isn’t set up yet.') };
  const owned = (await getMyWorkspaces()).filter((m) => m.workspace.ownerId === user.id && !m.isDefault).length;
  if (account.plan.workspaces !== null && owned >= account.plan.workspaces) {
    return { ok: false, message: account.plan.workspaces === 1
      ? t('The {plan} plan has {n} workspace — Teams has unlimited workspaces.', { plan: account.plan.name, n: account.plan.workspaces })
      : t('The {plan} plan has {n} workspaces — Teams has unlimited workspaces.', { plan: account.plan.name, n: account.plan.workspaces }) };
  }
  const { data: ws, error } = await db().from('workspaces').insert({ account_id: account.id, owner_id: user.id, name, created_by: user.id }).select('id').single();
  if (error || !ws) return { ok: false, message: error?.message || t('Could not create the workspace.') };
  await db().from('workspace_members').insert({ workspace_id: ws.id, user_id: user.id, role: 'admin' });
  await db().from('profiles').update({ current_workspace_id: ws.id }).eq('id', user.id);
  revalidatePath('/', 'layout');
  redirect(`/workspaces/${ws.id}`);
}

export async function renameWorkspace(workspaceId: string, name: string) {
  const m = await getMembership(workspaceId);
  if (!m || m.role !== 'admin' || name.trim().length < 2) return;
  await db().from('workspaces').update({ name: name.trim().slice(0, 80) }).eq('id', workspaceId);
  revalidatePath('/', 'layout');
}

/** Delete a workspace you own (not your last one, not the default scope's). */
export async function deleteWorkspace(workspaceId: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  const mine = await getMyWorkspaces();
  const m = mine.find((x) => x.workspace.id === workspaceId);
  const t = await getT();
  if (!user || !m || m.workspace.ownerId !== user.id) return { error: t('Only the workspace’s owner can delete it.') };
  if (m.isDefault) return { error: t('This workspace holds the default scope.') };
  if (mine.filter((x) => x.workspace.ownerId === user.id && !x.isDefault).length <= 1) return { error: t('You keep at least one workspace.') };
  // Its scopes go with it (cascade); their uploaded files are removed from storage first.
  const { data: scopes } = await db().from('scopes').select('id').eq('workspace_id', workspaceId);
  const ids = (scopes || []).map((x: any) => x.id);
  const { data: docs } = ids.length ? await db().from('company_documents').select('storage_path').in('scope_id', ids) : { data: [] as any[] };
  if (docs?.length) await db().storage.from(BUCKET).remove(docs.map((d: any) => d.storage_path));
  await db().from('workspaces').delete().eq('id', workspaceId);
  await db().from('profiles').update({ current_workspace_id: null }).eq('current_workspace_id', workspaceId);
  revalidatePath('/', 'layout');
  redirect('/workspaces');
}

/* ---------------- Members (Teams) ---------------- */

/** An invitation link to this workspace (as admin or member). The owner must be on Teams. */
export async function inviteMember(_prev: FormState, form: FormData): Promise<FormState> {
  const workspaceId = String(form.get('workspace') || '');
  const m = await getMembership(workspaceId);
  const t = await getT();
  if (!m || m.role !== 'admin') return { ok: false, message: t('Only this workspace’s admins can add people.') };
  if (m.plan.key !== 'teams') return { ok: false, message: t('Adding team members needs the Teams plan.') };
  const email = String(form.get('email') || '').trim().toLowerCase().slice(0, 200) || null;
  const role = form.get('role') === 'admin' ? 'admin' : 'member';
  const account = await getPersonalAccount(m.workspace.ownerId);
  const user = await getCurrentUser();
  const token = randomBytes(24).toString('base64url');
  const { error } = await db().from('account_invites').insert({ account_id: account!.id, workspace_id: workspaceId, email, role, token, invited_by: user!.id });
  if (error) return { ok: false, message: error.message };
  revalidatePath('/workspaces');
  return { ok: true, message: t('Invitation ready — copy the link and send it. It works for 14 days.'), link: `${siteOrigin()}/invite/${token}` };
}

export async function revokeInvite(inviteId: string) {
  const { data: inv } = await db().from('account_invites').select('workspace_id').eq('id', inviteId).maybeSingle();
  const m = inv?.workspace_id ? await getMembership(inv.workspace_id) : null;
  if (!m || m.role !== 'admin') return;
  await db().from('account_invites').delete().eq('id', inviteId);
  revalidatePath('/workspaces');
}

async function adminCount(workspaceId: string) {
  const { count } = await db().from('workspace_members').select('user_id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('role', 'admin');
  return count ?? 0;
}

export async function setMemberRole(workspaceId: string, userId: string, role: 'admin' | 'member'): Promise<{ error?: string }> {
  const m = await getMembership(workspaceId);
  const t = await getT();
  if (!m || m.role !== 'admin') return { error: t('Only admins can change roles.') };
  if (userId === m.workspace.ownerId) return { error: t('The workspace’s owner is always an admin.') };
  await db().from('workspace_members').update({ role }).match({ workspace_id: workspaceId, user_id: userId });
  revalidatePath('/workspaces');
  return {};
}

/** Remove someone from the workspace (admins), or leave it yourself. */
export async function removeMember(workspaceId: string, userId: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  const m = await getMembership(workspaceId);
  const t = await getT();
  if (!user || !m) return { error: t('Not allowed.') };
  const self = userId === user.id;
  if (userId === m.workspace.ownerId) return { error: t('The owner can’t leave their own workspace — delete it instead.') };
  if (!self && m.role !== 'admin') return { error: t('Only admins can remove people.') };
  const { data: target } = await db().from('workspace_members').select('role').match({ workspace_id: workspaceId, user_id: userId }).maybeSingle();
  if (target?.role === 'admin' && (await adminCount(workspaceId)) <= 1) return { error: t('The workspace needs at least one admin.') };
  await db().from('workspace_members').delete().match({ workspace_id: workspaceId, user_id: userId });
  await db().from('profiles').update({ current_workspace_id: null }).eq('id', userId).eq('current_workspace_id', workspaceId);
  revalidatePath('/', 'layout');
  if (self) redirect('/workspaces');
  return {};
}

/** /invite/[token]: join the workspace. */
export async function acceptInvite(token: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/invite/${encodeURIComponent(token)}`);
  const { data: inv } = await db().from('account_invites').select('*').eq('token', token).maybeSingle();
  const t = await getT();
  if (!inv?.workspace_id || inv.accepted_at || new Date(inv.expires_at) < new Date()) return { error: t('This invitation has expired or was already used.') };
  if (inv.email && inv.email !== user.email.toLowerCase()) return { error: t('This invitation is for {email}. Log in with that account.', { email: inv.email }) };
  await db().from('workspace_members').upsert({ workspace_id: inv.workspace_id, user_id: user.id, role: inv.role }, { onConflict: 'workspace_id,user_id' });
  await db().from('account_invites').update({ accepted_by: user.id, accepted_at: new Date().toISOString() }).eq('id', inv.id);
  await db().from('profiles').update({ current_workspace_id: inv.workspace_id }).eq('id', user.id);
  revalidatePath('/', 'layout');
  redirect('/');
}
