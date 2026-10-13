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
export type VisitSection = 'home' | 'community' | 'news' | 'tenders' | 'other';
export type PlanKey = 'free' | 'starter' | 'pro' | 'teams';
export const REGIONS = ['Europe', 'Americas', 'Asia', 'Africa', 'Oceania', 'Other regions'] as const;
export type RegionKey = (typeof REGIONS)[number];

const PAYING = new Set(['active', 'trialing', 'past_due']);
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const SECTIONS: VisitSection[] = ['home', 'community', 'news', 'tenders', 'other'];
const PLANS: PlanKey[] = ['free', 'starter', 'pro', 'teams'];
const KNOWN: { path: string; key: string }[] = [
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

const EUROPE = new Set('AD AL AT BA BE BG BY CH CY CZ DE DK EE ES FI FR GB GR HR HU IE IS IT LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS SE SI SK SM UA VA XK'.split(' '));
const AMERICAS = new Set('AG AR BB BO BR BS BZ CA CL CO CR CU DM DO EC GD GT GY HN HT JM KN LC MX NI PA PE PY SR SV TT US UY VC VE'.split(' '));
const ASIA = new Set('AE AF AM AZ BD BH BN BT CN GE HK ID IL IN IQ IR JO JP KG KH KR KW KZ LA LB LK MM MN MO MY NP OM PH PK PS QA SA SG SY TH TJ TL TM TR TW UZ VN YE'.split(' '));
const AFRICA = new Set('AO BF BI BJ BW CD CF CG CI CM CV DJ DZ EG EH ER ET GA GH GM GN GQ GW KE KM LR LS LY MA MG ML MR MU MW MZ NA NE NG RW SC SD SL SN SO SS ST SZ TD TG TN TZ UG ZA ZM ZW'.split(' '));
const OCEANIA = new Set('AU FJ FM KI MH NC NR NZ PG PW SB TO TV VU WS'.split(' '));

export function regionOf(code: string | null | undefined): RegionKey {
  const c = (code || '').toUpperCase();
  if (c === 'UK' || EUROPE.has(c)) return 'Europe';
  if (AMERICAS.has(c)) return 'Americas';
  if (ASIA.has(c)) return 'Asia';
  if (AFRICA.has(c)) return 'Africa';
  if (OCEANIA.has(c)) return 'Oceania';
  return 'Other regions';
}

export function rangeOf(value: string | undefined): RangeKey {
  return RANGES.some((range) => range.key === value) ? value as RangeKey : '7d';
}

export function sectionOf(value: string | undefined, fallback: VisitSection): VisitSection {
  return SECTIONS.includes(value as VisitSection) ? value as VisitSection : fallback;
}

export type DashPoint = { t: number; active: number; accounts: number; visitors: number };
export type DashPage = {
  href: string | null;
  title: string | null;
  labelKey: string | null;
  views: number;
  likes: number | null;
  comments: number | null;
};
export type PageBundle = Record<VisitSection, DashPage[]>;
export type ScopeCount = { id: string; name: string; visits: number };
export type ActiveRow = { email: string; username: string; plan: PlanKey; country: string | null; scopes: string[] };
export type McpRow = { email: string; username: string; plan: PlanKey; country: string | null; scopes: string[]; requests: number };
export type CreatedRow = { id: string; name: string; plan: PlanKey; country: string | null; at: string };
export type CreatedBlock = { plans: Record<PlanKey, number>; rows: CreatedRow[] };
export type GeoSlice = { code: string; visits: number; scopes: { name: string; visits: number }[] };
export type ReferrerRow = { from: string; path: string; signedIn: boolean | null; plan: string | null; country: string | null; views: number };
export type DashCountry = {
  code: string;
  visits: number;
  active: number;
  accounts: number;
  revenue: number;
  mcp: number;
  scopes: { name: string; visits: number }[];
};

export type DashboardReport = {
  points: DashPoint[];
  cards: { active: number; accounts: number; revenue: number; visitors: number };
  active: { plans: Record<PlanKey, number>; scopes: { id: string; name: string; users: number }[]; rows: ActiveRow[] };
  revenue: Record<'starter' | 'pro' | 'teams', number>;
  scopes: { guest: ScopeCount[]; plans: Record<PlanKey, ScopeCount[]>; regions: Record<RegionKey, ScopeCount[]> };
  pages: {
    guest: PageBundle;
    plans: Record<PlanKey, PageBundle>;
    scopes: { id: string; name: string; pages: PageBundle }[];
    regions: Record<RegionKey, PageBundle>;
  };
  countries: DashCountry[];
  created: { workspaces: CreatedBlock; scopes: CreatedBlock };
  referrers: ReferrerRow[];
  visitGeo: { guest: GeoSlice[]; plans: Record<PlanKey, GeoSlice[]>; regions: Record<RegionKey, GeoSlice[]>; scopes: { id: string; countries: GeoSlice[] }[] };
  scopeGeo: { all: GeoSlice[]; plans: Record<PlanKey, GeoSlice[]> };
  mcp: {
    agents: number;
    requests: number;
    tools: { tool: string; requests: number }[];
    plans: Record<PlanKey, number>;
    regions: Record<RegionKey, number>;
    scopes: { id: string; name: string; requests: number }[];
    rows: McpRow[];
  };
};

const emptyPoint = (t: number): DashPoint => ({ t, active: 0, accounts: 0, visitors: 0 });
const emptyPlans = (): Record<PlanKey, number> => ({ free: 0, starter: 0, pro: 0, teams: 0 });
const emptyRegions = (): Record<RegionKey, number> => ({ Europe: 0, Americas: 0, Asia: 0, Africa: 0, Oceania: 0, 'Other regions': 0 });

function asPlan(value: string | null | undefined): PlanKey {
  return value === 'free' || value === 'starter' || value === 'pro' || value === 'teams' ? value : 'free';
}

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
  if (kind === 'other') return 'other';
  return null;
}

type RawPage = { href: string; labelKey: string | null; id: string | null; item: 'news' | 'tender' | 'post' | null; views: number };
type RawBundle = Record<VisitSection, RawPage[]>;

function emptyRaw(): RawBundle {
  return { home: [], community: [], news: [], tenders: [], other: [] };
}

/** A list page keeps a translated label. An item page keeps its id so the title can be filled in. */
function describe(section: VisitSection, path: string): { href: string; labelKey: string | null; id: string | null; item: 'news' | 'tender' | 'post' | null } {
  if (section === 'other') return { href: path || '/', labelKey: null, id: null, item: null };
  const known = KNOWN.find((item) => item.path === path);
  if (known) return { href: path, labelKey: known.key, id: null, item: null };
  const parts = path.split('/').filter(Boolean);
  if (section === 'news' && parts[0] === 'news' && parts[1]) return { href: path, labelKey: null, id: decodeURIComponent(parts[1]), item: 'news' };
  if (section === 'tenders' && parts[0] === 'tenders' && parts[1]) return { href: path, labelKey: null, id: decodeURIComponent(parts[1]), item: 'tender' };
  if (section === 'community' && parts[0] === 'posts' && parts[1]) return { href: path, labelKey: null, id: decodeURIComponent(parts[1]), item: 'post' };
  return { href: path || '/', labelKey: section === 'home' ? 'Home' : null, id: null, item: null };
}

function absorb(bundle: RawBundle, kind: string, path: string, views: number) {
  const section = sectionFor(kind);
  if (!section || views <= 0) return;
  const described = describe(section, path);
  const existing = bundle[section].find((page) => page.href === described.href);
  if (existing) existing.views += views;
  else bundle[section].push({ ...described, views });
}

type PageDim = { kind: string; path: string; signed_in: boolean | null; plan: string | null; country: string | null; views: number };

function bundleOf<T extends PageDim>(rows: T[], pred: (row: T) => boolean) {
  const bundle = emptyRaw();
  for (const row of rows) if (pred(row)) absorb(bundle, row.kind, row.path || '', Number(row.views) || 0);
  return bundle;
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

function geoOf<T extends { country: string | null; views: number; scopeName?: string | null }>(rows: T[], pred: (row: T) => boolean): GeoSlice[] {
  const totals = new Map<string, number>();
  const names = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (!row.country || !pred(row)) continue;
    const views = Number(row.views) || 0;
    if (views <= 0) continue;
    totals.set(row.country, (totals.get(row.country) || 0) + views);
    if (!row.scopeName) continue;
    const bucket = names.get(row.country) || new Map();
    bucket.set(row.scopeName, (bucket.get(row.scopeName) || 0) + views);
    names.set(row.country, bucket);
  }
  return Array.from(totals, ([code, visits]) => ({
    code,
    visits,
    scopes: Array.from(names.get(code) || [], ([name, count]) => ({ name, visits: count }))
      .sort((a, b) => b.visits - a.visits || a.name.localeCompare(b.name)).slice(0, 3),
  })).sort((a, b) => b.visits - a.visits || a.code.localeCompare(b.code));
}

function scopeTotals<T extends { scope_id: string; views: number }>(rows: T[], names: Map<string, string>, pred: (row: T) => boolean): ScopeCount[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (!pred(row)) continue;
    totals.set(row.scope_id, (totals.get(row.scope_id) || 0) + (Number(row.views) || 0));
  }
  return Array.from(totals, ([id, visits]) => ({ id, name: names.get(id) || '', visits }))
    .filter((row) => row.name && row.visits > 0)
    .sort((a, b) => b.visits - a.visits || a.name.localeCompare(b.name));
}

/** Active users, accounts, revenue, visitors, and the breakdowns under each. */
export async function dashboardReport(range: RangeKey): Promise<DashboardReport> {
  const spec = RANGES.find((item) => item.key === range)!;
  const sinceIso = spec.ms == null ? null : new Date(Date.now() - spec.ms).toISOString();
  const hour = range === '24h';
  const db = getSupabaseServerClient();
  const [totalRes, peopleRes, profileRes, planRes, pageRes, scopePageRes, engageRes, emails, scopeNameRes, accountRes, workspaceRes, referrerRes, ignoredRes, activeRes, activeScopeRes, mcpRes, mcpScopeRes] = await Promise.all([
    db.rpc('analytics_totals', { since: sinceIso }),
    db.rpc('analytics_people', { since: sinceIso, unit: hour ? 'hour' : 'day' }),
    db.from('profiles').select('id, username, created_at, country').order('created_at', { ascending: false }).limit(500),
    db.from('accounts').select('owner_id, plan, plan_status, subscribed_at').eq('kind', 'personal'),
    db.rpc('analytics_pages', { since: sinceIso }),
    db.rpc('analytics_page_scopes', { since: sinceIso }),
    db.rpc('analytics_engagement', { since: sinceIso }),
    emailsById(),
    db.from('scopes').select('id, name, created_at, owner_id, workspace_id, catalog, is_default'),
    db.from('accounts').select('id, plan, owner_id, kind'),
    db.from('workspaces').select('id, name, created_at, created_by, account_id'),
    db.rpc('analytics_referrers', { since: sinceIso }),
    db.from('analytics_ignored_users').select('user_id'),
    db.rpc('analytics_active_users', { since: sinceIso }),
    db.rpc('analytics_active_scopes', { since: sinceIso }),
    db.rpc('analytics_mcp', { since: sinceIso }),
    db.rpc('analytics_mcp_scopes', { since: sinceIso }),
  ]);

  const ignored = new Set(((ignoredRes.data || []) as { user_id: string }[]).map((row) => row.user_id));
  const profiles = ((profileRes.data || []) as { id: string; username: string | null; created_at: string; country: string | null }[])
    .filter((profile) => !ignored.has(profile.id));
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const inWindow = (iso: string | null) => !!iso && (!sinceIso || iso >= sinceIso);
  const planByOwner = new Map((planRes.data || []).map((row) => [row.owner_id as string, row]));
  const names = new Map((scopeNameRes.data || []).map((row) => [row.id as string, (row.name as string) || '']));

  const createdAccounts = profiles.filter((profile) => inWindow(profile.created_at));
  const revenue = { starter: 0, pro: 0, teams: 0 };
  const revenueByCountry = new Map<string, number>();
  for (const row of planRes.data || []) {
    if (ignored.has(row.owner_id as string)) continue;
    const plan = row.plan as 'starter' | 'pro' | 'teams';
    if (!(plan in revenue) || !PAYING.has(row.plan_status) || !inWindow(row.subscribed_at)) continue;
    const amount = planOf(plan).priceEur;
    revenue[plan] += amount;
    const code = profileById.get(row.owner_id as string)?.country;
    if (code) revenueByCountry.set(code, (revenueByCountry.get(code) || 0) + amount);
  }

  const created = profiles.map((profile) => new Date(profile.created_at).getTime()).filter((t) => Number.isFinite(t));
  const earliest = sinceIso ? new Date(sinceIso).getTime() : (created.length ? Math.min(...created) : Date.now());
  const points = slots(earliest, hour);
  const at = new Map(points.map((point) => [point.t, point]));
  for (const row of (Array.isArray(peopleRes.data) ? peopleRes.data : []) as { bucket: string; visitors: number; active: number }[]) {
    const point = at.get(bucketStart(new Date(row.bucket).getTime(), hour));
    if (!point) continue;
    point.visitors += Number(row.visitors) || 0;
    point.active += Number(row.active) || 0;
  }
  for (const profile of createdAccounts) {
    const point = at.get(bucketStart(new Date(profile.created_at).getTime(), hour));
    if (point) point.accounts += 1;
  }

  const totalRow = (Array.isArray(totalRes.data) ? totalRes.data[0] : totalRes.data) as { visitors?: number; active?: number } | null;
  const pageRows = (pageRes.data || []) as PageDim[];
  const scopeRows = (scopePageRes.data || []) as (PageDim & { scope_id: string })[];

  const engage = new Map<string, { likes: number; comments: number }>();
  for (const row of (engageRes.data || []) as { item_type: string; item_id: string; likes: number; comments: number }[]) {
    engage.set(`${row.item_type}:${row.item_id}`, { likes: Number(row.likes) || 0, comments: Number(row.comments) || 0 });
  }

  const guestRaw = bundleOf(pageRows, (row) => row.signed_in !== true);
  const planRaw = Object.fromEntries(PLANS.map((plan) => [plan, bundleOf(pageRows, (row) => row.plan === plan)])) as Record<PlanKey, RawBundle>;
  const regionRaw = Object.fromEntries(REGIONS.map((region) => [region, bundleOf(pageRows, (row) => !!row.country && regionOf(row.country) === region)])) as Record<RegionKey, RawBundle>;
  const scopeIds = Array.from(new Set(scopeRows.map((row) => row.scope_id)));
  const scopeRaw = new Map<string, RawBundle>();
  for (const id of scopeIds) scopeRaw.set(id, bundleOf(scopeRows, (row) => row.scope_id === id));

  const ids = (item: 'news' | 'tender' | 'post') => {
    const found = new Set<string>();
    const walk = (bundle: RawBundle) => {
      for (const section of SECTIONS) for (const page of bundle[section]) if (page.item === item && page.id) found.add(page.id);
    };
    walk(guestRaw);
    for (const plan of PLANS) walk(planRaw[plan]);
    for (const region of REGIONS) walk(regionRaw[region]);
    Array.from(scopeRaw.values()).forEach(walk);
    return Array.from(found);
  };
  const [newsRes, tenderRes, postRes] = await Promise.all([
    ids('news').length ? db.from('news_items').select('news_id, title_en, title').in('news_id', ids('news')) : Promise.resolve({ data: [] }),
    ids('tender').length ? db.from('opportunities').select('opportunity_id, title_en, title').in('opportunity_id', ids('tender')) : Promise.resolve({ data: [] }),
    ids('post').length ? db.from('posts').select('id, title').in('id', ids('post')) : Promise.resolve({ data: [] }),
  ]);
  const titles = new Map<string, string>();
  for (const row of newsRes.data || []) titles.set(`news:${row.news_id}`, row.title_en || row.title || '');
  for (const row of tenderRes.data || []) titles.set(`tender:${row.opportunity_id}`, row.title_en || row.title || '');
  for (const row of postRes.data || []) titles.set(`post:${row.id}`, row.title || '');

  const seal = (bundle: RawBundle): PageBundle => {
    const out = {} as PageBundle;
    for (const section of SECTIONS) {
      out[section] = bundle[section]
        .map((page) => {
          const hit = page.item && page.id ? engage.get(`${page.item}:${page.id}`) : null;
          return {
            href: page.href, labelKey: page.labelKey, title: page.item && page.id ? titles.get(`${page.item}:${page.id}`) || null : null,
            views: page.views, likes: hit ? hit.likes : page.item ? 0 : null, comments: hit ? hit.comments : page.item ? 0 : null,
          };
        })
        .sort((a, b) => b.views - a.views || (a.title || a.href || '').localeCompare(b.title || b.href || ''))
        .slice(0, 100);
    }
    return out;
  };

  const scopeDims = scopeRows.map((row) => ({ scope_id: row.scope_id, views: Number(row.views) || 0, signed_in: row.signed_in, plan: row.plan, country: row.country }));
  const scopes = {
    guest: scopeTotals(scopeDims, names, (row) => row.signed_in !== true),
    plans: Object.fromEntries(PLANS.map((plan) => [plan, scopeTotals(scopeDims, names, (row) => row.plan === plan)])) as Record<PlanKey, ScopeCount[]>,
    regions: Object.fromEntries(REGIONS.map((region) => [region, scopeTotals(scopeDims, names, (row) => !!row.country && regionOf(row.country) === region)])) as Record<RegionKey, ScopeCount[]>,
  };

  const activeIds = ((activeRes.data || []) as { user_id: string; views: number }[])
    .filter((row) => row.user_id && !ignored.has(row.user_id))
    .sort((a, b) => (Number(b.views) || 0) - (Number(a.views) || 0));
  const scopesByUser = new Map<string, string[]>();
  for (const row of (activeScopeRes.data || []) as { user_id: string; scope_id: string }[]) {
    if (!names.get(row.scope_id)) continue;
    const list = scopesByUser.get(row.user_id) || [];
    list.push(row.scope_id);
    scopesByUser.set(row.user_id, list);
  }
  const activePlans = emptyPlans();
  const activeScopeUsers = new Map<string, number>();
  const activeRows: ActiveRow[] = [];
  for (const row of activeIds) {
    const profile = profileById.get(row.user_id);
    if (!profile) continue;
    const plan = asPlan(planByOwner.get(row.user_id)?.plan as string | undefined);
    activePlans[plan] += 1;
    const scopeIdsForUser = scopesByUser.get(row.user_id) || [];
    for (const id of scopeIdsForUser) activeScopeUsers.set(id, (activeScopeUsers.get(id) || 0) + 1);
    const scopeNames = scopeIdsForUser.map((id) => names.get(id) || '').filter(Boolean).sort((a, b) => a.localeCompare(b));
    activeRows.push({
      email: emails.get(row.user_id) || '',
      username: profile.username || '',
      plan,
      country: profile.country,
      scopes: scopeNames,
    });
  }
  const activeScopes = Array.from(activeScopeUsers, ([id, users]) => ({ id, name: names.get(id) || '', users }))
    .filter((row) => row.name)
    .sort((a, b) => b.users - a.users || a.name.localeCompare(b.name));

  const mcpRowsRaw = (mcpRes.data || []) as { user_id: string; tool: string; plan: string | null; country: string | null; requests: number }[];
  const mcpScopeRows = (mcpScopeRes.data || []) as { user_id: string; scope_id: string; requests: number }[];
  const toolTotals = new Map<string, number>();
  const mcpPlans = emptyPlans();
  const mcpRegions = emptyRegions();
  const perUser = new Map<string, { requests: number; plan: PlanKey; country: string | null; countryVotes: Map<string, number>; planVotes: Map<string, number> }>();
  let mcpRequests = 0;
  for (const row of mcpRowsRaw) {
    if (!row.user_id || ignored.has(row.user_id)) continue;
    const requests = Number(row.requests) || 0;
    mcpRequests += requests;
    toolTotals.set(row.tool, (toolTotals.get(row.tool) || 0) + requests);
    const plan = asPlan(row.plan);
    mcpPlans[plan] += requests;
    if (row.country) mcpRegions[regionOf(row.country)] += requests;
    const user = perUser.get(row.user_id) || { requests: 0, plan: 'free' as PlanKey, country: null, countryVotes: new Map(), planVotes: new Map() };
    user.requests += requests;
    user.planVotes.set(plan, (user.planVotes.get(plan) || 0) + requests);
    if (row.country) user.countryVotes.set(row.country, (user.countryVotes.get(row.country) || 0) + requests);
    perUser.set(row.user_id, user);
  }
  const topVote = (votes: Map<string, number>) => Array.from(votes.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const mcpScopeNames = new Map<string, string[]>();
  const mcpScopeTotals = new Map<string, number>();
  for (const row of mcpScopeRows) {
    const name = names.get(row.scope_id);
    if (!name || ignored.has(row.user_id)) continue;
    const requests = Number(row.requests) || 0;
    mcpScopeTotals.set(row.scope_id, (mcpScopeTotals.get(row.scope_id) || 0) + requests);
    const list = mcpScopeNames.get(row.user_id) || [];
    if (!list.includes(name)) list.push(name);
    mcpScopeNames.set(row.user_id, list);
  }
  const mcpUserRows: McpRow[] = Array.from(perUser.entries()).map(([id, user]) => {
    const profile = profileById.get(id);
    const country = topVote(user.countryVotes) || profile?.country || null;
    return {
      email: emails.get(id) || '',
      username: profile?.username || '',
      plan: asPlan(topVote(user.planVotes) || planByOwner.get(id)?.plan as string | undefined),
      country,
      scopes: (mcpScopeNames.get(id) || []).sort((a, b) => a.localeCompare(b)),
      requests: user.requests,
    };
  }).sort((a, b) => b.requests - a.requests || a.username.localeCompare(b.username));

  const accountsByCountry = new Map<string, number>();
  for (const profile of createdAccounts) {
    if (!profile.country) continue;
    accountsByCountry.set(profile.country, (accountsByCountry.get(profile.country) || 0) + 1);
  }
  const activeByCountry = new Map<string, number>();
  for (const row of activeRows) {
    if (!row.country) continue;
    activeByCountry.set(row.country, (activeByCountry.get(row.country) || 0) + 1);
  }
  const visitsByCountry = new Map<string, number>();
  const scopesByCountry = new Map<string, Map<string, number>>();
  for (const row of pageRows) {
    if (!row.country) continue;
    visitsByCountry.set(row.country, (visitsByCountry.get(row.country) || 0) + (Number(row.views) || 0));
  }
  for (const row of scopeRows) {
    if (!row.country) continue;
    const name = names.get(row.scope_id);
    if (!name) continue;
    const map = scopesByCountry.get(row.country) || new Map();
    map.set(name, (map.get(name) || 0) + (Number(row.views) || 0));
    scopesByCountry.set(row.country, map);
  }
  const mcpByCountry = new Map<string, number>();
  for (const row of mcpRowsRaw) {
    if (!row.country || ignored.has(row.user_id)) continue;
    mcpByCountry.set(row.country, (mcpByCountry.get(row.country) || 0) + (Number(row.requests) || 0));
  }
  const codes = new Set<string>([...visitsByCountry.keys(), ...accountsByCountry.keys(), ...revenueByCountry.keys(), ...activeByCountry.keys(), ...mcpByCountry.keys()]);
  const countries: DashCountry[] = Array.from(codes).map((code) => ({
    code,
    visits: visitsByCountry.get(code) || 0,
    active: activeByCountry.get(code) || 0,
    accounts: accountsByCountry.get(code) || 0,
    revenue: revenueByCountry.get(code) || 0,
    mcp: mcpByCountry.get(code) || 0,
    scopes: Array.from(scopesByCountry.get(code) || []).map(([name, visits]) => ({ name, visits }))
      .sort((a, b) => b.visits - a.visits || a.name.localeCompare(b.name)).slice(0, 3),
  })).sort((a, b) => b.visits - a.visits || b.active - a.active || b.accounts - a.accounts || b.revenue - a.revenue || a.code.localeCompare(b.code));

  const revenueTotal = revenue.starter + revenue.pro + revenue.teams;
  const accountById = new Map((accountRes.data || []).map((row) => [row.id as string, row]));
  const planForAccount = (accountId: string | null | undefined) => asPlan(accountId ? accountById.get(accountId)?.plan as string | undefined : undefined);
  const inCreated = (iso: string | null) => !!iso && (!sinceIso || iso >= sinceIso);
  const createdBlock = (rows: CreatedRow[]): CreatedBlock => {
    const plans = emptyPlans();
    for (const row of rows) plans[row.plan] += 1;
    return { plans, rows: rows.sort((a, b) => b.at.localeCompare(a.at) || a.name.localeCompare(b.name)).slice(0, 100) };
  };
  const workspacesCreated = ((workspaceRes.data || []) as { id: string; name: string | null; created_at: string; created_by: string | null; account_id: string }[])
    .filter((row) => inCreated(row.created_at) && accountById.get(row.account_id)?.kind !== 'platform' && !ignored.has(row.created_by || ''))
    .map((row) => ({
      id: row.id,
      name: row.name || '',
      plan: planForAccount(row.account_id),
      country: profileById.get(row.created_by || '')?.country || profileById.get(accountById.get(row.account_id)?.owner_id as string)?.country || null,
      at: row.created_at,
    }))
    .filter((row) => row.name);
  const scopesCreated = ((scopeNameRes.data || []) as { id: string; name: string | null; created_at: string; owner_id: string | null; workspace_id: string | null; catalog: boolean | null; is_default: boolean | null }[])
    .filter((row) => inCreated(row.created_at) && !row.catalog && !row.is_default && !ignored.has(row.owner_id || ''))
    .map((row) => {
      const accountId = (workspaceRes.data || []).find((workspace) => workspace.id === row.workspace_id)?.account_id as string | undefined;
      return {
        id: row.id,
        name: row.name || '',
        plan: accountId ? planForAccount(accountId) : asPlan(planByOwner.get(row.owner_id || '')?.plan as string | undefined),
        country: profileById.get(row.owner_id || '')?.country || null,
        at: row.created_at,
      };
    })
    .filter((row) => row.name);
  const pageGeoRows = pageRows.map((row) => ({ country: row.country, views: Number(row.views) || 0, signed_in: row.signed_in, plan: row.plan }));
  const scopeGeoRows = scopeRows.map((row) => ({
    country: row.country, views: Number(row.views) || 0, plan: row.plan, scope_id: row.scope_id,
    scopeName: names.get(row.scope_id) || null,
  }));
  const referrers = ((referrerRes.data || []) as { referrer: string; path: string; signed_in: boolean | null; plan: string | null; country: string | null; views: number }[])
    .map((row) => ({ from: row.referrer, path: row.path || '', signedIn: row.signed_in, plan: row.plan, country: row.country, views: Number(row.views) || 0 }))
    .filter((row) => row.from && row.views > 0);
  return {
    points,
    cards: {
      active: Number(totalRow?.active) || activeRows.length,
      accounts: createdAccounts.length,
      revenue: revenueTotal,
      visitors: Number(totalRow?.visitors) || 0,
    },
    active: { plans: activePlans, scopes: activeScopes, rows: activeRows },
    revenue,
    scopes,
    pages: {
      guest: seal(guestRaw),
      plans: Object.fromEntries(PLANS.map((plan) => [plan, seal(planRaw[plan])])) as Record<PlanKey, PageBundle>,
      scopes: scopeIds
        .map((id) => ({ id, name: names.get(id) || '', pages: seal(scopeRaw.get(id) || emptyRaw()) }))
        .filter((row) => row.name)
        .sort((a, b) => a.name.localeCompare(b.name)),
      regions: Object.fromEntries(REGIONS.map((region) => [region, seal(regionRaw[region])])) as Record<RegionKey, PageBundle>,
    },
    countries,
    created: { workspaces: createdBlock(workspacesCreated), scopes: createdBlock(scopesCreated) },
    referrers,
    visitGeo: {
      guest: geoOf(pageGeoRows, (row) => row.signed_in !== true),
      plans: Object.fromEntries(PLANS.map((plan) => [plan, geoOf(pageGeoRows, (row) => row.plan === plan)])) as Record<PlanKey, GeoSlice[]>,
      regions: Object.fromEntries(REGIONS.map((region) => [region, geoOf(pageGeoRows, (row) => !!row.country && regionOf(row.country) === region)])) as Record<RegionKey, GeoSlice[]>,
      scopes: scopeIds.map((id) => ({ id, countries: geoOf(scopeGeoRows, (row) => row.scope_id === id) })),
    },
    scopeGeo: {
      all: geoOf(scopeGeoRows, () => true),
      plans: Object.fromEntries(PLANS.map((plan) => [plan, geoOf(scopeGeoRows, (row) => row.plan === plan)])) as Record<PlanKey, GeoSlice[]>,
    },
    mcp: {
      agents: perUser.size,
      requests: mcpRequests,
      tools: Array.from(toolTotals, ([tool, requests]) => ({ tool, requests })).sort((a, b) => b.requests - a.requests || a.tool.localeCompare(b.tool)),
      plans: mcpPlans,
      regions: mcpRegions,
      scopes: Array.from(mcpScopeTotals, ([id, requests]) => ({ id, name: names.get(id) || '', requests }))
        .filter((row) => row.name)
        .sort((a, b) => b.requests - a.requests || a.name.localeCompare(b.name)),
      rows: mcpUserRows,
    },
  };
}
