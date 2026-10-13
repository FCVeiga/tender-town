'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { getT } from '@/lib/i18n/server';
import { chatOverview, counts, findConversation, listNotifications, membership, notify, thread } from '@/lib/social';

export type FormState = { ok: boolean; message: string } | null;
const db = () => getSupabaseServerClient();
const UUID = /^[0-9a-f-]{36}$/;

/* ---------------- Navbar ---------------- */

export async function getCounts() {
  const user = await getCurrentUser();
  return user ? counts(user.id) : { notifications: 0, chat: 0 };
}

export async function getNotifications() {
  const user = await getCurrentUser();
  return user ? listNotifications(user.id) : [];
}

/** The newest unread notification (for the toast when one arrives). */
export async function getLatestUnread() {
  const user = await getCurrentUser();
  if (!user) return null;
  const [n] = await listNotifications(user.id, 1);
  return n && !n.read ? n : null;
}

export async function getNotificationPrefs() {
  const user = await getCurrentUser();
  if (!user) return null;
  const { data } = await db().from('profiles').select('notification_prefs').eq('id', user.id).maybeSingle();
  return (data?.notification_prefs || {}) as Record<string, boolean>;
}

const PREF_KEYS = ['likes', 'comments', 'replies', 'new_tender', 'tender_update', 'follows'];
export async function setNotificationPref(key: string, on: boolean) {
  const user = await getCurrentUser();
  if (!user || !PREF_KEYS.includes(key)) return;
  const prefs = (await getNotificationPrefs()) || {};
  await db().from('profiles').update({ notification_prefs: { ...prefs, [key]: on } }).eq('id', user.id);
}

export async function markNotificationsRead(ids?: string[]) {
  const user = await getCurrentUser();
  if (!user) return;
  let q = db().from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', user.id).is('read_at', null);
  if (ids?.length) q = q.in('id', ids.filter((i) => UUID.test(i)));
  await q;
}

/* ---------------- Posts ---------------- */

const MEDIA = /\.(png|jpe?g|webp|gif|mp4|webm|mov)$/i;

/** Post media: a one-time upload URL in the public 'post-media' bucket (images and videos, up to 50 MB). */
export async function createPostMediaUpload(filename: string, size: number) {
  const t = await getT();
  const user = await getCurrentUser();
  if (!user) return { error: t('Log in to post.') };
  const ext = filename.match(MEDIA)?.[1]?.toLowerCase();
  if (!ext) return { error: t('Use PNG, JPG, WebP, GIF, MP4, WebM or MOV files.') };
  if (size > 50 * 1024 * 1024) return { error: t('Files up to 50 MB.') };
  const path = `${user.id}/${crypto.randomUUID()}.${ext === 'jpeg' ? 'jpg' : ext}`;
  const { data, error } = await db().storage.from('post-media').createSignedUploadUrl(path);
  if (error || !data) return { error: error?.message || t('Could not start the upload.') };
  return { path, url: data.signedUrl, publicUrl: db().storage.from('post-media').getPublicUrl(path).data.publicUrl,
           type: /^(mp4|webm|mov)$/.test(ext) ? 'video' as const : 'image' as const };
}

export async function createPost(_prev: FormState, form: FormData): Promise<FormState> {
  const t = await getT();
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: t('Log in to post.') };
  const title = String(form.get('title') || '').trim();
  const body = String(form.get('body') || '').trim();
  if (title.length < 3) return { ok: false, message: t('Give your post a title.') };
  if (title.length > 300) return { ok: false, message: t('Titles are up to 300 characters.') };
  let tags: string[] = [];
  let media: { type: string; url: string; path: string }[] = [];
  try {
    tags = (JSON.parse(String(form.get('tags') || '[]')) as unknown[]).map((t) => String(t).trim().toLowerCase().slice(0, 50)).filter(Boolean);
    media = (JSON.parse(String(form.get('media') || '[]')) as any[]).filter((m) =>
      (m?.type === 'image' || m?.type === 'video') && typeof m.path === 'string' && m.path.startsWith(`${user.id}/`)).slice(0, 10);
  } catch { return { ok: false, message: t('Something went wrong with the tags or media — try again.') }; }
  const bucket = db().storage.from('post-media');
  const { data, error } = await db().from('posts').insert({
    user_id: user.id, title, body: body.slice(0, 40000) || null, tags: Array.from(new Set(tags)).slice(0, 10),
    media: media.map((m) => ({ type: m.type, path: m.path, url: bucket.getPublicUrl(m.path).data.publicUrl })),
  }).select('id').single();
  if (error || !data) return { ok: false, message: error?.message || t('Could not publish the post.') };
  revalidatePath('/community');
  revalidatePath(`/u/${user.username}`);
  redirect(`/posts/${data.id}`);
}

/** Follow / unfollow a member: their posts rank higher in your Community Feed. */
export async function toggleFollow(username: string) {
  const user = await getCurrentUser();
  if (!user) return { error: 'login' as const };
  const { data: target } = await db().from('profiles').select('id, username').ilike('username', username.replace(/_/g, '\\_')).maybeSingle();
  if (!target || target.id === user.id) return { error: 'invalid' as const };
  const key = { follower_id: user.id, followee_id: target.id };
  const { data } = await db().from('user_follows').select('followee_id').match(key).maybeSingle();
  if (data) await db().from('user_follows').delete().match(key);
  else {
    await db().from('user_follows').insert(key);
    await notify(target.id, { type: 'follow', title: `u/${user.username} started following you`, link: `/u/${user.username}`, actorId: user.id });
  }
  revalidatePath(`/u/${target.username}`);
  return { following: !data };
}

const ITEM = /^(post|news|tender|blog):([\w-]{6,64})$/;
type ItemType = 'post' | 'news' | 'tender';
const itemHref = (t: string, id: string) => (t === 'post' ? `/posts/${id}` : t === 'news' ? `/news/${id}` : t === 'blog' ? `/blog/${id}` : `/tenders/${id}`);

/** A comment on a post, news story or tender — or a reply to another comment. */
export async function addComment(_prev: FormState, form: FormData): Promise<FormState> {
  const t = await getT();
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: t('Log in to comment.') };
  const ref = String(form.get('item') || '').match(ITEM);
  const parent = String(form.get('parent') || '');
  const body = String(form.get('body') || '').trim();
  if (!ref || !body) return { ok: false, message: t('Write a comment first.') };
  const [, type, id] = ref;
  if (parent && !UUID.test(parent)) return { ok: false, message: t('That comment no longer exists.') };
  let parentAuthor: string | null = null;
  if (parent) {
    const { data: p } = await db().from('comments').select('user_id, item_type, item_id').eq('id', parent).maybeSingle();
    if (!p || p.item_type !== type || p.item_id !== id) return { ok: false, message: t('That comment no longer exists.') };
    parentAuthor = p.user_id;
  }
  let postAuthor: string | null = null, postTitle = '';
  if (type === 'post') {
    const { data: post } = await db().from('posts').select('user_id, title').eq('id', id).maybeSingle();
    if (!post) return { ok: false, message: t('That post no longer exists.') };
    postAuthor = post.user_id; postTitle = post.title;
  }
  const { error } = await db().from('comments').insert({
    user_id: user.id, item_type: type, item_id: id, post_id: type === 'post' ? id : null, parent_id: parent || null, body: body.slice(0, 10000),
  });
  if (error) return { ok: false, message: error.message };
  const link = `${itemHref(type, id)}#comments`;
  if (parentAuthor && parentAuthor !== user.id) {
    await notify(parentAuthor, { type: 'reply', title: `u/${user.username} replied to your comment`, body: body.slice(0, 200), link, actorId: user.id });
  } else if (!parent && postAuthor && postAuthor !== user.id) {
    await notify(postAuthor, { type: 'comment', title: `u/${user.username} commented on your post`, body: postTitle, link, actorId: user.id });
  }
  revalidatePath(itemHref(type, id));
  return { ok: true, message: t('Comment posted.') };
}

/** Repost / undo: shares the item to your profile, and counts on the card. */
export async function toggleRepost(itemType: ItemType, itemId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: 'login' as const };
  if (!['post', 'news', 'tender'].includes(itemType) || !/^[\w-]{6,64}$/.test(itemId)) return { error: 'invalid' as const };
  const key = { user_id: user.id, item_type: itemType, item_id: itemId };
  const { data } = await db().from('reposts').select('item_id').match(key).maybeSingle();
  if (data) await db().from('reposts').delete().match(key);
  else await db().from('reposts').insert(key);
  revalidatePath(`/u/${user.username}`);
  return { reposted: !data };
}

/** "Hide" in a card's menu: the item disappears from your feeds. */
export async function hideItem(itemType: ItemType, itemId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: 'login' as const };
  if (!['post', 'news', 'tender'].includes(itemType) || !/^[\w-]{6,64}$/.test(itemId)) return { error: 'invalid' as const };
  await db().from('hidden_items').upsert({ user_id: user.id, item_type: itemType, item_id: itemId });
  return { ok: true };
}

const REASONS = ['spam', 'misleading', 'harassment', 'off-topic', 'copyright', 'other'];

/** "Report" in a card's menu: stored for review. */
export async function reportItem(itemType: ItemType | 'comment', itemId: string, reason: string, details: string) {
  const user = await getCurrentUser();
  if (!user) return { error: 'login' as const };
  if (!['post', 'news', 'tender', 'comment'].includes(itemType) || !/^[\w-]{6,64}$/.test(itemId) || !REASONS.includes(reason)) return { error: 'invalid' as const };
  await db().from('reports').insert({ user_id: user.id, item_type: itemType, item_id: itemId, reason, details: details.trim().slice(0, 1000) || null });
  return { ok: true };
}

/* ---------------- Chat ---------------- */

export async function getChats() {
  const user = await getCurrentUser();
  return user ? chatOverview(user.id) : [];
}

export async function getThread(conversationId: string) {
  const user = await getCurrentUser();
  if (!user || !UUID.test(conversationId)) return null;
  return thread(conversationId, user.id);
}

/** A chat request: a new conversation the other person accepts or declines (one per pair). */
/** Why a new chat request to this person isn't allowed (Settings → Chat), or null. */
async function chatBlocked(fromId: string, toId: string): Promise<string | null> {
  const { data: p } = await db().from('profiles').select('chat_permission').eq('id', toId).maybeSingle();
  const rule = p?.chat_permission ?? 'everyone';
  if (rule === 'nobody') return 'isn’t accepting chat requests';
  if (rule === 'workspace') {
    const { data: theirs } = await db().from('workspace_members').select('workspace_id').eq('user_id', toId);
    const ids = (theirs || []).map((r: any) => r.workspace_id);
    const { count } = ids.length
      ? await db().from('workspace_members').select('user_id', { count: 'exact', head: true }).eq('user_id', fromId).in('workspace_id', ids)
      : { count: 0 };
    if (!count) return 'only accepts chat requests from people in their workspaces';
  }
  return null;
}

export async function startChat(username: string, body: string): Promise<{ error: string } | { conversationId: string }> {
  const t = await getT();
  const user = await getCurrentUser();
  if (!user) return { error: t('Log in to chat.') };
  const text = body.trim();
  if (!text) return { error: t('Write a first message.') };
  const { data: target } = await db().from('profiles').select('id, username').ilike('username', username.replace(/_/g, '\\_')).maybeSingle();
  if (!target) return { error: t('No such user.') };
  if (target.id === user.id) return { error: t('That’s you.') };
  const existing = await findConversation(user.id, target.id);
  if (!existing) {
    const blocked = await chatBlocked(user.id, target.id);
    if (blocked) return { error: t(`u/{username} ${blocked}.`, { username: target.username }) };
  }
  if (existing) {
    if (existing.status === 'declined') return { error: t('u/{username} declined your chat request.', { username: target.username }) };
    const sent = await sendMessage(existing.conversation_id, text);
    return 'error' in sent && sent.error ? { error: sent.error } : { conversationId: existing.conversation_id };
  }
  const { data: conv, error } = await db().from('conversations').insert({ created_by: user.id }).select('id').single();
  if (error || !conv) return { error: error?.message || t('Could not start the chat.') };
  await db().from('conversation_members').insert([
    { conversation_id: conv.id, user_id: user.id, status: 'accepted', last_read_at: new Date().toISOString() },
    { conversation_id: conv.id, user_id: target.id, status: 'pending' },
  ]);
  await db().from('messages').insert({ conversation_id: conv.id, sender_id: user.id, body: text.slice(0, 4000) });
  await notify(target.id, { type: 'chat_request', title: `u/${user.username} wants to chat`, body: text.slice(0, 200), link: `/chat?c=${conv.id}`, actorId: user.id });
  return { conversationId: conv.id };
}

export async function respondToRequest(conversationId: string, accept: boolean) {
  const user = await getCurrentUser();
  if (!user || !UUID.test(conversationId) || (await membership(conversationId, user.id)) !== 'pending') return { error: 'not allowed' };
  await db().from('conversation_members').update({ status: accept ? 'accepted' : 'declined', last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId).eq('user_id', user.id);
  if (accept) {
    const { data: conv } = await db().from('conversations').select('created_by').eq('id', conversationId).maybeSingle();
    if (conv?.created_by) await notify(conv.created_by, { type: 'chat_accepted', title: `u/${user.username} accepted your chat request`, link: `/chat?c=${conversationId}`, actorId: user.id });
  }
  return { ok: true };
}

export async function sendMessage(conversationId: string, body: string) {
  const t = await getT();
  const user = await getCurrentUser();
  if (!user || !UUID.test(conversationId)) return { error: t('Log in to chat.') };
  const text = body.trim().slice(0, 4000);
  if (!text) return { error: t('Empty message.') };
  if ((await membership(conversationId, user.id)) !== 'accepted') return { error: t('Accept the chat request first.') };
  const { data: other } = await db().from('conversation_members').select('status').eq('conversation_id', conversationId).neq('user_id', user.id).maybeSingle();
  if (other?.status === 'declined') return { error: t('This chat request was declined.') };
  const now = new Date().toISOString();
  const { error } = await db().from('messages').insert({ conversation_id: conversationId, sender_id: user.id, body: text });
  if (error) return { error: error.message };
  await Promise.all([
    db().from('conversations').update({ last_message_at: now }).eq('id', conversationId),
    db().from('conversation_members').update({ last_read_at: now }).eq('conversation_id', conversationId).eq('user_id', user.id),
  ]);
  return { ok: true };
}

export async function markChatRead(conversationId: string) {
  const user = await getCurrentUser();
  if (!user || !UUID.test(conversationId)) return;
  await db().from('conversation_members').update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId).eq('user_id', user.id).eq('status', 'accepted');
}
