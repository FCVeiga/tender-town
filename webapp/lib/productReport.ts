import 'server-only';
import { planOf } from '@/lib/plans';
import { getSupabaseServerClient } from '@/lib/supabase';
import { buildDiagnosis, type Diagnosis } from '@/lib/productFunnel';
import {
  filtersOf, matchesFact, type AccountFact, type Fact, type Filters, type LogFact, type Traffic,
} from '@/lib/productModel';

type Raw = Record<string, unknown>;

function num(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function factOf(row: Raw): Fact {
  return {
    name: String(row.name || ''),
    at: new Date(String(row.created_at || 0)).getTime(),
    visitor: String(row.visitor || ''),
    session: String(row.session_id || ''),
    userId: row.user_id ? String(row.user_id) : null,
    flow: row.flow_id ? String(row.flow_id) : null,
    pageType: row.page_type ? String(row.page_type) : null,
    path: row.path ? String(row.path) : null,
    landing: row.landing ? String(row.landing) : null,
    referrerHost: row.referrer_host ? String(row.referrer_host) : null,
    source: row.source ? String(row.source) : null,
    medium: row.medium ? String(row.medium) : null,
    campaign: row.campaign ? String(row.campaign) : null,
    firstSource: row.first_source ? String(row.first_source) : null,
    firstMedium: row.first_medium ? String(row.first_medium) : null,
    firstCampaign: row.first_campaign ? String(row.first_campaign) : null,
    device: String(row.device || 'unknown'),
    country: row.country ? String(row.country) : null,
    scopeId: row.scope_id ? String(row.scope_id) : null,
    contentId: row.content_id ? String(row.content_id) : null,
    cta: row.cta ? String(row.cta) : null,
    placement: row.placement ? String(row.placement) : null,
    plan: row.plan ? String(row.plan) : null,
    entitlement: row.entitlement ? String(row.entitlement) : null,
    ok: typeof row.ok === 'boolean' ? row.ok : null,
    errorCode: row.error_code ? String(row.error_code) : null,
    demo: row.demo === true,
    traffic: (['human', 'bot', 'unknown', 'internal'].includes(String(row.traffic)) ? row.traffic : 'unknown') as Traffic,
    backfilled: row.backfilled === true,
    newVisitor: row.new_visitor === true,
    signedIn: row.signed_in === true,
    durationMs: num(row.duration_ms),
    scrollPct: num(row.scroll_pct),
  };
}

async function rowsBetween(start: number, end: number) {
  const db = getSupabaseServerClient();
  const out: Raw[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await db.from('analytics_events').select('*')
      .gte('created_at', new Date(start).toISOString())
      .lt('created_at', new Date(end).toISOString())
      .order('created_at', { ascending: true })
      .range(from, from + 999);
    if (error || !data?.length) break;
    out.push(...data as Raw[]);
    if (data.length < 1000) break;
  }
  return out.map(factOf);
}

async function logBetween(start: number, end: number): Promise<LogFact[]> {
  const db = getSupabaseServerClient();
  const out: LogFact[] = [];
  for (let from = 0; from < 10000; from += 1000) {
    const { data, error } = await db.from('page_views').select('created_at, visitor, path, kind, country, referrer, signed_in, user_id, scope_ids')
      .gte('created_at', new Date(start).toISOString())
      .lt('created_at', new Date(end).toISOString())
      .order('created_at', { ascending: true })
      .range(from, from + 999);
    if (error || !data?.length) break;
    for (const row of data) out.push({
      at: new Date(row.created_at).getTime(), visitor: row.visitor, path: row.path, kind: row.kind,
      country: row.country, referrer: row.referrer, signedIn: row.signed_in, userId: row.user_id,
      scopeIds: Array.isArray(row.scope_ids) ? row.scope_ids.filter((id): id is string => typeof id === 'string') : [],
    });
    if (data.length < 1000) break;
  }
  return out;
}

async function accountsBetween(start: number, end: number, ignored: Set<string>): Promise<AccountFact[]> {
  const db = getSupabaseServerClient();
  const { data } = await db.from('profiles').select('id, created_at, country')
    .gte('created_at', new Date(start).toISOString())
    .lt('created_at', new Date(end).toISOString())
    .order('created_at', { ascending: false })
    .limit(1000);
  return (data || []).map((row) => ({
    id: row.id as string, at: new Date(row.created_at).getTime(), country: row.country as string | null, internal: ignored.has(row.id),
  }));
}

export async function diagnosisReport(query: Record<string, string | undefined>): Promise<{ filters: Filters; report: Diagnosis; scopes: { id: string; name: string }[]; capped: boolean }> {
  const filters = filtersOf(query);
  const db = getSupabaseServerClient();
  const [events, previousEvents, log, ignoredRes, first, ingest, scopes] = await Promise.all([
    rowsBetween(filters.start, filters.end),
    rowsBetween(filters.prevStart, filters.prevEnd),
    logBetween(filters.prevStart, filters.end),
    db.from('analytics_ignored_users').select('user_id'),
    db.from('analytics_events').select('created_at').eq('backfilled', false).order('created_at', { ascending: true }).limit(1).maybeSingle(),
    db.from('analytics_ingest_errors').select('id', { count: 'exact', head: true }).gte('created_at', new Date(filters.start).toISOString()),
    db.from('scopes').select('id, name').eq('active', true).order('name').limit(80),
  ]);
  const ignored = new Set((ignoredRes.data || []).map((row) => row.user_id as string));
  const accounts = (await accountsBetween(filters.start, filters.end, ignored)).filter((row) => filters.noise || filters.only === 'internal' || !row.internal);
  const previousAccounts = (await accountsBetween(filters.prevStart, filters.prevEnd, ignored)).filter((row) => filters.noise || filters.only === 'internal' || !row.internal);
  const apply = (rows: Fact[], start: number, end: number) => rows.filter((row) => matchesFact(row, { ...filters, start, end, noise: true, only: null }));
  const report = buildDiagnosis({
    facts: apply(events, filters.start, filters.end),
    previousFacts: apply(previousEvents, filters.prevStart, filters.prevEnd),
    accounts, previousAccounts, log,
    filters,
    instrumentAt: first.data?.created_at ? new Date(first.data.created_at).getTime() : null,
    ingestErrors: ingest.count || 0,
    duplicates: 0,
  });
  return {
    filters, report, capped: events.length >= 20000,
    scopes: (scopes.data || []).map((row) => ({ id: row.id as string, name: (row.name as string) || 'Scope' })),
  };
}

const PAYING = new Set(['active', 'trialing', 'past_due']);
const PAID = ['starter', 'pro', 'teams'] as const;
export type PaidPlan = (typeof PAID)[number];
export type RevenueReport = {
  total: number;
  previous: number;
  plans: { plan: PaidPlan; count: number; amount: number }[];
};

function revenueTally(
  rows: { owner_id: string; plan: string; plan_status: string; subscribed_at: string | null }[],
  ignored: Set<string>,
  start: number,
  end: number,
) {
  const plans = { starter: { count: 0, amount: 0 }, pro: { count: 0, amount: 0 }, teams: { count: 0, amount: 0 } };
  for (const row of rows) {
    if (ignored.has(row.owner_id)) continue;
    if (row.plan !== 'starter' && row.plan !== 'pro' && row.plan !== 'teams') continue;
    if (!PAYING.has(row.plan_status)) continue;
    const at = row.subscribed_at ? new Date(row.subscribed_at).getTime() : NaN;
    if (!Number.isFinite(at) || at < start || at >= end) continue;
    plans[row.plan].count += 1;
    plans[row.plan].amount += planOf(row.plan).priceEur;
  }
  return plans;
}

/** Paid subscriptions that started in the dashboard range, at the monthly price. */
export async function revenueReport(query: Record<string, string | undefined>): Promise<RevenueReport> {
  const filters = filtersOf(query);
  const db = getSupabaseServerClient();
  const [accounts, ignoredRes] = await Promise.all([
    db.from('accounts').select('owner_id, plan, plan_status, subscribed_at').eq('kind', 'personal'),
    db.from('analytics_ignored_users').select('user_id'),
  ]);
  const ignored = new Set((ignoredRes.data || []).map((row) => row.user_id as string));
  const rows = (accounts.data || []) as { owner_id: string; plan: string; plan_status: string; subscribed_at: string | null }[];
  const current = revenueTally(rows, ignored, filters.start, filters.end);
  const previous = revenueTally(rows, ignored, filters.prevStart, filters.prevEnd);
  const sum = (bucket: typeof current) => PAID.reduce((total, plan) => total + bucket[plan].amount, 0);
  return {
    total: sum(current),
    previous: sum(previous),
    plans: PAID.map((plan) => ({ plan, count: current[plan].count, amount: current[plan].amount })),
  };
}

export async function journeyEvents(visitor: string) {
  if (!/^[0-9a-f-]{36}$/i.test(visitor) && !visitor.startsWith('backfill:')) return [];
  const { data } = await getSupabaseServerClient().from('analytics_events')
    .select('created_at, name, path, page_type, source, medium, country, device, traffic, error_code, demo, backfilled, session_id')
    .eq('visitor', visitor)
    .order('created_at', { ascending: true })
    .limit(200);
  return data || [];
}
