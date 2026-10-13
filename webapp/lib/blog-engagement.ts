/** Like and comment counts for blog articles. */
import 'server-only';
import { getSupabaseServerClient } from '@/lib/supabase';

export type BlogCounts = { likes: number; liked: boolean; comments: number };

export async function blogEngagement(slugs: string[], userId: string | null): Promise<Record<string, BlogCounts>> {
  const counts: Record<string, BlogCounts> = {};
  for (const slug of slugs) counts[slug] = { likes: 0, liked: false, comments: 0 };
  if (!slugs.length) return counts;
  const db = getSupabaseServerClient();
  const [{ data: likes }, { data: comments }, mine] = await Promise.all([
    db.from('likes').select('item_id').eq('item_type', 'blog').in('item_id', slugs),
    db.from('comments').select('item_id').eq('item_type', 'blog').in('item_id', slugs),
    userId
      ? db.from('likes').select('item_id').eq('item_type', 'blog').eq('user_id', userId).in('item_id', slugs)
      : Promise.resolve({ data: [] as { item_id: string }[] }),
  ]);
  for (const row of likes || []) if (counts[row.item_id]) counts[row.item_id].likes += 1;
  for (const row of comments || []) if (counts[row.item_id]) counts[row.item_id].comments += 1;
  for (const row of mine.data || []) if (counts[row.item_id]) counts[row.item_id].liked = true;
  return counts;
}
