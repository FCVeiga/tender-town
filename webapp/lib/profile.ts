/** Profile pages (/u/[username]): the user, their counts, and what they follow. */
import { getSupabaseServerClient } from '@/lib/supabase';
import { postBySlug } from '@/lib/blog';
import { newsCategoryLabel, oppCategoryLabel, opportunityPath, titleOf } from '@/lib/data';
import { firstInLanguage } from '@/lib/english';
import { publicText } from '@/lib/publication';
import type { FeedItem } from '@/lib/feed';

export type Profile = {
  id: string; username: string; displayName: string; avatarUrl: string | null; bannerUrl: string | null; bio: string | null; createdAt: string;
  company: string | null; role: string | null; location: string | null; expertise: string[];
  links: { website: string | null; linkedin: string | null; x: string | null; github: string | null };
};

export async function getProfile(username: string): Promise<Profile | null> {
  if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) return null;
  const { data } = await getSupabaseServerClient().from('profiles')
    .select('id, username, display_name, avatar_url, banner_url, bio, created_at, company, role, location, expertise, website_url, linkedin_url, x_url, github_url')
    .ilike('username', username.replace(/_/g, '\\_')).maybeSingle();
  return data && {
    id: data.id, username: data.username, displayName: data.display_name || data.username,
    avatarUrl: data.avatar_url, bannerUrl: data.banner_url, bio: data.bio, createdAt: data.created_at,
    company: data.company, role: data.role, location: data.location, expertise: data.expertise || [],
    links: { website: data.website_url, linkedin: data.linkedin_url, x: data.x_url, github: data.github_url },
  };
}

export async function getProfileStats(userId: string) {
  const db = getSupabaseServerClient();
  const [posts, comments, likes, followers, followingPeople] = await Promise.all([
    db.from('posts').select('score, like_count').eq('user_id', userId),
    db.from('comments').select('score').eq('user_id', userId),
    db.from('likes').select('item_id', { count: 'exact', head: true }).eq('user_id', userId),
    db.from('user_follows').select('follower_id', { count: 'exact', head: true }).eq('followee_id', userId),
    db.from('user_follows').select('followee_id', { count: 'exact', head: true }).eq('follower_id', userId),
  ]);
  const sum = (rows: any[] | null) => (rows || []).reduce((n, r) => n + (r.score || 0), 0);
  return {
    posts: posts.data?.length ?? 0, comments: comments.data?.length ?? 0, following: likes.count ?? 0,
    // Aura (lib/terms.ts): what the community gave — likes on posts, plus scores.
    postCred: sum(posts.data) + (posts.data || []).reduce((n: number, p: any) => n + (p.like_count || 0), 0), commentCred: sum(comments.data),
    followers: followers.count ?? 0, followingPeople: followingPeople.count ?? 0,
  };
}

export async function getPosts(userId: string) {
  const { data } = await getSupabaseServerClient().from('posts').select('id, title, body, score, created_at')
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(50);
  return data || [];
}

export async function getComments(userId: string) {
  const { data } = await getSupabaseServerClient().from('comments').select('id, post_id, item_type, item_id, body, score, created_at, posts(title)')
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(50);
  return data || [];
}

/** The tenders and news the user liked, newest like first, as feed cards. */
export async function getFollowing(userId: string): Promise<FeedItem[]> {
  const db = getSupabaseServerClient();
  const { data: likes } = await db.from('likes').select('item_type, item_id, created_at')
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(200);
  const ids = (t: string) => (likes || []).filter((l: any) => l.item_type === t).map((l: any) => l.item_id);
  const [{ data: opps }, { data: news }] = await Promise.all([
    ids('tender').length ? db.from('opportunities').select('*').in('opportunity_id', ids('tender')) : Promise.resolve({ data: [] as any[] }),
    ids('news').length ? db.from('news_items').select('*').in('news_id', ids('news')) : Promise.resolve({ data: [] as any[] }),
  ]);
  const opp = new Map((opps || []).map((o: any) => [o.opportunity_id, o]));
  const story = new Map((news || []).map((n: any) => [n.news_id, n]));
  const now = Date.now();
  return (likes || []).flatMap((l: any): FeedItem[] => {
    const at = new Date(l.created_at);
    if (l.item_type === 'blog') {
      const post = postBySlug(l.item_id);
      if (!post) return [];
      return [{
        key: `blog:${post.slug}`, kind: 'news', event: 'liked', href: `/blog/${post.slug}`,
        headline: post.title, body: post.description, category: 'blog', categoryLabel: 'Blog', kindLabel: 'Blog',
        country: null, at, score: 0, combined: 0, movement: 'same', deadline: null, isNew: false, fresh: null,
        image: post.image,
      }];
    }
    if (l.item_type === 'tender') {
      const o = opp.get(l.item_id);
      if (!o) return [];
      const closed = o.deadline && new Date(o.deadline).getTime() < now;
      return [{
        key: `tender:${o.opportunity_id}`, kind: o.opportunity_type === 'signal' ? 'news' : 'opportunity', event: 'liked', href: opportunityPath(o),
        headline: titleOf(o), body: publicText(firstInLanguage(o.summary) || '').split(/\n{2,}/)[0] || null,
        category: o.opportunity_type || 'rfp', categoryLabel: oppCategoryLabel(o.opportunity_type), kindLabel: o.opportunity_type === 'signal' ? 'Planned procurement' : 'Tender',
        country: o.country, at, score: o.opportunity_relevance_score ?? 0, combined: o.opportunity_relevance_score ?? 0,
        movement: 'same', deadline: closed ? null : o.deadline, isNew: false, fresh: null,
        statusLabel: closed ? 'Closed' : o.status === 'AWARDED' ? 'Awarded' : null,
      }];
    }
    const n = story.get(l.item_id);
    if (!n) return [];
    return [{
      key: `news:${n.news_id}`, kind: 'news', event: 'liked', href: `/news/${n.news_id}`,
      headline: titleOf(n), body: publicText(firstInLanguage(n.summary) || ''), category: n.category || 'market',
      categoryLabel: newsCategoryLabel(n.category), kindLabel: 'News', country: n.region && n.region !== 'EU / International' ? n.region : null,
      at, score: n.relevance_score ?? 0, combined: n.relevance_score ?? 0, movement: 'same', deadline: null, isNew: false, fresh: null,
      image: n.image_url,
    }];
  });
}

/** The trophy case — earned later (streaks, comments, posts); shown locked until then. */
export const ACHIEVEMENTS = [
  { key: 'streak10', name: '10-day streak', how: 'Visit Tender Town 10 days in a row', icon: '🔥' },
  { key: 'comments20', name: 'Conversationalist', how: 'Write 20 comments', icon: '💬' },
  { key: 'firstpost', name: 'First post', how: 'Publish your first post', icon: '✍️' },
  { key: 'follow10', name: 'Tender scout', how: 'Follow 10 tenders', icon: '🔭' },
  { key: 'year1', name: 'One year club', how: 'One year on Tender Town', icon: '🎂' },
];
