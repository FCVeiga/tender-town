/**
 * Scopes (migration 025). A scope is one configuration of the radar inside a
 * workspace (lib/accounts.ts): a name, instructions (what the agents should
 * know), context documents, a search configuration and its own agents —
 * Search, Triage, Tender Evaluation, Proposal Manager, News Report. Workspace
 * admins create them (as many as the plan allows) and switch them on or off.
 *
 * What you see on Home, Community, Tenders, News and History is the work of
 * your current workspace's active scopes. Signed out, presets are ranked from
 * the browser and the first one that has results is shown; otherwise the default.
 */
import 'server-only';
import { cache } from 'react';
import { getSupabaseServerClient } from '@/lib/supabase';
import { canEditWorkspace, getContext, getMembership, isPlatformAdmin } from '@/lib/accounts';
import { getCurrentUser } from '@/lib/auth';
import { cookies, headers } from 'next/headers';
import { CATALOG_ORDER, GUEST_GENERAL, GUEST_SCOPE_COOKIE, GUEST_SCOPE_HEADER, isBot } from '@/lib/guestScope';

export const SCOPE_AGENT_KEYS = ['search', 'triage', 'tender_evaluation', 'proposal_manager', 'news_report'];
export const PLATFORM_AGENT_KEYS = ['tender_documents', 'tender_analysis', 'feed_writer', 'translator'];

export type Scope = {
  id: string; ownerId: string | null; name: string; instructions: string | null; active: boolean; isDefault: boolean;
  catalog: boolean;
  searchScope: string | null; searchConfig: Record<string, any> | null; searchStatus: string | null; searchError: string | null;
  parsedAt: string | null; createdAt: string;
  /** Set only when a collection finished. `last_run_at` is that same success until a newer one lands. */
  lastSuccessAt: string | null; lastAttemptAt: string | null; lastRunError: string | null;
};

export { CATALOG_ORDER };

const toScope = (r: any): Scope => ({
  id: r.id, ownerId: r.owner_id, name: r.name, instructions: r.instructions, active: r.active, isDefault: r.is_default,
  catalog: !!r.catalog,
  searchScope: r.search_scope, searchConfig: r.search_config, searchStatus: r.search_status, searchError: r.search_error,
  parsedAt: r.search_parsed_at, createdAt: r.created_at,
  lastSuccessAt: r.last_success_at || r.last_run_at || null,
  lastAttemptAt: r.last_attempt_at || null,
  lastRunError: r.last_run_error || null,
});

const byCatalogOrder = (a: Scope, b: Scope) =>
  (CATALOG_ORDER.indexOf(a.name) + 1 || 99) - (CATALOG_ORDER.indexOf(b.name) + 1 || 99);

/** The shared General scope visitors and new workspaces start from. */
export async function getGeneralScope(): Promise<Scope | null> {
  const { data } = await getSupabaseServerClient().from('scopes').select('*').eq('is_default', true).eq('active', true).limit(1);
  return data?.[0] ? toScope(data[0]) : null;
}

/** Shared scopes every workspace can turn on. */
export async function getCatalogScopes(): Promise<Scope[]> {
  const { data } = await getSupabaseServerClient().from('scopes').select('*').eq('catalog', true).eq('active', true);
  return (data || []).map(toScope).sort(byCatalogOrder);
}

export async function getWorkspaceScopes(workspaceId: string): Promise<Scope[]> {
  const { data } = await getSupabaseServerClient().from('scopes').select('*').eq('workspace_id', workspaceId).order('created_at');
  return (data || []).map(toScope);
}

/**
 * A scope the signed-in user may open. General and the catalog are shared, so
 * every account can read them; only someone who may configure that workspace
 * (and, for a catalog scope, a platform admin) can change them.
 */
export async function getViewableScope(id: string): Promise<(Scope & { workspaceId: string; editable: boolean }) | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  if (!(await getCurrentUser())) return null;
  const { data } = await getSupabaseServerClient().from('scopes').select('*').eq('id', id).maybeSingle();
  if (!data?.workspace_id) return null;
  const scope = toScope(data);
  const shared = scope.isDefault || scope.catalog;
  if (!shared && !(await getMembership(data.workspace_id))) return null;
  const editor = await canEditWorkspace(data.workspace_id);
  const editable = !!editor && (!scope.catalog || await isPlatformAdmin());
  return { ...scope, workspaceId: data.workspace_id, editable };
}

/** A scope the user may configure: admin of its workspace, on a plan that allows customizing (else null). */
export async function getEditableScope(id: string): Promise<(Scope & { workspaceId: string }) | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const { data } = await getSupabaseServerClient().from('scopes').select('*').eq('id', id).maybeSingle();
  if (!data?.workspace_id || !(await canEditWorkspace(data.workspace_id))) return null;
  const scope = toScope(data);
  // A catalog scope is shared. Only a platform admin edits it, and nobody deletes it from a workspace.
  if (scope.catalog && !(await isPlatformAdmin())) return null;
  return { ...scope, workspaceId: data.workspace_id };
}

export async function getScope(id: string): Promise<Scope | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const { data } = await getSupabaseServerClient().from('scopes').select('*').eq('id', id).maybeSingle();
  return data ? toScope(data) : null;
}

/** Custom scopes in this workspace (not General, not a shared catalog scope) and the catalog scopes it has turned on. */
export async function workspaceScopeUse(workspaceId: string): Promise<{ custom: number; pickIds: string[] }> {
  const db = getSupabaseServerClient();
  const [{ count }, { data: picks }] = await Promise.all([
    db.from('scopes').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('is_default', false).eq('catalog', false),
    db.from('workspace_scope_picks').select('scope_id, created_at').eq('workspace_id', workspaceId).order('created_at'),
  ]);
  return { custom: count ?? 0, pickIds: (picks || []).map((p: any) => p.scope_id) };
}

/**
 * The scopes whose results this viewer sees. General is in every account (and
 * what visitors see) and does not use a default-scope slot. A workspace then
 * turns on shared catalog scopes up to `defaultScopes`, and its own scopes up
 * to `customScopes`. `own` = at least one of those is on; `canRun` = an admin
 * on a plan that allows customizing may run on-click agents.
 */
export const getViewScopes = cache(async (): Promise<{ scopes: Scope[]; own: boolean; canRun: boolean }> => {
  const ctx = await getContext();
  const db = getSupabaseServerClient();
  const { data: defRows } = await db.from('scopes').select('*').eq('is_default', true).limit(1);
  const defaults = (defRows || []).filter((s: any) => s.active).map(toScope);
  if (!ctx) {
    const guest = (await getCurrentUser()) ? defaults : await guestView(defaults);
    return { scopes: guest, own: false, canRun: false };
  }
  const defaultLimit = ctx.isDefault ? null : ctx.plan.defaultScopes;
  const customLimit = ctx.isDefault ? null : ctx.plan.customScopes;
  const [{ data: ownRows }, use, { data: ws }] = await Promise.all([
    db.from('scopes').select('*').eq('workspace_id', ctx.workspace.id).order('created_at'),
    workspaceScopeUse(ctx.workspace.id),
    db.from('workspaces').select('show_default').eq('id', ctx.workspace.id).maybeSingle(),
  ]);
  const activeOwn = (ownRows || []).filter((s: any) => s.active && !s.is_default && !s.catalog).map(toScope);
  const own = customLimit == null ? activeOwn : activeOwn.slice(0, Math.max(0, customLimit));
  const pickIds = defaultLimit == null ? use.pickIds : use.pickIds.slice(0, Math.max(0, defaultLimit));
  let catalog: Scope[] = [];
  if (pickIds.length) {
    const { data: catRows } = await db.from('scopes').select('*').in('id', pickIds).eq('catalog', true).eq('active', true);
    const byId = new Map((catRows || []).map((r: any) => [r.id, toScope(r)]));
    catalog = pickIds.map((id) => byId.get(id)).filter((s): s is Scope => !!s);
  }
  const extra = [...catalog, ...own];
  const seen = new Set(extra.map((s) => s.id));
  // General stays in the feed until this workspace has another scope on and has turned it off.
  const includeDefault = ws?.show_default !== false || extra.length === 0;
  const defaultsShown = includeDefault ? defaults.filter((d) => !seen.has(d.id)) : [];
  return { scopes: [...defaultsShown, ...extra], own: extra.length > 0, canRun: ctx.canCustomize };
});

/** Signed-out visitors: the catalog scope named by the guest cookie, else General. Bots stay on General. */
async function guestView(defaults: Scope[]): Promise<Scope[]> {
  if (isBot(headers().get('user-agent'))) return defaults;
  const raw = headers().get(GUEST_SCOPE_HEADER) || cookies().get(GUEST_SCOPE_COOKIE)?.value;
  if (!raw || raw === GUEST_GENERAL || !/^[0-9a-f-]{36}$/i.test(raw)) return defaults;
  const { data } = await getSupabaseServerClient().from('scopes').select('*').eq('id', raw).eq('catalog', true).eq('active', true).maybeSingle();
  return data ? [toScope(data)] : defaults;
}

export type ScopeItems = { ids: string[]; relevance: Map<string, number>; scopesOf: Map<string, string[]>; reason: Map<string, string> };

/** Tenders or news found by the viewer's scopes, with the best relevance any of them gave.
 * `focused` is the one scope Home, Tenders and News are showing. An empty result
 * (not null) means show nothing — null still means there is no scope setup yet. */
const loadScopeItems = cache(async (type: 'tender' | 'news', scopeKey: string): Promise<ScopeItems | null> => {
  const ids = scopeKey ? scopeKey.split(',') : [];
  if (!ids.length) return { ids: [], relevance: new Map(), scopesOf: new Map(), reason: new Map() };
  const { data } = await getSupabaseServerClient().from('scope_items').select('scope_id, item_id, relevance, reason')
    .eq('item_type', type).in('scope_id', ids).limit(20000);
  const relevance = new Map<string, number>();
  const scopesOf = new Map<string, string[]>();
  const reason = new Map<string, string>();
  const reasonScore = new Map<string, number>();
  for (const r of data || []) {
    const score = r.relevance ?? 0;
    relevance.set(r.item_id, Math.max(relevance.get(r.item_id) ?? -1, score));
    scopesOf.set(r.item_id, [...(scopesOf.get(r.item_id) || []), r.scope_id]);
    const why = typeof r.reason === 'string' ? r.reason.trim() : '';
    if (why && score >= (reasonScore.get(r.item_id) ?? -1)) {
      reason.set(r.item_id, why);
      reasonScore.set(r.item_id, score);
    }
  }
  return { ids: Array.from(relevance.keys()), relevance, scopesOf, reason };
});

/** Tenders or news for these scopes. `focused` uses the scope Home, Tenders and News are showing.
 * The scope id is part of the cache key so a later scope cannot reuse an earlier result. */
export const getScopeItems = cache(async (type: 'tender' | 'news', focused = false): Promise<ScopeItems | null> => {
  let scopes: Scope[];
  if (focused) {
    const { focusedScope } = await import('@/lib/scopeFocus');
    const picked = await focusedScope();
    if (picked.hold) return { ids: [], relevance: new Map(), scopesOf: new Map(), reason: new Map() };
    scopes = picked.scope ? [picked.scope] : [];
  } else {
    scopes = (await getViewScopes()).scopes;
  }
  if (!scopes.length) return focused ? { ids: [], relevance: new Map(), scopesOf: new Map(), reason: new Map() } : null;
  return loadScopeItems(type, scopes.map((s) => s.id).sort().join(','));
});

/** Agent switches and fine-tuning for one scope's agents (no row = on, default prompt). */
export async function getScopeAgents(scopeId: string) {
  const { data } = await getSupabaseServerClient().from('scope_agent_settings').select('*').eq('scope_id', scopeId);
  return new Map((data || []).map((a: any) => [a.agent_key, a]));
}

/** Is this scope agent switched on for the scope? */
export async function scopeAgentEnabled(scopeId: string, key: string) {
  const { data } = await getSupabaseServerClient().from('scope_agent_settings').select('enabled').eq('scope_id', scopeId).eq('agent_key', key).maybeSingle();
  return data?.enabled ?? true;
}
