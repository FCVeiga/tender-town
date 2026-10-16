'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useT } from '@/lib/i18n/client';

export type TenderPanel = 'summary' | 'fit' | 'brief' | 'documents';

const HASH: Record<string, TenderPanel> = {
  summary: 'summary',
  requirements: 'fit',
  evaluation: 'fit',
  'proposal-brief': 'brief',
  documents: 'documents',
  history: 'summary',
  sources: 'summary',
};

function panelFromHash(hash: string): TenderPanel | null {
  return HASH[hash.replace(/^#/, '')] ?? null;
}

/** The tender page below the figures. One section shows at a time. Comments stay put. */
export default function TenderView({ documentCount, summary, fit, brief, documents, comments }: {
  documentCount: number;
  summary: ReactNode;
  fit: ReactNode;
  brief: ReactNode;
  documents: ReactNode;
  comments?: ReactNode;
}) {
  const t = useT();
  const [panel, setPanel] = useState<TenderPanel>('summary');

  useEffect(() => {
    const apply = () => {
      const next = panelFromHash(window.location.hash);
      if (next) setPanel(next);
    };
    apply();
    window.addEventListener('hashchange', apply);
    return () => window.removeEventListener('hashchange', apply);
  }, []);

  function select(next: TenderPanel, hash: string) {
    setPanel(next);
    const url = `${window.location.pathname}${window.location.search}#${hash}`;
    window.history.replaceState(null, '', url);
  }

  function onClick(event: React.MouseEvent) {
    const link = (event.target as HTMLElement).closest('a');
    const href = link?.getAttribute('href') || '';
    if (!href.startsWith('#')) return;
    const next = panelFromHash(href);
    if (!next) return;
    event.preventDefault();
    select(next, href.slice(1));
  }

  const tabs: { id: TenderPanel; hash: string; label: string }[] = [
    { id: 'summary', hash: 'summary', label: t('Summary') },
    { id: 'fit', hash: 'evaluation', label: t('Assess my fit') },
    { id: 'brief', hash: 'proposal-brief', label: t('Prepare a brief') },
    { id: 'documents', hash: 'documents', label: documentCount > 0 ? t('Documents ({n})', { n: documentCount }) : t('Documents') },
  ];

  return (
    <div onClick={onClick}>
      <nav className="tender-jump" aria-label={t('On this page')}>
        {tabs.map((tab) => (
          <button key={tab.id} type="button" className={panel === tab.id ? 'is-primary' : undefined} aria-pressed={panel === tab.id} onClick={() => select(tab.id, tab.hash)}>
            {tab.label}
          </button>
        ))}
      </nav>
      <div className="tender-sections">
        <div hidden={panel !== 'summary'}>{summary}</div>
        <div hidden={panel !== 'fit'}>{fit}</div>
        <div hidden={panel !== 'brief'}>{brief}</div>
        <div hidden={panel !== 'documents'}>{documents}</div>
        {comments}
      </div>
    </div>
  );
}
