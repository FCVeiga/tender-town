/** Event schema version 1. Names stay stable. Add a name rather than renaming one. */

export const EVENT_VERSION = 1;
export const REPORT_TZ = 'Europe/Lisbon';
export const CONVERSION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_IDLE_MS = 30 * 60 * 1000;
export const ENGAGED_MS = 10_000;

export const EVENT_NAMES = [
  'session_started', 'page_viewed', 'scope_selected', 'search_submitted', 'search_results_viewed',
  'tender_viewed', 'signal_viewed', 'signup_cta_clicked', 'signup_page_viewed', 'signup_form_started',
  'signup_submitted', 'signup_validation_failed', 'oauth_started', 'oauth_callback_received',
  'authentication_failed', 'account_created', 'login_completed', 'company_context_saved',
  'evaluation_requested', 'evaluation_completed', 'evaluation_failed',
  'proposal_brief_requested', 'proposal_brief_completed', 'proposal_brief_failed',
  'gate_viewed', 'gate_cta_clicked', 'document_opened', 'example_opened',
  'example_evaluation_started', 'example_evaluation_completed', 'example_brief_started', 'example_brief_completed',
  'agent_connection_opened', 'agent_instructions_copied', 'engagement_recorded',
] as const;

export type EventName = (typeof EVENT_NAMES)[number];
const EVENT_SET = new Set<string>(EVENT_NAMES);

export const CLIENT_EVENTS = new Set<EventName>([
  'signup_cta_clicked', 'signup_form_started', 'scope_selected', 'search_submitted',
  'gate_viewed', 'gate_cta_clicked', 'document_opened', 'example_opened',
  'example_evaluation_started', 'example_evaluation_completed', 'example_brief_started', 'example_brief_completed',
  'agent_connection_opened', 'agent_instructions_copied', 'engagement_recorded',
]);

/** A scroll is not one of these. Opening a tender page emits tender_viewed. */
export const MEANINGFUL = new Set<EventName>([
  'scope_selected', 'search_submitted', 'tender_viewed', 'signal_viewed', 'example_opened', 'agent_connection_opened',
]);

export type Traffic = 'human' | 'bot' | 'unknown' | 'internal';
export type Device = 'desktop' | 'mobile' | 'tablet' | 'unknown';

export type Fact = {
  name: string;
  at: number;
  visitor: string;
  session: string;
  userId: string | null;
  flow: string | null;
  pageType: string | null;
  path: string | null;
  landing: string | null;
  referrerHost: string | null;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  firstSource: string | null;
  firstMedium: string | null;
  firstCampaign: string | null;
  device: string;
  country: string | null;
  scopeId: string | null;
  contentId: string | null;
  cta: string | null;
  placement: string | null;
  plan: string | null;
  entitlement: string | null;
  ok: boolean | null;
  errorCode: string | null;
  demo: boolean;
  traffic: Traffic;
  backfilled: boolean;
  newVisitor: boolean;
  signedIn: boolean;
  durationMs: number | null;
  scrollPct: number | null;
};

export type AccountFact = { id: string; at: number; country: string | null; internal: boolean };
export type LogFact = {
  at: number;
  visitor: string;
  path: string | null;
  kind: string | null;
  country: string | null;
  referrer: string | null;
  signedIn: boolean | null;
  userId: string | null;
  scopeIds: string[];
};

export function isEventName(value: string): value is EventName {
  return EVENT_SET.has(value);
}

/** First-party measurement is on unless a visitor has explicitly refused it. */
export function trackingAllowed(consent: string | undefined) {
  return consent !== 'no';
}

export function trafficOf(ua: string | null, internal: boolean): { traffic: Traffic; reason: string | null } {
  if (internal) return { traffic: 'internal', reason: 'staff_or_ignored' };
  const agent = (ua || '').trim();
  if (!agent) return { traffic: 'bot', reason: 'empty_user_agent' };
  if (/bot|crawler|spider|slurp|facebookexternalhit|embedly|quora|pinterest|redditbot|whatsapp|telegram|preview|curl\/|wget\/|httpie|python-requests|python-urllib|aiohttp|node-fetch|undici|go-http-client|axios\/|postman|insomnia|headlesschrome|playwright|puppeteer|phantomjs|scrapy/i.test(agent)) {
    return { traffic: 'bot', reason: 'user_agent' };
  }
  if (/Mozilla|AppleWebKit|Gecko|Chrome|Safari|Firefox|Edg\//i.test(agent)) return { traffic: 'human', reason: null };
  return { traffic: 'unknown', reason: 'unrecognised_user_agent' };
}

export function deviceOf(ua: string | null): Device {
  const agent = ua || '';
  if (!agent.trim()) return 'unknown';
  if (/iPad|Tablet/i.test(agent)) return 'tablet';
  if (/Mobi|Android|iPhone/i.test(agent)) return 'mobile';
  if (/Mozilla|AppleWebKit|Gecko/i.test(agent)) return 'desktop';
  return 'unknown';
}

const SEARCH = ['google.', 'bing.com', 'duckduckgo.com', 'search.yahoo', 'ecosia.org', 'baidu.com'];
const SOCIAL: [string, string][] = [
  ['linkedin.com', 'linkedin'], ['lnkd.in', 'linkedin'], ['reddit.com', 'reddit'],
  ['twitter.com', 'twitter'], ['x.com', 'twitter'], ['t.co', 'twitter'],
  ['facebook.com', 'facebook'], ['news.ycombinator.com', 'hackernews'],
];

export type Touch = { source: string; medium: string; campaign: string | null; landing: string | null; host: string | null };

/** Absent tags are direct/unknown. That is not evidence the address was typed. */
export function touchOf(input: { host: string; utmSource: string | null; utmMedium: string | null; utmCampaign: string | null; referrer: string | null; landing: string }): Touch {
  const campaign = cleanToken(input.utmCampaign);
  const utmSource = cleanToken(input.utmSource);
  const utmMedium = cleanToken(input.utmMedium);
  const ref = referrerHost(input.referrer, input.host);
  if (utmSource) return { source: utmSource, medium: utmMedium || 'unknown', campaign, landing: input.landing, host: ref };
  if (!ref) return { source: 'direct', medium: 'none', campaign: null, landing: input.landing, host: null };
  if (ref === input.host) return { source: 'direct', medium: 'none', campaign: null, landing: input.landing, host: null };
  if (/cursor\.(directory|com)$|directory\.cursor/.test(ref)) return { source: 'cursor', medium: 'directory', campaign, landing: input.landing, host: ref };
  const social = SOCIAL.find(([host]) => ref === host || ref.endsWith(`.${host}`));
  if (social) return { source: social[1], medium: 'social', campaign, landing: input.landing, host: ref };
  if (SEARCH.some((host) => ref.includes(host))) return { source: ref.replace(/^www\./, ''), medium: 'organic', campaign, landing: input.landing, host: ref };
  return { source: ref.replace(/^www\./, ''), medium: 'referral', campaign, landing: input.landing, host: ref };
}

export function referrerHost(raw: string | null, currentHost: string): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    if (host === currentHost) return currentHost;
    return host.slice(0, 120);
  } catch {
    return null;
  }
}

function cleanToken(value: string | null) {
  const text = (value || '').trim().toLowerCase().replace(/[^a-z0-9._~+/-]/g, '').slice(0, 80);
  return text || null;
}

export function pageOf(path: string): { type: string; contentId: string | null } {
  const clean = path.split('?')[0] || '/';
  if (clean === '/') return { type: 'home', contentId: null };
  if (clean === '/signup' || clean === '/login') return { type: clean.slice(1), contentId: null };
  if (clean === '/example') return { type: 'example', contentId: null };
  if (clean === '/pricing') return { type: 'pricing', contentId: null };
  if (clean === '/search') return { type: 'search', contentId: null };
  if (clean === '/markets' || clean.startsWith('/markets/')) return { type: 'market', contentId: clean.split('/')[2] || null };
  if (clean === '/blog') return { type: 'blog', contentId: null };
  if (clean.startsWith('/blog/')) return { type: 'article', contentId: decodeURIComponent(clean.split('/')[2] || '') || null };
  if (clean === '/signals' || clean.startsWith('/signals') || clean.startsWith('/news/signals')) return { type: 'signal', contentId: null };
  if (clean === '/news' || clean.startsWith('/news/')) {
    const id = clean.split('/')[2];
    return { type: id ? 'news' : 'news', contentId: id ? decodeURIComponent(id) : null };
  }
  if (clean === '/tenders' || clean.startsWith('/tenders/')) {
    const id = clean.split('/')[2];
    if (!id || ['rfps', 'rfis', 'grants', 'new'].includes(id)) return { type: 'tenders', contentId: null };
    return { type: 'tender', contentId: decodeURIComponent(id) };
  }
  if (clean.startsWith('/mcp') || clean === '/skills' || clean.startsWith('/skills/')) return { type: 'agent', contentId: null };
  return { type: 'other', contentId: null };
}

export function packTouch(touch: Touch) {
  return [touch.source, touch.medium, touch.campaign || '', touch.landing || '', touch.host || ''].map((part) => encodeURIComponent(part)).join('|');
}

export function unpackTouch(raw: string | undefined): Touch | null {
  if (!raw) return null;
  const parts = raw.split('|').map((part) => { try { return decodeURIComponent(part); } catch { return ''; } });
  if (!parts[0]) return null;
  return { source: parts[0], medium: parts[1] || 'unknown', campaign: parts[2] || null, landing: parts[3] || null, host: parts[4] || null };
}

export function sourceLabel(source: string | null, medium: string | null) {
  if (!source || source === 'unknown') return 'Unknown';
  if (source === 'direct' && (!medium || medium === 'none')) return 'Direct or unknown';
  return medium && medium !== 'none' && medium !== 'unknown' ? `${source} / ${medium}` : source;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function safeId(value: unknown) {
  return typeof value === 'string' && UUID.test(value) ? value : null;
}

const SAFE_PROP = /^(placement|cta|scopeId|contentId|pageType|path|errorCode|entitlement|plan|ok|demo|durationMs|scrollPct)$/;

/** Drops anything that could carry a password, address, document or token. */
export function safeProps(input: unknown): Record<string, string | number | boolean | null> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!SAFE_PROP.test(key)) continue;
    if (typeof value === 'boolean') out[key] = value;
    else if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    else if (typeof value === 'string') out[key] = value.slice(0, 180);
    else if (value == null) out[key] = null;
  }
  return out;
}

export function tzOffset(utcMs: number, timeZone = REPORT_TZ) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  const hour = get('hour') === 24 ? 0 : get('hour');
  return Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second')) - utcMs;
}

export function zonedStart(ymd: string) {
  const [year, month, day] = ymd.split('-').map(Number);
  if (!year || !month || !day) return null;
  const guess = Date.UTC(year, month - 1, day);
  const first = guess - tzOffset(guess);
  return guess - tzOffset(first);
}

export function lisbonKey(ms: number, hour: boolean) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORT_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
  const day = `${get('year')}-${get('month')}-${get('day')}`;
  return hour ? `${day} ${get('hour')}` : day;
}

export type TabKey = 'overview' | 'acquisition' | 'journeys' | 'signup' | 'health';
export type Filters = {
  tab: TabKey;
  start: number;
  end: number;
  prevStart: number;
  prevEnd: number;
  label: string;
  hourly: boolean;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  landing: string | null;
  device: string | null;
  country: string | null;
  visitor: 'all' | 'new' | 'returning';
  auth: 'all' | 'anon' | 'registered';
  scope: string | null;
  noise: boolean;
  only: Traffic | null;
  attr: 'first' | 'session';
  steps: 3 | 5;
  metric: 'visitors' | 'engaged' | 'accounts';
  partial: boolean;
};

const TABS = new Set(['overview', 'acquisition', 'journeys', 'signup', 'health']);
const RANGES: Record<string, number | null> = { '24h': 24 * 60 * 60 * 1000, '7d': 7 * 24 * 60 * 60 * 1000, '30d': 30 * 24 * 60 * 60 * 1000, '90d': 90 * 24 * 60 * 60 * 1000 };

export function filtersOf(query: Record<string, string | undefined>, now = Date.now()): Filters {
  const range = query.range && (query.range in RANGES || query.range === 'custom') ? query.range : '7d';
  let start: number;
  let end = now;
  let label = range === '24h' ? '24 hours' : range === '30d' ? '30 days' : range === '90d' ? '90 days' : '7 days';
  if (range === 'custom' && query.from && query.to) {
    const from = zonedStart(query.from);
    const to = zonedStart(query.to);
    if (from != null && to != null && to >= from) {
      start = from;
      end = to + 24 * 60 * 60 * 1000;
      label = `${query.from} – ${query.to}`;
    } else start = now - (RANGES['7d'] as number);
  } else start = now - (RANGES[range] || (RANGES['7d'] as number));
  if (end < start) end = start;
  const span = Math.max(end - start, 60 * 1000);
  const only = query.only === 'bot' || query.only === 'internal' || query.only === 'unknown' || query.only === 'human' ? query.only : null;
  return {
    tab: TABS.has(query.tab || '') ? query.tab as TabKey : 'overview',
    start, end, prevStart: start - span, prevEnd: start, label,
    hourly: span <= 48 * 60 * 60 * 1000,
    source: query.source?.slice(0, 80) || null,
    medium: null,
    campaign: null,
    landing: null,
    device: null,
    country: null,
    visitor: 'all',
    auth: 'all',
    scope: safeId(query.scope),
    noise: query.noise === '1',
    only,
    attr: query.attr === 'session' ? 'session' : 'first',
    steps: query.steps === '5' ? 5 : 3,
    metric: query.metric === 'engaged' || query.metric === 'accounts' ? query.metric : 'visitors',
    partial: false,
  };
}

export function keptTraffic(traffic: Traffic, filters: Filters) {
  if (filters.only) return traffic === filters.only;
  if (!filters.noise && (traffic === 'bot' || traffic === 'internal')) return false;
  return true;
}

export function attrOf(fact: Fact, filters: Filters) {
  return filters.attr === 'session'
    ? { source: fact.source, medium: fact.medium, campaign: fact.campaign }
    : { source: fact.firstSource, medium: fact.firstMedium, campaign: fact.firstCampaign };
}

export function matchesFact(fact: Fact, filters: Filters) {
  if (!keptTraffic(fact.traffic, filters)) return false;
  if (fact.at < filters.start || fact.at >= filters.end) return false;
  const attr = attrOf(fact, filters);
  if (filters.source && attr.source !== filters.source) return false;
  if (filters.medium && attr.medium !== filters.medium) return false;
  if (filters.campaign && attr.campaign !== filters.campaign) return false;
  if (filters.landing && fact.landing !== filters.landing) return false;
  if (filters.device && fact.device !== filters.device) return false;
  if (filters.country && fact.country !== filters.country) return false;
  if (filters.visitor === 'new' && !fact.newVisitor) return false;
  if (filters.visitor === 'returning' && fact.newVisitor) return false;
  if (filters.auth === 'anon' && fact.signedIn) return false;
  if (filters.auth === 'registered' && !fact.signedIn) return false;
  if (filters.scope && fact.scopeId !== filters.scope) return false;
  return true;
}
