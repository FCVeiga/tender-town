import Link from 'next/link';
import { getTSync } from '@/lib/i18n/server';

export type Tab = { href: string; label: string; count?: number };

// 16px line icons, keyed by the tab's last path segment (same style as the home sort pills).
const ICONS: Record<string, JSX.Element> = {
  tenders: <><rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" /><rect x="9" y="2.5" width="4.5" height="4.5" rx="1" /><rect x="2.5" y="9" width="4.5" height="4.5" rx="1" /><rect x="9" y="9" width="4.5" height="4.5" rx="1" /></>,
  new: <><circle cx="8" cy="8" r="6" /><path d="M8 4.8V8l2.2 1.6" /></>,
  rfps: <><rect x="2" y="5" width="12" height="8.5" rx="1.5" /><path d="M5.5 5V3.6c0-.4.3-.7.7-.7h3.6c.4 0 .7.3.7.7V5M2 9h12" /></>,
  rfis: <><path d="M2.5 3.5h11v7.2H8.4L5.2 13v-2.3H2.5z" /><path d="M6.6 5.8a1.5 1.5 0 1 1 2 1.4c-.4.2-.6.5-.6.9M8 9.2v.01" /></>,
  grants: <><circle cx="8" cy="8" r="5.8" /><path d="M9.8 5.8a2.4 2.4 0 1 0 0 4.4M5.4 7.3h3.2M5.4 8.7h3.2" /></>,
  signals: <><circle cx="8" cy="9.5" r="1.2" /><path d="M5.3 6.8a3.8 3.8 0 0 1 5.4 0M3.2 4.7a6.8 6.8 0 0 1 9.6 0" /></>,
  news: <><rect x="2.5" y="2.5" width="11" height="11" rx="1.5" /><path d="M5 5.5h6M5 8h6M5 10.5h3.5" /></>,
  regulation: <><path d="M8 2.5v11M4.5 13.5h7M3 5h10" /><path d="M3 5 1.5 9a2 2 0 0 0 3 0zM13 5l-1.5 4a2 2 0 0 0 3 0z" /></>,
  industry: <><path d="M2 13.5V7l4 2.3V7l4 2.3V3.5h4v10z" /><path d="M5 11.5h1M8.5 11.5h1" /></>,
  market: <><path d="M2.5 13.5h11" /><rect x="3.5" y="8.5" width="2.2" height="5" rx=".5" /><rect x="6.9" y="5.5" width="2.2" height="8" rx=".5" /><rect x="10.3" y="2.8" width="2.2" height="10.7" rx=".5" /></>,
};

/** Section pills for Tenders and News, styled like the home feed's sort pills. */
export default function SectionTabs({ tabs, active }: { tabs: Tab[]; active: string }) {
  const tr = getTSync();
  return (
    <nav className="feed-sort section-tabs" aria-label={tr('Sections')}>
      {tabs.map((t) => {
        const icon = ICONS[t.href.split('?')[0].split('/').filter(Boolean).pop() ?? ''];
        const on = t.href === active;
        return (
          <Link key={t.href} href={t.href} className={`feed-sort-link ${on ? 'active' : ''}`} aria-current={on ? 'page' : undefined}>
            {icon && <svg className="feed-sort-icon" viewBox="0 0 16 16" aria-hidden="true">{icon}</svg>}
            {tr(t.label)}
            {t.count !== undefined && <span className="pill-count">{t.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
