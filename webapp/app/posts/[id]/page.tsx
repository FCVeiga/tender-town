import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { siteOrigin } from '@/lib/auth';
import { getPost } from '@/lib/social';
import UserAvatar from '@/components/UserAvatar';
import CommentsSection from '@/components/social/CommentsSection';
import PostMarkdown from '@/components/social/PostMarkdown';
import CardActions from '@/components/social/CardActions';
import { getEngagement } from '@/lib/engagement';
import { getLocale, getT } from '@/lib/i18n/server';
import { clip, pageMeta } from '@/lib/seo';
import JsonLd from '@/components/JsonLd';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const post = await getPost(params.id);
  if (!post) return { title: 'Not found — Tender Town', robots: { index: false, follow: false } };
  return pageMeta({
    title: `${post.title} — Tender Town`,
    socialTitle: post.title,
    description: clip(post.body || post.title),
    path: `/posts/${post.id}`,
    type: 'article',
    published: post.createdAt,
  });
}

export default async function PostPage({ params }: { params: { id: string } }) {
  const post = await getPost(params.id);
  if (!post) notFound();
  const t = await getT();
  const locale = getLocale();
  const fmt = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  const eng = await getEngagement('post', [post.id]);
  const origin = siteOrigin();
  return (
    <div className="post-page">
      <JsonLd data={{
        '@context': 'https://schema.org',
        '@type': 'DiscussionForumPosting',
        headline: post.title,
        articleBody: clip(post.body || '', 5000),
        datePublished: post.createdAt,
        author: post.author ? { '@type': 'Person', name: post.author.username, url: `${origin}/u/${post.author.username}` } : { '@type': 'Organization', name: 'Tender Town' },
        publisher: { '@type': 'Organization', name: 'Tender Town', url: origin },
        url: `${origin}/posts/${post.id}`,
      }} />
      <Link className="back-link" href="/community">← {t('Community')}</Link>
      <article className="detail-block post">
        <div className="post-author">
          <UserAvatar name={post.author?.username || '?'} src={post.author?.avatarUrl} size={32} />
          {post.author ? <Link href={`/u/${post.author.username}`}>u/{post.author.username}</Link> : <span>{t('deleted user')}</span>}
          <span className="profile-meta">· {fmt(post.createdAt)}</span>
        </div>
        <h1>{post.title}</h1>
        {post.tags.length > 0 && <div className="cc-tags">{post.tags.map((tag) => <span key={tag} className="cc-tag">{tag}</span>)}</div>}
        {post.item && <Link className="post-item" href={post.item.href}><span className="feed-kind opportunity">{t(post.item.kind)}</span>{post.item.title}</Link>}
        {post.body && <PostMarkdown>{post.body}</PostMarkdown>}
        {post.media.length > 0 && (
          <div className="post-media">
            {post.media.map((m, i) => (
              // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/media-has-caption
              m.type === 'image' ? <img key={i} src={m.url} alt="" loading="lazy" /> : <video key={i} src={m.url} controls playsInline preload="metadata" />
            ))}
          </div>
        )}
        <CardActions type="post" id={post.id} href={`/posts/${post.id}`} title={post.title} signedIn={eng.signedIn}
          likes={eng.get(post.id).likes} liked={eng.get(post.id).liked} comments={eng.get(post.id).comments}
          reposts={eng.get(post.id).reposts} reposted={eng.get(post.id).reposted} />
      </article>

      <CommentsSection itemType="post" itemId={post.id} loginNext={`/posts/${post.id}`} />
    </div>
  );
}
