import Link from 'next/link';
import { redirect } from 'next/navigation';
import { startCheckout } from '@/app/settings/actions';
import { getCurrentUser } from '@/lib/auth';
import { getT } from '@/lib/i18n/server';
import { NOINDEX } from '@/lib/seo';
import type { BillingInterval } from '@/lib/billing';

export async function generateMetadata() {
  const t = await getT();
  return { title: `${t('Subscribe')} — Tender Town`, ...NOINDEX };
}

/** Lands here after sign-up from a pricing button, then opens Stripe. */
export default async function CheckoutPage({ searchParams }: { searchParams: { plan?: string; interval?: string } }) {
  const plan = searchParams.plan || '';
  const interval: BillingInterval = searchParams.interval === 'year' ? 'year' : 'month';
  const next = `/checkout?plan=${encodeURIComponent(plan)}&interval=${interval}`;
  if (!(await getCurrentUser())) redirect(`/signup?next=${encodeURIComponent(next)}`);
  const result = await startCheckout(plan, interval);
  const t = await getT();
  return (
    <article className="legal">
      <h1 className="opps-h1">{t('Subscribe')}</h1>
      {result?.error && <p className="form-msg err">{result.error}</p>}
      <p><Link href="/pricing">{t('Pricing')}</Link></p>
    </article>
  );
}
