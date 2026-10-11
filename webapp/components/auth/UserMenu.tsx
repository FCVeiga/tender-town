'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import UserAvatar from '@/components/UserAvatar';
import { logOut } from '@/app/auth/actions';
import { switchWorkspace } from '@/app/workspaces/actions';
import { useT } from '@/lib/i18n/client';

export type WorkspaceItem = { id: string; name: string; sharedBy: string | null };

const ITEMS = [
  { href: 'profile', label: 'Profile', icon: <><circle cx="8" cy="5.5" r="2.8" /><path d="M2.8 14c.6-2.8 2.7-4.4 5.2-4.4s4.6 1.6 5.2 4.4" /></> },
  { href: '/notifications', label: 'Notifications', icon: <path d="M8 2.3a3.7 3.7 0 0 0-3.7 3.7v2.2L3.2 10.4h9.6l-1.1-2.2V6A3.7 3.7 0 0 0 8 2.3zM6.6 12.5a1.5 1.5 0 0 0 2.8 0" /> },
  { href: '/workspaces', label: 'Workspaces', icon: <><rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" /><rect x="9" y="2.5" width="4.5" height="4.5" rx="1" /><rect x="2.5" y="9" width="4.5" height="4.5" rx="1" /><rect x="9" y="9" width="4.5" height="4.5" rx="1" /></> },
  { href: '/settings', label: 'Settings', icon: <><circle cx="8" cy="8" r="2.2" /><path d="M8 1.8v1.6M8 12.6v1.6M14.2 8h-1.6M3.4 8H1.8M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1M12.4 12.4l-1.1-1.1M4.7 4.7 3.6 3.6" /></> },
  { href: '/help', label: 'Help', icon: <><circle cx="8" cy="8" r="6" /><path d="M6.3 6.3a1.8 1.8 0 1 1 2.5 1.6c-.5.3-.8.6-.8 1.2M8 11.3v.01" /></> },
  { href: '/about', label: 'About', icon: <><circle cx="8" cy="8" r="6" /><path d="M8 7.2V11.2M8 5.1v.01" /></> },
  { href: '/blog', label: 'Blog', icon: <><path d="M4 2.5h5.5L12 5v8.5H4z" /><path d="M9.5 2.5V5H12M6 8h4M6 10.5h3" /></> },
  { href: '/pricing', label: 'Pricing', icon: <><path d="m8.2 2.2 5.6 5.6-5.6 5.6L2.6 7.8V2.2z" /><circle cx="6.2" cy="5.2" r=".9" /></> },
  { href: '/terms', label: 'Terms & Conditions', icon: <><path d="M4 2.5h5.5L12 5v8.5H4z" /><path d="M9.5 2.5V5H12M6 8h4M6 10.5h4" /></> },
  { href: '/privacy', label: 'Privacy policy', icon: <><path d="M8 2 3 4v4c0 3 2.2 5.2 5 6 2.8-.8 5-3 5-6V4z" /><path d="m6 8 1.5 1.5L10.5 6.5" /></> },
];

/** Navbar: the signed-in user's picture, opening their account menu. */
export default function UserMenu({ user, workspaces = [], currentWorkspace, dashboard = false }: {
  user: { username: string; displayName: string; avatarUrl: string | null }; workspaces?: WorkspaceItem[]; currentWorkspace?: string | null; dashboard?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className="user-menu" ref={box}>
      <button type="button" className="user-menu-button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}
        aria-label={t('Account menu for {name}', { name: user.displayName })} title={user.displayName}>
        <UserAvatar name={user.username} src={user.avatarUrl} size={34} />
      </button>
      {open && (
        <div className="user-menu-list" role="menu">
          <div className="user-menu-who">
            <UserAvatar name={user.username} src={user.avatarUrl} size={36} />
            <div><strong>{user.displayName}</strong><span>u/{user.username}</span></div>
          </div>
          {workspaces.length > 0 && (
            <div className="ws-switch" role="group" aria-label={t('Workspaces')}>
              <div className="ws-switch-title">{t('Workspaces')}</div>
              {workspaces.map((w) => (
                <form key={w.id} action={switchWorkspace.bind(null, w.id, path || '/')}>
                  <button type="submit" role="menuitemradio" aria-checked={w.id === currentWorkspace} className={`user-menu-item ws-item ${w.id === currentWorkspace ? 'on' : ''}`}>
                    <span className="ws-check" aria-hidden="true">{w.id === currentWorkspace ? '✓' : ''}</span>{w.name}
                    {w.sharedBy && <span className="ws-owner">u/{w.sharedBy}</span>}
                  </button>
                </form>
              ))}
              <Link href="/workspaces?new=1" className="user-menu-item ws-new">+ {t('New workspace')}</Link>
            </div>
          )}
          {dashboard && (
            <Link role="menuitem" href="/dashboard" className="user-menu-item">
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 9.5V13h3.5V9.5zM6.2 3v10H9.8V3zM10.5 6.2V13H14V6.2z" /></svg>{t('Dashboard')}
            </Link>
          )}
          {ITEMS.map((i) => (
            <Link key={i.href} role="menuitem" href={i.href === 'profile' ? `/u/${user.username}` : i.href} className="user-menu-item">
              <svg viewBox="0 0 16 16" aria-hidden="true">{i.icon}</svg>{t(i.label)}
            </Link>
          ))}
          <form action={logOut}>
            <button type="submit" role="menuitem" className="user-menu-item danger">
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 2.5H3.5v11H6M10 5l3 3-3 3M13 8H6.5" /></svg>{t('Log out')}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
