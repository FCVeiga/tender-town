import type { MetadataRoute } from 'next';
import { siteOrigin } from '@/lib/auth';
import { posts as blogPosts } from '@/lib/blog';
import { marketIndex } from '@/lib/discover';
import { getSupabaseServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

const STATIC = [
  '', '/about', '/pricing', '/privacy', '/terms', '/help', '/blog', '/mcp', '/discover', '/markets',
  '/tenders', '/tenders/new', '/tenders/rfps', '/tenders/rfis', '/tenders/grants',
  '/news', '/news/regulation', '/news/industry', '/news/market', '/news/signals',
  '/community',
];

async function pages(table: string, columns: string, order: string) {
  const db = getSupabaseServerClient();
  const rows: any[] = [];
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await db.from(table).select(columns).order(order, { ascending: false }).range(from, from + 999);
    if (error || !data?.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

/** Every public page, including tenders, news and posts as they are published. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteOrigin();
  const now = new Date();
  const [tenders, news, posts, people, markets] = await Promise.all([
    pages('opportunities', 'opportunity_id, opportunity_type, last_change, publication_date, first_detected', 'first_detected'),
    pages('news_items', 'news_id, published_date, created_at', 'published_date'),
    pages('posts', 'id, created_at', 'created_at'),
    pages('profiles', 'username, created_at, searchable', 'created_at'),
    marketIndex(),
  ]);
  const entry = (path: string, when?: string | null) => {
    const date = when ? new Date(when) : now;
    return { url: `${origin}${path}`, lastModified: Number.isNaN(date.getTime()) ? now : date };
  };
  return [
    ...STATIC.map((path) => entry(path || '/', now.toISOString())),
    ...blogPosts.map((post) => entry(`/blog/${post.slug}`, post.date)),
    ...markets.map((market) => entry(`/markets/${market.slug}`)),
    ...tenders.map((r) => entry(r.opportunity_type === 'signal' ? `/news/signals/${r.opportunity_id}` : `/tenders/${r.opportunity_id}`, r.last_change || r.publication_date || r.first_detected)),
    ...news.map((r) => entry(`/news/${r.news_id}`, r.published_date || r.created_at)),
    ...posts.map((r) => entry(`/posts/${r.id}`, r.created_at)),
    ...people.filter((r) => r.username && r.searchable !== false).map((r) => entry(`/u/${r.username}`, r.created_at)),
  ];
}
