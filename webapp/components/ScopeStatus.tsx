'use client';

import Link from 'next/link';
import { useT } from '@/lib/i18n/client';
import type { CollectionKind } from '@/lib/scopeStatus';

const EMPTY: Record<'tenders' | 'news' | 'feed' | 'signals', string> = {
  tenders: 'No active tenders in {scopeName} right now.',
  news: 'No news in {scopeName} right now.',
  feed: 'Nothing in {scopeName} right now.',
  signals: 'No signals in {scopeName} right now.',
};

/** Collection status for the scope on screen. Browse opens the existing scope menu. */
export default function ScopeStatus({
  kind, scopeName, surface, signedIn,
}: {
  kind: Exclude<CollectionKind, 'loading' | 'ready' | 'stale'>;
  scopeName: string;
  surface: 'tenders' | 'news' | 'feed' | 'signals';
  signedIn: boolean;
}) {
  const t = useT();
  const name = t(scopeName);
  const headline = kind === 'pending'
    ? t('{scopeName} is preparing its first results.', { scopeName: name })
    : kind === 'failed'
      ? t('Results for {scopeName} could not be refreshed.', { scopeName: name })
      : t(EMPTY[surface], { scopeName: name });

  return (
    <div className={`callout ${kind === 'failed' ? 'error' : ''}`}>
      <strong>{headline}</strong>
      <button type="button" className="btn scope-browse" onClick={() => window.dispatchEvent(new Event('tt-open-scopes'))}>
        {t('Browse another scope')}
      </button>
      {kind === 'empty' && surface === 'tenders' && signedIn && (
        <span className="scope-collected">
          {t('Closed tenders are in')} <Link href="/history">{t('History')}</Link>.
        </span>
      )}
    </div>
  );
}
