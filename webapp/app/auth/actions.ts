'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getSupabaseServerClient } from '@/lib/supabase';
import { USERNAME, authClient, getCurrentUser, safeNext, siteOrigin } from '@/lib/auth';
import { countryFrom } from '@/lib/guestScope';
import { clientIp } from '@/lib/internal';
import { ensureProfile, usernameTaken } from '@/lib/profiles';
import { notify } from '@/lib/social';
import { applyProfilePrefs, getT } from '@/lib/i18n/server';

export type AuthState = { ok: boolean; message: string } | null;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function requestPlace() {
  const h = headers();
  return {
    country: countryFrom(h.get('x-vercel-ip-country'), h.get('accept-language'), null),
    ip: clientIp((name) => h.get(name)),
  };
}

export async function signUp(_prev: AuthState, form: FormData): Promise<AuthState> {
  const t = await getT();
  const email = String(form.get('email') || '').trim().toLowerCase();
  const password = String(form.get('password') || '');
  const username = String(form.get('username') || '').trim();
  if (!EMAIL.test(email)) return { ok: false, message: t('Enter a valid email address.') };
  if (!USERNAME.test(username)) return { ok: false, message: t('Usernames are 3–24 letters, numbers or underscores.') };
  if (password.length < 8) return { ok: false, message: t('Use a password of at least 8 characters.') };
  if (password !== String(form.get('confirm') || '')) return { ok: false, message: t('The passwords don’t match.') };
  if (await usernameTaken(username)) return { ok: false, message: t('u/{username} is taken — try another.', { username }) };

  // Created confirmed: email verification needs an email provider on Supabase (see Help).
  const { data, error } = await getSupabaseServerClient().auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { username },
  });
  if (error || !data.user) {
    return { ok: false, message: /already|registered|exists/i.test(error?.message || '') ? t('An account with this email already exists — log in instead.') : error?.message || t('Could not create the account.') };
  }
  const place = requestPlace();
  await ensureProfile(data.user.id, email, { username }, place.country, place.ip);
  const { error: loginError } = await authClient().auth.signInWithPassword({ email, password });
  if (loginError) return { ok: false, message: t('Account created — please log in.') };
  redirect(safeNext(form.get('next'), `/u/${username}`));
}

export async function logIn(_prev: AuthState, form: FormData): Promise<AuthState> {
  const t = await getT();
  const email = String(form.get('email') || '').trim().toLowerCase();
  const password = String(form.get('password') || '');
  if (!email || !password) return { ok: false, message: t('Enter your email and password.') };
  const { data, error } = await authClient().auth.signInWithPassword({ email, password });
  if (error || !data.user) return { ok: false, message: t('Wrong email or password.') };
  const place = requestPlace();
  await ensureProfile(data.user.id, email, data.user.user_metadata, place.country, place.ip);
  await applyProfilePrefs(data.user.id);
  redirect(safeNext(form.get('next')));
}

/** "Continue with Google": ready for when the Google provider is enabled on Supabase. */
export async function continueWithGoogle(next?: string): Promise<AuthState> {
  const t = await getT();
  const settings = await fetch(`${process.env.SUPABASE_URL}/auth/v1/settings`, {
    headers: { apikey: process.env.SUPABASE_SERVICE_KEY! }, cache: 'no-store',
  }).then((r) => r.json()).catch(() => null);
  if (!settings?.external?.google) return { ok: false, message: t('Google sign-in is coming soon — use email and password for now.') };
  const { data, error } = await authClient().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${siteOrigin()}/auth/callback?next=${encodeURIComponent(safeNext(next))}` },
  });
  if (error || !data.url) return { ok: false, message: error?.message || t('Could not reach Google.') };
  redirect(data.url);
}

export async function logOut() {
  await authClient().auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/');
}

export async function requestPasswordReset(_prev: AuthState, form: FormData): Promise<AuthState> {
  const t = await getT();
  const email = String(form.get('email') || '').trim().toLowerCase();
  if (!EMAIL.test(email)) return { ok: false, message: t('Enter a valid email address.') };
  await authClient().auth.resetPasswordForEmail(email, { redirectTo: `${siteOrigin()}/auth/callback?next=/reset-password` });
  // Same answer either way, so the form doesn't reveal who has an account.
  return { ok: true, message: t('If an account exists for that email, a reset link is on its way.') };
}

export async function updatePassword(_prev: AuthState, form: FormData): Promise<AuthState> {
  const t = await getT();
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: t('Your session expired — log in again.') };
  const password = String(form.get('password') || '');
  if (password.length < 8) return { ok: false, message: t('Use a password of at least 8 characters.') };
  if (password !== String(form.get('confirm') || '')) return { ok: false, message: t('The passwords don’t match.') };
  const { error } = await authClient().auth.updateUser({ password });
  if (error) return { ok: false, message: error.message };
  if (form.get('then') === 'home') redirect('/');
  return { ok: true, message: t('Password changed.') };
}

export async function updateProfile(_prev: AuthState, form: FormData): Promise<AuthState> {
  const t = await getT();
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: t('Your session expired — log in again.') };
  const username = String(form.get('username') || '').trim();
  const displayName = String(form.get('display_name') || '').trim().slice(0, 60);
  const bio = String(form.get('bio') || '').trim().slice(0, 1000);
  if (!USERNAME.test(username)) return { ok: false, message: t('Usernames are 3–24 letters, numbers or underscores.') };
  if (await usernameTaken(username, user.id)) return { ok: false, message: t('u/{username} is taken.', { username }) };
  const { error } = await getSupabaseServerClient().from('profiles').update({
    username, display_name: displayName || username, bio: bio || null, updated_at: new Date().toISOString(),
  }).eq('id', user.id);
  if (error) return { ok: false, message: error.message };
  revalidatePath('/', 'layout');
  return { ok: true, message: t('Profile saved.') };
}

/** Profile picture or card banner: a one-time upload URL in the public 'avatars' bucket, then saved on the profile. */
export async function createAvatarUpload(filename: string, size: number, kind: 'avatar' | 'banner' = 'avatar') {
  const t = await getT();
  const user = await getCurrentUser();
  if (!user) return { error: t('log in first') };
  const ext = (filename.match(/\.(png|jpe?g|webp|gif)$/i)?.[1] || '').toLowerCase();
  if (!ext) return { error: t('use a PNG, JPG, WebP or GIF image') };
  if (size > 5 * 1024 * 1024) return { error: t('images up to 5 MB') };
  const path = `${user.id}/${kind === 'banner' ? 'banner-' : ''}${crypto.randomUUID()}.${ext === 'jpeg' ? 'jpg' : ext}`;
  const { data, error } = await getSupabaseServerClient().storage.from('avatars').createSignedUploadUrl(path);
  if (error || !data) return { error: error?.message || t('could not start the upload') };
  return { path, url: data.signedUrl };
}

export async function setAvatar(path: string, kind: 'avatar' | 'banner' = 'avatar') {
  const t = await getT();
  const user = await getCurrentUser();
  if (!user || !path.startsWith(`${user.id}/`) || (kind === 'banner') !== path.startsWith(`${user.id}/banner-`)) return { error: t('not allowed') };
  const db = getSupabaseServerClient();
  const { data } = db.storage.from('avatars').getPublicUrl(path);
  const column = kind === 'banner' ? 'banner_url' : 'avatar_url';
  const { data: current } = await db.from('profiles').select(column).eq('id', user.id).maybeSingle();
  const old = (current as any)?.[column]?.split('/avatars/')[1];
  await db.from('profiles').update({ [column]: data.publicUrl, updated_at: new Date().toISOString() }).eq('id', user.id);
  if (old && old.startsWith(`${user.id}/`)) await db.storage.from('avatars').remove([old]);
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** Deletes the account and everything tied to it (profile, likes, posts, comments, avatar). */
export async function deleteAccount(_prev: AuthState, form: FormData): Promise<AuthState> {
  const t = await getT();
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: t('Your session expired — log in again.') };
  if (String(form.get('confirm') || '').trim() !== user.username) return { ok: false, message: t('Type {username} to confirm.', { username: user.username }) };
  const db = getSupabaseServerClient();
  const { data: files } = await db.storage.from('avatars').list(user.id);
  if (files?.length) await db.storage.from('avatars').remove(files.map((f) => `${user.id}/${f.name}`));
  const { error } = await db.auth.admin.deleteUser(user.id);
  if (error) return { ok: false, message: error.message };
  await authClient().auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/');
}

/** Heart on a tender or news story: like / unlike. Liked items show under Following on the profile. */
export async function toggleLike(itemType: 'tender' | 'news' | 'post' | 'comment', itemId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: 'login' as const };
  if (!['tender', 'news', 'post', 'comment'].includes(itemType) || !/^[\w-]{6,64}$/.test(itemId)) return { error: 'invalid' as const };
  const db = getSupabaseServerClient();
  const key = { user_id: user.id, item_type: itemType, item_id: itemId };
  const { data } = await db.from('likes').select('item_id').match(key).maybeSingle();
  if (data) await db.from('likes').delete().match(key);
  else {
    await db.from('likes').insert(key);
    // Tell the author their post or comment was liked (once per person and item).
    if (itemType === 'post') {
      const { data: post } = await db.from('posts').select('user_id, title').eq('id', itemId).maybeSingle();
      if (post && post.user_id !== user.id) {
        await notify(post.user_id, { type: 'like_post', title: `u/${user.username} liked your post`, body: post.title, link: `/posts/${itemId}`, actorId: user.id, once: true });
      }
    } else if (itemType === 'comment') {
      const { data: c } = await db.from('comments').select('user_id, body, item_type, item_id, post_id').eq('id', itemId).maybeSingle();
      if (c && c.user_id !== user.id) {
        const base = c.item_type === 'news' ? `/news/${c.item_id}` : c.item_type === 'tender' ? `/tenders/${c.item_id}` : `/posts/${c.post_id ?? c.item_id}`;
        await notify(c.user_id, { type: 'like_comment', title: `u/${user.username} liked your comment`, body: c.body.slice(0, 200), link: `${base}#c-${itemId}`, actorId: user.id, once: true });
      }
    }
  }
  revalidatePath(`/u/${user.username}`);
  return { liked: !data };
}

/** "https://…" on the given site (or a bare handle for it), else null; throws on a link to another site. */
function socialUrl(t: (key: string, vars?: Record<string, string | number>) => string, raw: string, label: string, hosts: string[], handleBase?: string) {
  const v = raw.trim();
  if (!v) return null;
  const handle = v.replace(/^@/, '');
  if (handleBase && /^[A-Za-z0-9_.-]{1,60}$/.test(handle)) return `${handleBase}${handle}`;
  let url: URL;
  try { url = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`); } catch { throw new Error(t('{label}: that isn’t a valid link.', { label })); }
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  if (hosts.length && !hosts.some((h) => host === h || host.endsWith(`.${h}`))) throw new Error(t('{label}: use a link on {host}.', { label, host: hosts[0] }));
  url.protocol = 'https:';
  return url.toString().slice(0, 300);
}

/** About details and social links (Edit profile). */
export async function updateProfileDetails(_prev: AuthState, form: FormData): Promise<AuthState> {
  const t = await getT();
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: t('Your session expired — log in again.') };
  const text = (k: string, max: number) => String(form.get(k) || '').trim().slice(0, max) || null;
  const expertise = Array.from(new Set(String(form.get('expertise') || '').split(',').map((t) => t.trim().slice(0, 40)).filter(Boolean))).slice(0, 15);
  let links;
  try {
    links = {
      website_url: socialUrl(t, String(form.get('website') || ''), t('Website'), []),
      linkedin_url: socialUrl(t, String(form.get('linkedin') || ''), 'LinkedIn', ['linkedin.com']),
      x_url: socialUrl(t, String(form.get('x') || ''), 'X', ['x.com', 'twitter.com'], 'https://x.com/'),
      github_url: socialUrl(t, String(form.get('github') || ''), 'GitHub', ['github.com'], 'https://github.com/'),
    };
  } catch (e: any) { return { ok: false, message: e.message }; }
  const { error } = await getSupabaseServerClient().from('profiles').update({
    company: text('company', 100), role: text('role', 100), location: text('location', 100), expertise, ...links,
    updated_at: new Date().toISOString(),
  }).eq('id', user.id);
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/u/${user.username}`);
  return { ok: true, message: t('Saved.') };
}
