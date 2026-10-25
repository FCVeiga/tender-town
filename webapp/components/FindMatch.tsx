'use client';

import Link from 'next/link';
import { useT } from '@/lib/i18n/client';
import type { FindMatch } from '@/lib/findTender';

const flagCode = (c: string | null) => (!c ? 'eu' : c.toUpperCase() === 'UK' ? 'gb' : c.toLowerCase());

function Ring({ value, label, gradient }: { value: number | null; label: string; gradient: string }) {
  const t = useT();
  const r = 24;
  const c = 2 * Math.PI * r;
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

/** The tender row from the tenders list, as the result of the company search. */
export default function FindMatchCard({ match, onOpen }: { match: FindMatch; onOpen?: () => void }) {
  const t = useT();
  const urgent = match.days != null && match.days <= 14;
  return (
    <div className="opp-rows find-match">
      <svg width="0" height="0" className="sr-only" aria-hidden="true">
        <defs>
          <linearGradient id="grad-find-rel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#00CCFF" /><stop offset="1" stopColor="#00FFCC" /></linearGradient>
          <linearGradient id="grad-find-fit" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#6D5BFF" /><stop offset="1" stopColor="#00CCFF" /></linearGradient>
        </defs>
      </svg>
      <Link href={match.href} className={`opp-row${match.fresh ? ` fresh fresh-${match.fresh}` : ''}`} onClick={onOpen}>
        {match.fresh && <span className="fresh-tag">{t(match.fresh === 'new' ? 'New' : 'Updated')}</span>}
        <div className="opp-where">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="flag" src={`https://flagcdn.com/${flagCode(match.countryCode)}.svg`} alt="" width={44} height={33} />
          <span className="opp-country">{match.countryName ?? (match.countryCode || t('EU / Intl'))}</span>
        </div>
        <div className="opp-main">
          <div className="opp-tags">
            {match.typeLabel && match.typeSlug && <span className={`tag ${match.typeSlug}`}>{t(match.typeLabel)}</span>}
            {match.durationMonths ? <span className="opp-chip">{match.durationMonths >= 24 ? t('{n} years', { n: +(match.durationMonths / 12).toFixed(1) }) : t('{n} months', { n: match.durationMonths })}</span> : null}
          </div>
          <h2 className="opp-title">{match.title}</h2>
          {match.summary && <p className="opp-desc">{match.summary}</p>}
          {match.buyer && <p className="opp-buyer"><span>{t('Buyer')}</span>{match.buyer}</p>}
        </div>
        <div className="opp-metrics">
          <Ring value={match.relevance} label={t('Relevance')} gradient="grad-find-rel" />
          <Ring value={match.fit} label={t('Fit')} gradient="grad-find-fit" />
          <div className="metric value">
            <span className={`metric-big ${match.value ? 'shine' : 'muted'}`}>{match.value ?? t('n/d')}</span>
            <span className="metric-label">{t('Value')}</span>
          </div>
          <div className={`metric deadline ${urgent ? 'urgent' : ''}`}>
            {match.days != null ? (
              <>
                <span className={`metric-big ${urgent ? 'shine-warm' : 'shine-ink'}`}>{match.days <= 0 ? t('Today') : t('{n}d', { n: match.days })}</span>
                <span className="metric-label">{match.deadlineLabel}</span>
              </>
            ) : (
              <>
                <span className="metric-big muted">{t('Open')}</span>
                <span className="metric-label">{t('No deadline')}</span>
              </>
            )}
          </div>
        </div>
      </Link>
    </div>
  );
}
