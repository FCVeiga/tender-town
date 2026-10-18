import {
  CONVERSION_WINDOW_MS, ENGAGED_MS, MEANINGFUL, REPORT_TZ, SESSION_IDLE_MS,
  keptTraffic, type AccountFact, type Fact, type Filters, type LogFact, lisbonKey, sourceLabel,
} from '@/lib/productModel';

export type Step = { key: string; label: string; count: number; fromPrev: number | null; fromFirst: number | null; lost: number; medianMs: number | null; sample: number };
export type Point = { t: string; visitors: number; sessions: number; starts: number; accounts: number; activations: number };
export type Observation = { text: string; href: string; sample: number };
export type Row = Record<string, string | number | null>;

export type ScopeAudience = { id: string; visits: number; people: number };
export type Diagnosis = {
  coverage: 'none' | 'partial' | 'full';
  instrumentAt: number | null;
  cards: {
    visitors: number | null;
    visitorNote: 'events' | 'page_log';
    sessions: number | null;
    engaged: number | null;
    cta: number | null;
    ctaVisitors: number | null;
    starts: number | null;
    accounts: number;
    activated: number;
    activatedBackfill: number;
  };
  previous: { visitors: number | null; sessions: number | null; engaged: number | null; cta: number | null; starts: number | null; accounts: number; activated: number };
  excluded: { bot: number; internal: number; unknown: number; shown: number };
  points: Point[];
  funnel: Step[];
  direct: Step[];
  bypass: number;
  observations: Observation[];
  acquisition: Row[];
  landings: Row[];
  countries: { code: string; visitors: number; engaged: number; accounts: number }[];
  paths: { path: string; count: number; other: boolean }[];
  content: Row[];
  scopes: Row[];
  guestScopes: ScopeAudience[];
  memberScopes: ScopeAudience[];
  devices: { desktop: number; mobile: number; tablet: number; unknown: number } | null;
  signup: {
    emailStarts: number;
    googleStarts: number;
    emailAccounts: number;
    googleAccounts: number;
    logins: number;
    validation: { code: string; count: number }[];
    errors: { code: string; count: number }[];
    incompleteOauth: number;
    noOutcome: number;
    latencyMs: number | null;
    byDevice: Row[];
  };
  activation: Step[];
  gates: { code: string; count: number }[];
  free: { context: number; restricted: number; failed: number; completed: number; returned: number };
  health: {
    lastAt: number | null;
    ingestErrors: number;
    duplicates: number;
    logViews: number;
    logVisitors: number;
    eventViews: number;
    eventVisitors: number;
    dbAccounts: number;
    eventAccounts: number;
    liveEventAccounts: number;
    missingAttribution: number;
    unknownDevice: number;
    unknownCountry: number;
    backfilled: number;
    total: number;
  };
  legacy: { views: number; visitors: number; tenderViews: number; referrers: Row[]; pages: Row[] };
  limitations: string[];
};

const FUNNEL: [string, string][] = [
  ['session_started', 'Session started'],
  ['meaningful', 'Meaningful product interaction'],
  ['signup_cta_clicked', 'Signup action clicked'],
  ['signup_page_viewed', 'Signup page viewed'],
  ['signup_started', 'Signup flow started'],
  ['account_created', 'Account created'],
  ['company_context_saved', 'Company context ready'],
  ['evaluation_completed', 'Evaluation completed'],
];

const DIRECT: [string, string][] = [
  ['signup_page_viewed', 'Signup page viewed'],
  ['signup_started', 'Signup flow started'],
  ['account_created', 'Account created'],
  ['company_context_saved', 'Company context ready'],
  ['evaluation_completed', 'Evaluation completed'],
];

const AFTER: [string, string][] = [
  ['account_created', 'Account created'],
  ['company_context_saved', 'Company context ready'],
  ['tender_viewed', 'Tender opened'],
  ['evaluation_requested', 'Evaluation requested'],
  ['evaluation_completed', 'Evaluation completed'],
  ['proposal_brief_completed', 'Proposal brief completed'],
  ['returned', 'Returned on another day'],
];

function median(values: number[]) {
  if (values.length < 5) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function group(facts: Fact[]) {
  const by = new Map<string, Fact[]>();
  for (const fact of facts) {
    const rows = by.get(fact.visitor) || [];
    rows.push(fact);
    by.set(fact.visitor, rows);
  }
  for (const rows of by.values()) rows.sort((a, b) => a.at - b.at);
  return by;
}

function reached(rows: Fact[], key: string, after: number, windowEnd: number) {
  const hit = (row: Fact) => row.at >= after && row.at <= windowEnd;
  if (key === 'meaningful') return rows.find((row) => MEANINGFUL.has(row.name as never) && !row.demo && hit(row)) || null;
  if (key === 'signup_started') return rows.find((row) => (row.name === 'signup_form_started' || row.name === 'oauth_started' || row.name === 'signup_submitted') && hit(row)) || null;
  if (key === 'returned') {
    const account = rows.find((row) => row.name === 'account_created');
    if (!account) return null;
    const day = lisbonKey(account.at, false);
    return rows.find((row) => row.at > account.at && row.at <= windowEnd && lisbonKey(row.at, false) !== day && !row.backfilled) || null;
  }
  if (key === 'evaluation_completed') return rows.find((row) => row.name === 'evaluation_completed' && !row.demo && hit(row)) || null;
  return rows.find((row) => row.name === key && hit(row)) || null;
}

function stepsOf(visitors: Map<string, Fact[]>, keys: [string, string][], pickFrom: (rows: Fact[]) => number | null): Step[] {
  const hits = keys.map(() => [] as number[]);
  for (const rows of visitors.values()) {
    const origin = pickFrom(rows);
    if (origin == null) continue;
    const windowEnd = origin + CONVERSION_WINDOW_MS;
    let previous = origin;
    for (let i = 0; i < keys.length; i++) {
      const hit = reached(rows, keys[i][0], previous, windowEnd);
      if (!hit) break;
      hits[i].push(hit.at);
      previous = hit.at;
    }
  }
  const first = hits[0]?.length || 0;
  return keys.map(([, label], index) => {
    const count = hits[index]?.length || 0;
    const prev = index === 0 ? count : (hits[index - 1]?.length || 0);
    const gaps: number[] = [];
    if (index > 0) for (let i = 0; i < count; i++) gaps.push((hits[index][i] || 0) - (hits[index - 1][i] || 0));
    return {
      key: keys[index][0], label, count,
      fromPrev: index === 0 || prev === 0 ? null : count / prev,
      fromFirst: first === 0 ? null : count / first,
      lost: index === 0 ? 0 : Math.max(prev - count, 0),
      medianMs: index === 0 ? null : median(gaps),
      sample: count,
    };
  });
}

function engagedSessions(facts: Fact[]) {
  const sessions = new Map<string, boolean>();
  for (const fact of facts) {
    const on = (fact.durationMs || 0) >= ENGAGED_MS || MEANINGFUL.has(fact.name as never);
    sessions.set(fact.session, sessions.get(fact.session) || on);
  }
  let count = 0;
  for (const on of sessions.values()) if (on) count += 1;
  return { sessions: sessions.size, engaged: count };
}

function accountIds(facts: Fact[]) {
  const ids = new Set<string>();
  for (const fact of facts) if (fact.name === 'account_created' && fact.userId && !fact.demo) ids.add(fact.userId);
  return ids;
}

function activatedIds(facts: Fact[]) {
  const ids = new Set<string>();
  const backfill = new Set<string>();
  for (const fact of facts) {
    if (fact.name !== 'evaluation_completed' || fact.demo || !fact.userId) continue;
    ids.add(fact.userId);
    if (fact.backfilled) backfill.add(fact.userId);
  }
  return { ids, backfill: [...ids].filter((id) => backfill.has(id)).length };
}

function sliceWindow(facts: Fact[], start: number, end: number) {
  return facts.filter((fact) => fact.at >= start && fact.at < end);
}

function cardsFor(facts: Fact[], accounts: AccountFact[], covered: boolean, logVisitors: number | null) {
  const live = facts.filter((fact) => !fact.backfilled);
  const engagement = engagedSessions(live.filter((fact) => fact.name === 'session_started' || fact.name === 'engagement_recorded' || MEANINGFUL.has(fact.name as never) || fact.name === 'page_viewed'));
  const sessions = new Set(live.filter((fact) => fact.name === 'session_started').map((fact) => fact.session));
  const cta = live.filter((fact) => fact.name === 'signup_cta_clicked');
  const starts = new Set(live.filter((fact) => fact.name === 'signup_form_started' || fact.name === 'oauth_started' || fact.name === 'signup_submitted').map((fact) => fact.visitor));
  const activated = activatedIds(facts);
  const hasEvents = live.some((fact) => fact.name === 'session_started' || fact.name === 'page_viewed');
  const measured = covered && hasEvents;
  return {
    visitors: measured ? new Set(live.map((fact) => fact.visitor)).size : logVisitors,
    visitorNote: measured ? 'events' as const : 'page_log' as const,
    sessions: measured ? sessions.size : null,
    engaged: measured ? engagement.engaged : null,
    cta: measured || cta.length ? cta.length : null,
    ctaVisitors: new Set(cta.map((fact) => fact.visitor)).size,
    starts: measured || starts.size ? starts.size : null,
    accounts: accounts.length,
    activated: activated.ids.size,
    activatedBackfill: activated.backfill,
  };
}

function pointsOf(facts: Fact[], accounts: AccountFact[], filters: Filters): Point[] {
  const keys: string[] = [];
  const step = filters.hourly ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  for (let t = filters.start; t < filters.end && keys.length < 120; t += step) keys.push(lisbonKey(t + step / 2, filters.hourly));
  const by = new Map(keys.map((key) => [key, { t: key, visitors: new Set<string>(), sessions: new Set<string>(), starts: new Set<string>(), accounts: 0, activations: new Set<string>() }]));
  for (const fact of facts) {
    if (fact.backfilled && fact.name !== 'evaluation_completed' && fact.name !== 'account_created') continue;
    const bucket = by.get(lisbonKey(fact.at, filters.hourly));
    if (!bucket) continue;
    if (!fact.backfilled) {
      bucket.visitors.add(fact.visitor);
      if (fact.name === 'session_started') bucket.sessions.add(fact.session);
      if (fact.name === 'signup_form_started' || fact.name === 'oauth_started' || fact.name === 'signup_submitted') bucket.starts.add(fact.visitor);
    }
    if (fact.name === 'evaluation_completed' && !fact.demo && fact.userId) bucket.activations.add(fact.userId);
  }
  for (const account of accounts) {
    const bucket = by.get(lisbonKey(account.at, filters.hourly));
    if (bucket) bucket.accounts += 1;
  }
  return [...by.values()].map((bucket) => ({
    t: bucket.t, visitors: bucket.visitors.size, sessions: bucket.sessions.size, starts: bucket.starts.size, accounts: bucket.accounts, activations: bucket.activations.size,
  }));
}

function acquisitionOf(facts: Fact[], filters: Filters): Row[] {
  const live = facts.filter((fact) => !fact.backfilled);
  const buckets = new Map<string, { visitors: Set<string>; sessions: Set<string>; engaged: Set<string>; tenders: Set<string>; examples: Set<string>; starts: Set<string>; accounts: Set<string>; activations: Set<string> }>();
  for (const fact of live) {
    const source = filters.attr === 'session' ? fact.source : fact.firstSource;
    const medium = filters.attr === 'session' ? fact.medium : fact.firstMedium;
    const campaign = filters.attr === 'session' ? fact.campaign : fact.firstCampaign;
    const key = [source || 'unknown', medium || 'unknown', campaign || ''].join('|');
    const row = buckets.get(key) || { visitors: new Set(), sessions: new Set(), engaged: new Set(), tenders: new Set(), examples: new Set(), starts: new Set(), accounts: new Set(), activations: new Set() };
    row.visitors.add(fact.visitor);
    row.sessions.add(fact.session);
    if ((fact.durationMs || 0) >= ENGAGED_MS || MEANINGFUL.has(fact.name as never)) row.engaged.add(fact.session);
    if (fact.name === 'tender_viewed') row.tenders.add(fact.visitor);
    if (fact.name === 'example_opened' || fact.name === 'example_evaluation_started') row.examples.add(fact.visitor);
    if (fact.name === 'signup_form_started' || fact.name === 'oauth_started' || fact.name === 'signup_submitted') row.starts.add(fact.visitor);
    if (fact.name === 'account_created' && fact.userId) row.accounts.add(fact.userId);
    if (fact.name === 'evaluation_completed' && !fact.demo && fact.userId) row.activations.add(fact.userId);
    buckets.set(key, row);
  }
  return [...buckets.entries()].map(([key, row]) => {
    const [source, medium, campaign] = key.split('|');
    const visitors = row.visitors.size;
    return {
      source: sourceLabel(source, medium), campaign: campaign || '—', visitors, sessions: row.sessions.size, engaged: row.engaged.size,
      tenders: row.tenders.size, examples: row.examples.size, starts: row.starts.size, accounts: row.accounts.size, activations: row.activations.size,
      conversion: visitors ? row.accounts.size / visitors : null,
    };
  }).sort((a, b) => Number(b.visitors) - Number(a.visitors)).slice(0, 40);
}

function landingOf(facts: Fact[]): Row[] {
  const live = facts.filter((fact) => !fact.backfilled && fact.name === 'session_started');
  const byVisitor = group(facts.filter((fact) => !fact.backfilled));
  const buckets = new Map<string, { visits: number; engaged: Set<string>; product: Set<string>; starts: Set<string>; accounts: Set<string> }>();
  for (const fact of live) {
    const key = fact.landing || fact.path || 'Unknown';
    const row = buckets.get(key) || { visits: 0, engaged: new Set(), product: new Set(), starts: new Set(), accounts: new Set() };
    row.visits += 1;
    const journey = byVisitor.get(fact.visitor) || [];
    if (journey.some((item) => item.session === fact.session && ((item.durationMs || 0) >= ENGAGED_MS || MEANINGFUL.has(item.name as never)))) row.engaged.add(fact.session);
    if (journey.some((item) => MEANINGFUL.has(item.name as never) && item.at >= fact.at)) row.product.add(fact.visitor);
    if (journey.some((item) => (item.name === 'signup_form_started' || item.name === 'oauth_started') && item.at >= fact.at)) row.starts.add(fact.visitor);
    if (journey.some((item) => item.name === 'account_created' && item.at >= fact.at)) row.accounts.add(fact.visitor);
    buckets.set(key, row);
  }
  return [...buckets.entries()].map(([landing, row]) => ({
    landing, visits: row.visits, engaged: row.engaged.size, product: row.product.size, starts: row.starts.size, accounts: row.accounts.size,
  })).sort((a, b) => Number(b.visits) - Number(a.visits)).slice(0, 30);
}

function countriesOf(facts: Fact[], accounts: AccountFact[]) {
  const visitors = new Map<string, Set<string>>();
  const engaged = new Map<string, Set<string>>();
  for (const fact of facts) {
    if (fact.backfilled) continue;
    const code = fact.country || 'unknown';
    const set = visitors.get(code) || new Set<string>();
    set.add(fact.visitor);
    visitors.set(code, set);
    if ((fact.durationMs || 0) >= ENGAGED_MS || MEANINGFUL.has(fact.name as never)) {
      const sessions = engaged.get(code) || new Set<string>();
      sessions.add(fact.session);
      engaged.set(code, sessions);
    }
  }
  const created = new Map<string, number>();
  for (const account of accounts) created.set(account.country || 'unknown', (created.get(account.country || 'unknown') || 0) + 1);
  const codes = new Set([...visitors.keys(), ...created.keys()]);
  return [...codes].map((code) => ({
    code, visitors: visitors.get(code)?.size || 0, engaged: engaged.get(code)?.size || 0, accounts: created.get(code) || 0,
  })).sort((a, b) => b.visitors - a.visitors || b.accounts - a.accounts);
}

function pathsOf(facts: Fact[], steps: number) {
  const now = Math.max(...facts.map((fact) => fact.at), 0);
  const counts = new Map<string, number>();
  for (const rows of group(facts.filter((fact) => !fact.backfilled && (fact.name === 'page_viewed' || fact.name === 'session_started'))).values()) {
    const sessions = new Map<string, Fact[]>();
    for (const row of rows) if (row.name === 'page_viewed') {
      const list = sessions.get(row.session) || [];
      list.push(row);
      sessions.set(row.session, list);
    }
    for (const [session, pages] of sessions) {
      const last = pages[pages.length - 1];
      const closed = now - last.at > SESSION_IDLE_MS;
      const types = pages.slice(0, steps).map((page) => page.pageType || 'other');
      if (closed && types.length < steps) types.push('exit');
      else if (!closed && types.length < steps) types.push('in progress');
      counts.set(types.join(' → '), (counts.get(types.join(' → ')) || 0) + (session ? 1 : 0));
    }
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const head = ranked.slice(0, 8).map(([path, count]) => ({ path, count, other: false }));
  const rest = ranked.slice(8).reduce((sum, [, count]) => sum + count, 0);
  if (rest) head.push({ path: 'Other', count: rest, other: true });
  return head;
}

function contentOf(facts: Fact[]): Row[] {
  const live = facts.filter((fact) => !fact.backfilled);
  const pages = new Map<string, { type: string; views: number; visitors: Set<string>; entrances: number; ms: number; scroll: number; scrollN: number; cta: number; exits: number; assists: Set<string> }>();
  const bySession = new Map<string, Fact[]>();
  for (const fact of live) {
    const list = bySession.get(fact.session) || [];
    list.push(fact);
    bySession.set(fact.session, list);
  }
  for (const rows of bySession.values()) {
    rows.sort((a, b) => a.at - b.at);
    const views = rows.filter((row) => row.name === 'page_viewed');
    views.forEach((view, index) => {
      const key = view.path || 'Unknown';
      const row = pages.get(key) || { type: view.pageType || 'other', views: 0, visitors: new Set<string>(), entrances: 0, ms: 0, scroll: 0, scrollN: 0, cta: 0, exits: 0, assists: new Set<string>() };
      row.views += 1;
      row.visitors.add(view.visitor);
      if (index === 0) row.entrances += 1;
      pages.set(key, row);
    });
  }
  for (const fact of live) {
    if (!fact.path) continue;
    const row = pages.get(fact.path);
    if (!row) continue;
    if (fact.name === 'engagement_recorded') {
      row.ms += fact.durationMs || 0;
      if (fact.scrollPct != null) { row.scroll += fact.scrollPct; row.scrollN += 1; }
    }
    if (fact.name === 'signup_cta_clicked') row.cta += 1;
  }
  const now = Math.max(...live.map((fact) => fact.at), 0);
  for (const rows of bySession.values()) {
    const views = rows.filter((row) => row.name === 'page_viewed');
    const last = views[views.length - 1];
    if (!last?.path) continue;
    const row = pages.get(last.path);
    if (!row) continue;
    if (now - last.at > SESSION_IDLE_MS) row.exits += 1;
    if (rows.some((item) => item.name === 'account_created')) row.assists.add(last.visitor);
  }
  return [...pages.entries()].map(([path, row]) => ({
    path, type: row.type, entrances: row.entrances, views: row.views, visitors: row.visitors.size,
    engaged: row.views ? Math.round(row.ms / row.views / 1000) : null,
    scroll: row.scrollN ? Math.round(row.scroll / row.scrollN) : null,
    cta: row.cta, exits: row.exits, assists: row.assists.size,
  })).sort((a, b) => Number(b.views) - Number(a.views)).slice(0, 40);
}

function scopeRows(facts: Fact[]): Row[] {
  const buckets = new Map<string, { views: number; selects: number; tenders: Set<string>; starts: Set<string>; accounts: Set<string>; activations: Set<string> }>();
  for (const fact of facts) {
    if (!fact.scopeId || fact.backfilled) continue;
    const row = buckets.get(fact.scopeId) || { views: 0, selects: 0, tenders: new Set(), starts: new Set(), accounts: new Set(), activations: new Set() };
    if (fact.name === 'page_viewed') row.views += 1;
    if (fact.name === 'scope_selected') row.selects += 1;
    if (fact.name === 'tender_viewed') row.tenders.add(fact.visitor);
    if (fact.name === 'signup_form_started' || fact.name === 'oauth_started') row.starts.add(fact.visitor);
    if (fact.name === 'account_created' && fact.userId) row.accounts.add(fact.userId);
    if (fact.name === 'evaluation_completed' && !fact.demo && fact.userId) row.activations.add(fact.userId);
    buckets.set(fact.scopeId, row);
  }
  return [...buckets.entries()].map(([scope, row]) => ({
    scope, views: row.views, selects: row.selects, tenders: row.tenders.size, starts: row.starts.size, accounts: row.accounts.size, activations: row.activations.size,
  })).sort((a, b) => Number(b.views) - Number(a.views));
}

function signupOf(facts: Fact[]) {
  const live = facts.filter((fact) => !fact.backfilled);
  const emailStarts = new Set(live.filter((fact) => fact.name === 'signup_form_started' || fact.name === 'signup_submitted').map((fact) => fact.flow || fact.visitor));
  const googleStarts = new Set(live.filter((fact) => fact.name === 'oauth_started').map((fact) => fact.flow || fact.visitor));
  const emailAccounts = live.filter((fact) => fact.name === 'account_created' && fact.cta !== 'google').length;
  const googleAccounts = live.filter((fact) => fact.name === 'account_created' && fact.cta === 'google').length;
  const validation = countBy(live.filter((fact) => fact.name === 'signup_validation_failed'), (fact) => fact.errorCode || 'unknown');
  const errors = countBy(live.filter((fact) => fact.name === 'authentication_failed'), (fact) => fact.errorCode || 'unknown');
  const incompleteOauth = live.filter((fact) => fact.name === 'authentication_failed' && fact.errorCode === 'oauth_incomplete').length;
  const flows = new Set(live.filter((fact) => fact.name === 'signup_submitted' || fact.name === 'oauth_started').map((fact) => fact.flow).filter(Boolean) as string[]);
  const finished = new Set(live.filter((fact) => fact.flow && (fact.name === 'account_created' || fact.name === 'login_completed' || fact.name === 'authentication_failed' || fact.name === 'signup_validation_failed')).map((fact) => fact.flow as string));
  let noOutcome = 0;
  for (const flow of flows) if (!finished.has(flow)) noOutcome += 1;
  const latency = live.filter((fact) => fact.name === 'account_created' && fact.durationMs != null).map((fact) => fact.durationMs as number);
  const devices = new Map<string, { attempts: number; failures: number }>();
  for (const fact of live) {
    if (fact.name !== 'signup_submitted' && fact.name !== 'oauth_started' && fact.name !== 'authentication_failed' && fact.name !== 'signup_validation_failed') continue;
    const row = devices.get(fact.device || 'unknown') || { attempts: 0, failures: 0 };
    if (fact.name === 'signup_submitted' || fact.name === 'oauth_started') row.attempts += 1;
    if (fact.name === 'authentication_failed' || fact.name === 'signup_validation_failed') row.failures += 1;
    devices.set(fact.device || 'unknown', row);
  }
  return {
    emailStarts: emailStarts.size, googleStarts: googleStarts.size, emailAccounts, googleAccounts,
    logins: live.filter((fact) => fact.name === 'login_completed').length,
    validation, errors, incompleteOauth, noOutcome, latencyMs: median(latency),
    byDevice: [...devices.entries()].map(([device, row]) => ({ device, attempts: row.attempts, failures: row.failures })),
  };
}

function countBy(facts: Fact[], key: (fact: Fact) => string) {
  const map = new Map<string, number>();
  for (const fact of facts) map.set(key(fact), (map.get(key(fact)) || 0) + 1);
  return [...map.entries()].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count);
}

function activationOf(facts: Fact[], accounts: AccountFact[]) {
  const byUser = new Map<string, Fact[]>();
  for (const fact of facts) {
    if (!fact.userId) continue;
    const rows = byUser.get(fact.userId) || [];
    rows.push(fact);
    byUser.set(fact.userId, rows);
  }
  for (const account of accounts) if (!byUser.has(account.id)) byUser.set(account.id, [{
    name: 'account_created', at: account.at, visitor: account.id, session: account.id, userId: account.id,
    flow: null, pageType: null, path: null, landing: null, referrerHost: null, source: null, medium: null, campaign: null,
    firstSource: null, firstMedium: null, firstCampaign: null, device: 'unknown', country: account.country, scopeId: null,
    contentId: null, cta: null, placement: null, plan: null, entitlement: null, ok: true, errorCode: null, demo: false,
    traffic: account.internal ? 'internal' : 'human', backfilled: true, newVisitor: true, signedIn: true, durationMs: null, scrollPct: null,
  }]);
  return stepsOf(byUser, AFTER, (rows) => rows.find((row) => row.name === 'account_created')?.at ?? null);
}

function freeOf(facts: Fact[]) {
  const free = facts.filter((fact) => fact.plan === 'free' && fact.userId);
  const users = new Set(free.map((fact) => fact.userId as string));
  const has = (name: string, pred?: (fact: Fact) => boolean) => new Set(free.filter((fact) => fact.name === name && (!pred || pred(fact))).map((fact) => fact.userId)).size;
  let returned = 0;
  const byUser = group(facts.filter((fact) => fact.userId && users.has(fact.userId)));
  for (const rows of byUser.values()) {
    const done = rows.find((row) => row.name === 'evaluation_completed' && !row.demo);
    if (done && rows.some((row) => row.at > done.at && lisbonKey(row.at, false) !== lisbonKey(done.at, false))) returned += 1;
  }
  return {
    context: has('company_context_saved'),
    restricted: has('gate_viewed', (fact) => fact.entitlement === 'plan_restriction' || fact.entitlement === 'usage_exhausted' || fact.errorCode === 'plan' || fact.errorCode === 'quota'),
    failed: has('evaluation_failed'),
    completed: has('evaluation_completed', (fact) => !fact.demo),
    returned,
  };
}

function observationsOf(input: {
  facts: Fact[]; accounts: number; activated: number; log: Diagnosis['legacy']; coverage: Diagnosis['coverage']; liveAccounts: number;
}): Observation[] {
  const notes: Observation[] = [];
  const live = input.facts.filter((fact) => !fact.backfilled);
  const tenderVisitors = new Set(live.filter((fact) => fact.name === 'tender_viewed').map((fact) => fact.visitor));
  const tenderCta = new Set(live.filter((fact) => fact.name === 'signup_cta_clicked' && tenderVisitors.has(fact.visitor)).map((fact) => fact.visitor));
  if (tenderVisitors.size >= 5) notes.push({
    text: `${tenderVisitors.size} visitors opened a tender. ${tenderCta.size} of them clicked a signup action.`,
    href: '/dashboard?tab=journeys', sample: tenderVisitors.size,
  });
  const submits = live.filter((fact) => fact.name === 'signup_submitted').length;
  const invalid = live.filter((fact) => fact.name === 'signup_validation_failed').length;
  const emailAccounts = live.filter((fact) => fact.name === 'account_created' && fact.cta !== 'google').length;
  if (submits >= 3) notes.push({
    text: `${submits} email signup submissions produced ${invalid} validation failures and ${emailAccounts} accounts.`,
    href: '/dashboard?tab=signup', sample: submits,
  });
  const articleSessions = new Set(live.filter((fact) => fact.name === 'session_started' && (fact.landing || '').startsWith('/blog/')).map((fact) => fact.visitor));
  const continued = new Set(live.filter((fact) => articleSessions.has(fact.visitor) && MEANINGFUL.has(fact.name as never)).map((fact) => fact.visitor));
  if (articleSessions.size >= 5) notes.push({
    text: `${articleSessions.size} sessions landed on an article. ${continued.size} continued to a product action.`,
    href: '/dashboard?tab=acquisition', sample: articleSessions.size,
  });
  if (input.coverage !== 'none' && input.accounts > input.liveAccounts) notes.push({
    text: `${input.accounts} accounts were created in the database in this range. ${input.liveAccounts} of them have a live signup event.`,
    href: '/dashboard?tab=health', sample: input.accounts,
  });
  if (input.coverage !== 'full' && input.log.visitors > 0 && input.accounts === 0) notes.push({
    text: `The page log counts ${input.log.visitors} estimated visitors and ${input.log.tenderViews} tender page views. No accounts were created.`,
    href: '/dashboard?tab=acquisition', sample: input.log.visitors,
  });
  if (input.accounts > 0 && input.activated === 0 && input.accounts >= 3) notes.push({
    text: `${input.accounts} accounts were created. None has a company-specific evaluation in this range.`,
    href: '/dashboard?tab=signup', sample: input.accounts,
  });
  return notes.slice(0, 6);
}

function legacyOf(rows: LogFact[], filters: Filters) {
  const inRange = rows.filter((row) => row.at >= filters.start && row.at < filters.end);
  const visitors = new Set(inRange.map((row) => row.visitor));
  const hosts = new Map<string, { views: number; visitors: Set<string> }>();
  const pages = new Map<string, number>();
  let tenderViews = 0;
  for (const row of inRange) {
    if (row.kind === 'tender') tenderViews += 1;
    const path = row.path || 'Unknown';
    pages.set(path, (pages.get(path) || 0) + 1);
    let host = 'Direct or unknown';
    if (row.referrer) {
      try { host = new URL(row.referrer).hostname.replace(/^www\./, ''); } catch { host = row.referrer.startsWith('/') ? 'On site' : 'Direct or unknown'; }
    }
    const bucket = hosts.get(host) || { views: 0, visitors: new Set<string>() };
    bucket.views += 1;
    bucket.visitors.add(row.visitor);
    hosts.set(host, bucket);
  }
  return {
    views: inRange.length,
    visitors: visitors.size,
    tenderViews,
    referrers: [...hosts.entries()].map(([host, row]) => ({ host, views: row.views, visitors: row.visitors.size })).sort((a, b) => b.views - a.views).slice(0, 20),
    pages: [...pages.entries()].map(([path, views]) => ({ path, views })).sort((a, b) => b.views - a.views).slice(0, 20),
  };
}

function scopeAudiences(rows: LogFact[], signedIn: boolean): ScopeAudience[] {
  const buckets = new Map<string, { visits: number; people: Set<string> }>();
  for (const row of rows) {
    if (signedIn ? row.signedIn !== true : row.signedIn === true) continue;
    if (!row.scopeIds.length) continue;
    const who = signedIn ? (row.userId || row.visitor) : row.visitor;
    for (const id of row.scopeIds) {
      const bucket = buckets.get(id) || { visits: 0, people: new Set<string>() };
      bucket.visits += 1;
      bucket.people.add(who);
      buckets.set(id, bucket);
    }
  }
  return [...buckets.entries()]
    .map(([id, bucket]) => ({ id, visits: bucket.visits, people: bucket.people.size }))
    .sort((a, b) => b.visits - a.visits || b.people - a.people)
    .slice(0, 20);
}

function devicesOf(facts: Fact[]) {
  const views = facts.filter((fact) => fact.name === 'page_viewed' && !fact.backfilled);
  if (!views.length) return null;
  const seen = new Map<string, string>();
  for (const fact of views) if (!seen.has(fact.visitor)) seen.set(fact.visitor, fact.device || 'unknown');
  const counts = { desktop: 0, mobile: 0, tablet: 0, unknown: 0 };
  for (const device of seen.values()) {
    if (device === 'desktop' || device === 'mobile' || device === 'tablet') counts[device] += 1;
    else counts.unknown += 1;
  }
  return counts;
}

export function buildDiagnosis(input: {
  facts: Fact[];
  previousFacts: Fact[];
  accounts: AccountFact[];
  previousAccounts: AccountFact[];
  log: LogFact[];
  filters: Filters;
  instrumentAt: number | null;
  ingestErrors: number;
  duplicates: number;
  now?: number;
}): Diagnosis {
  const covered = input.instrumentAt != null && input.instrumentAt <= input.filters.start;
  const coverage = input.instrumentAt == null ? 'none' : covered ? 'full' : 'partial';
  const facts = input.facts.filter((fact) => keptTraffic(fact.traffic, input.filters));
  const previous = input.previousFacts.filter((fact) => keptTraffic(fact.traffic, input.filters));
  const liveFacts = input.facts;
  const excluded = {
    bot: liveFacts.filter((fact) => fact.traffic === 'bot').length,
    internal: liveFacts.filter((fact) => fact.traffic === 'internal').length,
    unknown: liveFacts.filter((fact) => fact.traffic === 'unknown').length,
    shown: facts.length,
  };
  const logRows = input.log.filter((row) => row.at >= input.filters.start && row.at < input.filters.end);
  const log = legacyOf(input.log, input.filters);
  const currentCards = cardsFor(facts, input.accounts, coverage === 'full', coverage === 'full' ? null : log.visitors);
  const prevLog = legacyOf(input.log, { ...input.filters, start: input.filters.prevStart, end: input.filters.prevEnd });
  const previousCards = cardsFor(previous, input.previousAccounts, coverage === 'full', coverage === 'full' ? null : prevLog.visitors);
  const withSession = group(facts.filter((fact) => !fact.backfilled));
  const mainVisitors = new Map([...withSession].filter(([, rows]) => rows.some((row) => row.name === 'session_started')));
  const directVisitors = new Map([...withSession].filter(([, rows]) => {
    const signup = rows.find((row) => row.name === 'signup_page_viewed' || row.name === 'oauth_started');
    if (!signup) return false;
    return !rows.some((row) => MEANINGFUL.has(row.name as never) && row.at < signup.at);
  }));
  const recordedAccounts = new Set(facts.filter((fact) => fact.name === 'account_created' && !fact.backfilled).map((fact) => fact.userId).filter(Boolean));
  const bypass = input.accounts.filter((account) => !recordedAccounts.has(account.id)).length;
  const activated = activatedIds(facts);
  const liveAccounts = facts.filter((fact) => fact.name === 'account_created' && !fact.backfilled && fact.userId).length;
  const eventViews = facts.filter((fact) => fact.name === 'page_viewed' && !fact.backfilled).length;
  const eventVisitors = new Set(facts.filter((fact) => !fact.backfilled).map((fact) => fact.visitor)).size;
  const attributed = facts.filter((fact) => !fact.backfilled && (fact.name === 'session_started' || fact.name === 'page_viewed'));
  const missingAttribution = attributed.filter((fact) => !fact.firstSource || fact.firstSource === 'direct' || fact.firstSource === 'unknown').length;
  return {
    coverage, instrumentAt: input.instrumentAt,
    cards: currentCards,
    previous: {
      visitors: previousCards.visitors, sessions: previousCards.sessions, engaged: previousCards.engaged,
      cta: previousCards.cta, starts: previousCards.starts, accounts: previousCards.accounts, activated: previousCards.activated,
    },
    excluded,
    points: pointsOf(facts, input.accounts, input.filters),
    funnel: coverage === 'none' ? [] : stepsOf(mainVisitors, FUNNEL, (rows) => rows.find((row) => row.name === 'session_started')?.at ?? null),
    direct: coverage === 'none' ? [] : stepsOf(directVisitors, DIRECT, (rows) => rows.find((row) => row.name === 'signup_page_viewed' || row.name === 'oauth_started')?.at ?? null),
    bypass,
    observations: observationsOf({ facts, accounts: input.accounts.length, activated: activated.ids.size, log, coverage, liveAccounts }),
    acquisition: acquisitionOf(facts, input.filters),
    landings: landingOf(facts),
    countries: countriesOf(facts, input.accounts),
    paths: pathsOf(facts, input.filters.steps),
    content: contentOf(facts),
    scopes: scopeRows(facts),
    guestScopes: scopeAudiences(logRows, false),
    memberScopes: scopeAudiences(logRows, true),
    devices: devicesOf(facts),
    signup: signupOf(facts),
    activation: activationOf(facts, input.accounts),
    gates: countBy(facts.filter((fact) => fact.name === 'gate_viewed' && !fact.backfilled), (fact) => fact.entitlement || fact.errorCode || 'unknown').map((row) => ({ code: row.code, count: row.count })),
    free: freeOf(facts),
    health: {
      lastAt: facts.reduce((max, fact) => Math.max(max, fact.at), 0) || null,
      ingestErrors: input.ingestErrors,
      duplicates: input.duplicates,
      logViews: log.views,
      logVisitors: log.visitors,
      eventViews,
      eventVisitors,
      dbAccounts: input.accounts.length,
      eventAccounts: accountIds(facts).size,
      liveEventAccounts: liveAccounts,
      missingAttribution,
      unknownDevice: facts.filter((fact) => !fact.backfilled && fact.device === 'unknown').length,
      unknownCountry: facts.filter((fact) => !fact.backfilled && !fact.country).length,
      backfilled: facts.filter((fact) => fact.backfilled).length,
      total: facts.length,
    },
    legacy: log,
    limitations: [
      `Times are stored in UTC and grouped in ${REPORT_TZ}.`,
      'Estimated visitors are browser cookies, not people.',
      'A direct or unknown source means the tag or referrer was absent. It does not mean the address was typed.',
      'Country can be a VPN or proxy and is not buying intent.',
      'The ordered funnel uses one visitor’s events inside 7 days. It starts when this instrumentation is deployed.',
      'Sample and example evaluations are separate events and are not activation.',
      'An exit is the last page of a session idle for 30 minutes. It is not a verdict on the page.',
      coverage === 'full' ? 'This range is fully inside the new event stream.' : 'Earlier page views stay in the page log. They are not rewritten as journeys.',
    ],
  };
}

export { FUNNEL, DIRECT, AFTER, REPORT_TZ };
