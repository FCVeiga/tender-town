'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useT } from '@/lib/i18n/client';

/** The way in: log in when signed out, the plan when it is missing. `buttonOnly` skips the lines above the button. */
export function UpgradeReport({ note, title, signedIn = true, actionLabel, buttonOnly = false, loginHref }: {
  note?: string; title?: string; signedIn?: boolean; actionLabel?: string; buttonOnly?: boolean; loginHref?: string;
}) {
  const t = useT();
  const path = usePathname();
  const showTitle = !buttonOnly && !note;
  if (buttonOnly) {
    return (
      <div className="eval-run">
        {signedIn ? (
          <Link href="/settings/account?plan=1" className="btn primary">{t(actionLabel || 'Upgrade plan')}</Link>
        ) : (
          <Link href={loginHref || `/signup?next=${encodeURIComponent(path || '/')}`} className="btn primary" data-track="signup_cta_clicked" data-placement="gate" data-cta="signup">{t(actionLabel || 'Create an account')}</Link>
        )}
      </div>
    );
  }
  return (
    <div className="profile-empty">
      {!buttonOnly && note && <p className="agent-intro">{note}</p>}
      {signedIn ? (
        <>
          {showTitle && <p className="profile-empty-title">{t(title || 'Upgrade Plan to See Agent Report')}</p>}
          <Link href="/settings/account?plan=1" className="btn primary profile-empty-cta">{t(actionLabel || 'Upgrade plan')}</Link>
        </>
      ) : (
        <>
          {showTitle && <p className="profile-empty-title">{t(title || 'Create an account to see this')}</p>}
          <Link href={loginHref || `/signup?next=${encodeURIComponent(path || '/')}`} className="btn primary profile-empty-cta" data-track="signup_cta_clicked" data-placement="gate" data-cta="signup">{t(actionLabel || 'Create an account')}</Link>
        </>
      )}
    </div>
  );
}
