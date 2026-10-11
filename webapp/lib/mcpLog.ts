import 'server-only';
import { headers } from 'next/headers';
import { countryFrom } from '@/lib/guestScope';
import { getActor } from '@/lib/actor';
import { SUPER_ADMIN_EMAIL, clientIp } from '@/lib/internal';
import { getSupabaseServerClient } from '@/lib/supabase';

const PLANS = new Set(['free', 'starter', 'pro', 'teams']);

/** One MCP tool call. The token is never stored. Staff and their own addresses are left out. */
export async function logMcpCall(tool: string) {
  try {
    const actor = getActor();
    if (!actor) return;
    if ((actor.user.email || '').toLowerCase() === SUPER_ADMIN_EMAIL) return;
    const h = headers();
    const db = getSupabaseServerClient();
    const ip = clientIp((name) => h.get(name));
    if (ip) {
      const { data: ignoredIp } = await db.from('analytics_ignored_ips').select('ip').eq('ip', ip).maybeSingle();
      if (ignoredIp) return;
    }
    const { data: ignoredUser } = await db.from('analytics_ignored_users').select('user_id').eq('user_id', actor.user.id).maybeSingle();
    if (ignoredUser) return;
    const [{ data: account }, { data: scopes }] = await Promise.all([
      db.from('accounts').select('plan').eq('kind', 'personal').eq('owner_id', actor.user.id).maybeSingle(),
      db.rpc('viewer_scope_ids', { uid: actor.user.id }),
    ]);
    const plan = typeof account?.plan === 'string' && PLANS.has(account.plan) ? account.plan : 'free';
    const country = countryFrom(h.get('x-vercel-ip-country'), null, null);
    const scopeIds = (Array.isArray(scopes) ? scopes : []).filter((id): id is string => typeof id === 'string');
    await db.from('mcp_calls').insert({
      user_id: actor.user.id,
      tool: tool.slice(0, 80),
      plan,
      country,
      scope_ids: scopeIds,
    });
  } catch { /* a missed log should not fail the tool */ }
}
