import Link from 'next/link';
import { marketIndex } from '@/lib/discover';
import { getT } from '@/lib/i18n/server';
import { pageMeta } from '@/lib/seo';

export async function generateMetadata() {
  const t = await getT();
  return pageMeta({ title: `${t('Markets')} — Tender Town`, description: t('Open tenders, grants and news.'), path: '/markets' });
}

export default async function MarketsPage() {
  const t = await getT();
  const markets = await marketIndex();
  return (
    <div>
      <div className="page-head">
        <h1>{t('Markets')}</h1>
      </div>
      <div className="feed">
        {markets.map((market) => (
          <Link key={market.slug} href={`/markets/${market.slug}`} className="news-card">
            <div className="list-row-main">
              <div className="news-title">{t(market.name)}</div>
              <div className="list-row-meta">
                {[
                  market.open === 1 ? t('{n} open tender', { n: market.open }) : market.open > 1 ? t('{n} open tenders', { n: market.open }) : null,
                  market.upcoming === 1 ? t('{n} signal', { n: market.upcoming }) : market.upcoming > 1 ? t('{n} signals', { n: market.upcoming }) : null,
                  market.open + market.upcoming === 0 ? t('No open tenders') : null,
                  market.archived === 1 ? t('{n} archived tender', { n: market.archived }) : market.archived > 1 ? t('{n} archived tenders', { n: market.archived }) : null,
                  t('{n} news', { n: market.news }),
                ].filter(Boolean).map((part, index) => (
                  <span key={index}>{index > 0 && <span className="sep">·</span>}{part}</span>
                ))}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
