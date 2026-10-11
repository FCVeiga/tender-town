import 'server-only';
import { planOf } from '@/lib/plans';
import { getSupabaseServerClient } from '@/lib/supabase';

export const RANGES = [
  { key: '24h', label: '24 hours', ms: 24 * 60 * 60 * 1000 },
  { key: '7d', label: '7 days', ms: 7 * 24 * 60 * 60 * 1000 },
  { key: '30d', label: '30 days', ms: 30 * 24 * 60 * 60 * 1000 },
  { key: '90d', label: '90 days', ms: 90 * 24 * 60 * 60 * 1000 },
  { key: 'all', label: 'All time', ms: null },
] as const;

export type RangeKey = (typeof RANGES)[number]['key'];
export type VisitSection = 'home' | 'community' | 'news' | 'tenders';
export type PlanKey = 'free' | 'starter' | 'pro' | 'teams';

const PAYING = new Set(['active', 'trialing', 'past_due']);
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const SECTIONS: { path: string; key: string }[] = [
  { path: '/news/regulation', key: 'Regulation' },
  { path: '/news/industry', key: 'Industry' },
  { path: '/news/market', key: 'Market' },
  { path: '/news/signals', key: 'Signals' },
  { path: '/tenders/rfps', key: 'RFPs' },
  { path: '/tenders/rfis', key: 'RFIs' },
  { path: '/tenders/grants', key: 'Grants' },
  { path: '/news', key: 'News' },
  { path: '/tenders', key: 'Tenders' },
  { path: '/community', key: 'Community' },
  { path: '/', key: 'Home' },
];

export function rangeOf(value: string | undefined): RangeKey {
  return RANGES.some((range) => range.key === value) ? value as RangeKey : '7d';
}

export function sectionOf(value: string | undefined, fallback: VisitSection): VisitSection {
  return value === 'home' || value === 'community' || value === 'news' || value === 'tenders' ? value : fallback;
}

export type DashPoint = { t: number; home: number; community: number; news: number; tenders: number };
export type DashAccount = { email: string; username: string; createdAt: string; plan: PlanKey };
export type DashPage = {
  href: string | null;
  title: string | null;
  labelKey: string | null;
  views: number;
  likes: number | null;
  comments: number | null;
};

export type DashboardReport = {
  points: DashPoint[];
  visits: Record<VisitSection, number>;
  accounts: DashAccount[];
  plans: Record<PlanKey, number>;
  revenue: Record<'starter' | 'pro' | 'teams', number>;
  pages: Record<VisitSection, DashPage[]>;
};

const emptyPoint = (t: number): DashPoint => ({ t, home: 0, community: 0, news: 0, tenders: 0 });

function bucketStart(ms: number, hour: boolean) {
  const d = new Date(ms);
  return hour
    ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours())
    : Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function slots(since: number, hour: boolean) {
  const step = hour ? HOUR : DAY;
  const start = bucketStart(since, hour);
  const end = bucketStart(Date.now(), hour);
  const out: DashPoint[] = [];
  for (let t = start; t <= end && out.length < 120; t += step) out.push(emptyPoint(t));
  return out;
}

function sectionFor(kind: string): VisitSection | null {
  if (kind === 'home') return 'home';
  if (kind === 'post') return 'community';
  if (kind === 'news') return 'news';
  if (kind === 'tender') return 'tenders';
  return null;
}

/** A list page keeps a translated label. An item page keeps its id so the title can be filled in. */
function describe(section: VisitSection, path: string): { href: string; labelKey: string | null; id: string | null; item: 'news' | 'tender' | 'post' | null } {
  const known = SECTIONS.find((item) => item.path === path);
  if (known) return { href: path, labelKey: known.key, id: null, item: null };
  const parts = path.split('/').filter(Boolean);
  if (section === 'news' && parts[0] === 'news' && parts[1]) return { href: path, labelKey: null, id: decodeURIComponent(parts[1]), item: 'news' };
  if (section === 'tenders' && parts[0] === 'tenders' && parts[1]) return { href: path, labelKey: null, id: decodeURIComponent(parts[1]), item: 'tender' };
  if (section === 'community' && parts[0] === 'posts' && parts[1]) return { href: path, labelKey: null, id: decodeURIComponent(parts[1]), item: 'post' };
  return { href: path || '/', labelKey: section === 'home' ? 'Home' : null, id: null, item: null };
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

/** Visits over time, accounts by plan, revenue, and each page with its likes and comments. */
export async function dashboardReport(range: RangeKey): Promise<DashboardReport> {
  const spec = RANGES.find((item) => item.key === range)!;
  const sinceIso = spec.ms == null ? null : new Date(Date.now() - spec.ms).toISOString();
  const hour = range === '24h';
  const db = getSupabaseServerClient();
  const [seriesRes, profileRes, planRes, pathRes, engageRes, emails] = await Promise.all([
    db.rpc('analytics_series', { since: sinceIso, unit: hour ? 'hour' : 'day' }),
    db.from('profiles').select('id, username, created_at').order('created_at', { ascending: false }).limit(500),
    db.from('accounts').select('owner_id, plan, plan_status, subscribed_at').eq('kind', 'personal'),
    db.rpc('analytics_paths', { since: sinceIso }),
    db.rpc('analytics_engagement', { since: sinceIso }),
    emailsById(),
  ]);

  const profiles = (profileRes.data || []) as { id: string; username: string | null; created_at: string }[];
  const inWindow = (iso: string | null) => !!iso && (!sinceIso || iso >= sinceIso);
  const planByOwner = new Map((planRes.data || []).map((row) => [row.owner_id as string, row]));
  const plans: Record<PlanKey, number> = { free: 0, starter: 0, pro: 0, teams: 0 };
  const accounts: DashAccount[] = profiles.filter((profile) => inWindow(profile.created_at)).map((profile) => {
    const plan = (planByOwner.get(profile.id)?.plan || 'free') as PlanKey;
    if (plan in plans) plans[plan] += 1;
    return { email: emails.get(profile.id) || '', username: profile.username || '', createdAt: profile.created_at, plan: plan in plans ? plan : 'free' };
  });

  const revenue = { starter: 0, pro: 0, teams: 0 };
  for (const row of planRes.data || []) {
    const plan = row.plan as 'starter' | 'pro' | 'teams';
    if (!(plan in revenue) || !PAYING.has(row.plan_status) || !inWindow(row.subscribed_at)) continue;
    revenue[plan] += planOf(plan).priceEur;
  }

  const created = profiles.map((profile) => new Date(profile.created_at).getTime()).filter((t) => Number.isFinite(t));
  const earliest = sinceIso ? new Date(sinceIso).getTime() : (created.length ? Math.min(...created) : Date.now());
  const points = slots(earliest, hour);
  const at = new Map(points.map((point) => [point.t, point]));
  for (const row of (seriesRes.data || []) as { bucket: string; kind: string; views: number }[]) {
    const section = sectionFor(row.kind);
    const point = at.get(bucketStart(new Date(row.bucket).getTime(), hour));
    if (section && point) point[section] += Number(row.views) || 0;
  }

  const engage = new Map<string, { likes: number; comments: number }>();
  for (const row of (engageRes.data || []) as { item_type: string; item_id: string; likes: number; comments: number }[]) {
    engage.set(`${row.item_type}:${row.item_id}`, { likes: Number(row.likes) || 0, comments: Number(row.comments) || 0 });
  }

  const grouped: Record<VisitSection, { href: string; labelKey: string | null; id: string | null; item: 'news' | 'tender' | 'post' | null; views: number }[]> = {
    home: [], community: [], news: [], tenders: [],
  };
  for (const row of (pathRes.data || []) as { kind: string; path: string; views: number }[]) {
    const section = sectionFor(row.kind);
    if (!section) continue;
    const path = row.path || (section === 'home' ? '/' : section === 'community' ? '/community' : section === 'news' ? '/news' : '/tenders');
    const described = describe(section, path);
    const views = Number(row.views) || 0;
    const existing = grouped[section].find((page) => page.href === described.href);
    if (existing) existing.views += views;
    else grouped[section].push({ ...described, views });
  }

  const ids = (item: 'news' | 'tender' | 'post') => Array.from(new Set(
    (['home', 'community', 'news', 'tenders'] as VisitSection[]).flatMap((section) => grouped[section].filter((page) => page.item === item && page.id).map((page) => page.id as string)),
  ));
  const [newsRes, tenderRes, postRes] = await Promise.all([
    ids('news').length ? db.from('news_items').select('news_id, title_en, title').in('news_id', ids('news')) : Promise.resolve({ data: [] }),
    ids('tender').length ? db.from('opportunities').select('opportunity_id, title_en, title').in('opportunity_id', ids('tender')) : Promise.resolve({ data: [] }),
    ids('post').length ? db.from('posts').select('id, title').in('id', ids('post')) : Promise.resolve({ data: [] }),
  ]);
  const titles = new Map<string, string>();
  for (const row of newsRes.data || []) titles.set(`news:${row.news_id}`, row.title_en || row.title || '');
  for (const row of tenderRes.data || []) titles.set(`tender:${row.opportunity_id}`, row.title_en || row.title || '');
  for (const row of postRes.data || []) titles.set(`post:${row.id}`, row.title || '');

  const pages = {} as Record<VisitSection, DashPage[]>;
  for (const section of ['home', 'community', 'news', 'tenders'] as VisitSection[]) {
    pages[section] = grouped[section]
      .map((page) => {
        const hit = page.item && page.id ? engage.get(`${page.item}:${page.id}`) : null;
        return {
          href: page.href, labelKey: page.labelKey, title: page.item && page.id ? titles.get(`${page.item}:${page.id}`) || null : null,
          views: page.views, likes: hit ? hit.likes : page.item ? 0 : null, comments: hit ? hit.comments : page.item ? 0 : null,
        };
      })
      .sort((a, b) => b.views - a.views || (a.title || '').localeCompare(b.title || ''))
      .slice(0, 100);
  }

  const visits = {
    home: pages.home.reduce((sum, page) => sum + page.views, 0),
    community: pages.community.reduce((sum, page) => sum + page.views, 0),
    news: pages.news.reduce((sum, page) => sum + page.views, 0),
    tenders: pages.tenders.reduce((sum, page) => sum + page.views, 0),
  };

  return { points, visits, accounts, plans, revenue, pages };
}
