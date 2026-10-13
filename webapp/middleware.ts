import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import {
  FOCUS_COOKIE, GUEST_PREFS_COOKIE, GUEST_SCOPE_COOKIE, GUEST_SCOPE_HEADER, GUEST_TZ_COOKIE,
  INTENT_COOKIE, SCOPE_QUERY_HEADER,
  countryFrom, encodePrefs, explicitGuestScope, isBot, noteInterest, parsePrefs, pickGuestScope,
  scopeTerms, scopesToRemember, signalWords, type GuestScopeChoice,
} from '@/lib/guestScope';
import { SUPER_ADMIN_EMAIL, clientIp, isInternalClient } from '@/lib/internal';

/**
 * Keeps sign-in sessions fresh: when the access token is near expiry, the
 * refresh happens here (the only place, besides actions, that may set cookies).
 * Signed-out visitors get the preset scope that best matches their preferences
 * and currently has results. Requests that only refresh a session skip that.
 */

const SKIP_GUEST = /^\/(api|feed\.xml|sitemap\.xml|robots\.txt|llms\.txt|mcp\.md|discover\.md)/;
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const VISITOR_COOKIE = 'tt_vid';
const STAFF_COOKIE = 'tt_staff';

/** Which page this request is. Compose screens stay out of the content charts, but still count as a visit. */
function viewKind(pathname: string): string | null {
  if (pathname.startsWith('/api') || pathname.startsWith('/dashboard')) return null;
  if (pathname === '/') return 'home';
  if (pathname === '/community' || (pathname.startsWith('/posts/') && pathname !== '/posts/new')) return 'post';
  if (pathname === '/news' || pathname.startsWith('/news/')) return 'news';
  if ((pathname === '/tenders' || pathname.startsWith('/tenders/')) && pathname !== '/tenders/new') return 'tender';
  return 'other';
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLAN_KEYS = new Set(['free', 'starter', 'pro', 'teams']);
const viewerCache = new Map<string, { at: number; ids: string[] }>();
const planCache = new Map<string, { at: number; plan: string | null }>();
const countryKnown = new Set<string>();
let generalCache: { at: number; id: string | null } | null = null;
let ignoredIpCache: { at: number; ips: Set<string> } | null = null;

function serviceHeaders(key: string, minimal = false) {
  const headers: Record<string, string> = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  if (minimal) headers.Prefer = 'return=minimal';
  return headers;
}

/** The shared General scope, so a guest on it is counted under that name. */
async function generalScopeId(url: string, key: string): Promise<string | null> {
  if (generalCache && Date.now() - generalCache.at < 60 * 60 * 1000) return generalCache.id;
  try {
    const res = await fetch(`${url}/rest/v1/scopes?select=id&is_default=eq.true&active=eq.true&limit=1`, { headers: serviceHeaders(key) });
    const rows = res.ok ? await res.json() : [];
    const id = Array.isArray(rows) && UUID.test(rows[0]?.id || '') ? rows[0].id as string : null;
    generalCache = { at: Date.now(), id };
    return id;
  } catch {
    return generalCache?.id ?? null;
  }
}

/** Scopes this signed-in account is being shown. Cached briefly so a page load stays one lookup. */
async function signedInScopeIds(url: string, key: string, userId: string): Promise<string[]> {
  const hit = viewerCache.get(userId);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.ids;
  try {
    const res = await fetch(`${url}/rest/v1/rpc/viewer_scope_ids`, {
      method: 'POST', headers: serviceHeaders(key), body: JSON.stringify({ uid: userId }),
    });
    const data = res.ok ? await res.json() : null;
    const ids = (Array.isArray(data) ? data : []).filter((id): id is string => typeof id === 'string' && UUID.test(id));
    if (!res.ok) return ids;
    if (viewerCache.size > 500) viewerCache.clear();
    viewerCache.set(userId, { at: Date.now(), ids });
    return ids;
  } catch {
    return [];
  }
}

/** The visitor's own plan, so a later visit can be grouped after they change it. */
async function personalPlan(url: string, key: string, userId: string): Promise<string | null> {
  const hit = planCache.get(userId);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.plan;
  try {
    const res = await fetch(`${url}/rest/v1/accounts?select=plan&kind=eq.personal&owner_id=eq.${userId}&limit=1`, { headers: serviceHeaders(key) });
    const rows = res.ok ? await res.json() : [];
    const raw = rows?.[0]?.plan;
    const plan = typeof raw === 'string' && PLAN_KEYS.has(raw) ? raw : null;
    if (!res.ok) return plan;
    planCache.set(userId, { at: Date.now(), plan });
    return plan;
  } catch {
    return null;
  }
}

async function ignoredIps(url: string, key: string): Promise<Set<string>> {
  if (ignoredIpCache && Date.now() - ignoredIpCache.at < 60 * 1000) return ignoredIpCache.ips;
  try {
    const res = await fetch(`${url}/rest/v1/analytics_ignored_ips?select=ip`, { headers: serviceHeaders(key) });
    const rows = res.ok ? await res.json() : [];
    const ips = new Set<string>(Array.isArray(rows) ? rows.map((row: { ip?: string }) => row.ip || '').filter(Boolean) : []);
    ignoredIpCache = { at: Date.now(), ips };
    return ips;
  } catch {
    return ignoredIpCache?.ips ?? new Set();
  }
}

async function rememberIp(url: string, key: string, ip: string) {
  if (ignoredIpCache?.ips.has(ip)) return;
  try {
    await fetch(`${url}/rest/v1/analytics_ignored_ips`, {
      method: 'POST',
      headers: { ...serviceHeaders(key), Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ ip }),
    });
    ignoredIpCache?.ips.add(ip);
  } catch { /* the next visit from this address can be recorded once */ }
}

/** Count a real page load. The visitor id is a random cookie, not an address. Internal traffic is not counted. */
async function trackVisit(request: NextRequest, response: NextResponse, who: { signedIn: boolean; userId: string | null; scopeId: string | null; email: string | null }) {
  if (request.method !== 'GET') return response;
  const purpose = request.headers.get('purpose') || request.headers.get('sec-purpose');
  if (request.headers.get('next-router-prefetch') || request.headers.get('x-middleware-prefetch') || purpose === 'prefetch') return response;
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_KEY;
  const ip = clientIp((name) => request.headers.get(name));
  const admin = (who.email || '').toLowerCase() === SUPER_ADMIN_EMAIL;
  if (admin) {
    response.cookies.set(STAFF_COOKIE, '1', {
      path: '/', maxAge: COOKIE_MAX_AGE, sameSite: 'lax', httpOnly: true, secure: process.env.NODE_ENV === 'production',
    });
    if (url && key && ip) await rememberIp(url, key, ip);
  }
  const staff = request.cookies.get(STAFF_COOKIE)?.value === '1';
  if (isInternalClient(request.headers.get('user-agent')) || staff || admin) return response;
  if (url && key && ip && (await ignoredIps(url, key)).has(ip)) return response;
  const kind = viewKind(request.nextUrl.pathname);
  if (!kind || !url || !key) return response;
  let visitor = request.cookies.get(VISITOR_COOKIE)?.value || '';
  if (!UUID.test(visitor)) {
    visitor = crypto.randomUUID();
    response.cookies.set(VISITOR_COOKIE, visitor, {
      path: '/', maxAge: COOKIE_MAX_AGE, sameSite: 'lax', httpOnly: true, secure: process.env.NODE_ENV === 'production',
    });
  }
  const tzRaw = request.cookies.get(GUEST_TZ_COOKIE)?.value;
  let timeZone: string | null = null;
  try { timeZone = tzRaw ? decodeURIComponent(tzRaw) : null; } catch { timeZone = null; }
  const country = countryFrom(request.headers.get('x-vercel-ip-country'), request.headers.get('accept-language'), timeZone);
  let scopeIds: string[] = [];
  let plan: string | null = null;
  if (who.signedIn && who.userId) {
    [scopeIds, plan] = await Promise.all([signedInScopeIds(url, key, who.userId), personalPlan(url, key, who.userId)]);
  } else if (who.scopeId && UUID.test(who.scopeId)) scopeIds = [who.scopeId];
  else if (who.scopeId === 'general') {
    const id = await generalScopeId(url, key);
    if (id) scopeIds = [id];
  }
  try {
    const headers = serviceHeaders(key, true);
    const rememberCountry = who.userId && country && !countryKnown.has(who.userId);
    await Promise.all([
      fetch(`${url}/rest/v1/page_views`, {
        method: 'POST', headers,
        body: JSON.stringify({
          kind, visitor, path: request.nextUrl.pathname.slice(0, 180),
          country, signed_in: who.signedIn, scope_ids: scopeIds,
          user_id: who.signedIn ? who.userId : null, plan,
        }),
      }),
      rememberCountry
        ? fetch(`${url}/rest/v1/profiles?id=eq.${who.userId}&country=is.null`, {
          method: 'PATCH', headers, body: JSON.stringify({ country }),
        }).then((res) => { if (res.ok && who.userId) countryKnown.add(who.userId); })
        : Promise.resolve(),
    ]);
  } catch { /* a missed count should not take the page down */ }
  return response;
}

let catalogCache: { at: number; scopes: GuestScopeChoice[]; byItem: Map<string, string[]> } | null = null;

async function catalogScopes(): Promise<{ scopes: GuestScopeChoice[]; byItem: Map<string, string[]> }> {
  if (catalogCache && Date.now() - catalogCache.at < 60 * 60 * 1000) return catalogCache;
  const empty = { scopes: catalogCache?.scopes || [], byItem: catalogCache?.byItem || new Map<string, string[]>() };
  const supabase = createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
  const { data: scopes, error } = await supabase.from('scopes').select('id, name, instructions, search_config').eq('catalog', true).eq('active', true);
  if (error || !scopes?.length) return empty;
  const ids = scopes.map((s) => s.id);
  const { data: items } = await supabase.from('scope_items').select('scope_id, item_id, item_type').in('scope_id', ids).limit(20000);
  const tenderIds = Array.from(new Set((items || []).filter((item) => item.item_type === 'tender').map((item) => item.item_id as string)));
  const countryOf = new Map<string, string | null>();
  for (let i = 0; i < tenderIds.length; i += 100) {
    const slice = tenderIds.slice(i, i + 100);
    const { data: opps } = await supabase.from('opportunities').select('opportunity_id, country').in('opportunity_id', slice);
    for (const opp of opps || []) countryOf.set(opp.opportunity_id, opp.country);
  }
  const byItem = new Map<string, string[]>();
  const choices = scopes.map((scope) => {
    const countries: Record<string, number> = {};
    let results = 0;
    for (const item of items || []) {
      if (item.scope_id !== scope.id) continue;
      results += 1;
      const owners = byItem.get(item.item_id) || [];
      if (!owners.includes(scope.id)) owners.push(scope.id);
      byItem.set(item.item_id, owners);
      if (item.item_type !== 'tender') continue;
      const country = countryOf.get(item.item_id);
      if (!country) continue;
      countries[country] = (countries[country] || 0) + 1;
    }
    return {
      id: scope.id as string, name: scope.name as string, results, countries,
      terms: scopeTerms(scope.name, scope.instructions, scope.search_config && typeof scope.search_config === 'object' ? scope.search_config as Record<string, unknown> : null),
    };
  });
  catalogCache = { at: Date.now(), scopes: choices, byItem };
  return catalogCache;
}

const focusCookie = { path: '/', maxAge: COOKIE_MAX_AGE, sameSite: 'lax' as const, httpOnly: true };

function withGuestScope(request: NextRequest, scopeId: string, prefs: string | null, lock: string | null) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(GUEST_SCOPE_HEADER, scopeId);
  requestHeaders.set(SCOPE_QUERY_HEADER, request.nextUrl.searchParams.get('scope') || '');
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  const cookie = { path: '/', maxAge: COOKIE_MAX_AGE, sameSite: 'lax' as const, httpOnly: true };
  response.cookies.set(GUEST_SCOPE_COOKIE, scopeId, cookie);
  if (prefs != null) response.cookies.set(GUEST_PREFS_COOKIE, prefs, cookie);
  if (lock) response.cookies.set(FOCUS_COOKIE, lock, focusCookie);
  return response;
}

async function personalizeGuest(request: NextRequest): Promise<{ response: NextResponse; scopeId: string | null }> {
  if (isBot(request.headers.get('user-agent')) || SKIP_GUEST.test(request.nextUrl.pathname)) return { response: NextResponse.next(), scopeId: null };
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) return { response: NextResponse.next(), scopeId: null };
  const queryScope = request.nextUrl.searchParams.get('scope');
  const storedScope = request.cookies.get(FOCUS_COOKIE)?.value || null;
  try {
    const tzRaw = request.cookies.get(GUEST_TZ_COOKIE)?.value;
    let timeZone: string | null = null;
    try { timeZone = tzRaw ? decodeURIComponent(tzRaw) : null; } catch { timeZone = null; }
    const acceptLanguage = request.headers.get('accept-language');
    const { scopes, byItem } = await catalogScopes();
    const country = countryFrom(request.headers.get('x-vercel-ip-country'), acceptLanguage, timeZone);
    const fromQuery = explicitGuestScope(scopes, queryScope);
    const fromStore = explicitGuestScope(scopes, storedScope);
    // A scope in the link wins. Otherwise a scope they already chose beats a fresh recommendation.
    const requested = fromQuery ? queryScope : (!queryScope && fromStore ? storedScope : null);
    const signals = {
      country, requested,
      prefs: parsePrefs(request.cookies.get(GUEST_PREFS_COOKIE)?.value),
      words: signalWords(request.headers.get('referer'), request.nextUrl),
    };
    const item = request.nextUrl.pathname.match(/^\/(?:tenders|news)\/([^/]+)$/)?.[1];
    const opened = item ? byItem.get(item) || [] : [];
    const remembered = scopesToRemember(scopes, signals);
    const before = encodePrefs(signals.prefs);
    const prefs = noteInterest(noteInterest(signals.prefs, remembered, requested ? 8 : 2), opened, 2);
    const scopeId = pickGuestScope(scopes, { ...signals, prefs });
    const encoded = encodePrefs(prefs);
    // A link's scope wins. With no scope in the link, remember the one we resolved
    // so refresh and the next page stay on it. An unrecognised link does not wipe a choice.
    const lock = fromQuery || (!queryScope ? scopeId : fromStore);
    return { response: withGuestScope(request, scopeId, encoded === before ? null : encoded, lock), scopeId };
  } catch {
    return { response: NextResponse.next(), scopeId: null };
  }
}

const LEGACY_HOSTS = new Set(['tender-town.vercel.app', 'eudi-radar.vercel.app']);

function legacyHostRedirect(request: NextRequest) {
  const host = (request.headers.get('x-forwarded-host') || request.headers.get('host') || '')
    .split(',')[0].trim().split(':')[0].toLowerCase();
  if (!LEGACY_HOSTS.has(host)) return null;
  // Stripe does not follow redirects. New events post to tendertown.io; this
  // path stays so a retry addressed to the previous host still lands.
  if (request.nextUrl.pathname === '/api/stripe/webhook') return null;
  const url = request.nextUrl.clone();
  url.protocol = 'https:';
  url.host = 'tendertown.io';
  return NextResponse.redirect(url, 308);
}

export async function middleware(request: NextRequest) {
  const moved = legacyHostRedirect(request);
  if (moved) return moved;
  // A leftover login verifier is not a session. Only the auth token means someone is signed in.
  const hasSession = request.cookies.getAll().some((c) => c.name.startsWith('sb-') && !c.name.includes('code-verifier'));
  const intent = request.nextUrl.searchParams.get('intent') || '';
  const stampIntent = (response: NextResponse) => {
    if (intent === 'create' || /^switch:[0-9a-f-]{36}$/i.test(intent)) {
      response.cookies.set(INTENT_COOKIE, intent.slice(0, 80), {
        path: '/', maxAge: 60 * 60, sameSite: 'lax', httpOnly: true,
      });
    }
    return response;
  };
  if (!hasSession) {
    const guest = await personalizeGuest(request);
    return trackVisit(request, stampIntent(guest.response), { signedIn: false, userId: null, scopeId: guest.scopeId, email: null });
  }
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(SCOPE_QUERY_HEADER, (request.nextUrl.searchParams.get('scope') || '').slice(0, 80));
  let response = NextResponse.next({ request: { headers: requestHeaders } });
  const supabase = createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: requestHeaders } });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  return trackVisit(request, stampIntent(response), { signedIn: !!data.user, userId: data.user?.id ?? null, scopeId: null, email: data.user?.email ?? null });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|gif|ico)$).*)'],
};
