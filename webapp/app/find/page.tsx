import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import FindRun from '@/components/FindRun';
import { getCurrentUser } from '@/lib/auth';
import { FIND_COOKIE } from '@/lib/guestScope';
import { parseFindBrief } from '@/lib/findTender';
import { getT } from '@/lib/i18n/server';
import { NOINDEX } from '@/lib/seo';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const t = await getT();
  return { title: `${t('Find a tender')} — Tender Town`, ...NOINDEX };
}

export default async function FindPage() {
  const t = await getT();
  if (!(await getCurrentUser())) redirect('/signup?next=/find');
  if (!parseFindBrief(cookies().get(FIND_COOKIE)?.value)) {
    return (
      <div className="detail-block">
        <h2>{t('Find a tender')}</h2>
        <p>{t('Tell the agent about your company first.')}</p>
      </div>
    );
  }
  return (
    <div className="detail-block">
      <FindRun />
    </div>
  );
}
