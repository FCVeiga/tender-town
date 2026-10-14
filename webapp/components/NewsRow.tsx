import Link from 'next/link';
import { NewsItem, newsCategoryLabel, titleOf } from '@/lib/data';
import { firstInLanguage } from '@/lib/english';
import { publicText } from '@/lib/publication';
import { getLocale, getTSync } from '@/lib/i18n/server';

export function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString(getLocale(), { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

export default function NewsRow({ n }: { n: NewsItem }) {
  const t = getTSync();
  return (
    <Link href={`/news/${n.news_id}`} className="news-card">
      <div className="list-row-main">
        <div className="news-top">
          <span className={`tag ${n.category}`}>{t(newsCategoryLabel(n.category))}</span>
          {n.unverified && <span className="tag unverified">{t('Unverified')}</span>}
          <span className="news-date">{formatDate(n.published_date)}</span>
        </div>
        <div className="news-title">{titleOf(n)}</div>
        {publicText(firstInLanguage(n.summary, n.excerpt) || '') && <div className="news-excerpt">{publicText(firstInLanguage(n.summary, n.excerpt) || '')}</div>}
        <div className="list-row-meta">
          {n.region}{n.source_name ? <> <span className="sep">·</span> {n.source_name}</> : null}
        </div>
      </div>
    </Link>
  );
}
