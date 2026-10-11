import 'server-only';
import { getSupabaseServerClient } from '@/lib/supabase';

export const RANGES = [
  { key: '24h', label: '24 hours', ms: 24 * 60 * 60 * 1000 },
  { key: '7d', label: '7 days', ms: 7 * 24 * 60 * 60 * 1000 },
  { key: '30d', label: '30 days', ms: 30 * 24 * 60 * 60 * 1000 },
  { key: '90d', label: '90 days', ms: 90 * 24 * 60 * 60 * 1000 },
  { key: 'all', label: 'All time', ms: null },
] as const;

export type RangeKey = (typeof RANGES)[number]['key'];

const PAID = new Set(['starter', 'pro', 'teams']);
const LIVE = new Set(['active', 'trialing', 'past_due', 'comped']);
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export function rangeOf(value: string | undefined): RangeKey {
  return RANGES.some((range) => range.key === value) ? value as RangeKey : '7d';
}

export type DashPoint = { t: number; home: number; accounts: number; posts: number; news: number; tenders: number };
export type DashAccount = { email: string; username: string; createdAt: string; plan: string };
export type DashPlan = { email: string; username: string; plan: string; subscribedAt: string };
export type DashAccess = { kind: 'home' | 'post' | 'news' | 'tender'; path: string | null; at: string };

export type DashboardReport = {
  homeVisitors: number;
  accounts: number;
  plans: number;
  posts: number;
  news: number;
  tenders: number;
  points: DashPoint[];
  accountRows: DashAccount[];
  planRows: DashPlan[];
  accesses: DashAccess[];
};

const emptyPoint = (t: number): DashPoint => ({ t, home: 0, accounts: 0, posts: 0, news: 0, tenders: 0 });

function bucketStart(ms: number, hour: boolean) {
  const d = new Date(ms);
  return hour
    ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours())
    : Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** One slot per hour or day from the start of the window through now, with gaps filled as zero. */
function slots(since: number, hour: boolean) {
  const step = hour ? HOUR : DAY;
  const start = bucketStart(since, hour);
  const end = bucketStart(Date.now(), hour);
  const out: DashPoint[] = [];
  for (let t = start; t <= end && out.length < 120; t += step) out.push(emptyPoint(t));
  return out;
}

async function emailsById() {
  const db = getSupabaseServerClient();
  const map = new Map<string, string>();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) break;
    const users = data?.users || [];
    for (const user of users) if (user.email) map.set(user.id, user.email);
    if (users.length < 200) break;
  }
  return map;
}

/** Totals, a chart series, and the accounts and pages behind the numbers. */
export async function dashboardReport(range: RangeKey): Promise<DashboardReport> {
  const spec = RANGES.find((item) => item.key === range)!;
  const sinceIso = spec.ms == null ? null : new Date(Date.now() - spec.ms).toISOString();
  const hour = range === '24h';
  const db = getSupabaseServerClient();
  const accessQuery = db.from('page_views').select('kind, path, created_at').order('created_at', { ascending: false }).limit(40);
  const [viewRes, seriesRes, profileRes, planRes, accessRes, emails] = await Promise.all([
    db.rpc('analytics_counts', { since: sinceIso }),
    db.rpc('analytics_series', { since: sinceIso, unit: hour ? 'hour' : 'day' }),
    db.from('profiles').select('id, username, created_at').order('created_at', { ascending: false }).limit(500),
    db.from('accounts').select('owner_id, plan, plan_status, subscribed_at').eq('kind', 'personal'),
    sinceIso ? accessQuery.gte('created_at', sinceIso) : accessQuery,
    emailsById(),
  ]);

  const byKind = new Map<string, { views: number; visitors: number }>();
  for (const row of (viewRes.data || []) as { kind: string; views: number; visitors: number }[]) {
    byKind.set(row.kind, { views: Number(row.views) || 0, visitors: Number(row.visitors) || 0 });
  }

  const profiles = (profileRes.data || []) as { id: string; username: string | null; created_at: string }[];
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const inWindow = (iso: string | null) => !!iso && (!sinceIso || iso >= sinceIso);
  const accountRows: DashAccount[] = profiles.filter((profile) => inWindow(profile.created_at)).map((profile) => ({
    email: emails.get(profile.id) || '',
    username: profile.username || '',
    createdAt: profile.created_at,
    plan: (planRes.data || []).find((row) => row.owner_id === profile.id)?.plan || 'free',
  }));
  const planRows: DashPlan[] = (planRes.data || [])
    .filter((row) => PAID.has(row.plan) && LIVE.has(row.plan_status) && inWindow(row.subscribed_at))
    .map((row) => ({
      email: emails.get(row.owner_id) || '',
      username: profileById.get(row.owner_id)?.username || '',
      plan: row.plan as string,
      subscribedAt: row.subscribed_at as string,
    }))
    .sort((a, b) => b.subscribedAt.localeCompare(a.subscribedAt));

  const created = profiles.map((profile) => new Date(profile.created_at).getTime()).filter((t) => Number.isFinite(t));
  const earliest = sinceIso ? new Date(sinceIso).getTime() : (created.length ? Math.min(...created) : Date.now());
  const points = slots(earliest, hour);
  const at = new Map(points.map((point) => [point.t, point]));
  const add = (iso: string, key: keyof Omit<DashPoint, 't'>, n = 1) => {
    const point = at.get(bucketStart(new Date(iso).getTime(), hour));
    if (point) point[key] += n;
  };
  for (const row of (seriesRes.data || []) as { bucket: string; kind: string; views: number; visitors: number }[]) {
    if (row.kind === 'home') add(row.bucket, 'home', Number(row.visitors) || 0);
    else if (row.kind === 'post') add(row.bucket, 'posts', Number(row.views) || 0);
    else if (row.kind === 'news') add(row.bucket, 'news', Number(row.views) || 0);
    else if (row.kind === 'tender') add(row.bucket, 'tenders', Number(row.views) || 0);
  }
  for (const row of accountRows) add(row.createdAt, 'accounts');

  return {
    homeVisitors: byKind.get('home')?.visitors ?? 0,
    accounts: accountRows.length,
    plans: planRows.length,
    posts: byKind.get('post')?.views ?? 0,
    news: byKind.get('news')?.views ?? 0,
    tenders: byKind.get('tender')?.views ?? 0,
    points,
    accountRows,
    planRows,
    accesses: ((accessRes.data || []) as { kind: DashAccess['kind']; path: string | null; created_at: string }[]).map((row) => ({
      kind: row.kind, path: row.path, at: row.created_at,
    })),
  };
}
