import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { getPlatformLanguage } from '@/lib/language';
import { COMMUNITY_VIEWS, CommunityView, getCommunityFeed } from '@/lib/community';
import { getEngagement } from '@/lib/engagement';
import CommunityCard from '@/components/social/CommunityCard';
import { getT } from '@/lib/i18n/server';
import { pageMeta } from '@/lib/seo';

export async function generateMetadata() {
  const t = await getT();
  return pageMeta({ title: `${t('Community')} — Tender Town`, description: t('Posts from people who find and bid on public contracts.'), path: '/community' });
}
const PAGE = 25;

const ICONS: Record<CommunityView, JSX.Element> = {
  best: <path d="M8 2.5c.3 2 2.6 2.9 2.6 5.6A2.6 2.6 0 0 1 8 10.7a2.6 2.6 0 0 1-2.6-2.6c0-1.1.5-1.8 1-2.4-.1 1 .5 1.7 1.1 1.7C7.5 5.5 7.2 4 8 2.5zM4 10.5a4 4 0 0 0 8 0" />,
  new: <><circle cx="8" cy="8" r="6" /><path d="M8 4.8V8l2.2 1.6" /></>,
  top: <path d="M3 12.5 7 8.5l2.2 2.2L13 6.5M10 6.5h3v3" />,
};

/** Community Feed: members' posts, ranked for you (see lib/community.ts). */
export default async function CommunityPage({ searchParams }: { searchParams: { view?: string; n?: string } }) {
  await getPlatformLanguage();
  const t = await getT();
  const now = new Date();
  const view = (COMMUNITY_VIEWS.find((v) => v.slug === searchParams.view)?.slug ?? 'best') as CommunityView;
  const user = await getCurrentUser();
  const ranked = await getCommunityFeed(view, user?.id ?? null, now);
  const shown = Math.max(PAGE, Number(searchParams.n) || PAGE);
  const engagement = await getEngagement('post', ranked.map((p) => p.id));
  const posts = ranked.filter((p) => !engagement.hidden.has(p.id));  // "Hide" in a card's menu
  const href = (v: CommunityView, n?: number) => {
    const p = new URLSearchParams();
    if (v !== 'best') p.set('view', v);
    if (n) p.set('n', String(n));
    return `/community${p.toString() ? `?${p}` : ''}`;
  };

  return (
    <div className="community">
      <div className="community-head">
        <h1 className="opps-h1">{t('Community')}</h1>
        {user ? <Link href="/posts/new" className="btn primary">{t('Create a post')}</Link> : <Link href="/login?next=/posts/new" className="btn">{t('Log in to post')}</Link>}
      </div>
      <nav className="feed-sort" aria-label={t('Sort posts')}>
        {COMMUNITY_VIEWS.map((v) => (
          <Link key={v.slug} href={href(v.slug)} className={`feed-sort-link ${view === v.slug ? 'active' : ''}`} aria-current={view === v.slug ? 'page' : undefined}>
            <svg className="feed-sort-icon" viewBox="0 0 16 16" aria-hidden="true">{ICONS[v.slug]}</svg>{t(v.label)}
          </Link>
        ))}
      </nav>

      {posts.length === 0 ? (
        <div className="profile-empty">
          <p className="profile-empty-title">{t('No posts yet — start the conversation')}</p>
          
          <Link href={user ? '/posts/new' : '/login?next=/posts/new'} className="btn primary profile-empty-cta">{t('Create the first post')}</Link>
        </div>
      ) : (
        <div className="feed">
          {posts.slice(0, shown).map((p) => <CommunityCard key={p.id} post={p} now={now} engagement={engagement.get(p.id)} signedIn={engagement.signedIn} />)}
        </div>
      )}
      {posts.length > shown && <Link href={href(view, shown + PAGE)} scroll={false} className="feed-more">{t('Show more')} <span className="mono">({t('{n} left', { n: posts.length - shown })})</span></Link>}
    </div>
  );
}
