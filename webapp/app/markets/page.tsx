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
                {t('{n} tenders', { n: market.tenders })}
                <span className="sep">·</span>
                {t('{n} news', { n: market.news })}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
