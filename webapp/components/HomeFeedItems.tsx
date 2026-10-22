import FeedCard from '@/components/FeedCard';
import OpportunityRow, { RingGradients } from '@/components/OpportunityRow';
import CommunityCard from '@/components/social/CommunityCard';
import type { EngagementMap } from '@/lib/engagement';
import type { FeedItem } from '@/lib/feed';
import type { PostCard } from '@/lib/community';
import { likeTarget } from '@/lib/likes';

export type HomeEntry =
  | { key: string; kind: 'item'; item: FeedItem }
  | { key: string; kind: 'post'; post: PostCard };

/** Home mixes the four sources, each in the card its own page uses. */
export default function HomeFeedItems({ entries, now, valueOf, countries, likes, newsEng, tenderEng, postEng }: {
  entries: HomeEntry[];
  now: Date;
  valueOf: (item: FeedItem) => number;
  countries: Map<string, string>;
  likes: { signedIn: boolean; liked: Set<string> };
  newsEng: EngagementMap;
  tenderEng: EngagementMap;
  postEng: EngagementMap;
}) {
  const tender = entries.some((entry) => entry.kind === 'item' && entry.item.event !== 'signal' && entry.item.opportunity);
  return (
    <>
      {tender && <RingGradients />}
      {entries.map((entry) => {
        if (entry.kind === 'post') {
          return <CommunityCard key={entry.key} post={entry.post} now={now} engagement={postEng.get(entry.post.id)} signedIn={postEng.signedIn} />;
        }
        const item = entry.item;
        if (item.event === 'signal') {
          const id = likeTarget(item.href)?.[1] ?? item.opportunityId ?? '';
          const card = { ...item, kind: 'news' as const, kindLabel: 'Planned procurement', category: 'signal', categoryLabel: 'Planned procurement', fresh: null };
          return <FeedCard key={entry.key} item={card} now={now} value={valueOf(item)} social={{ engagement: tenderEng.get(id), signedIn: tenderEng.signedIn }} />;
        }
        if (item.kind === 'news') {
          const id = item.newsId || likeTarget(item.href)?.[1] || '';
          return <FeedCard key={entry.key} item={item} now={now} value={valueOf(item)} social={{ engagement: newsEng.get(id), signedIn: newsEng.signedIn }} />;
        }
        if (item.opportunity) {
          return (
            <OpportunityRow key={entry.key} o={item.opportunity} title={item.opportunity.title}
              countryName={item.opportunity.country ? countries.get(item.opportunity.country) ?? null : null}
              like={{ liked: likes.liked.has(item.opportunity.opportunity_id), signedIn: likes.signedIn }} />
          );
        }
        return <FeedCard key={entry.key} item={item} now={now} value={valueOf(item)} />;
      })}
    </>
  );
}
