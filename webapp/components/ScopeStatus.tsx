'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useLocale, useT } from '@/lib/i18n/client';
import type { CollectionKind } from '@/lib/scopeStatus';

const EMPTY: Record<'tenders' | 'news' | 'feed' | 'signals', string> = {
  tenders: 'No active tenders in {scopeName} right now.',
  news: 'No news in {scopeName} right now.',
  feed: 'Nothing in {scopeName} right now.',
  signals: 'No signals in {scopeName} right now.',
};

const CHECKED: Record<'tenders' | 'news' | 'feed' | 'signals', string> = {
  tenders: 'Tenders last checked {time}.',
  news: 'News last checked {time}.',
  feed: 'Tenders and news last checked {time}.',
  signals: 'Signals last checked {time}.',
};

/**
 * One clock for every page. The absolute time is formatted only in `timeZone`,
 * which must be the visitor's zone. Without it, only the relative time is shown,
 * so the server never stamps its own zone into the page.
 */
export function formatChecked(
  iso: string | null,
  locale: string,
  t: (key: string, vars?: Record<string, string | number>) => string,
  now = Date.now(),
  timeZone: string | null = null,
) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const abs = timeZone
    ? new Intl.DateTimeFormat(locale, {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      timeZone, timeZoneName: 'short',
    }).format(date)
    : '';
  const mins = Math.round((now - date.getTime()) / 60000);
  const rel = mins < 1 ? t('just now')
    : mins < 60 ? t('{n}m ago', { n: mins })
    : mins < 60 * 24 ? t('{n}h ago', { n: Math.round(mins / 60) })
    : mins < 60 * 24 * 14 ? t('{n}d ago', { n: Math.round(mins / (60 * 24)) })
    : '';
  if (abs && rel) return `${rel} (${abs})`;
  return abs || rel || null;
}

/** When this surface's results were last successfully checked. */
export function CheckedLine({ iso, surface }: { iso: string | null; surface: keyof typeof CHECKED }) {
  const t = useT();
  const locale = useLocale();
  const [timeZone, setTimeZone] = useState<string | null>(null);
  useEffect(() => {
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || null);
  }, []);
  const when = formatChecked(iso, locale, t, Date.now(), timeZone);
  if (!when) return null;
  return <span className="scope-collected">{t(CHECKED[surface], { time: when })}</span>;
}

/** Collection status for the scope on screen. Browse opens the existing scope menu. */
export default function ScopeStatus({
  kind, scopeName, lastSuccessAt, surface, signedIn,
}: {
  kind: Exclude<CollectionKind, 'loading' | 'ready'>;
  scopeName: string;
  lastSuccessAt: string | null;
  surface: 'tenders' | 'news' | 'feed' | 'signals';
  signedIn: boolean;
}) {
  const t = useT();
  const name = t(scopeName);
  const headline = kind === 'pending'
    ? t('{scopeName} is preparing its first results.', { scopeName: name })
    : kind === 'failed'
      ? t('Results for {scopeName} could not be refreshed.', { scopeName: name })
      : kind === 'stale'
        ? t('The latest refresh failed.')
        : t(EMPTY[surface], { scopeName: name });

  return (
    <div className={`callout ${kind === 'failed' || kind === 'stale' ? 'error' : ''}`}>
      <strong>{headline}</strong>
      <CheckedLine iso={lastSuccessAt} surface={surface} />
      {kind !== 'stale' && (
        <button type="button" className="btn scope-browse" onClick={() => window.dispatchEvent(new Event('tt-open-scopes'))}>
          {t('Browse another scope')}
        </button>
      )}
      {kind === 'empty' && surface === 'tenders' && signedIn && (
        <span className="scope-collected">
          {t('Closed tenders are in')} <Link href="/history">{t('History')}</Link>.
        </span>
      )}
    </div>
  );
}
