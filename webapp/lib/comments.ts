/** Comment threads (posts and news): nested replies, with likes. */
import 'server-only';
import { getSupabaseServerClient } from '@/lib/supabase';

export type CommentNode = {
  id: string; body: string; createdAt: string; likes: number; liked: boolean;
  author: { username: string; avatarUrl: string | null } | null; replies: CommentNode[];
};

export async function getCommentTree(itemType: 'post' | 'news' | 'tender' | 'blog', itemId: string, userId: string | null): Promise<{ tree: CommentNode[]; total: number }> {
  const db = getSupabaseServerClient();
  const { data } = await db.from('comments').select('id, user_id, parent_id, body, like_count, created_at')
    .eq('item_type', itemType).eq('item_id', itemId).order('created_at', { ascending: true }).limit(1000);
  const rows = data || [];
  const ids = rows.map((c: any) => c.id);
  const [{ data: authors }, { data: mine }] = await Promise.all([
    db.from('profiles').select('id, username, avatar_url').in('id', Array.from(new Set(rows.map((c: any) => c.user_id)))),
    userId && ids.length ? db.from('likes').select('item_id').eq('user_id', userId).eq('item_type', 'comment').in('item_id', ids) : Promise.resolve({ data: [] as any[] }),
  ]);
  const who = new Map((authors || []).map((a: any) => [a.id, { username: a.username, avatarUrl: a.avatar_url }]));
  const liked = new Set((mine || []).map((l: any) => l.item_id));
  const nodes = new Map<string, CommentNode>(rows.map((c: any) => [c.id, {
    id: c.id, body: c.body, createdAt: c.created_at, likes: c.like_count || 0, liked: liked.has(c.id), author: who.get(c.user_id) ?? null, replies: [],
  }]));
  const tree: CommentNode[] = [];
  for (const c of rows) {
    const node = nodes.get(c.id)!;
    const parent = c.parent_id ? nodes.get(c.parent_id) : null;
    (parent ? parent.replies : tree).push(node);
  }
  return { tree, total: rows.length };
}
