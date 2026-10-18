import 'server-only';
import { cookies, headers } from 'next/headers';
import { getSupabaseServerClient } from '@/lib/supabase';
import {
  EVENT_VERSION, deviceOf, safeId, trackingAllowed, trafficOf, unpackTouch, type EventName,
} from '@/lib/productModel';

export type RecordInput = {
  name: EventName;
  userId?: string | null;
  flow?: string | null;
  path?: string | null;
  pageType?: string | null;
  scopeId?: string | null;
  contentId?: string | null;
  cta?: string | null;
  placement?: string | null;
  plan?: string | null;
  entitlement?: string | null;
  ok?: boolean | null;
  errorCode?: string | null;
  demo?: boolean;
  dedupe?: string | null;
  durationMs?: number | null;
  country?: string | null;
};

/** Writes one server-side event. A failure here must not break the action that called it. */
export async function recordProductEvent(input: RecordInput) {
  try {
    const jar = cookies();
    if (!trackingAllowed(jar.get('tt_consent')?.value)) return;
    const header = headers();
    const visitor = jar.get('tt_vid')?.value || `server:${input.userId || input.flow || 'anon'}`;
    const session = jar.get('tt_sid')?.value || visitor;
    const first = unpackTouch(jar.get('tt_ft')?.value);
    const current = unpackTouch(jar.get('tt_ss')?.value);
    const staff = jar.get('tt_staff')?.value === '1';
    const traffic = trafficOf(header.get('user-agent'), staff);
    const flow = safeId(input.flow) || safeId(jar.get('tt_flow')?.value);
    const row = {
      name: input.name, version: EVENT_VERSION, visitor, session_id: session, user_id: input.userId || null, flow_id: flow,
      page_type: input.pageType || null, path: input.path?.slice(0, 180) || null,
      landing: first?.landing || current?.landing || null, referrer_host: first?.host || current?.host || null,
      source: current?.source || null, medium: current?.medium || null, campaign: current?.campaign || null,
      first_source: first?.source || current?.source || null, first_medium: first?.medium || current?.medium || null, first_campaign: first?.campaign || current?.campaign || null,
      device: deviceOf(header.get('user-agent')), country: input.country || null, scope_id: safeId(input.scopeId),
      content_id: input.contentId?.slice(0, 80) || null, cta: input.cta?.slice(0, 40) || null, placement: input.placement?.slice(0, 40) || null,
      plan: input.plan || null, entitlement: input.entitlement?.slice(0, 40) || null, ok: input.ok ?? null, error_code: input.errorCode?.slice(0, 80) || null,
      demo: input.demo === true, traffic: traffic.traffic, backfilled: false, new_visitor: false, signed_in: Boolean(input.userId),
      duration_ms: input.durationMs ?? null, scroll_pct: null, dedupe: input.dedupe?.slice(0, 180) || null,
    };
    const db = getSupabaseServerClient();
    const { error } = row.dedupe
      ? await db.from('analytics_events').upsert(row, { onConflict: 'dedupe', ignoreDuplicates: true })
      : await db.from('analytics_events').insert(row);
    if (error && !/duplicate|23505/i.test(error.message)) {
      await db.from('analytics_ingest_errors').insert({ reason: error.code || 'insert', event: input.name });
    }
  } catch {
    try { await getSupabaseServerClient().from('analytics_ingest_errors').insert({ reason: 'throw', event: input.name }); } catch { /* ignore */ }
  }
}
