'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useT } from '@/lib/i18n/client';
import { scopeQuery, withPublicScope } from '@/lib/guestScope';

const SCOPED = new Set(['/', '/tenders', '/news']);

export const LINKS = [
  { href: '/', label: 'Home', icon: <path d="M2.5 7.2 8 2.5l5.5 4.7V13a.5.5 0 0 1-.5.5H9.6V9.8H6.4v3.7H3a.5.5 0 0 1-.5-.5z" /> },
  { href: '/community', label: 'Community', icon: <><circle cx="5.5" cy="6" r="2.2" /><circle cx="11" cy="6.5" r="1.8" /><path d="M1.8 13c.4-2.3 1.9-3.6 3.7-3.6s3.3 1.3 3.7 3.6M9.4 9.7c.5-.3 1-.4 1.6-.4 1.5 0 2.7 1.1 3 3" /></> },
  { href: '/tenders', label: 'Tenders', icon: <><rect x="2" y="4.5" width="12" height="9" rx="1.5" /><path d="M5.5 4.5V3.2c0-.4.3-.7.7-.7h3.6c.4 0 .7.3.7.7v1.3M2 8.5h12" /></> },
  { href: '/news', label: 'News', icon: <><rect x="2.5" y="2.5" width="11" height="11" rx="1.5" /><path d="M5 5.5h6M5 8h6M5 10.5h3.5" /></> },
  { href: '/history', label: 'History', icon: <><ellipse cx="8" cy="4" rx="5" ry="1.8" /><path d="M3 4v8c0 1 2.2 1.8 5 1.8s5-.8 5-1.8V4M3 8c0 1 2.2 1.8 5 1.8s5-.8 5-1.8" /></> },
  { href: '/workspaces', label: 'Workspaces', icon: <><circle cx="8" cy="8" r="2.2" /><path d="M8 1.8v1.6M8 12.6v1.6M14.2 8h-1.6M3.4 8H1.8M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1M12.4 12.4l-1.1-1.1M4.7 4.7 3.6 3.6" /><circle cx="8" cy="8" r="4.6" /></> },
];

export const isActive = (href: string, path: string) => (href === '/' ? path === '/' : path === href || path.startsWith(href + '/'));

const GUEST = new Set(['/', '/community', '/tenders', '/news']);

export function ScopedHomeLink({ label, children }: { label: string; children: React.ReactNode }) {
  const scope = scopeQuery(useSearchParams().get('scope'));
  return <Link href={withPublicScope('/', scope)} className="brand" aria-label={label}>{children}</Link>;
}

export function SideNavLinks({ guest = false, scope = null }: { guest?: boolean; scope?: string | null }) {
  const t = useT();
  const path = usePathname() || '/';
  const links = guest ? LINKS.filter((l) => GUEST.has(l.href)) : LINKS;
  return (
    <nav className="side-nav" aria-label={t('Sections')}>
      {links.map((l) => {
        const active = isActive(l.href, path);
        const href = withPublicScope(l.href, SCOPED.has(l.href) ? scope ?? null : null);
        return (
          <Link key={l.href} href={href} className={`side-link ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}>
            <svg viewBox="0 0 16 16" aria-hidden="true">{l.icon}</svg>
            {t(l.label)}
          </Link>
        );
      })}
    </nav>
  );
}

export default function SideNav({ guest = false }: { guest?: boolean }) {
  return <SideNavLinks guest={guest} scope={scopeQuery(useSearchParams().get('scope'))} />;
}
