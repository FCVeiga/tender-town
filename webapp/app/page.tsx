import { Suspense } from 'react';
import Link from 'next/link';
import { siteOrigin } from '@/lib/auth';
import { pageMeta } from '@/lib/seo';
import JsonLd from '@/components/JsonLd';
import { FEED_VIEWS, FeedItem, FeedView, getFeed } from '@/lib/feed';
import { getActivity } from '@/lib/sources';
import HomeFeedItems, { HomeEntry } from '@/components/HomeFeedItems';
import LiveActivity from '@/components/LiveActivity';
import { getLikes, likeTarget } from '@/lib/likes';
import { getEngagement } from '@/lib/engagement';
import { getCommunityFeed, type PostCard } from '@/lib/community';
import { getCurrentUser } from '@/lib/auth';
import { getSupabaseServerClient } from '@/lib/supabase';
import { getT } from '@/lib/i18n/server';
import { withPublicScope } from '@/lib/guestScope';
import { resolveFocus } from '@/lib/scopeFocus';
import { ScopeBannerSuspense } from '@/components/ScopeBannerSlot';
import { HomeSkeleton } from '@/components/ContentSkeleton';
import ScopeView from '@/components/ScopeView';
import ScopeStatus, { CheckedLine } from '@/components/ScopeStatus';
import { collectionKind, scopeRun } from '@/lib/scopeStatus';
import AgentLoader from '@/components/AgentLoader';

const PAGE = 30;
const LEAD = 'Specialised AI agents for your next tender. They find opportunities, analyse requirements and prepare proposal briefs.';

export async function generateMetadata() {
  const t = await getT();
  return pageMeta({ title: 'Tender Town', description: t(LEAD), path: '/' });
}

// 16px line icons for the sort pills.
const VIEW_ICONS: Record<FeedView, JSX.Element> = {
  top: <path d="M8 1.5c.4 2.3 3.5 3.7 3.5 7.2A3.5 3.5 0 0 1 8 12.2a3.5 3.5 0 0 1-3.5-3.5c0-1.3.6-2.2 1.3-2.9.1 1.1.6 1.8 1.4 2.1-.4-2.4.2-4.6.8-6.4z" />,
  relevance: <path d="M8 1.5l1.5 4 4 1.5-4 1.5L8 12.5l-1.5-4-4-1.5 4-1.5zM12.5 11l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" />,
  new: <><circle cx="8" cy="8" r="6" /><path d="M8 4.8V8l2.2 1.6" /></>,
};

export default async function FeedPage({ searchParams }: { searchParams: { view?: string; n?: string } }) {
  const t = await getT();
  const origin = siteOrigin();
  return (
    <div className="home-layout">
      <JsonLd data={{
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'WebSite',
            name: 'Tender Town',
            url: origin,
            description: t(LEAD),
            potentialAction: { '@type': 'SearchAction', target: `${origin}/discover?q={search_term_string}`, 'query-input': 'required name=search_term_string' },
          },
          {
            '@type': 'SoftwareApplication',
            name: 'Tender Town',
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'Web',
            url: origin,
            description: t(LEAD),
            featureList: [t('Find opportunities'), t('Analyse requirements'), t('Prepare proposal briefs')],
          },
        ],
      }} />
      <ScopeBannerSuspense />
      <Suspense fallback={<HomeSkeleton />}>
        <HomeFeed view={searchParams.view} n={searchParams.n} />
      </Suspense>
    </div>
  );
}

async function HomeFeed({ view: raw, n }: { view?: string; n?: string }) {
  const now = new Date();
  const t = await getT();
  const focus = await resolveFocus();
  const view = (FEED_VIEWS.find((v) => v.slug === raw)?.slug ?? 'top') as FeedView;
  const scopeId = focus.hold?.id ?? focus.current?.id ?? null;
  const [{ items, error }, activity, user] = await Promise.all([
    getFeed(view, now),
    focus.hold || !focus.current ? Promise.resolve([]) : getActivity(30, focus.current.id),
    getCurrentUser(),
  ]);
  const posts = focus.hold ? [] : await getCommunityFeed(view === 'new' ? 'new' : 'best', user?.id ?? null, now);
  const postEngAll = await getEngagement('post', posts.map((post) => post.id));
  const visiblePosts = posts.filter((post) => !postEngAll.hidden.has(post.id));
  const entries = mixHome(items, visiblePosts, view);
  const run = scopeRun(focus.current);
  const kind = collectionKind(run, entries.length > 0, !!focus.hold);
  const shown = Math.max(PAGE, Number(n) || PAGE);
  const slice = entries.slice(0, shown);
  const newsIds = slice.flatMap((entry) => entry.kind === 'item' && entry.item.kind === 'news' && entry.item.newsId ? [entry.item.newsId] : []);
  const signalIds = slice.flatMap((entry) => entry.kind === 'item' && entry.item.event === 'signal' ? [likeTarget(entry.item.href)?.[1] || entry.item.opportunityId || ''] : []).filter(Boolean);
  const postIds = slice.flatMap((entry) => entry.kind === 'post' ? [entry.post.id] : []);
  const tenderIds = slice.flatMap((entry) => entry.kind === 'item' && entry.item.event !== 'signal' && entry.item.opportunity ? [entry.item.opportunity.opportunity_id] : []);
  const codes = Array.from(new Set(slice.flatMap((entry) => entry.kind === 'item' && entry.item.opportunity?.country && entry.item.event !== 'signal' ? [entry.item.opportunity.country] : [])));
  const [newsEng, tenderEng, postEng, likes, countryRows] = await Promise.all([
    getEngagement('news', newsIds),
    getEngagement('tender', signalIds),
    postIds.length ? Promise.resolve(postEngAll) : getEngagement('post', []),
    getLikes('tender', tenderIds),
    codes.length ? getSupabaseServerClient().from('countries').select('code, name').in('code', codes) : Promise.resolve({ data: [] as { code: string; name: string }[] }),
  ]);
  const countries = new Map((countryRows.data || []).map((row) => [row.code, row.name]));
  const href = (v: FeedView, more?: number) => {
    const p = new URLSearchParams();
    if (v !== 'top') p.set('view', v);
    if (more) p.set('n', String(more));
    return withPublicScope(p.toString() ? `/?${p}` : '/', focus.publicSlug);
  };

  return (
    <>
      <nav className="feed-sort" aria-label={t('Sort the feed')}>
        {FEED_VIEWS.map((v) => (
          <Link key={v.slug} href={href(v.slug)} className={`feed-sort-link ${v.slug === view ? 'active' : ''}`}
                aria-current={v.slug === view ? 'page' : undefined}>
            <svg className="feed-sort-icon" viewBox="0 0 16 16" aria-hidden="true">{VIEW_ICONS[v.slug]}</svg>
            {t(v.label)}
          </Link>
        ))}
      </nav>

      <div className="feed-page">
        <ScopeView scopeId={scopeId}>
        {error && <div className="callout error"><strong>{t('Error loading the feed.')}</strong> {error.message}</div>}
        {kind === 'loading' && <AgentLoader />}
        {!error && kind === 'stale' && (
          <ScopeStatus kind="stale" scopeName={focus.current?.name || ''} lastSuccessAt={run.lastSuccessAt} surface="feed" signedIn={focus.signedIn} />
        )}
        {!error && (kind === 'pending' || kind === 'failed' || kind === 'empty') && (
          <ScopeStatus kind={kind} scopeName={focus.current?.name || ''} lastSuccessAt={run.lastSuccessAt} surface="feed" signedIn={focus.signedIn} />
        )}
        {kind === 'ready' && <CheckedLine iso={run.lastSuccessAt} surface="feed" />}
        <div className="feed">
          {(kind === 'ready' || kind === 'stale') && (
            <HomeFeedItems entries={slice} now={now} valueOf={(item) => view === 'relevance' ? item.score : item.combined}
              countries={countries} likes={likes} newsEng={newsEng} tenderEng={tenderEng} postEng={postEng} />
          )}
        </div>
        {(kind === 'ready' || kind === 'stale') && entries.length > shown && (
          <Link href={href(view, shown + PAGE)} scroll={false} className="feed-more">
            {t('Show more')} <span className="mono">({t('{n} left', { n: entries.length - shown })})</span>
          </Link>
        )}
        </ScopeView>
      </div>

      <aside className="home-right"><LiveActivity initial={focus.hold ? [] : activity} scopeId={scopeId} /></aside>
    </>
  );
}

/** Signals stay first, industry news last. Community posts sit with the rest, on the same sort. */
function mixHome(items: FeedItem[], posts: PostCard[], view: FeedView): HomeEntry[] {
  const bandOf = (item: FeedItem) => item.category === 'signal' || item.event === 'signal' ? 0 : item.category === 'industry' ? 2 : 1;
  const rows = [
    ...items.map((item) => ({ key: item.key, kind: 'item' as const, item, band: bandOf(item), at: item.at.getTime(), hot: item.combined, score: item.score })),
    ...posts.map((post) => ({ key: `post:${post.id}`, kind: 'post' as const, post, band: 1, at: new Date(post.createdAt).getTime(), hot: post.score, score: post.score })),
  ];
  const rank = (row: (typeof rows)[number]) => view === 'new' ? row.at : view === 'relevance' ? row.score : row.hot;
  rows.sort((a, b) => a.band - b.band || rank(b) - rank(a));
  return rows;
}
