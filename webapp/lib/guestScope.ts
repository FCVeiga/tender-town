/**
 * Which shared catalog scope a signed-out visitor sees.
 * Presets are ranked from the visitor's preferences (an explicit scope, scopes
 * they have opened, words in the link they arrived from, and their country).
 * The highest-ranked preset that currently has tenders or news is shown.
 * Empty presets are skipped, in order, until one has results. General is last.
 * Crawlers always stay on General so public list pages stay stable.
 */

export const GUEST_SCOPE_COOKIE = 'guest_scope';
export const GUEST_PREFS_COOKIE = 'guest_prefs';
export const GUEST_TZ_COOKIE = 'guest_tz';
export const GUEST_SCOPE_HEADER = 'x-guest-scope';
export const GUEST_GENERAL = 'general';
/** A scope the person chose. Guests and signed-in users both use it; signed-in reads count only with FOCUS_USER_COOKIE. */
export const FOCUS_COOKIE = 'tt_scope';
export const FOCUS_USER_COOKIE = 'tt_scope_user';
/** create, or switch:<scope id>, so signup and checkout can resume the action. */
export const INTENT_COOKIE = 'tt_intent';
/** 1 = the scope banner is collapsed. 0 = the person opened it again. */
export const BANNER_COOKIE = 'tt_banner';
/** What a visitor told the find-a-tender agent, before an account exists. */
export const FIND_COOKIE = 'tt_find';
export const SCOPE_QUERY_HEADER = 'x-tt-scope';

const SCOPE_QUERY = /^[a-z0-9-]{1,80}$/;

/** A scope slug or id safe to copy onto Home, Tenders and News links. */
export function scopeQuery(raw: string | null | undefined): string | null {
  const q = (raw || '').trim().toLowerCase();
  return SCOPE_QUERY.test(q) ? q : null;
}

/** Same order as the catalog cards. Kept here so middleware can use it. */
export const CATALOG_ORDER = [
  'Artificial Intelligence', 'Cybersecurity', 'Digital ID & Biometrics', 'EUDI Wallet',
  'Healthcare software', 'ERP & business software', 'Cloud platforms',
  'Workplace devices', 'Servers & data centres', 'Networks & telecoms', 'Medical equipment',
  'Building energy renovation', 'Solar & wind', 'Waste & recycling', 'Electric buses & charging', 'Water & wastewater',
];

export type GuestScopeChoice = {
  id: string; name: string; results: number;
  countries: Record<string, number>; terms: string[];
};

export type GuestSignals = {
  country: string | null; requested: string | null;
  prefs: Record<string, number>; words: string[];
};

const STOP = new Set('the and for with from that this your have will into about over more than also only their there what when which while news tender tenders public digital services service system systems software work them they this'.split(' '));

const LANG_COUNTRY: Record<string, string> = {
  de: 'DE', fr: 'FR', es: 'ES', it: 'IT', pt: 'PT', nl: 'NL', pl: 'PL',
  sv: 'SE', da: 'DK', fi: 'FI', cs: 'CZ', ro: 'RO', el: 'GR', hu: 'HU',
  bg: 'BG', hr: 'HR', sk: 'SK', sl: 'SI', lt: 'LT', lv: 'LV', et: 'EE',
  ga: 'IE', mt: 'MT',
};

const TZ_COUNTRY: Record<string, string> = {
  'Europe/Berlin': 'DE', 'Europe/Vienna': 'AT', 'Europe/Zurich': 'CH',
  'Europe/Paris': 'FR', 'Europe/Madrid': 'ES', 'Europe/Rome': 'IT',
  'Europe/Lisbon': 'PT', 'Europe/Amsterdam': 'NL', 'Europe/Brussels': 'BE',
  'Europe/Stockholm': 'SE', 'Europe/Oslo': 'NO', 'Europe/Copenhagen': 'DK',
  'Europe/Helsinki': 'FI', 'Europe/Warsaw': 'PL', 'Europe/Prague': 'CZ',
  'Europe/Bucharest': 'RO', 'Europe/Athens': 'GR', 'Europe/Dublin': 'IE',
  'Europe/Malta': 'MT', 'Europe/Tallinn': 'EE', 'Europe/Riga': 'LV',
  'Europe/Vilnius': 'LT', 'Europe/Budapest': 'HU', 'Europe/Sofia': 'BG',
  'Europe/Zagreb': 'HR', 'Europe/Bratislava': 'SK', 'Europe/Ljubljana': 'SI',
  'Europe/Luxembourg': 'LU', 'Europe/London': 'GB', 'Europe/Nicosia': 'CY',
  'Atlantic/Reykjavik': 'IS',
};

export function scopeSlug(name: string) {
  return name.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function isBot(ua: string | null) {
  return /bot|crawler|spider|slurp|facebookexternalhit|embedly|quora|pinterest|redditbot|whatsapp|telegram|preview/i.test(ua || '');
}

const geoCountry = (geo: string | null) => {
  const g = (geo || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(g) && g !== 'XX' && g !== 'T1' ? g : null;
};

/** English is a weak hint: many browsers ship as en-US wherever the person is. */
export function languageIsEnglish(acceptLanguage: string | null) {
  const lang = /^[a-z]{2}/i.exec((acceptLanguage || '').split(',')[0]?.trim() || '')?.[0].toLowerCase();
  return !lang || lang === 'en';
}

/** IP first, then the browser timezone, then the language. */
export function countryFrom(geo: string | null, acceptLanguage: string | null, timeZone: string | null): string | null {
  const g = geoCountry(geo);
  if (g) return g;
  const tz = TZ_COUNTRY[(timeZone || '').trim()];
  if (tz) return tz;
  const al = acceptLanguage || '';
  for (const part of al.split(',')) {
    const tag = part.split(';')[0].trim();
    const region = /^[a-z]{2}[-_]([a-z]{2})$/i.exec(tag);
    if (region && !languageIsEnglish(tag)) return region[1].toUpperCase();
  }
  const lang = /^[a-z]{2}/i.exec(al.split(',')[0]?.trim() || '')?.[0].toLowerCase();
  if (lang && LANG_COUNTRY[lang]) return LANG_COUNTRY[lang];
  return null;
}

const rank = (name: string) => {
  const i = CATALOG_ORDER.indexOf(name);
  return i === -1 ? 99 : i;
};

export function wordsOf(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? ([] as string[])).filter((w) => w.length >= 4 && !STOP.has(w));
}

/** Words a preset can be recognised by. New presets need no code: this reads their name, instructions and search config. */
export function scopeTerms(name: string, instructions: string | null, config: Record<string, unknown> | null): string[] {
  const parts = [name, instructions || ''];
  const topic = config?.topic;
  if (typeof topic === 'string') parts.push(topic);
  for (const key of ['ted_phrases', 'news_queries'] as const) {
    const list = config?.[key];
    if (Array.isArray(list)) for (const phrase of list.slice(0, 40)) parts.push(String(phrase));
  }
  return Array.from(new Set(wordsOf(parts.join(' '))));
}

export function signalWords(referrer: string | null, url: { pathname: string; search: string }): string[] {
  const q = new URLSearchParams(url.search);
  q.delete('scope');
  q.delete('view');
  q.delete('n');
  return Array.from(new Set(wordsOf(`${referrer || ''} ${url.pathname} ${q.toString()}`)));
}

export function parsePrefs(raw: string | undefined | null): Record<string, number> {
  if (!raw) return {};
  let text = raw;
  try { if (text.includes('%')) text = decodeURIComponent(text); } catch { /* already decoded */ }
  try {
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object') return {};
    const out: Record<string, number> = {};
    for (const [id, n] of Object.entries(data as Record<string, unknown>)) {
      if (/^[0-9a-f-]{36}$/i.test(id) && typeof n === 'number' && n > 0) out[id] = Math.min(40, n);
    }
    return out;
  } catch {
    return {};
  }
}

export function encodePrefs(prefs: Record<string, number>): string {
  const entries = Object.entries(prefs).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 24);
  return JSON.stringify(Object.fromEntries(entries.map(([id, n]) => [id, Math.min(40, Math.round(n))])));
}

export function noteInterest(prefs: Record<string, number>, scopeIds: string[], boost: number): Record<string, number> {
  const next = { ...prefs };
  for (const id of scopeIds) if (/^[0-9a-f-]{36}$/i.test(id)) next[id] = Math.min(40, (next[id] || 0) + boost);
  return next;
}

function matchesRequest(scope: GuestScopeChoice, requested: string) {
  return requested === scope.id || requested === scopeSlug(scope.name);
}

/** A public scope the visitor asked for, by id or slug. Empty scopes still count: a choice beats the ranking. */
export function explicitGuestScope(scopes: GuestScopeChoice[], requested: string | null): string | null {
  const raw = (requested || '').trim().toLowerCase();
  if (!raw) return null;
  if (raw === GUEST_GENERAL || raw === 'default') return GUEST_GENERAL;
  const hit = scopes.find((scope) => matchesRequest(scope, raw));
  return hit ? hit.id : null;
}

/** Keep a public scope on links, pagination and the back button. */
export function withPublicScope(href: string, slug: string | null) {
  if (!slug) return href;
  const url = new URL(href, 'http://local');
  url.searchParams.set('scope', slug);
  const q = url.searchParams.toString();
  return q ? `${url.pathname}?${q}` : url.pathname;
}

/** Higher means this preset fits the visitor better. Result counts are not part of the score. */
export function preferenceScore(scope: GuestScopeChoice, signals: GuestSignals): number {
  const requested = (signals.requested || '').trim().toLowerCase();
  let score = 0;
  if (requested && matchesRequest(scope, requested)) score += 100;
  score += Math.min(40, signals.prefs[scope.id] || 0) * 5;
  if (signals.words.length && scope.terms.length) {
    const have = new Set(scope.terms);
    for (const word of signals.words) if (have.has(word)) score += 12;
  }
  if (signals.country) score += Math.min(15, (scope.countries[signals.country] || 0) * 3);
  return score;
}

/**
 * The best preset for this visitor that has at least one tender or news item.
 * A higher preference with no results is skipped for the next one. General is
 * used only when every preset is empty, or when the visitor asked for it.
 */
export function pickGuestScope(scopes: GuestScopeChoice[], signals: GuestSignals): string {
  const explicit = explicitGuestScope(scopes, signals.requested);
  if (explicit) return explicit;
  const ranked = [...scopes].sort((a, b) => {
    const byPref = preferenceScore(b, signals) - preferenceScore(a, signals);
    if (byPref) return byPref;
    if (b.results !== a.results) return b.results - a.results;
    return rank(a.name) - rank(b.name);
  });
  return ranked.find((scope) => scope.results > 0)?.id || GUEST_GENERAL;
}

/** Presets the visitor just showed an interest in, so the ranking survives the next page. */
export function scopesToRemember(scopes: GuestScopeChoice[], signals: GuestSignals): string[] {
  const requested = (signals.requested || '').trim().toLowerCase();
  return scopes.filter((scope) => {
    if (requested && matchesRequest(scope, requested)) return true;
    if (!signals.words.length || !scope.terms.length) return false;
    const have = new Set(scope.terms);
    return signals.words.some((word) => have.has(word));
  }).map((scope) => scope.id);
}
