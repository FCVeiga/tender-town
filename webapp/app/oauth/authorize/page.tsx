import { redirect } from 'next/navigation';
import AuthCard from '@/components/auth/AuthCard';
import { getCurrentUser, siteOrigin } from '@/lib/auth';
import { getT } from '@/lib/i18n/server';
import { denyRedirect, resolveAuthorize } from '@/lib/oauth';
import { allowOauth } from '@/app/oauth/actions';
import { NOINDEX } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const t = await getT();
  return { title: `${t('Allow this app')} — Tender Town`, ...NOINDEX };
}

function queryFrom(searchParams: Record<string, string | string[] | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === 'string') query.set(key, value);
  }
  return query;
}

export default async function AuthorizePage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const t = await getT();
  const query = queryFrom(searchParams);
  const origin = siteOrigin();
  const checked = await resolveAuthorize(origin, query);
  if (!checked.ok) {
    if ('redirect' in checked && checked.redirect) redirect(checked.redirect);
    return (
      <AuthCard title={t('Allow this app')}>
        <p className="muted">{t('This connection request is not valid.')}</p>
      </AuthCard>
    );
  }
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/oauth/authorize?${query.toString()}`)}`);
  const name = checked.client.clientName || t('This app');
  return (
    <AuthCard title={t('Allow this app')} sub={t('{name} wants to use your Tender Town account. It can search the public index, and it can use your workspaces, scopes and agents within your plan.', { name })}>
      <form action={allowOauth} className="auth-form">
        <input type="hidden" name="request" value={query.toString()} />
        <button type="submit" className="btn primary auth-submit">{t('Allow')}</button>
      </form>
      <p className="auth-switch"><a href={denyRedirect(origin, checked.client)}>{t('Cancel')}</a></p>
    </AuthCard>
  );
}
