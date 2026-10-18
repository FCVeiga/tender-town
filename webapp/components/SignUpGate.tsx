import Link from 'next/link';
import { getT } from '@/lib/i18n/server';

/** Shown where a page's content would be, for someone who is not signed in. The title, nav and sidebar stay. */
export default async function SignUpGate() {
  const t = await getT();
  return (
    <div className="profile-empty">
      <p className="profile-empty-title">{t('Create an account to see this content')}</p>
      <Link href="/signup" className="btn primary profile-empty-cta" data-track="signup_cta_clicked" data-placement="gate" data-cta="signup">{t('Create account')}</Link>
    </div>
  );
}
