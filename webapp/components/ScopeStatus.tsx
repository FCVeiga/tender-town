'use client';

import Link from 'next/link';
import { useLocale, useT } from '@/lib/i18n/client';
import type { CollectionKind } from '@/lib/scopeStatus';

const EMPTY: Record<'tenders' | 'news' | 'feed' | 'signals', string> = {
  tenders: 'No active tenders in {scopeName} right now.',
  news: 'No news in {scopeName} right now.',
  feed: 'Nothing in {scopeName} right now.',
  signals: 'No signals in {scopeName} right now.',
};

function collected(iso: string | null, locale: string) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(locale, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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
  const locale = useLocale();
  const name = t(scopeName);
  const when = collected(lastSuccessAt, locale);
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
      {when && <span className="scope-collected">{t('Last collected {time}.', { time: when })}</span>}
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
