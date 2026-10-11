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

const PAID = ['starter', 'pro', 'teams'] as const;
const LIVE = ['active', 'trialing', 'past_due', 'comped'];

export function rangeOf(value: string | undefined): RangeKey {
  return RANGES.some((range) => range.key === value) ? value as RangeKey : '7d';
}

export type DashboardCounts = {
  homeVisitors: number;
  accounts: number;
  plans: number;
  byPlan: Record<(typeof PAID)[number], number>;
  posts: number;
  news: number;
  tenders: number;
};

/** Counts for one timeframe. Page visits start when tracking shipped; accounts and plans use their own dates. */
export async function dashboardCounts(range: RangeKey): Promise<DashboardCounts> {
  const spec = RANGES.find((item) => item.key === range)!;
  const since = spec.ms == null ? null : new Date(Date.now() - spec.ms).toISOString();
  const db = getSupabaseServerClient();
  let accounts = db.from('profiles').select('id', { count: 'exact', head: true });
  let plans = db.from('accounts').select('plan').eq('kind', 'personal').in('plan', [...PAID]).in('plan_status', LIVE);
  if (since) {
    accounts = accounts.gte('created_at', since);
    plans = plans.gte('subscribed_at', since);
  }
  const [viewRes, accountRes, planRes] = await Promise.all([
    db.rpc('analytics_counts', { since }),
    accounts,
    plans,
  ]);
  const byKind = new Map<string, { views: number; visitors: number }>();
  for (const row of (viewRes.data || []) as { kind: string; views: number; visitors: number }[]) {
    byKind.set(row.kind, { views: Number(row.views) || 0, visitors: Number(row.visitors) || 0 });
  }
  const byPlan = { starter: 0, pro: 0, teams: 0 };
  for (const row of planRes.data || []) {
    const key = row.plan as keyof typeof byPlan;
    if (key in byPlan) byPlan[key] += 1;
  }
  return {
    homeVisitors: byKind.get('home')?.visitors ?? 0,
    accounts: accountRes.count ?? 0,
    plans: byPlan.starter + byPlan.pro + byPlan.teams,
    byPlan,
    posts: byKind.get('post')?.views ?? 0,
    news: byKind.get('news')?.views ?? 0,
    tenders: byKind.get('tender')?.views ?? 0,
  };
}
