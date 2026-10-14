/**
 * The public index agents can search without an account. Tenders, grants and
 * news that are already on the public pages. Not limited to the visitor's scope.
 */
import 'server-only';
import { getSupabaseServerClient } from '@/lib/supabase';
import { searchWords } from '@/lib/search';
import { buyerOf, opportunityPath, titleOf, type Opportunity, type NewsItem } from '@/lib/data';
import { firstInLanguage } from '@/lib/english';
import { plainText } from '@/lib/plain';
import { publicText, shownWhy } from '@/lib/publication';
import { getPlatformLanguage } from '@/lib/language';
import { getCatalogScopes } from '@/lib/scopes';
import { scopeSlug } from '@/lib/guestScope';
import { clip } from '@/lib/seo';

export type DiscoverKind = 'tender' | 'grant' | 'news';

export type DiscoverHit = {
  kind: DiscoverKind;
  title: string;
  url: string;
  buyer: string | null;
  country: string | null;
  deadline: string | null;
  summary: string;
  why?: string | null;
  closed?: boolean;
  upcoming?: boolean;
};

export type MarketSummary = { slug: string; name: string; open: number; upcoming: number; archived: number; news: number };

const KIND_WORDS = new Set([
  'grant', 'grants', 'tender', 'tenders', 'news', 'rfp', 'rfps', 'rfi', 'rfis',
  'contract', 'contracts', 'funding', 'call', 'calls', 'open', 'public',
]);

const ilikeAny = (fields: string[], word: string) => fields.map((field) => `${field}.ilike.*${word}*`).join(',');

/** Words that name the kind ("grants", "news") choose the kind. The rest is the topic. */
export function parseDiscoverQuery(q: string, kind?: string | null): { kind: DiscoverKind | 'all'; words: string[] } {
  const requested = kind === 'tender' || kind === 'grant' || kind === 'news' || kind === 'all' ? kind : 'all';
  const words = searchWords(q);
  let resolved: DiscoverKind | 'all' = requested;
  if (resolved === 'all') {
    if (words.some((word) => word === 'grant' || word === 'grants' || word === 'funding')) resolved = 'grant';
    else if (words.some((word) => word === 'news')) resolved = 'news';
    else if (words.some((word) => word === 'tender' || word === 'tenders' || word === 'rfp' || word === 'rfps')) resolved = 'tender';
  }
  return { kind: resolved, words: words.filter((word) => !KIND_WORDS.has(word)) };
}

export function discoverLimit(raw?: number | null) {
  if (!raw || raw < 1) return 8;
  return Math.min(20, Math.floor(raw));
}

function oppHit(row: Opportunity): DiscoverHit {
  return {
    kind: row.opportunity_type === 'grant' ? 'grant' : 'tender',
    title: titleOf(row),
    url: opportunityPath(row),
    buyer: buyerOf(row),
    country: row.country,
    deadline: row.deadline,
    summary: clip(publicText(plainText(firstInLanguage(row.summary) || '')), 220),
  };
}

function newsHit(row: NewsItem): DiscoverHit {
  return {
    kind: 'news',
    title: titleOf(row),
    url: `/news/${row.news_id}`,
    buyer: row.source_name,
    country: row.country,
    deadline: null,
    summary: clip(publicText(plainText(firstInLanguage(row.summary, row.excerpt) || '')), 220),
  };
}

export async function publicSearch(q: string, kind?: string | null, limit?: number | null): Promise<DiscoverHit[]> {
  await getPlatformLanguage();
  const parsed = parseDiscoverQuery(q, kind);
  const cap = discoverLimit(limit);
  if (!parsed.words.length && parsed.kind === 'all') return [];
  const db = getSupabaseServerClient();
  const now = new Date().toISOString();
  const wantOpps = parsed.kind !== 'news';
  const wantNews = parsed.kind === 'news' || parsed.kind === 'all';

  let opps = db.from('opportunities')
    .select('opportunity_id, title, title_en, language, country, authority, authority_en, opportunity_type, status, summary, deadline, publication_date')
    .in('status', ['OPEN', 'SIGNAL'])
    .or(`deadline.is.null,deadline.gte.${now}`)
    .order('deadline', { ascending: true, nullsFirst: false })
    .limit(40);
  if (parsed.kind === 'grant') opps = opps.eq('opportunity_type', 'grant');
  if (parsed.kind === 'tender') opps = opps.in('opportunity_type', ['rfp', 'rfi', 'signal']);
  for (const word of parsed.words) opps = opps.or(ilikeAny(['title', 'title_en', 'summary', 'authority', 'authority_en', 'country'], word));

  let news = db.from('news_items')
    .select('news_id, title, title_en, language, category, country, published_date, source_name, excerpt, summary, created_at')
    .order('published_date', { ascending: false, nullsFirst: false })
    .limit(40);
  for (const word of parsed.words) news = news.or(ilikeAny(['title', 'title_en', 'summary', 'excerpt', 'source_name', 'country'], word));

  const [oppRows, newsRows] = await Promise.all([
    wantOpps ? opps : Promise.resolve({ data: [] as Opportunity[] }),
    wantNews ? news : Promise.resolve({ data: [] as NewsItem[] }),
  ]);
  const opportunities = ((oppRows.data || []) as Opportunity[]).map(oppHit).filter((hit) => hit.title);
  const stories = ((newsRows.data || []) as NewsItem[]).map(newsHit).filter((hit) => hit.title);
  if (parsed.kind === 'news') return stories.slice(0, cap);
  if (parsed.kind === 'tender' || parsed.kind === 'grant') return opportunities.slice(0, cap);
  const half = Math.ceil(cap / 2);
  const taken = opportunities.slice(0, half);
  return [...taken, ...stories.slice(0, cap - taken.length)].slice(0, cap);
}

export async function marketIndex(): Promise<MarketSummary[]> {
  const scopes = await getCatalogScopes();
  const db = getSupabaseServerClient();
  return Promise.all(scopes.map(async (scope) => {
    const [tenders, news] = await Promise.all([
      db.from('scope_items').select('item_id').eq('scope_id', scope.id).eq('item_type', 'tender').limit(2000),
      db.from('scope_items').select('item_id', { count: 'exact', head: true }).eq('scope_id', scope.id).eq('item_type', 'news'),
    ]);
    const ids = (tenders.data || []).map((row) => row.item_id);
    const counts = await openAndArchived(db, ids);
    return { slug: scopeSlug(scope.name), name: scope.name, ...counts, news: news.count ?? 0 };
  }));
}

export async function marketBySlug(slug: string) {
  await getPlatformLanguage();
  const scopes = await getCatalogScopes();
  const scope = scopes.find((item) => scopeSlug(item.name) === slug);
  if (!scope) return null;
  const db = getSupabaseServerClient();
  const [tenderLinks, newsLinks] = await Promise.all([
    db.from('scope_items').select('item_id, relevance, reason').eq('scope_id', scope.id).eq('item_type', 'tender').order('relevance', { ascending: false }).limit(80),
    db.from('scope_items').select('item_id, relevance, reason').eq('scope_id', scope.id).eq('item_type', 'news').order('relevance', { ascending: false }).limit(20),
  ]);
  const tenderIds = (tenderLinks.data || []).map((row) => row.item_id);
  const newsIds = (newsLinks.data || []).map((row) => row.item_id);
  const [oppRows, newsRows] = await Promise.all([
    tenderIds.length
      ? db.from('opportunities')
        .select('opportunity_id, title, title_en, language, country, authority, authority_en, opportunity_type, status, summary, deadline, publication_date')
        .in('opportunity_id', tenderIds)
      : Promise.resolve({ data: [] as Opportunity[] }),
    newsIds.length
      ? db.from('news_items')
        .select('news_id, title, title_en, language, category, country, published_date, source_name, excerpt, summary, created_at')
        .in('news_id', newsIds)
      : Promise.resolve({ data: [] as NewsItem[] }),
  ]);
  const now = new Date();
  const whyOf = new Map((tenderLinks.data || []).map((row) => [row.item_id, row.reason as string | null]));
  const newsWhy = new Map((newsLinks.data || []).map((row) => [row.item_id, row.reason as string | null]));
  const withWhy = (hit: DiscoverHit, reason: string | null | undefined) => {
    const why = shownWhy(hit.summary, plainText(reason || ''));
    return { ...hit, why: why && why !== hit.summary ? why : null };
  };
  const ranked = ((oppRows.data || []) as Opportunity[]).map((row) => {
    const live = (row.status === 'OPEN' || row.status === 'SIGNAL') && (!row.deadline || new Date(row.deadline) >= now);
    const upcoming = live && (row.status === 'SIGNAL' || row.opportunity_type === 'signal');
    return withWhy({ ...oppHit(row), closed: !live, upcoming }, whyOf.get(row.opportunity_id));
  });
  const open = ranked.filter((hit) => !hit.closed && !hit.upcoming).slice(0, 20);
  const upcoming = ranked.filter((hit) => hit.upcoming).slice(0, 20);
  const archived = ranked.filter((hit) => hit.closed).slice(0, 20);
  const newsRank = new Map(newsIds.map((id, index) => [id, index]));
  const industry = new Map(((newsRows.data || []) as NewsItem[]).map((row) => [row.news_id, row.category === 'industry']));
  const news = ((newsRows.data || []) as NewsItem[])
    .map((row) => withWhy(newsHit(row), newsWhy.get(row.news_id)))
    .sort((a, b) => {
      const id = (url: string) => url.split('/').pop() || '';
      return Number(!!industry.get(id(a.url))) - Number(!!industry.get(id(b.url)))
        || (newsRank.get(id(a.url)) ?? 99) - (newsRank.get(id(b.url)) ?? 99);
    })
    .slice(0, 12);
  return { name: scope.name, slug, open, upcoming, archived, news };
}

async function openAndArchived(db: ReturnType<typeof getSupabaseServerClient>, ids: string[]) {
  let open = 0;
  let upcoming = 0;
  let archived = 0;
  const now = Date.now();
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await db.from('opportunities').select('status, deadline, opportunity_type').in('opportunity_id', ids.slice(i, i + 100));
    for (const row of data || []) {
      const live = (row.status === 'OPEN' || row.status === 'SIGNAL') && (!row.deadline || new Date(row.deadline).getTime() >= now);
      const signal = live && (row.status === 'SIGNAL' || row.opportunity_type === 'signal');
      if (signal) upcoming += 1;
      else if (live) open += 1;
      else archived += 1;
    }
  }
  return { open, upcoming, archived };
}

const HEADING: Record<DiscoverKind, string> = { grant: 'Grants', tender: 'Tenders', news: 'News' };

export function discoverMarkdown(origin: string, q: string, hits: DiscoverHit[], markets: MarketSummary[]) {
  const lines = ['# Tender Town', ''];
  if (!q.trim()) {
    lines.push(
      'Search public tenders, grants and news. No account.',
      '',
      `GET ${origin}/discover.md?q=solar+power&kind=all`,
      '',
      'kind: tender, grant, news, or all. limit: 1 to 20.',
      '',
      `MCP tool search at ${origin}/api/mcp, with no Authorization header. Arguments: query, kind, limit.`,
      '',
      '## Markets',
      '',
    );
    for (const market of markets) lines.push(`- [${market.name}](${origin}/markets/${market.slug})`);
    return `${lines.join('\n').trim()}\n`;
  }
  lines.push(`Query: ${q}`, '');
  if (!hits.length) {
    lines.push('No public tenders, grants or news match this query.', '');
    return `${lines.join('\n').trim()}\n`;
  }
  for (const kind of ['grant', 'tender', 'news'] as const) {
    const rows = hits.filter((hit) => hit.kind === kind);
    if (!rows.length) continue;
    lines.push(`## ${HEADING[kind]}`, '');
    for (const hit of rows) {
      lines.push(`- [${hit.title}](${origin}${hit.url})`);
      const meta = [
        hit.buyer ? `Buyer: ${hit.buyer}` : '',
        hit.country ? `Country: ${hit.country}` : '',
        hit.deadline ? `Deadline: ${hit.deadline.slice(0, 10)}` : '',
      ].filter(Boolean);
      if (meta.length) lines.push(`  ${meta.join('. ')}.`);
      if (hit.summary) lines.push(`  ${hit.summary}`);
      lines.push('');
    }
  }
  return `${lines.join('\n').trim()}\n`;
}
