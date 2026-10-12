'use client';

import { useEffect, useRef, useState } from 'react';
import type { SourceActivity as Activity } from '@/lib/sourceMeta';
import SourceIcon from './SourceIcon';
import { useLocale, useT } from '@/lib/i18n/client';
import AgentLoader from '@/components/AgentLoader';

type T = ReturnType<typeof useT>;

const POLL_MS = 60_000;

function ago(t: T, locale: string, iso: string | null, now: number) {
  if (!iso) return '';
  const mins = Math.round((now - new Date(iso).getTime()) / 60000);
  if (mins < 1) return t('just now');
  if (mins < 60) return t('{n}m ago', { n: mins });
  const h = Math.round(mins / 60);
  if (h < 24) return t('{n}h ago', { n: h });
  const d = Math.round(h / 24);
  return d < 14 ? t('{n}d ago', { n: d }) : new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

// What kind of publisher a source is, for the wording below.
const PUBLISHER: Record<string, 'buyer' | 'media' | 'standards' | 'reddit' | 'social'> = {
  PROCUREMENT_PORTAL: 'buyer', FUNDING_PORTAL: 'buyer', EU_PROGRAMME: 'buyer', LSP: 'buyer', CONSORTIUM: 'buyer',
  GOVERNMENT: 'buyer', DIGITAL_AGENCY: 'buyer', IDENTITY_AUTHORITY: 'buyer', DEVELOPMENT_BANK: 'buyer',
  STANDARDS_BODY: 'standards', NEWS: 'media', INDUSTRY_SOURCE: 'media',
  SOCIAL_REDDIT: 'reddit', SOCIAL_TWITTER: 'social', SOCIAL_LINKEDIN: 'social',
};

/** "<source> <verb>: <title>" — the verb says what the item is (from triage)
 * and fits who published it: a portal *lists* a tender, a news site *reports* one. */
function verb(t: T, a: Activity) {
  const who = PUBLISHER[a.sources?.source_type ?? ''] ?? 'media';
  const own = who === 'buyer';
  switch (a.kind) {
    case 'TENDER': return own ? t('listed a tender') : t('reported a tender');
    case 'RFI': return own ? t('opened a market consultation') : t('reported a market consultation');
    case 'GRANT': case 'CONSORTIUM_CALL': case 'PILOT': return own ? t('announced a funding call') : t('reported a funding call');
    case 'PIPELINE_SIGNAL': return own ? t('announced a planned procurement') : t('reported a planned procurement');
  }
  if (who === 'reddit') {
    const h = a.sources?.handle;
    return h?.startsWith('r/') ? <>{t('posted in')} <span className="la-where">{h}</span></> : t('posted');
  }
  if (who === 'social') return t('posted');
  if (who === 'standards') return t('published an update');
  if (own) return t('published a news release');
  return t('published an article');
}

/** Moltbook-style live panel: latest activity of the scope on screen, polled every minute. */
export default function LiveActivity({ initial, scopeId }: { initial: Activity[]; scopeId: string | null }) {
  const t = useT();
  const locale = useLocale();
  const [items, setItems] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  // Phones and tablets show the panel above the feed, collapsed until tapped (desktop: always open).
  const [open, setOpen] = useState(false);
  const gen = useRef(0);
  const scope = useRef(scopeId);
  scope.current = scopeId;
  const first = useRef(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const onPending = () => {
      gen.current += 1;
      setItems([]);
      setLoading(true);
    };
    const onCancel = (event: Event) => {
      const id = String((event as CustomEvent).detail || '');
      if (!id || id === scope.current) return;
      setRetry((n) => n + 1);
    };
    window.addEventListener('tt-scope-pending', onPending);
    window.addEventListener('tt-scope-cancel', onCancel);
    return () => {
      window.removeEventListener('tt-scope-pending', onPending);
      window.removeEventListener('tt-scope-cancel', onCancel);
    };
  }, []);

  useEffect(() => {
    const mine = ++gen.current;
    const ctrl = new AbortController();
    if (!first.current) {
      setItems([]);
      setLoading(true);
    }
    first.current = false;
    const load = async () => {
      const id = scope.current;
      if (!id) {
        if (mine === gen.current) { setItems([]); setLoading(false); }
        return;
      }
      try {
        const res = await fetch(`/api/activity?scope=${encodeURIComponent(id)}`, { cache: 'no-store', signal: ctrl.signal });
        if (!res.ok || mine !== gen.current) return;
        const body = await res.json();
        if (body.scopeId !== scope.current || mine !== gen.current) return;
        if (body.pending) { setItems([]); setLoading(true); return; }
        setItems(body.activity || []);
        setLoading(false);
        setNow(Date.now());
      } catch (err) {
        if ((err as Error).name === 'AbortError' || mine !== gen.current) return;
        setLoading(false);
      }
    };
    load();
    const timer = setInterval(load, POLL_MS);
    return () => { ctrl.abort(); clearInterval(timer); };
  }, [scopeId, retry]);

  return (
    <div className={`live-panel ${open ? 'open' : ''}`}>
      <button type="button" className="live-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="live-title"><span className="live-pulse" />{t('Live activity')}</span>
        <svg className="live-chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5l3-3" /></svg>
      </button>
      <ul className="live-list">
        {loading && items.length === 0 && <li aria-busy="true"><AgentLoader compact /></li>}
        {!loading && items.length === 0 && <li className="side-empty">{t('No activity yet for this scope.')}</li>}
        {items.length > 0 && <li className="live-note">{t('Posts from sources this scope follows. Not scored results.')}</li>}
        {items.map((a) => (
          <li key={a.id} className="la-item">
            <SourceIcon type={a.sources?.source_type ?? 'NEWS'} size={26} />
            <div className="la-body">
              <p>
                <strong>{(a.sources?.name ?? t('Unknown source')).replace(/ — national procurement portal$/, ` ${t('portal')}`)}</strong>{' '}
                {verb(t, a)}:{' '}
                <a href={a.url ?? '#'} target="_blank" rel="noopener noreferrer" className="la-link"
                   title={a.title_en && a.title_en !== a.title ? t('Original: {title}', { title: a.title }) : undefined}>{a.title_en || a.title}</a>
              </p>
              <span className="la-time">{ago(t, locale, a.published_at, now)}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
