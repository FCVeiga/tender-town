import Link from 'next/link';
import { publicSearch, type DiscoverHit } from '@/lib/discover';
import { getT, getTSync } from '@/lib/i18n/server';
import { pageMeta } from '@/lib/seo';
import { formatDate } from '@/components/NewsRow';

const KINDS = [
  { kind: 'all', label: 'All' },
  { kind: 'tender', label: 'Tenders' },
  { kind: 'grant', label: 'Grants' },
  { kind: 'news', label: 'News' },
] as const;

export async function generateMetadata({ searchParams }: { searchParams: { q?: string } }) {
  const t = await getT();
  const q = (searchParams.q || '').trim();
  const title = q ? `${t('Results for “{q}”', { q })} — Tender Town` : `${t('Search')} — Tender Town`;
  return pageMeta({ title, description: t('Search tenders, grants and news'), path: q ? `/discover?q=${encodeURIComponent(q)}` : '/discover' });
}

export default async function DiscoverPage({ searchParams }: { searchParams: { q?: string; kind?: string } }) {
  const t = await getT();
  const q = (searchParams.q || '').trim().slice(0, 200);
  const kind = KINDS.some((item) => item.kind === searchParams.kind) ? searchParams.kind! : 'all';
  const hits = q ? await publicSearch(q, kind) : [];
  const href = (next: string) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (next !== 'all') params.set('kind', next);
    const text = params.toString();
    return text ? `/discover?${text}` : '/discover';
  };

  return (
    <div>
      <div className="page-head">
        <h1>{q ? t('Results for “{q}”', { q }) : t('Search')}</h1>
      </div>
      <form className="search-box discover-search" action="/discover" method="get">
        <input name="q" defaultValue={q} placeholder={t('Search tenders, grants and news')} aria-label={t('Search tenders, grants and news')} />
        {kind !== 'all' && <input type="hidden" name="kind" value={kind} />}
      </form>
      {q && (
        <nav className="filters" aria-label={t('Search')}>
          {KINDS.map((item) => (
            <Link key={item.kind} href={href(item.kind)} className={`filter-link${item.kind === kind ? ' active' : ''}`} aria-current={item.kind === kind ? 'page' : undefined}>
              {t(item.label)}
            </Link>
          ))}
        </nav>
      )}
      {q && hits.length === 0 && <div className="callout">{t('Nothing matches every word. Try fewer or broader words.')}</div>}
      <div className="feed">
        {hits.map((hit) => <Hit key={hit.url} hit={hit} />)}
      </div>
    </div>
  );
}

function kindLabel(hit: DiscoverHit) {
  if (hit.kind === 'news') return 'News';
  if (hit.kind === 'grant') return 'Grants';
  return 'Tenders';
}

function Hit({ hit }: { hit: DiscoverHit }) {
  const t = getTSync();
  const meta = [hit.buyer, hit.country].filter(Boolean).join(' · ');
  const tag = hit.kind === 'news' ? 'market' : hit.kind === 'grant' ? 'grant' : 'rfp';
  return (
    <Link href={hit.url} className="news-card">
      <div className="list-row-main">
        <div className="news-top">
          <span className={`tag ${tag}`}>{t(kindLabel(hit))}</span>
          {hit.deadline && <span className="news-date">{formatDate(hit.deadline)}</span>}
        </div>
        <div className="news-title">{hit.title}</div>
        {hit.summary && <div className="news-excerpt">{hit.summary}</div>}
        {meta && <div className="list-row-meta">{meta}</div>}
      </div>
    </Link>
  );
}
