import { cookies } from 'next/headers';
import { authClient, getCurrentUser, siteOrigin } from '@/lib/auth';
import { INTENT_COOKIE } from '@/lib/guestScope';
import ResumeScopeIntent from '@/components/ResumeScopeIntent';
import { getPersonalAccount, isPlatformAdmin } from '@/lib/accounts';
import { getSupabaseServerClient } from '@/lib/supabase';
import { PLANS } from '@/lib/plans';
import { billingReady } from '@/lib/billing';
import { listMcpTokens } from '@/lib/mcpTokens';
import AccountTab from '@/components/settings/tabs/AccountTab';

export default async function AccountSettings({ searchParams }: { searchParams: { plan?: string; billing?: string } }) {
  const user = (await getCurrentUser())!;
  const [{ data: { user: auth } }, account, admin, { data: profile }, tokens] = await Promise.all([
    authClient().auth.getUser(),
    getPersonalAccount(user.id),
    isPlatformAdmin(),
    getSupabaseServerClient().from('profiles').select('birthday, gender').eq('id', user.id).maybeSingle(),
    listMcpTokens(user.id),
  ]);
  const identities = auth?.identities || [];
  const google = identities.find((i: any) => i.provider === 'google');

  const intent = cookies().get(INTENT_COOKIE)?.value || '';
  return (
    <>
    <ResumeScopeIntent active={searchParams.billing === 'success' && (intent === 'create' || intent.startsWith('switch:'))} />
    <AccountTab
      userId={user.id} username={user.username} email={user.email}
      hasPassword={identities.some((i: any) => i.provider === 'email')}
      google={google ? ((google.identity_data as any)?.email ?? 'connected') : null}
      birthday={profile?.birthday ?? null} gender={profile?.gender ?? null}
      plan={{ key: account?.plan.key ?? 'free', status: account?.planStatus ?? 'active', periodEnd: account?.periodEnd ?? null, hasBilling: !!account?.stripeCustomerId }}
      plans={PLANS} billingReady={billingReady()} admin={admin}
      openPlan={searchParams.plan === '1'} paid={searchParams.billing === 'success'}
      tokens={tokens} endpoint={`${siteOrigin()}/api/mcp`}
    />
    </>
  );
}
