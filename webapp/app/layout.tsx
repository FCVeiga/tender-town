import './globals.css';
import { Suspense } from 'react';
import Link from 'next/link';
import { Nunito, JetBrains_Mono } from 'next/font/google';
import SearchBox from '@/components/SearchBox';
import SideNav from '@/components/SideNav';
import SourcesSidebar from '@/components/SourcesSidebar';
import WorkingAgents from '@/components/WorkingAgents';
import GuestPromo from '@/components/auth/GuestPromo';
import GuestScopeHint from '@/components/auth/GuestScopeHint';
import { getPlatformLanguage } from '@/lib/language';
import { getCurrentUser, siteOrigin } from '@/lib/auth';
import { I18nProvider } from '@/lib/i18n/client';
import { getLang, getT, getTheme, messagesFor } from '@/lib/i18n/server';
import BrandLogo from '@/components/BrandLogo';
import WorkspaceSwitcher from '@/components/WorkspaceSwitcher';
import UserMenu, { type WorkspaceItem } from '@/components/auth/UserMenu';
import GuestMenu from '@/components/auth/GuestMenu';
import { getContext, getMyWorkspaces } from '@/lib/accounts';
import NavActions from '@/components/social/NavActions';
import UserAvatar from '@/components/UserAvatar';
import { logOut } from '@/app/auth/actions';
import { BottomNav, MenuBackdrop, MenuButton } from '@/components/MobileNav';
import { isSuperAdmin } from '@/lib/admin';

// Every page reads live from Supabase. Without this, Next prerenders pages
// with no searchParams at build time and serves that frozen snapshot forever.
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const sans = Nunito({ subsets: ['latin', 'latin-ext'], variable: '--font-sans', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

// viewport-fit=cover: the layout pads itself for the notch and home indicator.
export const viewport = {
  width: 'device-width', initialScale: 1, viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
};

export async function generateMetadata() {
  const t = await getT();
  const description = t('Public tenders, funding and market news across Europe — and a community of the people who bid on them.');
  return {
    metadataBase: new URL(siteOrigin()),
    title: { default: 'Tender Town', template: '%s' },
    description,
    alternates: { types: { 'application/rss+xml': `${siteOrigin()}/feed.xml` } },
    openGraph: { siteName: 'Tender Town', type: 'website', description },
    twitter: { card: 'summary' },
    icons: {
      icon: [
        { url: '/brand/favicon.png', media: '(prefers-color-scheme: light)', type: 'image/png' },
        { url: '/brand/favicon-white.png', media: '(prefers-color-scheme: dark)', type: 'image/png' },
      ],
      apple: '/brand/favicon.png',
    },
  };
}

// Reddit-style shell: fixed navbar, fixed left sidebar (sections + followed
// workspaces); pages render in the remaining area.
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [, user] = await Promise.all([getPlatformLanguage(), getCurrentUser()]);
  const uiLang = getLang();
  const theme = getTheme();
  const t = await getT();
  const [mine, ctx, dashboard] = user
    ? [...await Promise.all([getMyWorkspaces(), getContext()]), await isSuperAdmin()] as const
    : [[], null, false] as const;
  const workspaces: WorkspaceItem[] = mine.map((m) => ({ id: m.workspace.id, name: m.workspace.name, sharedBy: m.workspace.ownerId === user?.id ? null : m.owner.username }));
  return (
    <html lang={uiLang} data-theme={theme} className={`${sans.variable} ${mono.variable}`}>
      <body>
        <I18nProvider lang={uiLang} messages={messagesFor(uiLang)}>
        <header className="topbar">
          <Link href="/" className="brand" aria-label={t('Tender Town home')}>
            <BrandLogo />
          </Link>
          <Suspense fallback={<div className="search-box" />}><SearchBox /></Suspense>
          {user && <NavActions />}
          <div className={user ? 'auth-buttons' : 'auth-buttons guest'}>
            {user ? <UserMenu user={{ username: user.username, displayName: user.displayName, avatarUrl: user.avatarUrl }} workspaces={workspaces} currentWorkspace={ctx?.workspace.id ?? null} dashboard={dashboard} /> : (
              <>
                <Link href="/login" className="btn">{t('Log in')}</Link>
                <Link href="/signup" className="btn primary">{t('Sign up')}</Link>
                <GuestMenu />
              </>
            )}
          </div>
          <MenuButton />
        </header>
        <div className="shell">
          <MenuBackdrop />
          <aside className={user ? 'sidebar' : 'sidebar guest'} aria-label={t('Sources and agents')}>
            {ctx && <WorkspaceSwitcher activeId={ctx.workspace.id} workspaces={mine.map((m) => ({
              id: m.workspace.id, name: m.workspace.name, role: m.role, sharedBy: m.workspace.ownerId === user?.id ? null : m.owner.username,
            }))} />}
            <SideNav guest={!user} />
            {!user && <GuestScopeHint />}
            {!user && (
              <nav className="sidebar-site-links" aria-label={t('More')}>
                <Link href="/about">{t('About')}</Link>
                <Link href="/blog">{t('Blog')}</Link>
                <Link href="/pricing">{t('Pricing')}</Link>
              </nav>
            )}
            {user ? (
              <>
            <div className="sidebar-rule" />
            <SourcesSidebar />
            <div className="sidebar-rule" />
            <WorkingAgents />
              <div className="sidebar-user">
                <Link href={`/u/${user.username}`} className="sidebar-user-card">
                  <UserAvatar name={user.username} src={user.avatarUrl} size={40} />
                  <span><strong>{user.displayName}</strong><em>u/{user.username}</em></span>
                </Link>
                <nav className="sidebar-user-links">
                  {dashboard && <Link href="/dashboard">{t('Dashboard')}</Link>}
                  <Link href="/posts/new">{t('New post')}</Link><Link href="/notifications">{t('Notifications')}</Link><Link href="/chat">{t('Chat')}</Link><Link href="/workspaces">{t('Workspaces')}</Link><Link href="/settings">{t('Settings')}</Link>
                  <Link href="/help">{t('Help')}</Link><Link href="/about">{t('About')}</Link><Link href="/blog">{t('Blog')}</Link><Link href="/pricing">{t('Pricing')}</Link><Link href="/terms">{t('Terms & Conditions')}</Link><Link href="/privacy">{t('Privacy policy')}</Link>
                </nav>
                <form action={logOut}><button type="submit" className="btn">{t('Log out')}</button></form>
              </div>
              </>
            ) : (
              <GuestPromo />
            )}
          </aside>
          <main className="content">{children}</main>
        </div>
        <BottomNav guest={!user} />
        </I18nProvider>
      </body>
    </html>
  );
}
