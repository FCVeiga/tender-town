import { Suspense } from 'react';
import Link from 'next/link';
import { siteOrigin } from '@/lib/auth';
import { pageMeta } from '@/lib/seo';
import JsonLd from '@/components/JsonLd';
import { FEED_VIEWS, FeedView, getFeed } from '@/lib/feed';
import { getActivity } from '@/lib/sources';
import FeedCard from '@/components/FeedCard';
import LiveActivity from '@/components/LiveActivity';
import { getFeedLikes, likeTarget } from '@/lib/likes';
import { getT } from '@/lib/i18n/server';
import { withPublicScope } from '@/lib/guestScope';
import { resolveFocus } from '@/lib/scopeFocus';
import { ScopeBannerSuspense } from '@/components/ScopeBannerSlot';
import ScopeView from '@/components/ScopeView';
import ScopeStatus from '@/components/ScopeStatus';
import { collectionKind, scopeRun } from '@/lib/scopeStatus';
import { getLocale } from '@/lib/i18n/server';

const likeOf = (likes: { signedIn: boolean; liked: Set<string> }, href: string) => {
  const t = likeTarget(href);
  return { liked: !!t && likes.liked.has(`${t[0]}:${t[1]}`), signedIn: likes.signedIn };
};

const PAGE = 30;
const LEAD = 'Public tenders, funding and market news across Europe — and a community of the people who bid on them.';

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
        '@type': 'WebSite',
        name: 'Tender Town',
        url: origin,
        description: t(LEAD),
        potentialAction: { '@type': 'SearchAction', target: `${origin}/search?q={search_term_string}`, 'query-input': 'required name=search_term_string' },
      }} />
      <ScopeBannerSuspense />
      <Suspense fallback={null}>
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
  const [{ items, error }, activity] = await Promise.all([
    getFeed(view, now),
    focus.hold || !focus.current ? Promise.resolve([]) : getActivity(30, focus.current.id),
  ]);
  const run = scopeRun(focus.current);
  const kind = collectionKind(run, items.length > 0, !!focus.hold);
  const collected = run.lastSuccessAt && !Number.isNaN(new Date(run.lastSuccessAt).getTime())
    ? new Date(run.lastSuccessAt).toLocaleString(getLocale(), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;
  const shown = Math.max(PAGE, Number(n) || PAGE);
  const likes = await getFeedLikes(items.map((i) => i.href));
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
        {kind === 'loading' && <div className="callout" aria-busy="true">{t('Loading scope')}</div>}
        {!error && kind === 'stale' && (
          <ScopeStatus kind="stale" scopeName={focus.current?.name || ''} lastSuccessAt={run.lastSuccessAt} surface="feed" signedIn={focus.signedIn} />
        )}
        {!error && (kind === 'pending' || kind === 'failed' || kind === 'empty') && (
          <ScopeStatus kind={kind} scopeName={focus.current?.name || ''} lastSuccessAt={run.lastSuccessAt} surface="feed" signedIn={focus.signedIn} />
        )}
        {kind === 'ready' && collected && <p className="scope-collected">{t('Last collected {time}.', { time: collected })}</p>}
        <div className="feed">
          {(kind === 'ready' || kind === 'stale') && items.slice(0, shown).map((item) => (
            <FeedCard key={item.key} item={item} now={now} value={view === 'relevance' ? item.score : item.combined} like={likeOf(likes, item.href)} />
          ))}
        </div>
        {(kind === 'ready' || kind === 'stale') && items.length > shown && (
          <Link href={href(view, shown + PAGE)} scroll={false} className="feed-more">
            {t('Show more')} <span className="mono">({t('{n} left', { n: items.length - shown })})</span>
          </Link>
        )}
        </ScopeView>
      </div>

      <aside className="home-right"><LiveActivity initial={focus.hold ? [] : activity} scopeId={scopeId} /></aside>
    </>
  );
}
