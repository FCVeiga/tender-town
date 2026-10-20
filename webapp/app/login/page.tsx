import { redirect } from 'next/navigation';
import AuthCard from '@/components/auth/AuthCard';
import { LoginForm } from '@/components/auth/AuthForms';
import { getCurrentUser, safeNext } from '@/lib/auth';
import { getT } from '@/lib/i18n/server';
import { NOINDEX } from '@/lib/seo';

export async function generateMetadata() {
  const t = await getT();
  return { title: `${t('Log in')} — Tender Town`, ...NOINDEX };
}

export default async function LoginPage({ searchParams }: { searchParams: { next?: string; error?: string } }) {
  const next = safeNext(searchParams.next);
  if (await getCurrentUser()) redirect(next);
  const t = await getT();
  return (
    <AuthCard title={t('Log in')} sub={t('Your tenders, evaluations and proposal briefs.')}>
      <LoginForm next={next} error={searchParams.error} />
    </AuthCard>
  );
}
