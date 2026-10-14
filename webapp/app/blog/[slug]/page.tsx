import Link from 'next/link';
import { Fragment } from 'react';
import { notFound } from 'next/navigation';
import BlogActions from '@/components/blog/BlogActions';
import CommentsSection from '@/components/social/CommentsSection';
import { getCurrentUser, siteOrigin } from '@/lib/auth';
import { postBySlug, posts, type Post } from '@/lib/blog';
import { blogEngagement } from '@/lib/blog-engagement';
import { getLang, getLocale, getT, getTSync } from '@/lib/i18n/server';
import { pageMeta } from '@/lib/seo';

const TAGS: Record<string, string> = {
  configure: '/skills/configure-scope',
  fit: '/skills/fit-analysis',
  proposal: '/skills/proposal-draft',
  guide: '/mcp',
  skills: '/skills.md',
  check: '/blog/how-to-check-if-your-company-can-bid',
  account: '/signup',
};

function rich(text: string) {
  const parts: React.ReactNode[] = [];
  const re = /<(\w+)>(.*?)<\/\1>/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = re.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const href = TAGS[match[1]];
    const label = match[2];
    parts.push(href
      ? (match[1] === 'skills'
        ? <a key={i++} href={href}>{label}</a>
        : <Link key={i++} href={href}>{label}</Link>)
      : <Fragment key={i++}>{match[0]}</Fragment>);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function written(date: string, locale: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
}

function articleGraph(post: Post, origin: string, title: string, description: string, lang: string) {
  const url = `${origin}/blog/${post.slug}`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BlogPosting',
        headline: title,
        description,
        datePublished: post.date,
        dateModified: post.date,
        inLanguage: lang,
        mainEntityOfPage: url,
        url,
        image: `${origin}${post.image}`,
        author: { '@type': 'Organization', name: 'Tender Town', url: origin },
        publisher: { '@type': 'Organization', name: 'Tender Town', url: origin },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Blog', item: `${origin}/blog` },
          { '@type': 'ListItem', position: 2, name: title, item: url },
        ],
      },
    ],
  };
}

export function generateStaticParams() {
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const post = postBySlug(params.slug);
  if (!post) return {};
  const t = await getT();
  const meta = pageMeta({
    title: `${t(post.title)} — Tender Town`,
    description: t(post.description),
    path: `/blog/${post.slug}`,
    type: 'article',
    image: post.image,
  });
  return {
    ...meta,
    openGraph: { ...meta.openGraph, publishedTime: post.date },
  };
}

export default async function BlogPostPage({ params }: { params: { slug: string } }) {
  const post = postBySlug(params.slug);
  if (!post) notFound();
  const t = getTSync();
  const origin = siteOrigin();
  const title = t(post.title);
  const description = t(post.description);
  const href = `/blog/${post.slug}`;
  const user = await getCurrentUser();
  const counts = await blogEngagement([post.slug], user?.id ?? null);
  const n = counts[post.slug];
  const graph = articleGraph(post, origin, title, description, getLang());
  return (
    <article className="legal blog-article">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(graph).replace(/</g, '\\u003c') }} />
      <p className="legal-updated"><Link href="/blog">{t('Blog')}</Link></p>
      <h1>{title}</h1>
      <p className="blog-dek">{description}</p>
      <div className="blog-byline">
        <time dateTime={post.date}>{written(post.date, getLocale())}</time>
        <BlogActions slug={post.slug} href={href} title={title} likes={n.likes} liked={n.liked} comments={n.comments} signedIn={!!user} />
      </div>
      <img className="blog-hero" src={post.image} alt={t(post.imageAlt)} width={1280} height={720} />
      <div className="legal-body">
        {post.blocks.map((block, i) => (
          block.type === 'h2' ? <h2 key={i}>{t(block.text)}</h2>
            : block.type === 'h3' ? <h3 key={i}>{t(block.text)}</h3>
              : block.type === 'ul' ? <ul key={i}>{block.items.map((item) => <li key={item}>{rich(t(item))}</li>)}</ul>
                : block.type === 'img' ? <figure key={i} className="blog-figure"><img src={block.src} alt={t(block.alt)} width={1280} height={720} /></figure>
                  : <p key={i}>{rich(t(block.text))}</p>
        ))}
        <div className="blog-cta">
          <Link className="btn primary" href="/signup">{t('Create an account')}</Link>
          <Link className="btn" href="/mcp">{t('Connect your own agents')}</Link>
        </div>
      </div>
      <CommentsSection itemType="blog" itemId={post.slug} loginNext={href} />
    </article>
  );
}
