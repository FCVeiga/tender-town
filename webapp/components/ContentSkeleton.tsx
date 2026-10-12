'use client';

import { useT } from '@/lib/i18n/client';

const COPY = 'Explore tenders, funding and news in your market. Create a custom scope to put specialised agents to work finding opportunities, analysing requirements and preparing proposal briefs.';

function Bars({ n, className }: { n: number; className: string }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => <div key={i} className={`skel ${className}`} />)}
    </>
  );
}

/** The illustrated banner, before the scope list has arrived. */
export function BannerSkeleton() {
  const t = useT();
  return (
    <div className="scope-banner-slot">
      <section className="scope-banner" aria-busy="true">
        <span className="sr-only">{t('Loading scope')}</span>
        <div className="scope-banner-bg" aria-hidden="true">
          <img className="scope-banner-art light" src="/brand/sidebar-banner-light.jpg" alt="" />
          <img className="scope-banner-art dark" src="/brand/sidebar-banner.jpg" alt="" />
        </div>
        <div className="scope-banner-inner">
          <div className="scope-banner-lead">
            <p className="scope-banner-kicker">{t('Choose your scope. Find your next opportunity.')}</p>
            <p className="scope-banner-copy">{t(COPY)}</p>
          </div>
          <div className="scope-banner-actions" aria-hidden="true">
            <div className="skel skel-select" />
            <div className="skel skel-btn" />
          </div>
        </div>
      </section>
    </div>
  );
}

/** Home feed, sort, and activity while results are loading. */
export function HomeSkeleton() {
  const t = useT();
  return (
    <>
      <div className="feed-sort" aria-hidden="true">
        <Bars n={3} className="skel-pill" />
      </div>
      <div className="feed-page" aria-busy="true">
        <span className="sr-only">{t('Loading scope')}</span>
        <div className="feed-skel"><Bars n={4} className="skel-card" /></div>
      </div>
      <aside className="home-right" aria-busy="true" aria-label={t('Live activity')}>
        <div className="live-panel">
          <div className="live-head"><span className="live-title"><span className="live-pulse" />{t('Live activity')}</span></div>
          <ul className="live-list"><Bars n={3} className="skel-activity" /></ul>
        </div>
      </aside>
    </>
  );
}

/** Tender or news rows while that list is loading. */
export function ListSkeleton({ rows = 'cards' }: { rows?: 'cards' | 'tenders' }) {
  const t = useT();
  return (
    <div aria-busy="true">
      <span className="sr-only">{t('Loading scope')}</span>
      <div className="feed-sort" aria-hidden="true"><Bars n={4} className="skel-pill" /></div>
      <div className={rows === 'tenders' ? 'opp-skel' : 'feed-skel'}>
        <Bars n={4} className={rows === 'tenders' ? 'skel-row' : 'skel-card'} />
      </div>
    </div>
  );
}
