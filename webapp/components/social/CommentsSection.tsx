import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { getCommentTree } from '@/lib/comments';
import CommentThread, { CommentForm } from './CommentThread';
import { getT } from '@/lib/i18n/server';

/** Comments block for a post or news page. */
export default async function CommentsSection({ itemType, itemId, loginNext }: { itemType: 'post' | 'news' | 'tender' | 'blog'; itemId: string; loginNext: string }) {
  const t = await getT();
  const user = await getCurrentUser();
  const { tree, total } = await getCommentTree(itemType, itemId, user?.id ?? null);
  const item = `${itemType}:${itemId}`;
  return (
    <section className="detail-block" id="comments">
      <h2>{t('Comments')} <span className="uc-count">{total}</span></h2>
      {user ? <CommentForm item={item} /> : <p className="muted"><Link href={`/login?next=${encodeURIComponent(loginNext)}`}>{t('Log in')}</Link> {t('to comment.')}</p>}
      {tree.length > 0 ? <CommentThread nodes={tree} item={item} signedIn={!!user} />
        : <p className="muted comments-empty">{t('No comments yet — start the conversation.')}</p>}
    </section>
  );
}
