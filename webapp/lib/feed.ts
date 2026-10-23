/**
 * Tender Town feed: posts written by the feed-writer agent
 * (agents/feed_writer.py) about opportunities, their updates, and news.
 *
 * "Top" (the default) leads with open tenders: new and updated first, then the
 * other open notices. A news story only joins that lead when it is under an
 * hour old, and even then it sits after the tenders. Older news and planned
 * procurements follow by time. "Relevance" is the AI score alone; "New" is
 * newest first.
 * Keep HALF_LIFE_DAYS in sync with agents/feed_writer.py.
 *
 * Movement arrows compare the post's rank at the last pipeline run with the
 * run before (feed_posts.rank / prev_rank). Since every post decays at the
 * same rate, order only shifts when posts enter or leave the feed.
 */
import { getSupabaseServerClient } from '@/lib/supabase';
import { cardFreshness, getActiveOpportunities, NEW_WINDOW_DAYS, newsCategoryLabel, oppCategoryLabel, opportunityPath, titleOf, type CardFreshness, type Opportunity } from '@/lib/data';
import { firstInLanguage } from '@/lib/english';
import { plainText } from '@/lib/plain';
import { publicText } from '@/lib/publication';
import { shownSummary } from '@/lib/shownSummary';
import { getScopeItems } from '@/lib/scopes';
import { getPlatformLanguage } from '@/lib/language';

export const HALF_LIFE_DAYS = 4;
const UNSCORED = 30;
const FRESH_MS = NEW_WINDOW_DAYS * 86400_000;
const BREAKING_MS = 60 * 60 * 1000;

// Top (default) = AI score × novelty; Relevance = AI score alone; New = newest first.
export const FEED_VIEWS = [
  { slug: 'top', label: 'Top' },
  { slug: 'relevance', label: 'Relevance' },
  { slug: 'new', label: 'New' },
] as const;
export type FeedView = (typeof FEED_VIEWS)[number]['slug'];

type PostRow = {
  post_id: string; kind: 'opportunity' | 'news'; event: string;
  opportunity_id: string | null; news_id: string | null;
  category: string | null; country: string | null;
  headline: string; body: string | null; score: number | null;
  posted_at: string | null; created_at: string | null;
  rank: number | null; prev_rank: number | null;
};

export type FeedItem = {
  key: string;
  kind: 'opportunity' | 'news';
  event: string;
  href: string;
  headline: string;
  body: string | null;
  category: string;
  categoryLabel: string;
  kindLabel: string;
  country: string | null;
  at: Date;
  score: number;        // AI relevance / importance
  combined: number;     // score × novelty — what the card shows
  movement: 'up' | 'down' | 'same';
  deadline: string | null;
  isNew: boolean;
  fresh: CardFreshness | null;
  opportunityId?: string | null;
  newsId?: string | null;
  statusLabel?: string | null;   // e.g. "Closed" / "Awarded" in search results
  image?: string | null;         // news: the publisher's share image
  related?: { href: string; headline: string }[];
  opportunity?: Opportunity;    // tender and signal rows, when the notice is still open
};

/**
 * News page score: importance × novelty, where more important stories age
 * more slowly — the half-life runs from 2 days (importance 0) to 8 days
 * (importance 100), so big stories stay near the top of the news feed longer.
 */
export function newsScore(score: number, at: Date, now = new Date()) {
  const halfLife = 2 + 6 * (Math.max(0, Math.min(100, score)) / 100);
  const ageDays = Math.max(0, (now.getTime() - at.getTime()) / 86400_000);
  return score * Math.pow(0.5, ageDays / halfLife);
}

const COVERAGE_STOP = new Set('about after which their there these those would other tender tenders public digital wallet service services system market news european europe identity national member states state'.split(' '));
const MONTH = '(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)';

function coverageWords(text: string): Set<string> {
  return new Set(text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((word) => word.length > 4 && !COVERAGE_STOP.has(word)));
}

function eventMonth(text: string): string | null {
  const hit = text.toLowerCase().match(new RegExp(`\\b(?:${MONTH})\\s+20\\d{2}\\b`));
  if (!hit) return null;
  const [month, year] = hit[0].split(/\s+/);
  const full: Record<string, string> = { jan: 'january', feb: 'february', mar: 'march', apr: 'april', jun: 'june', jul: 'july', aug: 'august', sep: 'september', sept: 'september', oct: 'october', nov: 'november', dec: 'december' };
  return `${full[month] || month} ${year}`;
}

function sameEvent(a: FeedItem, b: FeedItem): boolean {
  const aText = `${a.headline} ${a.body || ''}`;
  const bText = `${b.headline} ${b.body || ''}`;
  const aWords = coverageWords(aText);
  const bWords = coverageWords(bText);
  let shared = 0;
  aWords.forEach((word) => { if (bWords.has(word)) shared += 1; });
  const month = eventMonth(aText);
  if (month && month === eventMonth(bText) && shared >= 2) return true;
  const union = aWords.size + bWords.size - shared;
  return shared >= 3 && union > 0 && shared / union >= 0.45;
}

/** Stories about the same event sit under the strongest one, as related sources. */
export function groupCoverage(items: FeedItem[]): FeedItem[] {
  const stories = items.filter((item) => item.kind === 'news' && item.event !== 'signal');
  const ranked = [...stories].sort((a, b) => b.score - a.score);
  const folded = new Set<string>();
  const related = new Map<string, { href: string; headline: string }[]>();
  for (let i = 0; i < ranked.length; i++) {
    const lead = ranked[i];
    if (folded.has(lead.key)) continue;
    const matches: { href: string; headline: string }[] = [];
    for (let j = i + 1; j < ranked.length && matches.length < 3; j++) {
      const other = ranked[j];
      if (folded.has(other.key) || !sameEvent(lead, other)) continue;
      matches.push({ href: other.href, headline: other.headline });
      folded.add(other.key);
    }
    if (matches.length) related.set(lead.key, matches);
  }
  return items.filter((item) => !folded.has(item.key)).map((item) => related.has(item.key) ? { ...item, related: related.get(item.key) } : item);
}

const decay = (at: Date, now: Date) =>
  Math.pow(0.5, Math.max(0, (now.getTime() - at.getTime()) / 86400_000) / HALF_LIFE_DAYS);

export async function getFeed(view: FeedView, now = new Date()) {
  await getPlatformLanguage();  // the display filter's language
  const [{ data, error }, { opportunities }] = await Promise.all([
    getSupabaseServerClient().from('feed_posts').select('*').order('posted_at', { ascending: false }).limit(1000),
    getActiveOpportunities(),
  ]);
  const active = new Map(opportunities.map((o) => [o.opportunity_id, o]));
  // The viewer's scopes: which items count, and the relevance each scope gave them.
  const [tenderItems, newsItems] = await Promise.all([getScopeItems('tender', true), getScopeItems('news', true)]);
  const inScope = (p: PostRow) => p.kind === 'news'
    ? !newsItems || (!!p.news_id && newsItems.relevance.has(p.news_id))
    : !tenderItems || (!!p.opportunity_id && tenderItems.relevance.has(p.opportunity_id));
  const scopeScore = (p: PostRow) => p.kind === 'news'
    ? (p.news_id ? newsItems?.relevance.get(p.news_id) : undefined)
    : (p.opportunity_id ? tenderItems?.relevance.get(p.opportunity_id) : undefined);

  const items: FeedItem[] = ((data || []) as PostRow[])
    // Opportunity posts only while the opportunity is still open; awards and news always.
    .filter((p) => inScope(p) && (p.kind === 'news' || p.event === 'awarded' || (p.opportunity_id && active.has(p.opportunity_id))))
    .map((p) => {
      const atPosted = new Date(p.posted_at || p.created_at || now);
      const opp = p.opportunity_id ? active.get(p.opportunity_id) : undefined;
      const movement: FeedItem['movement'] =
        p.rank === null ? 'same'
          : p.prev_rank === null || p.rank < p.prev_rank ? 'up'
            : p.rank > p.prev_rank ? 'down' : 'same';
      const signal = opp?.opportunity_type === 'signal' || p.category === 'signal' || p.event === 'signal';
      const score = scopeScore(p) ?? p.score ?? UNSCORED;
      const openTender = !!opp && opp.status !== 'CLOSED' && opp.status !== 'AWARDED';
      const fresh = signal || p.kind === 'news' ? null : openTender ? cardFreshness(opp, now) : eventFresh(p.event, atPosted, now);
      const stamp = fresh && opp
        ? (fresh === 'updated' ? opp.last_change : opp.first_detected) || opp.publication_date
        : null;
      const at = stamp ? new Date(stamp) : atPosted;
      return {
        key: p.post_id, kind: p.kind, event: signal ? 'signal' : p.event,
        href: p.kind === 'news' ? `/news/${p.news_id}` : opportunityPath({ opportunity_id: p.opportunity_id || '', opportunity_type: signal ? 'signal' : opp?.opportunity_type }),
        headline: p.headline, body: p.body,
        category: signal ? 'signal' : (p.category || (p.kind === 'news' ? 'market' : 'rfp')),
        categoryLabel: p.kind === 'news' && !signal ? newsCategoryLabel(p.category) : oppCategoryLabel(signal ? 'signal' : p.category),
        kindLabel: signal ? 'Planned procurement' : p.kind === 'news' ? 'News' : 'Tender',
        country: p.country, at, score, combined: Math.round(score * decay(at, now)),
        movement, deadline: p.event === 'awarded' ? null : opp?.deadline ?? null,
        isNew: fresh === 'new',
        fresh,
        opportunityId: p.opportunity_id,
        newsId: p.news_id,
        opportunity: opp,
      };
    });

  // One card per purchase, and one card per story. A deadline update replaces
  // the "new tender" card; syndicated headlines collapse onto the strongest post.
  const keptOpp = new Map<string, FeedItem>();
  const newsById = new Map<string, FeedItem>();
  const rest: FeedItem[] = [];
  for (const item of items) {
    if (item.kind === 'opportunity' && item.opportunityId) {
      const prev = keptOpp.get(item.opportunityId);
      if (!prev || item.at > prev.at) keptOpp.set(item.opportunityId, item);
    } else if (item.kind === 'news') {
      const id = item.newsId || item.key;
      const prev = newsById.get(id);
      if (!prev || item.at > prev.at) newsById.set(id, item);
    } else {
      rest.push(item);
    }
  }
  // A planned procurement with no post yet still features, and ages from when the radar saw it.
  for (const o of opportunities) {
    if (o.opportunity_type !== 'signal' || keptOpp.has(o.opportunity_id)) continue;
    const at = new Date(o.first_detected || o.publication_date || now);
    const score = tenderItems?.relevance.get(o.opportunity_id) ?? o.opportunity_relevance_score ?? UNSCORED;
    keptOpp.set(o.opportunity_id, {
      key: `signal:${o.opportunity_id}`, kind: 'opportunity', event: 'signal',
      href: opportunityPath(o), headline: titleOf(o), body: plainText(shownSummary(o)) || null,
      category: 'signal', categoryLabel: oppCategoryLabel('signal'), kindLabel: 'Planned procurement',
      country: o.country, at, score, combined: Math.round(score * decay(at, now)),
      movement: 'same', deadline: o.deadline, isNew: false,
      fresh: null,
      opportunityId: o.opportunity_id,
      opportunity: o,
    });
  }
  // Every open tender features, even before the feed writer posts it.
  for (const o of opportunities) {
    if (o.opportunity_type === 'signal' || keptOpp.has(o.opportunity_id)) continue;
    if (o.status === 'CLOSED' || o.status === 'AWARDED') continue;
    const fresh = cardFreshness(o, now);
    const at = new Date((fresh === 'updated' ? o.last_change : o.first_detected) || o.publication_date || now);
    const score = tenderItems?.relevance.get(o.opportunity_id) ?? o.opportunity_relevance_score ?? UNSCORED;
    keptOpp.set(o.opportunity_id, {
      key: `fresh:${o.opportunity_id}`, kind: 'opportunity', event: fresh === 'updated' ? 'notice_update' : 'new_opportunity',
      href: opportunityPath(o), headline: titleOf(o), body: plainText(shownSummary(o)) || null,
      category: o.opportunity_type || 'rfp', categoryLabel: oppCategoryLabel(o.opportunity_type), kindLabel: 'Tender',
      country: o.country, at, score, combined: Math.round(score * decay(at, now)),
      movement: 'same', deadline: o.deadline, isNew: fresh === 'new', fresh,
      opportunityId: o.opportunity_id,
      opportunity: o,
    });
  }
  await publishedCopy([...rest, ...keptOpp.values(), ...newsById.values()]);
  const newsByHeadline = new Map<string, FeedItem>();
  for (const item of newsById.values()) {
    const key = item.headline.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const prev = newsByHeadline.get(key);
    if (!prev || item.at > prev.at) newsByHeadline.set(key, item);
  }
  const unique = [...rest, ...keptOpp.values(), ...newsByHeadline.values()];

  const byTime = (a: FeedItem, b: FeedItem) => b.at.getTime() - a.at.getTime() || b.score - a.score;
  const sorted =
    view === 'new' ? unique.sort(byTime)
      : view === 'relevance' ? unique.sort((a, b) => b.score - a.score || b.at.getTime() - a.at.getTime())
        : unique.sort((a, b) => homeRank(a, now) - homeRank(b, now) || byTime(a, b));
  return { items: groupCoverage(sorted), error };
}

/** Open tenders lead the home feed. News from the last hour follows them; older stories wait. */
export function homeRank(item: FeedItem, now: Date): number {
  if (isOpenTender(item) && item.fresh) return 0;
  if (isOpenTender(item)) return 1;
  if (item.kind === 'news' && item.event !== 'signal' && now.getTime() - item.at.getTime() <= BREAKING_MS) return 2;
  return 3;
}

function isOpenTender(item: FeedItem): boolean {
  if (item.kind !== 'opportunity' || item.event === 'signal' || item.category === 'signal') return false;
  const opp = item.opportunity;
  if (!opp) return item.event !== 'awarded';
  return opp.opportunity_type !== 'signal' && opp.status !== 'CLOSED' && opp.status !== 'AWARDED';
}

function eventFresh(event: string, at: Date, now: Date): CardFreshness | null {
  if (now.getTime() - at.getTime() > FRESH_MS) return null;
  if (event === 'deadline_change' || event === 'notice_update') return 'updated';
  if (event === 'new_opportunity') return 'new';
  return null;
}

/** The card title and summary are the published record. */
async function publishedCopy(items: FeedItem[]) {
  const db = getSupabaseServerClient();
  const newsIds = items.map((item) => item.newsId).filter((id): id is string => !!id);
  const oppIds = items.map((item) => item.opportunityId).filter((id): id is string => !!id);
  const [newsRows, oppRows] = await Promise.all([
    newsIds.length ? db.from('news_items').select('news_id, title, title_en, language, summary, excerpt, category, image_url').in('news_id', newsIds) : Promise.resolve({ data: [] as any[] }),
    oppIds.length ? db.from('opportunities').select('opportunity_id, title, title_en, language, summary, tender_summary').in('opportunity_id', oppIds) : Promise.resolve({ data: [] as any[] }),
  ]);
  const news = new Map((newsRows.data || []).map((row: any) => [row.news_id, row]));
  const opps = new Map((oppRows.data || []).map((row: any) => [row.opportunity_id, row]));
  for (const item of items) {
    const story = item.newsId ? news.get(item.newsId) : null;
    const opp = item.opportunityId ? opps.get(item.opportunityId) : null;
    const row = story || opp;
    if (!row) continue;
    const official = item.kind === 'opportunity' && item.event !== 'signal' ? String(item.opportunity?.title || opp?.title || '').trim() : '';
    item.headline = official || titleOf(row);
    item.body = publicText(plainText(story ? firstInLanguage(row.summary, row.excerpt) || '' : shownSummary(row))) || null;
    if (story?.image_url) item.image = story.image_url;
    if (story?.category === 'industry') item.categoryLabel = 'Industry news';
  }
}

/** "3h ago", "2d ago", "14 Sep" — compact, like a feed. */
export function timeAgo(at: Date, now = new Date(), t: (k: string, v?: Record<string, string | number>) => string = (k, v) => k.replace('{n}', String(v?.n ?? '')), locale = 'en-GB') {
  const mins = Math.round((now.getTime() - at.getTime()) / 60000);
  if (mins < 60) return t('{n}m ago', { n: Math.max(1, mins) });
  const hours = Math.round(mins / 60);
  if (hours < 24) return t('{n}h ago', { n: hours });
  const days = Math.round(hours / 24);
  if (days < 14) return t('{n}d ago', { n: days });
  return at.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}
