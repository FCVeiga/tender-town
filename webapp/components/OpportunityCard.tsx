import Link from 'next/link';
import { getLocale, getTSync } from '@/lib/i18n/server';
import { Opportunity, buyerOf, daysUntil, isNew, isUpdated, oppCategoryLabel, opportunityPath, titleOf } from '@/lib/data';
import { stageOf } from '@/lib/publication';

export function DeadlineText({ deadline, closed = false }: { deadline: string | null; closed?: boolean }) {
  const t = getTSync();
  if (!deadline) return <>{t('No deadline stated')}</>;
  const d = daysUntil(deadline);
  const date = new Date(deadline).toLocaleDateString(getLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <>
      {date}
      {!closed && d !== null && d >= 0 && (
        <span className={`countdown ${d <= 14 ? 'due-soon' : ''}`}>{d === 0 ? t('today') : t('{n}d left', { n: d })}</span>
      )}
    </>
  );
}

export function StatusTags({ o, archived = false }: { o: Opportunity; archived?: boolean }) {
  const t = getTSync();
  const stage = stageOf(o);
  const awarded = (o.status || '').toUpperCase() === 'AWARDED';
  return (
    <>
      {isNew(o) && <span className="tag new">{t('New')}</span>}
      {!isNew(o) && isUpdated(o) && stage !== 'closed' && <span className="tag updated">{t('Updated')}</span>}
      {o.opportunity_type && <span className={`tag ${o.opportunity_type}`}>{t(oppCategoryLabel(o.opportunity_type))}</span>}
      {awarded && <span className="tag">{t('Awarded')}</span>}
      {stage === 'closed' && !awarded && <span className="tag closed">{archived ? t('Archived') : t('Closed')}</span>}
      {stage === 'uncertain' && <span className="tag unverified">{t('Unverified')}</span>}
    </>
  );
}

export function ScoreBar({ label, value, kind }: { label: string; value: number | null; kind: 'rel' | 'fit' }) {
  return (
    <div className="mini-score">
      <div className="mini-score-label">{label}<span className="mini-score-val">{value ?? '—'}</span></div>
      <div className="mini-score-bar">
        <div className={`mini-score-fill ${kind}`} style={{ width: `${value ?? 0}%` }} />
      </div>
    </div>
  );
}

export default function OpportunityCard({ o }: { o: Opportunity }) {
  const t = getTSync();
  return (
    <Link href={opportunityPath(o)} className="opp-card">
      <div className="opp-card-top">
        <div className="opp-tags"><StatusTags o={o} /></div>
        {o.country && <span className="country-chip">{o.country}</span>}
      </div>
      <div className="opp-card-title">{titleOf(o)}</div>
      {buyerOf(o) && <div className="opp-card-authority">{buyerOf(o)}</div>}
      {o.summary && <div className="opp-card-summary">{o.summary}</div>}
      <div className="opp-card-scores">
        <ScoreBar label={t('Relevance')} value={o.opportunity_relevance_score} kind="rel" />
        <ScoreBar label={t('Fit')} value={o.bid_readiness_score} kind="fit" />
      </div>
      <div className="opp-card-foot">
        <span className="foot-label">{t('Deadline')}</span>
        <span className="opp-card-deadline"><DeadlineText deadline={o.deadline} /></span>
        <span className="opp-card-value">
          {o.estimated_value ? `${o.currency || ''} ${o.estimated_value.toLocaleString(getLocale())}` : t('Value n/d')}
        </span>
      </div>
    </Link>
  );
}
