/**
 * Every signed-up account, for the dashboard. The plan is the personal account.
 * Scopes are the catalog picks and custom scopes on the workspaces they own.
 * General is not listed. A member with no workspace of their own shows the
 * scopes of the workspace they belong to. The journey is only what was stored
 * before the account existed.
 */
import 'server-only';
import { companyLabel, journeyOf, type AccountOrigin, type JourneyEvent } from '@/lib/accountJourney';
import { getSupabaseServerClient } from '@/lib/supabase';
import type { PlanKey } from '@/lib/plans';

export type { AccountOrigin };
export type AccountScope = { name: string; catalog: boolean };
export type AccountRow = {
  id: string;
  email: string;
  username: string;
  plan: PlanKey;
  status: string;
  signedUp: string;
  scopes: AccountScope[];
  origin: AccountOrigin | null;
  company: string;
};

const PLANS = new Set<PlanKey>(['free', 'starter', 'pro', 'teams']);

function asPlan(value: string | null | undefined): PlanKey {
  return value && PLANS.has(value as PlanKey) ? value as PlanKey : 'free';
}

async function pages<T>(load: (from: number) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data } = await load(from);
    const rows = data || [];
    all.push(...rows);
    if (rows.length < 1000) break;
  }
  return all;
}

async function emailsAndCreated() {
  const db = getSupabaseServerClient();
  const emails = new Map<string, string>();
  const created = new Map<string, string>();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) break;
    const users = data?.users || [];
    for (const user of users) {
      if (user.email) emails.set(user.id, user.email);
      if (user.created_at) created.set(user.id, user.created_at);
    }
    if (users.length < 200) break;
  }
  return { emails, created };
}

type DocRow = { workspace_id: string | null; name: string | null; text_content?: string | null };

async function eventsFor(visitors: string[], until: string): Promise<JourneyEvent[]> {
  if (!visitors.length || !until) return [];
  const db = getSupabaseServerClient();
  const rows = await pages<{
    name: string; path: string | null; landing: string | null; first_source: string | null; first_medium: string | null;
    created_at: string; backfilled: boolean; cta: string | null;
  }>((from) => db.from('analytics_events')
    .select('name, path, landing, first_source, first_medium, created_at, backfilled, cta')
    .in('visitor', visitors)
    .lte('created_at', until)
    .order('created_at')
    .range(from, from + 999));
  return rows.map((row) => ({
    name: row.name, path: row.path, landing: row.landing, firstSource: row.first_source, firstMedium: row.first_medium,
    at: row.created_at, backfilled: row.backfilled, cta: row.cta,
  }));
}

/** Visitors tied to each account, ignoring the synthetic ids written for old signups. */
async function visitorsByUser(ids: string[]) {
  const db = getSupabaseServerClient();
  const found = new Map<string, string[]>();
  for (let i = 0; i < ids.length; i += 80) {
    const chunk = ids.slice(i, i + 80);
    const rows = await pages<{ user_id: string; visitor: string }>((from) =>
      db.from('analytics_events').select('user_id, visitor').in('user_id', chunk).order('created_at').range(from, from + 999));
    for (const row of rows) {
      if (!row.visitor || row.visitor.startsWith('backfill:') || row.visitor.startsWith('server:')) continue;
      const list = found.get(row.user_id) || [];
      if (!list.includes(row.visitor)) list.push(row.visitor);
      found.set(row.user_id, list);
    }
  }
  return found;
}

export async function accountList(): Promise<AccountRow[]> {
  const db = getSupabaseServerClient();
  const [profiles, accounts, workspaces, scopes, picks, members, notes, files, auth] = await Promise.all([
    pages<{ id: string; username: string | null; created_at: string; company: string | null }>((from) =>
      db.from('profiles').select('id, username, created_at, company').order('id').range(from, from + 999)),
    pages<{ owner_id: string; plan: string; plan_status: string }>((from) =>
      db.from('accounts').select('owner_id, plan, plan_status').eq('kind', 'personal').order('owner_id').range(from, from + 999)),
    pages<{ id: string; owner_id: string }>((from) =>
      db.from('workspaces').select('id, owner_id').order('id').range(from, from + 999)),
    pages<{ id: string; name: string; workspace_id: string | null; catalog: boolean; is_default: boolean; active: boolean }>((from) =>
      db.from('scopes').select('id, name, workspace_id, catalog, is_default, active').order('id').range(from, from + 999)),
    pages<{ workspace_id: string; scope_id: string }>((from) =>
      db.from('workspace_scope_picks').select('workspace_id, scope_id').order('workspace_id').order('scope_id').range(from, from + 999)),
    pages<{ user_id: string; workspace_id: string }>((from) =>
      db.from('workspace_members').select('user_id, workspace_id').order('user_id').order('workspace_id').range(from, from + 999)),
    pages<DocRow>((from) =>
      db.from('company_documents').select('workspace_id, name, text_content').eq('name', 'Company note').order('id').range(from, from + 999)),
    pages<DocRow>((from) =>
      db.from('company_documents').select('workspace_id, name').neq('name', 'Company note').order('id').range(from, from + 999)),
    emailsAndCreated(),
  ]);

  const planByOwner = new Map(accounts.map((row) => [row.owner_id, row]));
  const scopeById = new Map(scopes.map((scope) => [scope.id, scope]));
  const ownedBy = new Map<string, string[]>();
  for (const workspace of workspaces) {
    const list = ownedBy.get(workspace.owner_id) || [];
    list.push(workspace.id);
    ownedBy.set(workspace.owner_id, list);
  }
  const memberOf = new Map<string, string[]>();
  for (const member of members) {
    const list = memberOf.get(member.user_id) || [];
    list.push(member.workspace_id);
    memberOf.set(member.user_id, list);
  }
  const customByWorkspace = new Map<string, AccountScope[]>();
  for (const scope of scopes) {
    if (!scope.workspace_id || scope.is_default || scope.catalog || !scope.name) continue;
    const list = customByWorkspace.get(scope.workspace_id) || [];
    list.push({ name: scope.name, catalog: false });
    customByWorkspace.set(scope.workspace_id, list);
  }
  const picksByWorkspace = new Map<string, AccountScope[]>();
  for (const pick of picks) {
    const scope = scopeById.get(pick.scope_id);
    if (!scope?.catalog || scope.is_default || !scope.name) continue;
    const list = picksByWorkspace.get(pick.workspace_id) || [];
    list.push({ name: scope.name, catalog: true });
    picksByWorkspace.set(pick.workspace_id, list);
  }

  const scopesFor = (workspaceIds: string[]) => {
    const seen = new Set<string>();
    const found: AccountScope[] = [];
    for (const id of workspaceIds) {
      for (const scope of [...(picksByWorkspace.get(id) || []), ...(customByWorkspace.get(id) || [])]) {
        const key = `${scope.catalog}:${scope.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        found.push(scope);
      }
    }
    return found.sort((a, b) => Number(b.catalog) - Number(a.catalog) || a.name.localeCompare(b.name));
  };

  const docsByWorkspace = new Map<string, { name: string; text: string | null }[]>();
  for (const doc of [...notes, ...files]) {
    if (!doc.workspace_id || !doc.name) continue;
    const list = docsByWorkspace.get(doc.workspace_id) || [];
    list.push({ name: doc.name, text: doc.text_content ?? null });
    docsByWorkspace.set(doc.workspace_id, list);
  }

  const ids = new Set<string>([...profiles.map((profile) => profile.id), ...auth.emails.keys()]);
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const signedUpOf = (id: string) => profileById.get(id)?.created_at || auth.created.get(id) || '';
  const visitors = await visitorsByUser([...ids]);
  const origins = new Map<string, AccountOrigin | null>();
  await Promise.all([...ids].map(async (id) => {
    const signedUp = signedUpOf(id);
    const until = signedUp ? new Date(new Date(signedUp).getTime() + 2 * 60 * 1000).toISOString() : '';
    const events = await eventsFor(visitors.get(id) || [], until);
    origins.set(id, journeyOf(events, signedUp));
  }));
  const rows: AccountRow[] = [];
  for (const id of ids) {
    const profile = profileById.get(id);
    const account = planByOwner.get(id);
    const owned = ownedBy.get(id) || [];
    const using = owned.length ? owned : (memberOf.get(id) || []);
    const docs = using.flatMap((workspaceId) => docsByWorkspace.get(workspaceId) || []);
    rows.push({
      id,
      email: auth.emails.get(id) || '',
      username: profile?.username || '',
      plan: asPlan(account?.plan),
      status: account?.plan_status || 'active',
      signedUp: signedUpOf(id),
      scopes: scopesFor(using),
      origin: origins.get(id) || null,
      company: companyLabel(profile?.company, docs),
    });
  }
  const rank: Record<PlanKey, number> = { teams: 0, pro: 1, starter: 2, free: 3 };
  return rows.sort((a, b) => rank[a.plan] - rank[b.plan] || b.signedUp.localeCompare(a.signedUp) || a.email.localeCompare(b.email));
}

/** Shown beside a paid plan. A free account has no billing state. */
export function billingKey(plan: PlanKey, status: string): string | null {
  if (plan === 'free') return null;
  if (status === 'trialing') return 'Trial';
  if (status === 'past_due') return 'Past due';
  if (status === 'canceled') return 'Canceled';
  if (status === 'comped') return 'Comped';
  if (status === 'active') return 'Paying';
  return null;
}
