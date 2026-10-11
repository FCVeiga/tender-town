import 'server-only';
import { cache } from 'react';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { getSupabaseServerClient } from '@/lib/supabase';
import type { CurrentUser } from '@/lib/auth';

const MAX_TOKENS = 8;

export type McpTokenRow = { id: string; name: string; createdAt: string; lastUsedAt: string | null };

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const LINK_NAME = 'Remote MCP';

/** Shown in the access-token field. The full value is only copied, not displayed. */
export function maskMcpToken(token: string) {
  if (token.length < 16) return '••••••••';
  return `${token.slice(0, 7)}••••${token.slice(-4)}`;
}

const sealKey = () => {
  const secret = process.env.SUPABASE_SERVICE_KEY;
  if (!secret) throw new Error('SUPABASE_SERVICE_KEY is not set');
  return createHash('sha256').update(secret).digest();
};

/** AES-GCM so a database copy alone does not reveal the token. */
function seal(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', sealKey(), iv);
  const enc = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64url');
}

function open(payload: string): string | null {
  try {
    const buf = Buffer.from(payload, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', sealKey(), buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

export async function listMcpTokens(userId: string): Promise<McpTokenRow[]> {
  const { data } = await getSupabaseServerClient().from('mcp_tokens')
    .select('id, name, created_at, last_used_at').eq('user_id', userId).is('revoked_at', null).order('created_at', { ascending: false });
  return (data || []).map((r: any) => ({ id: r.id, name: r.name, createdAt: r.created_at, lastUsedAt: r.last_used_at }));
}

/** A new token. The raw value is returned once; a sealed copy is kept so a link can include it later. */
export async function createMcpToken(userId: string, name: string): Promise<{ id: string; token: string } | { error: string }> {
  const label = name.trim().slice(0, 60);
  if (label.length < 2) return { error: 'Give the token a name.' };
  const db = getSupabaseServerClient();
  const { count } = await db.from('mcp_tokens').select('id', { count: 'exact', head: true }).eq('user_id', userId).is('revoked_at', null);
  if ((count ?? 0) >= MAX_TOKENS) return { error: 'Revoke a token before creating another.' };
  const token = `tt_${randomBytes(32).toString('base64url')}`;
  let tokenSecret: string;
  try { tokenSecret = seal(token); } catch { return { error: 'Could not create the token.' }; }
  const { data, error } = await db.from('mcp_tokens').insert({ user_id: userId, name: label, token_hash: hash(token), token_secret: tokenSecret }).select('id').single();
  if (error || !data) return { error: 'Could not create the token.' };
  return { id: data.id, token };
}

export async function revokeMcpToken(userId: string, id: string) {
  await getSupabaseServerClient().from('mcp_tokens')
    .update({ revoked_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId).is('revoked_at', null);
}

/** Tokens this page can put into a copied link. Creates one named Remote MCP when none can be revealed. */
export const mcpLinksForUser = cache(async (userId: string): Promise<{ id: string; name: string; token: string }[] | { error: string }> => {
  const ready = await revealable(userId);
  if (ready.length) return ready;
  const created = await createMcpToken(userId, LINK_NAME);
  if ('error' in created) return created;
  // Don't read the row back. Next memoizes identical GETs for the whole render,
  // so a second lookup returns the empty result from the call above.
  return [{ id: created.id, name: LINK_NAME, token: created.token }];
});

async function revealable(userId: string) {
  const { data } = await getSupabaseServerClient().from('mcp_tokens')
    .select('id, name, token_secret').eq('user_id', userId).is('revoked_at', null).not('token_secret', 'is', null).order('created_at', { ascending: false });
  const out: { id: string; name: string; token: string }[] = [];
  for (const row of data || []) {
    const token = row.token_secret ? open(row.token_secret) : null;
    if (token) out.push({ id: row.id, name: row.name, token });
  }
  return out;
}

/** The account behind a bearer token, or null. */
export async function userForToken(header: string | null): Promise<CurrentUser | null> {
  const match = /^Bearer\s+(tt_[A-Za-z0-9_-]{20,})$/.exec(header || '');
  if (!match) return null;
  const db = getSupabaseServerClient();
  const { data: row } = await db.from('mcp_tokens').select('id, user_id').eq('token_hash', hash(match[1])).is('revoked_at', null).maybeSingle();
  if (!row) return null;
  const [{ data: profile }, { data: auth }] = await Promise.all([
    db.from('profiles').select('username, display_name, avatar_url, bio, created_at').eq('id', row.user_id).maybeSingle(),
    db.auth.admin.getUserById(row.user_id),
  ]);
  if (!profile) return null;
  await db.from('mcp_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', row.id);
  const email = auth.user?.email || '';
  const fallback = (email || profile.username || 'user').split('@')[0];
  return {
    id: row.user_id, email, username: profile.username || fallback,
    displayName: profile.display_name || profile.username || fallback,
    avatarUrl: profile.avatar_url || null, bio: profile.bio || null,
    createdAt: profile.created_at || auth.user?.created_at || new Date().toISOString(),
  };
}
