import type { NextRequest, NextResponse } from 'next/server';
import {
  EVENT_VERSION, SESSION_IDLE_MS, deviceOf, packTouch, pageOf, touchOf, trafficOf, unpackTouch,
} from '@/lib/productModel';

const YEAR = 60 * 60 * 24 * 365;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const VISITOR_COOKIE = 'tt_vid';
const SESSION_COOKIE = 'tt_sid';
const SEEN_COOKIE = 'tt_seen';
const FIRST_COOKIE = 'tt_ft';
const SESSION_TOUCH_COOKIE = 'tt_ss';
const FIRST_SEEN_COOKIE = 'tt_first';

type Who = { signedIn: boolean; userId: string | null; scopeId: string | null; plan: string | null; country: string | null; internal: boolean };

/** Sets the visitor, session and attribution cookies and returns the events for this page load. */
export function stampVisit(request: NextRequest, response: NextResponse, who: Who): { events: Record<string, unknown>[]; traffic: string; visitor: string | null } {
  const empty = { events: [] as Record<string, unknown>[], traffic: who.internal ? 'internal' : 'human', visitor: null };
  if (request.method !== 'GET') return empty;
  const purpose = request.headers.get('purpose') || request.headers.get('sec-purpose');
  if (request.headers.get('next-router-prefetch') || request.headers.get('x-middleware-prefetch') || purpose === 'prefetch') return empty;
  const path = request.nextUrl.pathname;
  if (path.startsWith('/api') || path.startsWith('/dashboard') || path.startsWith('/_next')) return empty;
  const now = Date.now();
  const ua = request.headers.get('user-agent');
  const traffic = trafficOf(ua, who.internal);
  const hadVisitor = UUID.test(request.cookies.get(VISITOR_COOKIE)?.value || '');
  const visitor = hadVisitor ? request.cookies.get(VISITOR_COOKIE)!.value : crypto.randomUUID();
  const previousSession = request.cookies.get(SESSION_COOKIE)?.value || '';
  const seen = Number(request.cookies.get(SEEN_COOKIE)?.value || 0);
  const newSession = !UUID.test(previousSession) || !seen || now - seen > SESSION_IDLE_MS;
  const session = newSession ? crypto.randomUUID() : previousSession;
  const landing = `${path}${request.nextUrl.search ? request.nextUrl.search.slice(0, 80) : ''}`.slice(0, 180);
  const tagged = Boolean(request.nextUrl.searchParams.get('utm_source') || request.nextUrl.searchParams.get('utm_campaign'));
  const incoming = touchOf({
    host: request.nextUrl.hostname.replace(/^www\./, ''),
    utmSource: request.nextUrl.searchParams.get('utm_source'),
    utmMedium: request.nextUrl.searchParams.get('utm_medium'),
    utmCampaign: request.nextUrl.searchParams.get('utm_campaign'),
    referrer: request.headers.get('referer'),
    landing: path.slice(0, 180),
  });
  const storedFirst = unpackTouch(request.cookies.get(FIRST_COOKIE)?.value);
  const storedSession = unpackTouch(request.cookies.get(SESSION_TOUCH_COOKIE)?.value);
  const first = storedFirst || incoming;
  const sessionTouch = tagged || newSession || !storedSession ? incoming : storedSession;
  const cookie = { path: '/', sameSite: 'lax' as const, httpOnly: true, secure: process.env.NODE_ENV === 'production' };
  if (!hadVisitor) response.cookies.set(VISITOR_COOKIE, visitor, { ...cookie, maxAge: YEAR });
  response.cookies.set(SESSION_COOKIE, session, { ...cookie, maxAge: YEAR });
  response.cookies.set(SEEN_COOKIE, String(now), { ...cookie, maxAge: YEAR });
  if (!storedFirst) response.cookies.set(FIRST_COOKIE, packTouch(first), { ...cookie, maxAge: YEAR });
  if (tagged || newSession || !storedSession) response.cookies.set(SESSION_TOUCH_COOKIE, packTouch(sessionTouch), { ...cookie, maxAge: YEAR });
  if (!request.cookies.get(FIRST_SEEN_COOKIE)?.value) response.cookies.set(FIRST_SEEN_COOKIE, String(now), { ...cookie, maxAge: YEAR });
  const page = pageOf(path);
  const base = {
    version: EVENT_VERSION, visitor, session_id: session, user_id: who.userId, flow_id: null,
    path: path.slice(0, 180), landing: (storedSession?.landing || incoming.landing || path).slice(0, 180),
    referrer_host: incoming.host, source: sessionTouch.source, medium: sessionTouch.medium, campaign: sessionTouch.campaign,
    first_source: first.source, first_medium: first.medium, first_campaign: first.campaign,
    device: deviceOf(ua), country: who.country, scope_id: who.scopeId, content_id: page.contentId,
    cta: null, placement: null, plan: who.plan, entitlement: null, ok: null, error_code: traffic.reason,
    demo: false, traffic: traffic.traffic, backfilled: false, new_visitor: !hadVisitor, signed_in: who.signedIn,
    duration_ms: null, scroll_pct: null,
  };
  const bucket = Math.floor(now / 2000);
  const events: Record<string, unknown>[] = [
    { ...base, name: 'page_viewed', page_type: page.type, dedupe: `pv:${visitor}:${path}:${bucket}` },
  ];
  if (newSession) events.unshift({ ...base, name: 'session_started', page_type: page.type, landing: path.slice(0, 180), dedupe: `ss:${session}` });
  if (page.type === 'tender' && page.contentId) events.push({ ...base, name: 'tender_viewed', page_type: 'tender', dedupe: `tv:${session}:${page.contentId}` });
  if (page.type === 'signal') events.push({ ...base, name: 'signal_viewed', page_type: 'signal', dedupe: `sv:${session}:${path}` });
  if (page.type === 'example') events.push({ ...base, name: 'example_opened', page_type: 'example', demo: true, dedupe: `ex:${session}` });
  if (page.type === 'signup') events.push({ ...base, name: 'signup_page_viewed', page_type: 'signup', dedupe: `sp:${session}` });
  if (page.type === 'search') events.push({ ...base, name: 'search_results_viewed', page_type: 'search', dedupe: `sr:${session}:${bucket}` });
  return { events, traffic: traffic.traffic, visitor };
}
