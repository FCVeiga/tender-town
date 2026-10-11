/** Profile rows for accounts (server-only helpers, not server actions). */
import 'server-only';
import { SUPER_ADMIN_EMAIL } from '@/lib/internal';
import { getSupabaseServerClient } from '@/lib/supabase';
import { USERNAME } from '@/lib/auth';

export async function usernameTaken(username: string, exceptId?: string) {
  const { data } = await getSupabaseServerClient().from('profiles').select('id').ilike('username', username.replace(/[\\%_]/g, (c) => `\\${c}`)).maybeSingle();
  return !!data && data.id !== exceptId;
}

/** A free username from an email address or name (for Google sign-ups). */
async function freeUsername(seed: string) {
  const base = (seed.normalize('NFKD').replace(/[^\w]/g, '').slice(0, 18) || 'user').padEnd(3, '0');
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? base : `${base}${Math.floor(Math.random() * 9000 + 1000)}`;
    if (!(await usernameTaken(candidate))) return candidate;
  }
  return `user${Date.now().toString(36)}`;
}

/** Profile row for a new account (email sign-up or Google). Country is kept from the first request that has one. */
export async function ensureProfile(userId: string, email: string, meta: Record<string, any> = {}, country: string | null = null, ip: string | null = null) {
  const db = getSupabaseServerClient();
  const admin = email.toLowerCase() === SUPER_ADMIN_EMAIL;
  if (admin && ip) await db.from('analytics_ignored_ips').upsert({ ip }, { onConflict: 'ip' });
  const fromIgnoredIp = ip ? !!(await db.from('analytics_ignored_ips').select('ip').eq('ip', ip).maybeSingle()).data : false;
  const ignore = admin || fromIgnoredIp;
  if (ignore) await db.from('analytics_ignored_users').upsert({ user_id: userId }, { onConflict: 'user_id' });
  const code = !ignore && country && /^[A-Z]{2}$/.test(country) ? country : null;
  const { data } = await db.from('profiles').select('id').eq('id', userId).maybeSingle();
  if (data) {
    if (code) await db.from('profiles').update({ country: code }).eq('id', userId).is('country', null);
    return;
  }
  const username = meta.username && USERNAME.test(meta.username) && !(await usernameTaken(meta.username))
    ? meta.username : await freeUsername(meta.username || meta.full_name || email.split('@')[0]);
  await db.from('profiles').insert({
    id: userId, username, display_name: meta.full_name || meta.name || username, avatar_url: meta.avatar_url || meta.picture || null,
    country: code,
  });
  await ensurePersonalAccount(userId, username);
}

/** Everyone gets a personal account (Free) with one workspace, which the site opens on. */
export async function ensurePersonalAccount(userId: string, name: string) {
  const db = getSupabaseServerClient();
  const { data: existing } = await db.from('accounts').select('id').eq('owner_id', userId).eq('kind', 'personal').maybeSingle();
  if (existing) return;
  const { data: acc } = await db.from('accounts').insert({ kind: 'personal', name, owner_id: userId, plan: 'free' }).select('id').single();
  if (!acc) return;
  await db.from('account_members').insert({ account_id: acc.id, user_id: userId, role: 'admin' });
  const { data: ws } = await db.from('workspaces').insert({ account_id: acc.id, owner_id: userId, name: 'My Workspace', created_by: userId }).select('id').single();
  if (!ws) return;
  await db.from('workspace_members').insert({ workspace_id: ws.id, user_id: userId, role: 'admin' });
  await db.from('profiles').update({ current_workspace_id: ws.id }).eq('id', userId);
}

