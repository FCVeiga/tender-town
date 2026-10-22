import Link from 'next/link';
import HeartButton from './HeartButton';
import { Opportunity, buyerOf, cardFreshness, daysUntil, oppCategoryLabel, opportunityPath, titleOf } from '@/lib/data';
import { firstInLanguage } from '@/lib/english';
import { plainText } from '@/lib/plain';
import { publicText, stageOf } from '@/lib/publication';
import UpdateComment, { UpdateEvent } from './UpdateComment';
import { getLocale, getTSync } from '@/lib/i18n/server';

function money(value: number | null, currency: string | null) {
  if (!value) return null;
  const sym = currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : currency === 'USD' ? '$' : `${currency ?? ''} `;
  if (value >= 1e9) return `${sym}${(value / 1e9).toFixed(1).replace(/\.0$/, '')}B`;
  if (value >= 1e6) return `${sym}${(value / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (value >= 1e3) return `${sym}${Math.round(value / 1e3)}K`;
  return `${sym}${value}`;
}

/** flagcdn uses ISO 3166 codes (gb, not uk) and has an EU flag. */
const flagCode = (c: string | null) => (!c ? 'eu' : c.toUpperCase() === 'UK' ? 'gb' : c.toLowerCase());

export function Ring({ value, label, gradient }: { value: number | null; label: string; gradient: string }) {
  const t = getTSync();
  const r = 24, c = 2 * Math.PI * r;
  const v = value == null ? null : Math.max(0, Math.min(100, value));
  return (
    <div className="ring" title={`${label}: ${v ?? t('not scored yet')}`}>
      <svg viewBox="0 0 60 60" aria-hidden="true">
        <circle cx="30" cy="30" r={r} className="ring-track" />
        {v != null && (
          <circle cx="30" cy="30" r={r} className="ring-value" stroke={`url(#${gradient})`}
                  strokeDasharray={`${(v / 100) * c} ${c}`} transform="rotate(-90 30 30)" />
        )}
      </svg>
      <span className={`ring-num ${v == null ? 'empty' : ''}`}>{v ?? '—'}</span>
      <span className="metric-label">{label}</span>
    </div>
  );
}

/** Shared <defs> for the rings — render once per page. */
export function RingGradients() {
  return (
    <svg width="0" height="0" className="sr-only" aria-hidden="true">
      <defs>
        <linearGradient id="grad-rel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#00CCFF" /><stop offset="1" stopColor="#00FFCC" /></linearGradient>
        <linearGradient id="grad-fit" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#6D5BFF" /><stop offset="1" stopColor="#00CCFF" /></linearGradient>
      </defs>
    </svg>
  );
}

export default function OpportunityRow({ o, countryName, updates = [], like, archived = false, title }: {
  o: Opportunity; countryName: string | null; updates?: UpdateEvent[];
  like?: { liked: boolean; signedIn: boolean };
  archived?: boolean;
  title?: string;
}) {
  const days = daysUntil(o.deadline);
  const stage = stageOf(o);
  const value = money(o.estimated_value, o.currency);
  const description = publicText(plainText(firstInLanguage(o.summary) || ''));
  const buyer = buyerOf(o);
  const urgent = days != null && days <= 14;
  const fresh = stage === 'closed' || o.opportunity_type === 'signal' ? null : cardFreshness(o);
  const t = getTSync();

  const row = (
    <Link href={opportunityPath(o)} className={`opp-row${fresh ? ` fresh fresh-${fresh}` : ''}`}>
      {fresh && <span className="fresh-tag">{t(fresh === 'new' ? 'New' : 'Updated')}</span>}
      <div className="opp-where">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="flag" src={`https://flagcdn.com/${flagCode(o.country)}.svg`} alt="" width={44} height={33} loading="lazy" />
        <span className="opp-country">{countryName ?? (o.country || t('EU / Intl'))}</span>
      </div>

      <div className="opp-main">
        <div className="opp-tags">
          {o.status === 'AWARDED' && <span className="tag">{t('Awarded')}</span>}
          {stage === 'closed' && o.status !== 'AWARDED' && <span className="tag closed">{t('Closed')}</span>}
          {stage === 'uncertain' && <span className="tag unverified">{t('Unverified')}</span>}
          {o.opportunity_type && o.opportunity_type !== 'signal' && <span className={`tag ${o.opportunity_type}`}>{t(oppCategoryLabel(o.opportunity_type))}</span>}
          {o.duration_months ? <span className="opp-chip">{o.duration_months >= 24 ? t('{n} years', { n: +(o.duration_months / 12).toFixed(1) }) : t('{n} months', { n: o.duration_months })}</span> : null}
        </div>
        <h2 className="opp-title">{title || titleOf(o)}</h2>
        {description && <p className="opp-desc">{description}</p>}
        {buyer && <p className="opp-buyer" title={o.authority ?? ''}><span>{t('Buyer')}</span>{buyer}</p>}
      </div>

      <div className="opp-metrics">
        <Ring value={o.opportunity_relevance_score} label={t('Relevance')} gradient="grad-rel" />
        <Ring value={o.bid_readiness_score} label={t('Fit')} gradient="grad-fit" />
        <div className="metric value">
          <span className={`metric-big ${value ? 'shine' : 'muted'}`}>{value ?? t('n/d')}</span>
          <span className="metric-label">{t('Value')}</span>
        </div>
        <div className={`metric deadline ${urgent && stage !== 'closed' ? 'urgent' : ''}`}>
          {stage === 'closed' ? (
            <>
              <span className="metric-big muted">{o.status === 'AWARDED' ? t('Awarded') : t('Closed')}</span>
              <span className="metric-label">{o.deadline ? new Date(o.deadline).toLocaleDateString(getLocale(), { day: 'numeric', month: 'short', year: 'numeric' }) : o.status === 'AWARDED' ? '\u00a0' : t('No deadline')}</span>
            </>
          ) : days != null && days >= 0 ? (
            <>
              <span className={`metric-big ${urgent ? 'shine-warm' : 'shine-ink'}`}>{days <= 0 ? t('Today') : t('{n}d', { n: days })}</span>
              <span className="metric-label">{new Date(o.deadline!).toLocaleDateString(getLocale(), { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            </>
          ) : stage === 'uncertain' ? (
            <>
              <span className="metric-big muted">{t('Unverified')}</span>
              <span className="metric-label">{t('No deadline')}</span>
            </>
          ) : (
            <>
              <span className="metric-big muted">{stage === 'signal' ? t('Soon') : t('Open')}</span>
              <span className="metric-label">{t('No deadline')}</span>
            </>
          )}
        </div>
      </div>

      {updates.length > 0 && (
        <div className="opp-updates">
          <UpdateComment e={updates[0]} compact />
          {updates.length > 1 && <span className="uc-more">{updates.length > 2 ? t('+{n} earlier updates', { n: updates.length - 1 }) : t('+{n} earlier update', { n: updates.length - 1 })}</span>}
        </div>
      )}
    </Link>
  );
  if (!like) return row;
  return (
    <div className="likeable">
      {row}
      <HeartButton type="tender" id={o.opportunity_id} liked={like.liked} signedIn={like.signedIn} className="row-heart" />
    </div>
  );
}
