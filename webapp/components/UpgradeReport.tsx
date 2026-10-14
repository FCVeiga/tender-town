'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useT } from '@/lib/i18n/client';

/** What the agent does, then the way in: an account when signed out, the plan when it is missing. */
export function UpgradeReport({ note, title, signedIn = true, actionLabel }: { note?: string; title?: string; signedIn?: boolean; actionLabel?: string }) {
  const t = useT();
  const path = usePathname();
  return (
    <div className="profile-empty">
      {note && <p className="agent-intro">{note}</p>}
      {signedIn ? (
        <>
          <p className="profile-empty-title">{t(title || 'Upgrade Plan to See Agent Report')}</p>
          <Link href="/settings/account?plan=1" className="btn primary profile-empty-cta">{t(actionLabel || 'Upgrade plan')}</Link>
        </>
      ) : (
        <>
          <p className="profile-empty-title">{t(title || 'Create an account to see this')}</p>
          <Link href={`/signup?next=${encodeURIComponent(path || '/')}`} className="btn primary profile-empty-cta">{t(actionLabel || 'Create an account')}</Link>
        </>
      )}
    </div>
  );
}
