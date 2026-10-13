import Link from 'next/link';
import { notFound } from 'next/navigation';
import { marketBySlug, type DiscoverHit } from '@/lib/discover';
import { getT, getTSync } from '@/lib/i18n/server';
import { pageMeta } from '@/lib/seo';
import { formatDate } from '@/components/NewsRow';

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const t = await getT();
  const market = await marketBySlug(params.slug);
  if (!market) return { title: `${t('Not found')} — Tender Town`, robots: { index: false, follow: false } };
  return pageMeta({
    title: `${t(market.name)} — Tender Town`,
    description: t('Open tenders, grants and news.'),
    path: `/markets/${market.slug}`,
  });
}

export default async function MarketPage({ params }: { params: { slug: string } }) {
  const t = await getT();
  const market = await marketBySlug(params.slug);
  if (!market) notFound();
  const empty = market.tenders.length === 0 && market.news.length === 0;
  return (
    <div>
      <Link className="back-link" href="/markets">← {t('Markets')}</Link>
      <div className="page-head">
        <h1>{t(market.name)}</h1>
      </div>
      {empty && <div className="callout">{t('Nothing open in this market right now.')}</div>}
      {market.tenders.length > 0 && (
        <section className="market-section">
          <h2 className="search-h2">{t('Tenders')}</h2>
          <div className="feed">
            {market.tenders.map((hit) => <Hit key={hit.url} hit={hit} />)}
          </div>
        </section>
      )}
      {market.news.length > 0 && (
        <section className="market-section">
          <h2 className="search-h2">{t('News')}</h2>
          <div className="feed">
            {market.news.map((hit) => <Hit key={hit.url} hit={hit} />)}
          </div>
        </section>
      )}
    </div>
  );
}

function Hit({ hit }: { hit: DiscoverHit }) {
  const t = getTSync();
  const meta = [hit.buyer, hit.country].filter(Boolean).join(' · ');
  const tag = hit.kind === 'grant' ? 'grant' : hit.kind === 'news' ? 'market' : 'rfp';
  const label = hit.kind === 'grant' ? 'Grants' : hit.kind === 'news' ? 'News' : 'Tenders';
  return (
    <Link href={hit.url} className="news-card">
      <div className="list-row-main">
        <div className="news-top">
          <span className={`tag ${tag}`}>{t(label)}</span>
          {hit.closed && <span className="tag closed">{t('Closed')}</span>}
          {hit.deadline && <span className="news-date">{formatDate(hit.deadline)}</span>}
        </div>
        <div className="news-title">{hit.title}</div>
        {hit.summary && <div className="news-excerpt">{hit.summary}</div>}
        {meta && <div className="list-row-meta">{meta}</div>}
      </div>
    </Link>
  );
}
