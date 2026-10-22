/**
 * Site search (navbar box → /search?q=…). Every word must match somewhere in
 * an item's original fields or in the agent-written post about it — the post
 * copy is English, so this also finds notices whose titles are in Greek or
 * German. Results come back as feed items so they render as post cards.
 */
import { getSupabaseServerClient } from '@/lib/supabase';
import { NewsItem, Opportunity, cardFreshness, newsCategoryLabel, oppCategoryLabel, opportunityPath, titleOf } from '@/lib/data';
import { FeedItem, HALF_LIFE_DAYS } from '@/lib/feed';
import { firstInLanguage } from '@/lib/english';
import { publicText } from '@/lib/publication';
import { getPlatformLanguage } from '@/lib/language';
import { getScopeItems } from '@/lib/scopes';

const MAX_WORDS = 6;

export function searchWords(q: string) {
  return q.toLowerCase().split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}\-]/gu, ''))  // strip PostgREST filter syntax (, ( ) * etc.)
    .filter((w) => w.length >= 2)
    .slice(0, MAX_WORDS);
}

const ilikeAny = (fields: string[], w: string) => fields.map((f) => `${f}.ilike.*${w}*`).join(',');

function isActive(o: Opportunity, now: Date) {
  return (o.status === 'OPEN' || o.status === 'SIGNAL') && (!o.deadline || new Date(o.deadline) >= now);
}

function statusLabel(o: Opportunity, now: Date) {
  if (isActive(o, now)) return null;
  if (o.status === 'AWARDED') return 'Awarded';
  if (o.status === 'REJECTED') return 'Not an opportunity';
  if (o.status === 'UNVERIFIED') return 'Unverified';
  return 'Closed';
}

export async function search(q: string, now = new Date()) {
  await getPlatformLanguage();  // the display filter's language
  const words = searchWords(q);
  if (!words.length) return { opportunities: [] as FeedItem[], news: [] as FeedItem[] };
  const db = getSupabaseServerClient();

  const filtered = (table: string, fields: string[], select = '*') => {
    let query = db.from(table).select(select).limit(200);
    for (const w of words) query = query.or(ilikeAny(fields, w));
    return query;
  };
  const [opps, news, posts] = await Promise.all([
    filtered('opportunities', ['title', 'title_en', 'summary', 'authority', 'country']),
    filtered('news_items', ['title', 'title_en', 'summary', 'excerpt', 'source_name']),
    filtered('feed_posts', ['headline', 'body'], 'opportunity_id, news_id'),
  ]);

  // Union of direct matches and items whose post matched, then fetch what's missing.
  const oppIds = new Set<string>([...(opps.data || []).map((o: any) => o.opportunity_id),
    ...(posts.data || []).map((p: any) => p.opportunity_id).filter(Boolean)]);
  const newsIds = new Set<string>([...(news.data || []).map((n: any) => n.news_id),
    ...(posts.data || []).map((p: any) => p.news_id).filter(Boolean)]);
  const haveOpp = new Set((opps.data || []).map((o: any) => o.opportunity_id));
  const haveNews = new Set((news.data || []).map((n: any) => n.news_id));
  const missingOpp = [...oppIds].filter((id) => !haveOpp.has(id));
  const missingNews = [...newsIds].filter((id) => !haveNews.has(id));

  const [extraOpps, extraNews] = await Promise.all([
    missingOpp.length ? db.from('opportunities').select('*').in('opportunity_id', missingOpp) : { data: [] },
    missingNews.length ? db.from('news_items').select('*').in('news_id', missingNews) : { data: [] },
  ]);
  const decay = (at: Date) => Math.pow(0.5, Math.max(0, (now.getTime() - at.getTime()) / 86400_000) / HALF_LIFE_DAYS);

  // Only what the viewer's scopes found, scored with their relevance.
  const [tenderScope, newsScope] = await Promise.all([getScopeItems('tender'), getScopeItems('news')]);
  const oppRows = [...(opps.data || []), ...(extraOpps.data || [])].filter((o: Opportunity) => !tenderScope || tenderScope.relevance.has(o.opportunity_id));
  const newsRows = [...(news.data || []), ...(extraNews.data || [])].filter((n: NewsItem) => !newsScope || newsScope.relevance.has(n.news_id));

  const oppItems: FeedItem[] = oppRows.map((o: Opportunity) => {
    const at = new Date(o.first_detected || o.publication_date || now);
    const score = tenderScope?.relevance.get(o.opportunity_id) ?? o.opportunity_relevance_score ?? 30;
    const signal = o.opportunity_type === 'signal';
    const label = statusLabel(o, now);
    const fresh = signal || label ? null : cardFreshness(o, now);
    return {
      key: `opp:${o.opportunity_id}`, kind: 'opportunity', event: signal ? 'signal' : 'new_opportunity',
      href: opportunityPath(o),
      headline: titleOf(o), body: publicText(firstInLanguage(o.summary) || ''),
      category: o.opportunity_type || 'rfp', categoryLabel: oppCategoryLabel(o.opportunity_type), kindLabel: signal ? 'Planned procurement' : 'Opportunity',
      country: o.country, at, score, combined: Math.round(score * decay(at)), movement: 'same',
      deadline: o.deadline, isNew: fresh === 'new', fresh, statusLabel: label,
    };
  });
  const newsItems: FeedItem[] = newsRows.map((n: NewsItem) => {
    const at = new Date(n.published_date || n.created_at || now);
    const score = newsScope?.relevance.get(n.news_id) ?? n.relevance_score ?? 30;
    return {
      key: `news:${n.news_id}`, kind: 'news', event: 'news', href: `/news/${n.news_id}`,
      headline: titleOf(n), body: publicText(firstInLanguage(n.summary, n.excerpt) || ''),
      category: n.category || 'market', categoryLabel: newsCategoryLabel(n.category), kindLabel: 'News',
      country: n.country, at, score, combined: Math.round(score * decay(at)), movement: 'same',
      deadline: null, isNew: false, fresh: null,
    };
  });

  // Open opportunities first, then by the Top score; news by time.
  oppItems.sort((a, b) => Number(!!a.statusLabel) - Number(!!b.statusLabel) || b.combined - a.combined || b.score - a.score);
  newsItems.sort((a, b) => b.at.getTime() - a.at.getTime() || b.score - a.score);
  return { opportunities: oppItems, news: newsItems };
}

export type PersonHit = { username: string; displayName: string; avatarUrl: string | null; company: string | null };

/** People whose profile is searchable (Settings → Privacy) matching every word of the query. */
export async function searchPeople(q: string): Promise<PersonHit[]> {
  const words = searchWords(q);
  if (!words.length) return [];
  let query = getSupabaseServerClient().from('profiles').select('username, display_name, avatar_url, company')
    .eq('searchable', true).limit(10);
  for (const w of words) query = query.or(ilikeAny(['username', 'display_name', 'company'], w));
  const { data } = await query;
  return (data || []).map((p: any) => ({ username: p.username, displayName: p.display_name || p.username, avatarUrl: p.avatar_url, company: p.company }));
}
