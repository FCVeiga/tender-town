/**
 * Source registry (server side): the Following sidebar lists and edits it,
 * agents/source_monitor.py monitors it. This module also keeps the Live
 * activity panel fresh by re-reading RSS sources at most every
 * FEED_REFRESH_MINUTES while someone is looking; site searches cost search
 * credits, so they only run in the daily pipeline.
 */
import { XMLParser } from 'fast-xml-parser';
import { getSupabaseServerClient } from '@/lib/supabase';
import { Source, SourceActivity } from '@/lib/sourceMeta';
import { firstInLanguage } from '@/lib/english';
import { getPlatformLanguage } from '@/lib/language';

const FEED_REFRESH_MINUTES = 10;
const FETCH_TIMEOUT_MS = 9000;
const ITEMS_PER_FETCH = 10;
// Honest, descriptive agent: some sites' firewalls block 'Mozilla/5.0 (compatible; …)' bots.
const UA = 'TenderTown/1.0 (+https://tendertown.io; RSS reader)';

async function get(url: string) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, signal: ctrl.signal, cache: 'no-store', redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { text: await res.text(), url: res.url || url };
  } finally {
    clearTimeout(timer);
  }
}

const isFeed = (text: string) => /<(rss|feed|rdf:RDF)[\s>]/i.test(text.slice(0, 2000));
// Entities are decoded here rather than by the parser: its entity expansion
// guard (anti XML-bomb) trips on ordinary feeds full of &amp;.
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
      : ENTITIES[e.toLowerCase()] ?? m);
const asText = (v: unknown): string => decode(
  typeof v === 'string' ? v : typeof v === 'number' ? String(v)
    : v && typeof v === 'object' && '#text' in (v as any) ? String((v as any)['#text']) : '');

/** Items of an RSS 2.0 / Atom / RSS 1.0 feed: { id, title, url, published }. */
export function parseFeed(xml: string) {
  const doc = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', processEntities: false }).parse(xml);
  const raw = doc?.rss?.channel?.item ?? doc?.feed?.entry ?? doc?.['rdf:RDF']?.item ?? [];
  const items = Array.isArray(raw) ? raw : [raw];
  return items.map((it: any) => {
    const link = Array.isArray(it.link)
      ? (it.link.find((l: any) => !l['@rel'] || l['@rel'] === 'alternate') ?? it.link[0])['@href']
      : typeof it.link === 'object' ? it.link['@href'] : it.link;
    const published = it.pubDate ?? it.published ?? it.updated ?? it['dc:date'];
    return {
      id: asText(it.guid) || asText(it.id) || link,
      title: asText(it.title).trim(),
      url: link ? decode(String(link).trim()) : null,
      published: published ? new Date(asText(published) || published) : null,
    };
  }).filter((i) => i.id && i.title);
}

/**
 * Work out how to monitor what the user entered: returns the normalised
 * url/handle and the method (rss when a feed is found, else site search;
 * X and LinkedIn can't be monitored yet).
 */
export async function resolveSource(type: string, input: string) {
  const v = input.trim();
  if (type === 'SOCIAL_TWITTER') {
    const handle = '@' + v.replace(/^@/, '').replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//, '').split(/[/?]/)[0];
    return { url: `https://x.com/${handle.slice(1)}`, handle, feedUrl: null, method: 'off' as const };
  }
  if (type === 'SOCIAL_LINKEDIN') return { url: v, handle: null, feedUrl: null, method: 'off' as const };
  if (type === 'SOCIAL_REDDIT') {
    const m = v.match(/(?:reddit\.com\/)?(r|u|user)\/([\w-]+)/i);
    if (!m) throw new Error('Use r/subreddit or u/username.');
    const kind = m[1].toLowerCase() === 'r' ? 'r' : 'user';
    return { url: `https://www.reddit.com/${kind}/${m[2]}`, handle: `${kind === 'r' ? 'r' : 'u'}/${m[2]}`,
             feedUrl: `https://www.reddit.com/${kind}/${m[2]}/.rss`, method: 'rss' as const };
  }
  const url = /^https?:\/\//.test(v) ? v : `https://${v}`;
  try {
    const page = await get(url);
    if (isFeed(page.text)) return { url, handle: null, feedUrl: page.url, method: 'rss' as const };
    const link = page.text.match(/<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*>/i)?.[0];
    const href = link?.match(/href=["']([^"']+)["']/i)?.[1];
    if (href) return { url, handle: null, feedUrl: new URL(href, page.url).toString(), method: 'rss' as const };
  } catch { /* unreachable or blocked: fall back to site search, which goes through a search engine */ }
  return { url, handle: null, feedUrl: null, method: 'site_search' as const };
}

/** Re-read RSS sources not read in the last FEED_REFRESH_MINUTES; errors are kept per source. */
export async function refreshDueFeeds() {
  const supabase = getSupabaseServerClient();
  const cutoff = new Date(Date.now() - FEED_REFRESH_MINUTES * 60_000).toISOString();
  const { data: due } = await supabase.from('sources').select('source_id, feed_url')
    .eq('enabled', true).eq('method', 'rss').not('feed_url', 'is', null)
    .or(`last_checked.is.null,last_checked.lt.${cutoff}`);
  await Promise.all(((due || []) as Pick<Source, 'source_id' | 'feed_url'>[]).map(async (s) => {
    const now = new Date().toISOString();
    try {
      const items = parseFeed((await get(s.feed_url!)).text).slice(0, ITEMS_PER_FETCH);
      if (items.length) {
        await supabase.from('source_activity').upsert(
          items.map((i) => ({
            source_id: s.source_id, external_id: i.id.slice(0, 1000), title: i.title.slice(0, 500), url: i.url,
            published_at: i.published && !isNaN(i.published.getTime()) ? i.published.toISOString() : now,
          })),
          { onConflict: 'source_id,external_id', ignoreDuplicates: true },
        );
      }
      await supabase.from('sources').update({ last_checked: now, last_successful_check: now, last_error: null,
        number_results_last_run: items.length }).eq('source_id', s.source_id);
    } catch (e: any) {
      const msg = e?.name === 'AbortError' ? 'Feed timed out' : String(e?.message || e).slice(0, 200);
      await supabase.from('sources').update({ last_checked: now, last_error: msg }).eq('source_id', s.source_id);
    }
  }));
}

export async function getSources() {
  const { data } = await getSupabaseServerClient().from('sources')
    .select('source_id, name, source_type, country, url, handle, feed_url, method, enabled, check_every_days, last_checked, last_successful_check, last_error, number_results_last_run')
    .order('name');
  return (data || []) as Source[];
}

/** Sources each of these scopes follows (scope_sources). */
export async function getFollowedSourceIds(scopeIds: string[]): Promise<Set<string>> {
  if (!scopeIds.length) return new Set();
  const { data } = await getSupabaseServerClient().from('scope_sources').select('source_id').in('scope_id', scopeIds);
  return new Set((data || []).map((r: any) => r.source_id));
}

/** Sources the viewer's scopes follow (the sidebar's Following, Live activity). */
export async function getViewSourceIds(): Promise<Set<string>> {
  const { getViewScopes } = await import('@/lib/scopes');
  const { scopes } = await getViewScopes();
  return getFollowedSourceIds(scopes.map((s) => s.id));
}

export async function getCountryOptions() {
  const { data } = await getSupabaseServerClient().from('countries').select('code, name').order('name');
  return (data || []) as { code: string; name: string }[];
}

const FEED_MAX_AGE_DAYS = 30;
const OPPORTUNITY_KINDS = ['TENDER', 'RFI', 'GRANT', 'CONSORTIUM_CALL', 'PILOT', 'PIPELINE_SIGNAL'];

/**
 * Latest activity, current and on-topic only:
 *  - feed items (RSS/Reddit) from the last FEED_MAX_AGE_DAYS that triage
 *    hasn't rejected as off-topic (not-yet-triaged ones show meanwhile);
 *  - site-search finds only once they became an opportunity that is open
 *    right now (same rule as the Opportunities page), dated from it — search
 *    results carry no publication date, so they can't be trusted to be new.
 */
export async function getActivity(limit = 30, scopeId?: string | null) {
  await getPlatformLanguage();  // the display filter's language
  const db = getSupabaseServerClient();
  const now = new Date();
  const cols = 'id, source_id, title, title_en, kind, url, published_at, relevant, sources!inner(name, source_type, handle, method)';
  const since = new Date(now.getTime() - FEED_MAX_AGE_DAYS * 86400_000).toISOString();
  const followed = Array.from(scopeId ? await getFollowedSourceIds([scopeId]) : await getViewSourceIds());
  if (!followed.length) return [];
  const [feeds, finds] = await Promise.all([
    db.from('source_activity').select(cols).neq('sources.method', 'site_search').in('source_id', followed)
      .gte('published_at', since).or('kind.is.null,kind.neq.FALSE_POSITIVE')
      .order('published_at', { ascending: false }).limit(limit),
    db.from('source_activity').select(cols).eq('sources.method', 'site_search').in('source_id', followed).eq('relevant', true)
      .in('kind', OPPORTUNITY_KINDS).order('fetched_at', { ascending: false }).limit(100),
  ]);

  // Keep site-search finds whose opportunity is open now; take its date.
  let current: SourceActivity[] = [];
  const findRows = (finds.data || []) as unknown as SourceActivity[];
  if (findRows.length) {
    const { data: opps } = await db.from('opportunities')
      .select('official_url, publication_date, first_detected, deadline, status')
      .in('official_url', findRows.map((f) => f.url).filter(Boolean) as string[])
      .in('status', ['OPEN', 'SIGNAL'])
      .or(`deadline.is.null,deadline.gte.${now.toISOString()}`);
    const open = new Map((opps || []).map((o: any) => [o.official_url, o.publication_date || o.first_detected]));
    current = findRows.filter((f) => f.url && open.has(f.url)).map((f) => ({ ...f, published_at: open.get(f.url!) }));
  }

  // Sites often serve one document under several URLs: one entry per source and title.
  const seen = new Set<string>();
  return ([...((feeds.data || []) as unknown as SourceActivity[]), ...current])
    .sort((a, b) => new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime())
    // English only: an item waits until it has an English title.
    .map((a) => ({ ...a, title_en: firstInLanguage(a.title_en, a.title) }))
    .filter((a) => {
      if (!a.title_en) return false;
      const k = `${a.source_id}|${a.title_en.toLowerCase().trim()}`;
      return !seen.has(k) && !!seen.add(k);
    })
    .slice(0, limit);
}
