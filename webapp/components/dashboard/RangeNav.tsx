import DashLink from '@/components/dashboard/DashLink';
import { RANGES, type RangeKey } from '@/lib/analytics';

/** The timeframe row. Choosing one stays at the current scroll position. */
export default function RangeNav({ range, hrefFor, label, names }: {
  range: RangeKey;
  hrefFor: (key: RangeKey) => string;
  label: string;
  names: Record<RangeKey, string>;
}) {
  return (
    <nav className="feed-sort" aria-label={label}>
      {RANGES.map((item) => (
        <DashLink key={item.key} href={hrefFor(item.key)} className={`feed-sort-link ${item.key === range ? 'active' : ''}`} current={item.key === range}>
          {names[item.key]}
        </DashLink>
      ))}
    </nav>
  );
}
