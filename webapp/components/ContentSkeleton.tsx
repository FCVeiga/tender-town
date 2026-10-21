'use client';

import { useT } from '@/lib/i18n/client';
import { BannerJobs } from '@/components/ScopeBanner';
import AgentLoader from '@/components/AgentLoader';

const HEADING = 'Specialised AI bidding workforce for your team';
const NOTE = 'Your specialised tender agents';

function Bars({ n, className }: { n: number; className: string }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => <div key={i} className={`skel ${className}`} />)}
    </>
  );
}

/** The illustrated banner, before the scope list has arrived. */
export function BannerSkeleton({ compact = false }: { compact?: boolean }) {
  const t = useT();
  return (
    <div className="scope-banner-slot">
      <section className={`scope-banner${compact ? ' compact' : ''}`} aria-busy="true">
        <span className="sr-only">{t('Loading scope')}</span>
        <div className="scope-banner-bg" aria-hidden="true">
          <img className="scope-banner-art light" src="/brand/sidebar-banner-light.jpg" alt="" />
          <img className="scope-banner-art dark" src="/brand/sidebar-banner.jpg" alt="" />
        </div>
        <div className="scope-banner-inner">
          <div className="scope-banner-lead">
            <p className="scope-banner-kicker">{t(HEADING)}</p>
            <BannerJobs />
          </div>
          {compact && <p className="scope-banner-note">{t(NOTE)}</p>}
          <div className="scope-banner-actions" aria-hidden="true">
            <div className="skel skel-btn" />
          </div>
        </div>
      </section>
    </div>
  );
}

/** Home feed and activity while results are loading. */
export function HomeSkeleton() {
  const t = useT();
  return (
    <>
      <div className="scope-tools">
        <div className="feed-scope" aria-hidden="true"><div className="skel skel-select" /></div>
        <aside className="home-right" aria-busy="true" aria-label={t('Live activity')}>
          <div className="live-panel">
            <div className="live-head"><span className="live-title"><span className="live-pulse" /><span className="live-label">{t('Live activity')}</span></span><svg className="live-chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5l3-3" /></svg></div>
            <AgentLoader compact />
          </div>
        </aside>
      </div>
      <div className="feed-page agent-loader-slot" aria-busy="true">
        <AgentLoader />
      </div>
    </>
  );
}

/** Tender or news list while that section is loading. */
export function ListSkeleton() {
  return (
    <div aria-busy="true">
      <AgentLoader />
    </div>
  );
}
