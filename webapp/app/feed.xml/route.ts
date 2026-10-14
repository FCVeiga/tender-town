import { siteOrigin } from '@/lib/auth';
import { getSupabaseServerClient } from '@/lib/supabase';
import { opportunityPath, titleOf } from '@/lib/data';
import { firstInLanguage } from '@/lib/english';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

type Item = { title: string; link: string; date: string; description: string };

/** The latest tenders, news and posts, for search engines and agents that follow a feed. */
export async function GET() {
  const origin = siteOrigin();
  const db = getSupabaseServerClient();
  const [tenders, news, posts] = await Promise.all([
    db.from('opportunities').select('opportunity_id, opportunity_type, title, title_en, language, summary, tender_summary, publication_date, first_detected').order('first_detected', { ascending: false }).limit(40),
    db.from('news_items').select('news_id, title, title_en, language, summary, excerpt, published_date, created_at').order('published_date', { ascending: false }).limit(40),
    db.from('posts').select('id, title, body, created_at').order('created_at', { ascending: false }).limit(20),
  ]);
  const items: Item[] = [
    ...(tenders.data || []).map((r: any) => ({
      title: titleOf(r),
      link: `${origin}${opportunityPath(r)}`,
      date: r.publication_date || r.first_detected || new Date().toISOString(),
      description: firstInLanguage(r.tender_summary, r.summary) || '',
    })),
    ...(news.data || []).map((r: any) => ({
      title: titleOf(r),
      link: `${origin}/news/${r.news_id}`,
      date: r.published_date || r.created_at || new Date().toISOString(),
      description: firstInLanguage(r.summary, r.excerpt) || '',
    })),
    ...(posts.data || []).map((r: any) => ({
      title: r.title,
      link: `${origin}/posts/${r.id}`,
      date: r.created_at,
      description: r.body || '',
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>Tender Town</title>
<link>${xml(origin)}</link>
<description>Specialised AI agents for your next tender. They find opportunities, analyse requirements and prepare proposal briefs. Updated every four hours.</description>
<language>en</language>
${items.map((item) => `<item>
<title>${xml(item.title)}</title>
<link>${xml(item.link)}</link>
<guid>${xml(item.link)}</guid>
<pubDate>${new Date(item.date).toUTCString()}</pubDate>
<description>${xml(item.description.replace(/\s+/g, ' ').trim().slice(0, 500))}</description>
</item>`).join('\n')}
</channel>
</rss>`;
  return new Response(body, {
    headers: { 'content-type': 'application/rss+xml; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
}
