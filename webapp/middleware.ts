import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import {
  GUEST_PREFS_COOKIE, GUEST_SCOPE_COOKIE, GUEST_SCOPE_HEADER, GUEST_TZ_COOKIE,
  countryFrom, encodePrefs, isBot, noteInterest, parsePrefs, pickGuestScope,
  scopeTerms, scopesToRemember, signalWords, type GuestScopeChoice,
} from '@/lib/guestScope';

/**
 * Keeps sign-in sessions fresh: when the access token is near expiry, the
 * refresh happens here (the only place, besides actions, that may set cookies).
 * Signed-out visitors get the preset scope that best matches their preferences
 * and currently has results. Requests that only refresh a session skip that.
 */

const SKIP_GUEST = /^\/(api|feed\.xml|sitemap\.xml|robots\.txt|llms\.txt|mcp\.md)/;
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const VISITOR_COOKIE = 'tt_vid';

/** Which public page this request is, for the dashboard. Compose screens are not content views. */
function viewKind(pathname: string): 'home' | 'post' | 'news' | 'tender' | null {
  if (pathname === '/') return 'home';
  if (pathname === '/community' || (pathname.startsWith('/posts/') && pathname !== '/posts/new')) return 'post';
  if (pathname === '/news' || pathname.startsWith('/news/')) return 'news';
  if ((pathname === '/tenders' || pathname.startsWith('/tenders/')) && pathname !== '/tenders/new') return 'tender';
  return null;
}

/** Count a real page load. The visitor id is a random cookie, not an address. */
async function trackVisit(request: NextRequest, response: NextResponse) {
  if (request.method !== 'GET') return response;
  const purpose = request.headers.get('purpose') || request.headers.get('sec-purpose');
  if (request.headers.get('next-router-prefetch') || request.headers.get('x-middleware-prefetch') || purpose === 'prefetch') return response;
  if (isBot(request.headers.get('user-agent'))) return response;
  const kind = viewKind(request.nextUrl.pathname);
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!kind || !url || !key) return response;
  let visitor = request.cookies.get(VISITOR_COOKIE)?.value || '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(visitor)) {
    visitor = crypto.randomUUID();
    response.cookies.set(VISITOR_COOKIE, visitor, {
      path: '/', maxAge: COOKIE_MAX_AGE, sameSite: 'lax', httpOnly: true, secure: process.env.NODE_ENV === 'production',
    });
  }
  try {
    await fetch(`${url.replace(/\/$/, '')}/rest/v1/page_views`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ kind, visitor, path: request.nextUrl.pathname.slice(0, 180) }),
    });
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

function withGuestScope(request: NextRequest, scopeId: string, prefs: string | null) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(GUEST_SCOPE_HEADER, scopeId);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  const cookie = { path: '/', maxAge: COOKIE_MAX_AGE, sameSite: 'lax' as const, httpOnly: true };
  response.cookies.set(GUEST_SCOPE_COOKIE, scopeId, cookie);
  if (prefs != null) response.cookies.set(GUEST_PREFS_COOKIE, prefs, cookie);
  return response;
}

async function personalizeGuest(request: NextRequest) {
  if (isBot(request.headers.get('user-agent')) || SKIP_GUEST.test(request.nextUrl.pathname)) return NextResponse.next();
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) return NextResponse.next();
  const requested = request.nextUrl.searchParams.get('scope');
  try {
    const tzRaw = request.cookies.get(GUEST_TZ_COOKIE)?.value;
    let timeZone: string | null = null;
    try { timeZone = tzRaw ? decodeURIComponent(tzRaw) : null; } catch { timeZone = null; }
    const acceptLanguage = request.headers.get('accept-language');
    const { scopes, byItem } = await catalogScopes();
    const country = countryFrom(request.headers.get('x-vercel-ip-country'), acceptLanguage, timeZone);
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
    return withGuestScope(request, scopeId, encoded === before ? null : encoded);
  } catch {
    return NextResponse.next();
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
  if (!hasSession) return trackVisit(request, await personalizeGuest(request));
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  await supabase.auth.getUser();
  return trackVisit(request, response);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|gif|ico)$).*)'],
};
