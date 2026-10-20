import { redirect } from 'next/navigation';
import AuthCard from '@/components/auth/AuthCard';
import { SignupForm } from '@/components/auth/AuthForms';
import { getCurrentUser, safeNext } from '@/lib/auth';
import { getT } from '@/lib/i18n/server';
import { NOINDEX } from '@/lib/seo';

export async function generateMetadata() {
  const t = await getT();
  return { title: `${t('Sign up')} — Tender Town`, ...NOINDEX };
}

export default async function SignupPage({ searchParams }: { searchParams: { next?: string } }) {
  const next = safeNext(searchParams.next);
  if (await getCurrentUser()) redirect(next);
  const t = await getT();
  return (
    <AuthCard title={t('Sign up')} sub={t('An AI bidding workforce that finds the best tenders and handles the analysis and the paperwork.')}>
      <SignupForm next={next} />
    </AuthCard>
  );
}
