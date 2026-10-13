import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getPlatformLanguage } from '@/lib/language';
import { ACHIEVEMENTS, getComments, getFollowing, getPosts, getProfile, getProfileStats } from '@/lib/profile';
import { getFeedLikes, likeTarget } from '@/lib/likes';
import FeedCard from '@/components/FeedCard';
import UserAvatar from '@/components/UserAvatar';
import { CRED } from '@/lib/terms';
import StartChatButton from '@/components/social/StartChatButton';
import ImageEditButton from '@/components/auth/ImageEditButton';
import SocialLinks, { hasLinks } from '@/components/SocialLinks';
import FollowButton from '@/components/social/FollowButton';
import CommunityCard from '@/components/social/CommunityCard';
import { getLikedPosts } from '@/lib/community';
import { getSupabaseServerClient } from '@/lib/supabase';
import { getEngagement } from '@/lib/engagement';
import { getLocale, getT, getTSync } from '@/lib/i18n/server';

const TABS = [
  { key: 'posts', label: 'Posts' },
  { key: 'comments', label: 'Comments' },
  { key: 'following', label: 'Following' },
  { key: 'about', label: 'About' },
] as const;
type Tab = (typeof TABS)[number]['key'];

const fmt = (iso: string) => new Date(iso).toLocaleDateString(getLocale(), { day: 'numeric', month: 'short', year: 'numeric' });

export async function generateMetadata({ params }: { params: { username: string } }) {
  // Settings → Privacy → "Show up in search results" off: ask search engines not to index the profile.
  const { data } = await getSupabaseServerClient().from('profiles').select('searchable')
    .ilike('username', params.username.replace(/[\\%_]/g, (c) => `\\${c}`)).maybeSingle();
  return { title: `u/${params.username} — Tender Town`, ...(data && data.searchable === false ? { robots: { index: false, follow: false } } : {}) };
}

/** A user's profile, laid out like Reddit's: header, tabs, and a sidebar card. */
export default async function ProfilePage({ params, searchParams }: { params: { username: string }; searchParams: { tab?: string } }) {
  await getPlatformLanguage();
  const t = await getT();
  const [profile, me] = await Promise.all([getProfile(params.username), getCurrentUser()]);
  if (!profile) notFound();
  const own = me?.id === profile.id;
  const tab: Tab = (TABS.find((tb) => tb.key === searchParams.tab)?.key ?? 'posts');
  const stats = await getProfileStats(profile.id);
  const iFollow = !own && me ? !!(await getSupabaseServerClient().from('user_follows').select('followee_id')
    .eq('follower_id', me.id).eq('followee_id', profile.id).maybeSingle()).data : false;
  const now = new Date();

  let body: React.ReactNode;
  if (tab === 'posts') {
    const posts = await getPosts(profile.id);
    body = posts.length ? posts.map((p: any) => (
      <Link key={p.id} href={`/posts/${p.id}`} className="profile-post"><h3>{p.title}</h3>{p.body && <p className="profile-post-body">{p.body}</p>}<span className="profile-meta">{p.score} {CRED} · {fmt(p.created_at)}</span></Link>
    )) : <Empty own={own} who={profile.username} what="posts" hint={own ? t('Share a take on a tender, a question for the market, or lessons from a bid.') : t('Their posts will show here.')} cta={own ? { href: '/posts/new', label: t('Create a post') } : undefined} />;
  } else if (tab === 'comments') {
    const comments = await getComments(profile.id);
    body = comments.length ? comments.map((c: any) => (
      <Link key={c.id} href={`${c.item_type === 'news' ? `/news/${c.item_id}` : c.item_type === 'tender' ? `/tenders/${c.item_id}` : c.item_type === 'blog' ? `/blog/${c.item_id}` : `/posts/${c.post_id}`}#c-${c.id}`} className="profile-post">
        <span className="profile-meta">{c.posts?.title ? t('on “{title}”', { title: c.posts.title }) : c.item_type === 'news' ? t('on a news story') : c.item_type === 'blog' ? t('on an article') : t('on a tender')} · {fmt(c.created_at)}</span>
        <p className="profile-post-body">{c.body}</p>
      </Link>
    )) : <Empty own={own} who={profile.username} what="comments" hint={t('Comments on other people’s posts will show here.')} />;
  } else if (tab === 'following') {
    if (!own) {
      body = <div className="profile-empty"><p className="profile-empty-title">{t('Only u/{username} can see what they follow.', { username: profile.username })}</p></div>;
    } else {
      const [items, likedPosts] = await Promise.all([getFollowing(profile.id), getLikedPosts(profile.id, now)]);
      const [likes, postEngagement] = await Promise.all([getFeedLikes(items.map((i) => i.href)), getEngagement('post', likedPosts.map((l) => l.post.id))]);
      // Tenders, news and posts together, most recently liked first.
      const all = [
        ...items.map((i) => ({ at: i.at.getTime(), node: (() => { const t = likeTarget(i.href); return <FeedCard key={i.key} item={i} now={now} like={{ liked: !!t && likes.liked.has(`${t[0]}:${t[1]}`), signedIn: true }} />; })() })),
        ...likedPosts.map(({ post, likedAt }) => ({ at: new Date(likedAt).getTime(), node: <CommunityCard key={`post:${post.id}`} post={post} now={now} engagement={postEngagement.get(post.id)} signedIn /> })),
      ].sort((a, b) => b.at - a.at);
      body = all.length
        ? <div className="feed">{all.map((x) => x.node)}</div>
        : <Empty own hint={t('Tap the heart on any tender, news story or post to follow it — it lands here.')} who={profile.username} what="follows" />;
    }
  } else {
    body = (
      <div className="profile-about">
        <section className="detail-block">
          <h2>{t('About')}</h2>
          {profile.bio ? <p className="profile-bio">{profile.bio}</p>
            : <p className="muted">{own ? t('No bio yet.') : t('u/{username} hasn’t written anything yet.', { username: profile.username })}</p>}
          {own && <Link href="/profile/edit" className="btn">{profile.bio ? t('Edit description') : t('Add a description')}</Link>}
        </section>
        <section className="detail-block">
          <div className="about-head"><h2>{t('Details')}</h2>{own && <Link href="/profile/edit#details" className="btn">{t('Edit details')}</Link>}</div>
          {profile.company || profile.role || profile.location || profile.expertise.length || hasLinks(profile.links) ? (
            <dl className="about-details">
              {profile.role && <div><dt>{t('Role')}</dt><dd>{profile.role}</dd></div>}
              {profile.company && <div><dt>{t('Company')}</dt><dd>{profile.company}</dd></div>}
              {profile.location && <div><dt>{t('Location')}</dt><dd>{profile.location}</dd></div>}
              {profile.expertise.length > 0 && <div className="wide"><dt>{t('Expertise')}</dt><dd className="cc-tags">{profile.expertise.map((e) => <span key={e} className="cc-tag">{e}</span>)}</dd></div>}
              {hasLinks(profile.links) && <div className="wide"><dt>{t('Connections')}</dt><dd><SocialLinks links={profile.links} variant="list" /></dd></div>}
            </dl>
          ) : <p className="muted">{own ? t('No details yet.') : t('u/{username} hasn’t added any details yet.', { username: profile.username })}</p>}
        </section>
        <section className="detail-block">
          <h2>{t('Achievements')} <span className="uc-count">0/{ACHIEVEMENTS.length}</span></h2>
          <div className="trophies">
            {ACHIEVEMENTS.map((a) => (
              <div key={a.key} className="trophy locked" title={t(a.how)}>
                <span className="trophy-icon" aria-hidden="true">{a.icon}</span>
                <span><strong>{t(a.name)}</strong><em>{t(a.how)}</em></span>
              </div>
            ))}
          </div>
          
        </section>
      </div>
    );
  }

  return (
    <div className="profile">
      <div className="profile-main">
        <header className="profile-head">
          <UserAvatar name={profile.username} src={profile.avatarUrl} size={72} className="profile-avatar" />
          <div className="profile-names">
            <h1>{profile.displayName}</h1>
            <span className="profile-handle">u/{profile.username}</span>
          </div>
          {own && <Link href="/profile/edit" className="btn profile-edit-top">{t('Edit profile')}</Link>}
          {!own && me && <span className="profile-chat-top"><FollowButton username={profile.username} following={iFollow} /><StartChatButton username={profile.username} /></span>}
          {!own && !me && <Link href={`/login?next=/u/${profile.username}`} className="btn profile-chat-top">{t('Log in to chat')}</Link>}
        </header>

        <nav className="feed-sort section-tabs profile-tabs" aria-label={t('Profile sections')}>
          {TABS.map((tb) => (
            <Link key={tb.key} href={tb.key === 'posts' ? `/u/${profile.username}` : `/u/${profile.username}?tab=${tb.key}`}
              className={`feed-sort-link ${tab === tb.key ? 'active' : ''}`} aria-current={tab === tb.key ? 'page' : undefined}>
              {t(tb.label)}
              {tb.key === 'posts' && <span className="pill-count">{stats.posts}</span>}
              {tb.key === 'comments' && <span className="pill-count">{stats.comments}</span>}
              {tb.key === 'following' && own && <span className="pill-count">{stats.following}</span>}
            </Link>
          ))}
        </nav>

        <div className="profile-body">{body}</div>
      </div>

      <aside className="profile-side">
        <div className="profile-card">
          <div className="profile-banner" style={profile.bannerUrl ? { backgroundImage: `url(${JSON.stringify(profile.bannerUrl)})` } : undefined}>
            {own && <ImageEditButton kind="banner" className="banner-edit" />}
          </div>
          <div className="profile-card-body">
            <div className="profile-card-avatar-wrap">
              <UserAvatar name={profile.username} src={profile.avatarUrl} size={56} className="profile-card-avatar" />
              {own && <ImageEditButton kind="avatar" className="avatar-edit" />}
            </div>
            <h2>{profile.displayName}</h2>
            <span className="profile-handle">u/{profile.username}</span>
            {(profile.role || profile.company) && <p className="profile-card-work">{[profile.role, profile.company].filter(Boolean).join(' · ')}</p>}
            {profile.bio && <p className="profile-card-bio">{profile.bio}</p>}
            {own && <Link href="/profile/edit" className="btn primary profile-card-edit">{t('Edit profile')}</Link>}
            {!own && me && <div className="profile-card-edit profile-card-actions"><FollowButton username={profile.username} following={iFollow} /><StartChatButton username={profile.username} /></div>}
            <dl className="profile-stats">
              <div><dt>{stats.postCred}</dt><dd>{t('Post {cred}', { cred: CRED })}</dd></div>
              <div><dt>{stats.commentCred}</dt><dd>{t('Comment {cred}', { cred: CRED })}</dd></div>
              <div><dt>{stats.followers}</dt><dd>{t('Followers')}</dd></div>
              <div><dt>{stats.followingPeople}</dt><dd>{t('Following')}</dd></div>
              <div><dt>{fmt(profile.createdAt)}</dt><dd>{t('Membership day')}</dd></div>
              <div><dt>{own ? stats.following : '—'}</dt><dd>{t('Liked items')}</dd></div>
            </dl>
            {(hasLinks(profile.links) || own) && (
              <div className="profile-card-section">
                <div className="profile-card-section-head">
                  <h3>{t('Social links')}</h3>
                  {own && hasLinks(profile.links) && <Link href="/profile/edit#links" className="section-edit" aria-label={t('Edit social links')}>
                    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.8 2.7a1.6 1.6 0 0 1 2.3 2.3L5.6 12.5 2.5 13.5l1-3.1z" /></svg></Link>}
                </div>
                {hasLinks(profile.links) ? <SocialLinks links={profile.links} />
                  : <Link href="/profile/edit#links" className="add-links">+ {t('Add social links')}</Link>}
              </div>
            )}
            <div className="profile-card-section">
              <h3>{t('Trophy case')}</h3>
              <div className="trophy-row">
                {ACHIEVEMENTS.map((a) => <span key={a.key} className="trophy-mini locked" title={`${t(a.name)} — ${t(a.how)} (${t('locked')})`} aria-label={`${t(a.name)}, ${t('locked')}`}>{a.icon}</span>)}
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Empty({ own, who, what, hint, cta }: { own: boolean; who: string; what: string; hint: string; cta?: { href: string; label: string } }) {
  const t = getTSync();
  return (
    <div className="profile-empty">
      <p className="profile-empty-title">{own ? t(`You don’t have any ${what} yet`) : t(`u/{username} hasn’t got any ${what} yet`, { username: who })}</p>
      <p className="muted">{hint}</p>
      {cta && <Link href={cta.href} className="btn primary profile-empty-cta">{cta.label}</Link>}
    </div>
  );
}
