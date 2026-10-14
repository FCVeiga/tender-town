import { NEWS_CATEGORIES, getActiveOpportunities, getNews, newsCategoryLabel, titleOf } from '@/lib/data';
import { FeedItem, newsScore } from '@/lib/feed';
import { firstInLanguage } from '@/lib/english';
import { plainText } from '@/lib/plain';
import { publicText, shownWhy } from '@/lib/publication';
import { getScopeItems } from '@/lib/scopes';
import { getSupabaseServerClient } from '@/lib/supabase';
import FeedCard from './FeedCard';
import SectionTabs from './SectionTabs';
import { likeTarget } from '@/lib/likes';
import { getEngagement } from '@/lib/engagement';
import { getT } from '@/lib/i18n/server';
import { withPublicScope } from '@/lib/guestScope';
import { resolveFocus } from '@/lib/scopeFocus';
import { Suspense } from 'react';
import { ScopeBannerSuspense } from './ScopeBannerSlot';
import { ListSkeleton } from './ContentSkeleton';
import ScopeView from './ScopeView';
import ScopeStatus, { CheckedLine } from './ScopeStatus';
import { collectionKind, scopeRun } from '@/lib/scopeStatus';
import AgentLoader from '@/components/AgentLoader';


type View = 'all' | 'signals' | (typeof NEWS_CATEGORIES)[number]['slug'];

export default async function NewsView({ view }: { view: View }) {
  const t = await getT();
  const heading = view === 'signals' ? { label: 'Signals' } : NEWS_CATEGORIES.find((c) => c.slug === view);
  return (
    <div>
      <ScopeBannerSuspense />
      <h1 className="opps-h1">{heading ? t(heading.label) : t('News')}</h1>
      <Suspense fallback={<ListSkeleton />}>
        <NewsBody view={view} />
      </Suspense>
    </div>
  );
}

async function NewsBody({ view }: { view: View }) {
  const t = await getT();
  const focus = await resolveFocus();
  const scope = (href: string) => withPublicScope(href, focus.publicSlug);
  const now = new Date();
  const [{ news: all, error }, { opportunities: signals }] = await Promise.all([getNews(), getActiveOpportunities('signal')]);

  // The agents' post for each story: substance-first English copy, and the
  // feed ranks behind the movement arrows.
  const [newsScope, tenderScope, { data: posts }, { data: signalPosts }] = await Promise.all([
    getScopeItems('news', true),
    getScopeItems('tender', true),
    all.length
      ? getSupabaseServerClient().from('feed_posts').select('post_id, rank, prev_rank').in('post_id', all.map((n) => `news:${n.news_id}`))
      : Promise.resolve({ data: [] as any[] }),
    signals.length
      ? getSupabaseServerClient().from('feed_posts').select('opportunity_id, posted_at, rank, prev_rank')
          .in('opportunity_id', signals.map((o) => o.opportunity_id)).order('posted_at', { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const post = new Map((posts || []).map((p: any) => [p.post_id.slice(5), p]));
  const signalPost = new Map<string, any>();
  for (const p of signalPosts || []) if (!signalPost.has(p.opportunity_id)) signalPost.set(p.opportunity_id, p);
  const aside = (summary: string | null, why: string | null) => {
    const facts = publicText(plainText(summary || ''));
    const note = shownWhy(facts, plainText(why || ''));
    return { body: facts || null, why: note && note !== facts ? note : null };
  };
  const signalItems: FeedItem[] = signals.map((o): FeedItem => {
    const p = signalPost.get(o.opportunity_id);
    const at = new Date(o.publication_date || o.first_detected || now);
    const score = Math.max(o.opportunity_relevance_score ?? 30, 85);
    const copy = aside(firstInLanguage(o.summary), tenderScope?.reason.get(o.opportunity_id) || null);
    return {
      key: `signal:${o.opportunity_id}`, kind: 'news', event: 'signal', href: `/news/signals/${o.opportunity_id}`,
      headline: titleOf(o), ...copy,
      category: 'signal', categoryLabel: 'Signal', kindLabel: 'Planned procurement',
      country: o.country, at, score, combined: Math.round(newsScore(score, at, now)),
      movement: !p || p.rank == null ? 'same' : p.prev_rank == null || p.rank < p.prev_rank ? 'up' : p.rank > p.prev_rank ? 'down' : 'same',
      deadline: o.deadline, isNew: now.getTime() - at.getTime() <= 2 * 86400_000,
    };
  });

  const newsItems: FeedItem[] = all
    .filter((n) => view === 'all' || n.category === view)
    .map((n): FeedItem => {
      const p = post.get(n.news_id);
      const at = new Date(n.published_date || n.created_at || now);
      const score = n.relevance_score ?? 30;
      const movement: FeedItem['movement'] = !p || p.rank == null ? 'same'
        : p.prev_rank == null || p.rank < p.prev_rank ? 'up' : p.rank > p.prev_rank ? 'down' : 'same';
      const copy = aside(firstInLanguage(n.summary, n.excerpt), newsScope?.reason.get(n.news_id) || null);
      return {
        key: n.news_id, kind: 'news', event: 'news', href: `/news/${n.news_id}`,
        headline: titleOf(n), ...copy,
        category: n.category || 'market', categoryLabel: newsCategoryLabel(n.category), kindLabel: 'News',
        country: n.region && n.region !== 'EU / International' ? n.region : null,
        at, score, combined: Math.round(newsScore(score, at, now)), movement,
        deadline: null, isNew: now.getTime() - at.getTime() <= 2 * 86400_000,
        image: n.image_url,
      };
    });
  const band = (item: FeedItem) => item.category === 'signal' || item.event === 'signal' ? 0 : item.category === 'industry' ? 2 : 1;
  const items = (view === 'signals' ? signalItems : view === 'all' ? [...newsItems, ...signalItems] : newsItems)
    .sort((a, b) => band(a) - band(b) || b.combined - a.combined || b.at.getTime() - a.at.getTime());

  // Action bars: news stories and signals (tenders).
  const idsOf = (k: string) => items.map((i) => likeTarget(i.href)).filter((x) => x?.[0] === k).map((x) => x![1]);
  const [newsEng, tenderEng] = await Promise.all([getEngagement('news', idsOf('news')), getEngagement('tender', idsOf('tender'))]);
  const engOf = (href: string) => { const tg = likeTarget(href); return tg?.[0] === 'tender' ? tenderEng : newsEng; };
  const visible = items.filter((i) => { const tg = likeTarget(i.href); return !tg || !engOf(i.href).hidden.has(tg[1]); });
  const tabs = [
    { href: scope('/news'), label: t('All'), count: all.length + signals.length },
    ...NEWS_CATEGORIES.map((c) => ({
      href: scope(`/news/${c.slug}`), label: t(c.label), count: all.filter((n) => n.category === c.slug).length,
    })),
    { href: scope('/news/signals'), label: t('Signals'), count: signals.length },
  ];

  const run = scopeRun(focus.current);
  const hasCollected = view === 'signals' ? signals.length > 0 : view === 'all' ? all.length + signals.length > 0 : all.length > 0;
  const kind = collectionKind(run, hasCollected, !!focus.hold);
  const surface = view === 'signals' ? 'signals' : 'news';

  return (
      <ScopeView scopeId={focus.hold?.id ?? focus.current?.id ?? null}>
      <SectionTabs tabs={tabs} active={scope(view === 'all' ? '/news' : `/news/${view}`)} />

      {error && <div className="callout error"><strong>{t('Error loading news.')}</strong> {error.message}</div>}
      {kind === 'loading' && <AgentLoader />}
      {!error && (kind === 'pending' || kind === 'failed' || kind === 'empty') && (
        <ScopeStatus kind={kind} scopeName={focus.current?.name || ''} lastSuccessAt={run.lastSuccessAt} surface={surface} signedIn={focus.signedIn} />
      )}
      {!error && kind === 'stale' && (
        <ScopeStatus kind="stale" scopeName={focus.current?.name || ''} lastSuccessAt={run.lastSuccessAt} surface={surface} signedIn={focus.signedIn} />
      )}
      {!error && (kind === 'ready' || kind === 'stale') && visible.length === 0 && (
        <div className="callout"><strong>{t('Nothing in this section right now.')}</strong></div>
      )}

      {kind === 'ready' && <CheckedLine iso={run.lastSuccessAt} surface={surface} />}
      <div className="feed">
        {(kind === 'ready' || kind === 'stale') && visible.map((i) => <FeedCard key={i.key} item={i} now={now}
          social={{ engagement: engOf(i.href).get(likeTarget(i.href)?.[1] ?? ''), signedIn: newsEng.signedIn }} />)}
      </div>
      </ScopeView>
  );
}
