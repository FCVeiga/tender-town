import Link from 'next/link';
import HeartButton from './HeartButton';
import CardActions from './social/CardActions';
import CardMenu from './social/CardMenu';
import type { Engagement } from '@/lib/engagement';
import { likeTarget } from '@/lib/likes';
import { daysUntil } from '@/lib/data';
import type { FeedItem } from '@/lib/feed';
import { getLocale, getTSync } from '@/lib/i18n/server';
import NewsImage from './NewsImage';

type T = ReturnType<typeof getTSync>;

/** "3h ago", "2d ago", "14 Sep" — compact, like a feed (lib/feed's timeAgo, in the viewer's language). */
function timeAgo(t: T, at: Date, now: Date) {
  const mins = Math.round((now.getTime() - at.getTime()) / 60000);
  if (mins < 60) return t('{n}m ago', { n: Math.max(1, mins) });
  const hours = Math.round(mins / 60);
  if (hours < 24) return t('{n}h ago', { n: hours });
  const days = Math.round(hours / 24);
  if (days < 14) return t('{n}d ago', { n: days });
  return at.toLocaleDateString(getLocale(), { day: 'numeric', month: 'short' });
}

function Related({ item }: { item: FeedItem }) {
  const t = getTSync();
  if (!item.related?.length) return null;
  return (
    <p className="feed-related">
      <span>{t('Also covered')}</span>
      {item.related.map((story) => <Link key={story.href} href={story.href}>{story.headline}</Link>)}
    </p>
  );
}

function Deadline({ deadline, now }: { deadline: string; now: Date }) {
  const t = getTSync();
  const d = daysUntil(deadline, now)!;
  const date = new Date(deadline).toLocaleDateString(getLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
  if (d < 0) return <div className="feed-foot">{t('Closed {date}', { date })}</div>;
  return (
    <div className={`feed-foot ${d <= 14 ? 'due-soon' : ''}`}>
      {t('Deadline {date}', { date })} · {d === 0 ? t('closes today') : d === 1 ? t('{n} day left', { n: d }) : t('{n} days left', { n: d })}
    </div>
  );
}

/** One post: the same card on the home feed and in search results. */
export default function FeedCard({ item, now, value, like, social }: {
  item: FeedItem; now: Date; value?: number; like?: { liked: boolean; signedIn: boolean };
  social?: { engagement: Engagement; signedIn: boolean };  // News page: … menu and action bar
}) {
  if (social) return <SocialFeedCard item={item} now={now} value={value} social={social} />;
  const t = getTSync();
  const target = like ? likeTarget(item.href) : null;
  const card = (
    <Link href={item.href} className={`feed-item ${item.kind}`}>
      <div className="feed-body">
        <div className="feed-meta">
          <span className={`feed-kind ${item.kind}`}>{t(item.kindLabel)}</span>
          <span className={`tag ${item.category}`}>{t(item.categoryLabel)}</span>
          {item.isNew && <span className="tag new">{t('New')}</span>}
          {item.statusLabel && <span className="tag closed">{t(item.statusLabel)}</span>}
          {item.country && <span className="feed-meta-text">{item.country}</span>}
          <span className="feed-time" title={item.at.toLocaleString(getLocale())}>{timeAgo(t, item.at, now)}</span>
        </div>
        <div className="feed-title">{item.headline}</div>
        {item.image && <NewsImage src={item.image} />}
        {item.body && <p className="feed-summary">{item.body}</p>}
        {item.deadline && <Deadline deadline={item.deadline} now={now} />}
      </div>
    </Link>
  );
  const withRelated = item.related?.length ? <div className="feed-stack">{card}<Related item={item} /></div> : card;
  if (!target || !like) return withRelated;
  // The heart sits beside the link (a button can't live inside a link).
  return (
    <div className="likeable">
      {withRelated}
      <HeartButton type={target[0]} id={target[1]} liked={like.liked} signedIn={like.signedIn} className="card-heart" />
    </div>
  );
}

/** News page card (Reddit-style): tags · time, … menu, content, action bar under it. */
function SocialFeedCard({ item, now, value, social }: { item: FeedItem; now: Date; value?: number; social: { engagement: Engagement; signedIn: boolean } }) {
  const target = likeTarget(item.href);
  if (!target || target[0] === 'post' || target[0] === 'blog') return null;
  const [type, id] = target as ['news' | 'tender', string];
  const t = getTSync();
  const e = social.engagement;
  return (
    <article className={`feed-item ${item.kind} social-card`} data-card>
      <div className="feed-body">
        <div className="feed-meta cc-meta">
          <span className={`feed-kind ${item.kind}`}>{t(item.kindLabel)}</span>
          <span className={`tag ${item.category}`}>{t(item.categoryLabel)}</span>
          {item.isNew && <span className="tag new">{t('New')}</span>}
          {item.country && <span className="feed-meta-text">{item.country}</span>}
          <span className="cc-dot">·</span>
          <span className="cc-time" title={item.at.toLocaleString(getLocale())}>{timeAgo(t, item.at, now)}</span>
        </div>
        <Link href={item.href} className="cc-link">
          <div className="feed-title">{item.headline}</div>
          {item.image && <NewsImage src={item.image} />}
          {item.body && <p className="feed-summary">{item.body}</p>}
          {item.deadline && <Deadline deadline={item.deadline} now={now} />}
        </Link>
        <Related item={item} />
        <CardActions type={type} id={id} href={item.href} title={item.headline} signedIn={social.signedIn}
          likes={e.likes} liked={e.liked} comments={e.comments} reposts={e.reposts} reposted={e.reposted} />
      </div>
      <CardMenu type={type} id={id} signedIn={social.signedIn} />
    </article>
  );
}
