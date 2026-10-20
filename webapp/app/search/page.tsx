import FeedCard from '@/components/FeedCard';
import Link from 'next/link';
import UserAvatar from '@/components/UserAvatar';
import { search, searchPeople, searchWords } from '@/lib/search';
import { getFeedLikes, likeTarget } from '@/lib/likes';
import { getT } from '@/lib/i18n/server';
import { pageMeta } from '@/lib/seo';

export async function generateMetadata() {
  const t = await getT();
  return { ...pageMeta({ title: `${t('Search')} — Tender Town`, description: t('Search tenders, grants and news'), path: '/search' }), robots: { index: false, follow: true } };
}

const likeOf = (likes: { signedIn: boolean; liked: Set<string> }, href: string) => {
  const t = likeTarget(href);
  return { liked: !!t && likes.liked.has(`${t[0]}:${t[1]}`), signedIn: likes.signedIn };
};

export default async function SearchPage({ searchParams }: { searchParams: { q?: string } }) {
  const q = (searchParams.q || '').trim();
  const now = new Date();
  const t = await getT();
  const [{ opportunities, news }, people] = await Promise.all([search(q, now), searchPeople(q)]);
  const likes = await getFeedLikes([...opportunities, ...news].map((i) => i.href));
  const total = opportunities.length + news.length + people.length;

  return (
    <div className="search-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">{t('Search')}</div>
          <h1>{q ? t('Results for “{q}”', { q }) : t('Search')}</h1>
          <p className="page-sub">
            {!q ? t('Search tenders and news.')
              : !searchWords(q).length ? t('Use at least one word of two or more letters.')
                : `${total === 1 ? t('{n} result', { n: total }) : t('{n} results', { n: total })} — ${opportunities.length === 1 ? t('{n} tender', { n: opportunities.length }) : t('{n} tenders', { n: opportunities.length })}, ${t('{n} news', { n: news.length })}, ${people.length === 1 ? t('{n} person', { n: people.length }) : t('{n} people', { n: people.length })}.`}
          </p>
        </div>
      </div>

      {q && total === 0 && searchWords(q).length > 0 && (
        <div className="callout">{t('Nothing matches every word. Try fewer or broader words.')}</div>
      )}

      {people.length > 0 && (
        <section className="search-section">
          <h2 className="search-h2">{t('People')} <span className="mono">{people.length}</span></h2>
          <ul className="people-list">
            {people.map((p) => (
              <li key={p.username}>
                <Link href={`/u/${p.username}`} className="people-row">
                  <UserAvatar name={p.username} src={p.avatarUrl} size={36} />
                  <span><strong>{p.displayName}</strong><em>u/{p.username}{p.company ? ` · ${p.company}` : ''}</em></span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {opportunities.length > 0 && (
        <section className="search-section">
          <h2 className="search-h2">{t('Tenders')} <span className="mono">{opportunities.length}</span></h2>
          <div className="feed">{opportunities.map((i) => <FeedCard key={i.key} item={i} now={now} like={likeOf(likes, i.href)} />)}</div>
        </section>
      )}
      {news.length > 0 && (
        <section className="search-section">
          <h2 className="search-h2">{t('News')} <span className="mono">{news.length}</span></h2>
          <div className="feed">{news.map((i) => <FeedCard key={i.key} item={i} now={now} like={likeOf(likes, i.href)} />)}</div>
        </section>
      )}
    </div>
  );
}
