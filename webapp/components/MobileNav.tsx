'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { LINKS, isActive } from './SideNav';
import { useT } from '@/lib/i18n/client';
import { scopeQuery, withPublicScope } from '@/lib/guestScope';

const SCOPED = new Set(['/', '/tenders', '/news', '/news/signals']);

const setMenu = (open: boolean) => {
  document.documentElement.toggleAttribute('data-menu-open', open);
};

/** Phones: the top bar's menu button — opens the sidebar (Following, Working Agents, account) as a drawer. */
export function MenuButton() {
  const t = useT();
  const path = usePathname();
  useEffect(() => setMenu(false), [path]);  // close on navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <button type="button" className="menu-button" aria-label={t('Open menu: sources, agents and account')}
      onClick={() => setMenu(!document.documentElement.hasAttribute('data-menu-open'))}>
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 6h14M3 10h14M3 14h14" /></svg>
    </button>
  );
}

/** Tap outside the drawer to close it. */
export function MenuBackdrop() {
  return <div className="menu-backdrop" onClick={() => setMenu(false)} aria-hidden="true" />;
}

/** Phones: the app's sections as a bottom tab bar. Signals, Markets and Workspaces stay in the menu. */
const FOOTER_HREFS = ['/', '/tenders', '/news', '/history', '/community'];

export function BottomNavLinks({ guest = false, scope = null }: { guest?: boolean; scope?: string | null }) {
  const t = useT();
  const path = usePathname() || '/';
  const links = FOOTER_HREFS.flatMap((href) => {
    if (guest && href === '/history') return [];
    const link = LINKS.find((item) => item.href === href);
    return link ? [link] : [];
  });
  return (
    <nav className={`bottom-nav${guest ? ' guest' : ''}`} aria-label={t('Sections')}>
      {links.map((l) => {
        const active = isActive(l.href, path);
        const href = withPublicScope(l.href, SCOPED.has(l.href) ? scope ?? null : null);
        return (
          <Link key={l.href} href={href} className={`bottom-link ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}>
            <span className="bottom-icon"><svg viewBox="0 0 16 16" aria-hidden="true">{l.icon}</svg></span>
            <span className="bottom-label">{t(l.label)}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav({ guest = false }: { guest?: boolean }) {
  return <BottomNavLinks guest={guest} scope={scopeQuery(useSearchParams().get('scope'))} />;
}
