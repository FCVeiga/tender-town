import { NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { getSupabaseServerClient } from '@/lib/supabase';
import {
  CLIENT_EVENTS, EVENT_VERSION, deviceOf, isEventName, safeId, safeProps, trackingAllowed, trafficOf, unpackTouch,
} from '@/lib/productModel';

export const dynamic = 'force-dynamic';

function dedupeOf(name: string, id: unknown) {
  if (typeof id !== 'string') return null;
  if (safeId(id)) return `${name}:${id}`;
  if (/^[a-z0-9:._/-]{6,140}$/i.test(id)) return `${name}:${id}`.slice(0, 180);
  return null;
}

/** Browser interactions. The visitor cookie is httpOnly, so the browser cannot invent the identity. */
export async function POST(request: Request) {
  const jar = cookies();
  if (!trackingAllowed(jar.get('tt_consent')?.value)) return NextResponse.json({ ok: true, skipped: 'consent' });
  const visitor = jar.get('tt_vid')?.value || '';
  if (!safeId(visitor)) return NextResponse.json({ ok: false }, { status: 400 });
  let body: { id?: unknown; name?: unknown; props?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  if (typeof body.name !== 'string' || !isEventName(body.name) || !CLIENT_EVENTS.has(body.name)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const props = safeProps(body.props);
  const header = headers();
  const staff = jar.get('tt_staff')?.value === '1';
  const traffic = trafficOf(header.get('user-agent'), staff);
  const first = unpackTouch(jar.get('tt_ft')?.value);
  const current = unpackTouch(jar.get('tt_ss')?.value);
  const demo = body.name.startsWith('example_') || props.demo === true;
  const row = {
    name: body.name, version: EVENT_VERSION, visitor, session_id: jar.get('tt_sid')?.value || visitor,
    user_id: null, flow_id: safeId(jar.get('tt_flow')?.value),
    page_type: typeof props.pageType === 'string' ? props.pageType : null,
    path: typeof props.path === 'string' ? props.path : null,
    landing: first?.landing || null, referrer_host: first?.host || null,
    source: current?.source || null, medium: current?.medium || null, campaign: current?.campaign || null,
    first_source: first?.source || null, first_medium: first?.medium || null, first_campaign: first?.campaign || null,
    device: deviceOf(header.get('user-agent')), country: null, scope_id: safeId(props.scopeId),
    content_id: typeof props.contentId === 'string' ? props.contentId.slice(0, 80) : null,
    cta: typeof props.cta === 'string' ? props.cta.slice(0, 40) : null,
    placement: typeof props.placement === 'string' ? props.placement.slice(0, 40) : null,
    plan: null, entitlement: typeof props.entitlement === 'string' ? props.entitlement.slice(0, 40) : null,
    ok: typeof props.ok === 'boolean' ? props.ok : null,
    error_code: typeof props.errorCode === 'string' ? props.errorCode.slice(0, 80) : null,
    demo, traffic: traffic.traffic, backfilled: false, new_visitor: false, signed_in: false,
    duration_ms: typeof props.durationMs === 'number' ? Math.max(0, Math.min(props.durationMs, 30 * 60 * 1000)) : null,
    scroll_pct: typeof props.scrollPct === 'number' ? Math.max(0, Math.min(100, Math.round(props.scrollPct))) : null,
    dedupe: dedupeOf(body.name, body.id),
  };
  const db = getSupabaseServerClient();
  const write = row.dedupe
    ? db.from('analytics_events').upsert(row, body.name === 'engagement_recorded' ? { onConflict: 'dedupe' } : { onConflict: 'dedupe', ignoreDuplicates: true })
    : db.from('analytics_events').insert(row);
  const { error } = await write;
  if (error && !/duplicate|23505/i.test(error.message)) {
    await db.from('analytics_ingest_errors').insert({ reason: error.code || 'insert', event: body.name });
    return NextResponse.json({ ok: false }, { status: 202 });
  }
  return NextResponse.json({ ok: true });
}
