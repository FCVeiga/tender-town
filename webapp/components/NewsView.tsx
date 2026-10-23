import { NEWS_CATEGORIES, getActiveOpportunities, getNews, newsCategoryLabel, titleOf } from '@/lib/data';
import { FeedItem, groupCoverage, newsScore } from '@/lib/feed';
import { firstInLanguage } from '@/lib/english';
import { plainText } from '@/lib/plain';
import { publicText } from '@/lib/publication';
import { shownSummary } from '@/lib/shownSummary';
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
import ScopeStatus from './ScopeStatus';
import { collectionKind, scopeRun } from '@/lib/scopeStatus';
import AgentLoader from '@/components/AgentLoader';
import ScopePicker from '@/components/ScopePicker';


type View = 'all' | 'signals' | (typeof NEWS_CATEGORIES)[number]['slug'];

export default async function NewsView({ view }: { view: View }) {
  return (
    <div className="list-page">
      <ScopeBannerSuspense />
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
  const [{ data: posts }, { data: signalPosts }] = await Promise.all([
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
  const bodyOf = (summary: string | null) => publicText(plainText(summary || '')) || null;
  const signalItems: FeedItem[] = signals.map((o): FeedItem => {
    const p = signalPost.get(o.opportunity_id);
    const at = new Date(o.first_detected || o.publication_date || now);
    const score = o.opportunity_relevance_score ?? 30;
    const copy = { body: bodyOf(shownSummary(o)) };
    return {
      key: `signal:${o.opportunity_id}`, kind: 'news', event: 'signal', href: `/news/signals/${o.opportunity_id}`,
      headline: titleOf(o), ...copy,
      category: 'signal', categoryLabel: 'Planned procurement', kindLabel: 'Planned procurement',
      country: o.country, at, score, combined: Math.round(newsScore(score, at, now)),
      movement: !p || p.rank == null ? 'same' : p.prev_rank == null || p.rank < p.prev_rank ? 'up' : p.rank > p.prev_rank ? 'down' : 'same',
      deadline: o.deadline, isNew: false, fresh: null,
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
      const copy = { body: bodyOf(firstInLanguage(n.summary, n.excerpt)) };
      return {
        key: n.news_id, kind: 'news', event: 'news', href: `/news/${n.news_id}`,
        headline: titleOf(n), ...copy,
        category: n.category || 'market', categoryLabel: newsCategoryLabel(n.category), kindLabel: 'News',
        country: n.region && n.region !== 'EU / International' ? n.region : null,
        at, score, combined: Math.round(newsScore(score, at, now)), movement,
        deadline: null, isNew: false, fresh: null,
        image: n.image_url,
      };
    });
  const items = groupCoverage((view === 'signals' ? signalItems : view === 'all' ? [...newsItems, ...signalItems] : newsItems)
    .sort((a, b) => b.at.getTime() - a.at.getTime() || b.score - a.score));

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
      <h1 className="opps-h1">{view === 'signals' ? t('Signals') : t(NEWS_CATEGORIES.find((c) => c.slug === view)?.label || 'News')}</h1>
      <ScopePicker model={focus} />
      {view !== 'signals' && <SectionTabs tabs={tabs} active={scope(view === 'all' ? '/news' : `/news/${view}`)} />}

      {error && <div className="callout error"><strong>{t('Error loading news.')}</strong> {error.message}</div>}
      {kind === 'loading' && <AgentLoader />}
      {!error && (kind === 'pending' || kind === 'failed' || kind === 'empty') && (
        <ScopeStatus kind={kind} scopeName={focus.current?.name || ''} surface={surface} signedIn={focus.signedIn} />
      )}
      {!error && kind === 'stale' && (
        <ScopeStatus kind="stale" scopeName={focus.current?.name || ''} surface={surface} signedIn={focus.signedIn} />
      )}
      {!error && (kind === 'ready' || kind === 'stale') && visible.length === 0 && (
        <div className="callout"><strong>{t('Nothing in this section right now.')}</strong></div>
      )}

      <div className="feed">
        {(kind === 'ready' || kind === 'stale') && visible.map((i) => <FeedCard key={i.key} item={i} now={now}
          social={{ engagement: engOf(i.href).get(likeTarget(i.href)?.[1] ?? ''), signedIn: newsEng.signedIn }} />)}
      </div>
      </ScopeView>
  );
}
