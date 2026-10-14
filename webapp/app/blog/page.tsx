import Link from 'next/link';
import BlogActions from '@/components/blog/BlogActions';
import { getCurrentUser } from '@/lib/auth';
import { BLOG_LEAD, posts } from '@/lib/blog';
import { blogEngagement } from '@/lib/blog-engagement';
import { getLocale, getT, getTSync } from '@/lib/i18n/server';
import { pageMeta } from '@/lib/seo';

export async function generateMetadata() {
  const t = await getT();
  return pageMeta({
    title: `${t('Blog')} — Tender Town`,
    description: t(BLOG_LEAD),
    path: '/blog',
  });
}

function written(date: string, locale: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
}

export default async function BlogPage() {
  const t = getTSync();
  const locale = getLocale();
  const user = await getCurrentUser();
  const counts = await blogEngagement(posts.map((post) => post.slug), user?.id ?? null);
  return (
    <article className="legal blog-index">
      <h1 className="opps-h1">{t('Blog')}</h1>
      {posts.length === 0 ? (
        <p className="muted">{t('No posts yet.')}</p>
      ) : (
        <ul className="blog-list">
          {posts.map((post) => {
            const href = `/blog/${post.slug}`;
            const title = t(post.title);
            const n = counts[post.slug];
            return (
              <li key={post.slug} className="blog-row">
                <div className="blog-row-copy">
                  <Link href={href} className="blog-row-link">
                    <strong>{title}</strong>
                    <span>{t(post.description)}</span>
                  </Link>
                  <div className="blog-row-foot">
                    <time dateTime={post.date}>{written(post.date, locale)}</time>
                    <BlogActions slug={post.slug} href={href} title={title} likes={n.likes} liked={n.liked} comments={n.comments} signedIn={!!user} />
                  </div>
                </div>
                <Link href={href} className="blog-row-thumb" tabIndex={-1} aria-hidden="true">
                  <img src={post.image} alt="" width={1280} height={720} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}
