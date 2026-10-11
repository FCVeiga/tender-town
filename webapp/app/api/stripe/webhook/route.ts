import type Stripe from 'stripe';
import { getSupabaseServerClient } from '@/lib/supabase';
import { planForPrice, stripe } from '@/lib/billing';

export const dynamic = 'force-dynamic';

/** Stripe → account plan. Point a Stripe webhook here (checkout + subscription events) with STRIPE_WEBHOOK_SECRET. */
export async function POST(req: Request) {
  const s = stripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!s || !secret) return new Response('Billing not configured', { status: 503 });
  let event: Stripe.Event;
  try {
    event = s.webhooks.constructEvent(await req.text(), req.headers.get('stripe-signature') || '', secret);
  } catch {
    return new Response('Bad signature', { status: 400 });
  }
  const db = getSupabaseServerClient();
  const byAccount = async (accountId: string | undefined, customer: string | null, values: Record<string, any>) => {
    if (accountId) await db.from('accounts').update(values).eq('id', accountId);
    else if (customer) await db.from('accounts').update(values).eq('stripe_customer_id', customer);
  };
  const markSubscribed = async (accountId: string | undefined, customer: string | null) => {
    let query = db.from('accounts').update({ subscribed_at: new Date().toISOString() }).is('subscribed_at', null);
    if (accountId) query = query.eq('id', accountId);
    else if (customer) query = query.eq('stripe_customer_id', customer);
    else return;
    await query;
  };

  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.payment_status === 'paid' || session.payment_status === 'no_payment_required') {
      const plan = session.metadata?.plan || 'free';
      await byAccount(session.metadata?.account_id, session.customer as string | null, {
        plan, plan_status: 'active',
        stripe_subscription_id: session.subscription as string | null, stripe_customer_id: session.customer as string | null,
      });
      if (plan !== 'free') await markSubscribed(session.metadata?.account_id, session.customer as string | null);
    }
  } else if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
    const sub = event.data.object as Stripe.Subscription;
    const item = sub.items.data[0];
    const plan = planForPrice(item?.price?.id) || sub.metadata?.plan || null;
    const end = (item as any)?.current_period_end ?? (sub as any).current_period_end;
    await byAccount(sub.metadata?.account_id, sub.customer as string, {
      ...(plan && ['active', 'trialing', 'past_due'].includes(sub.status) ? { plan } : {}),
      plan_status: sub.status, stripe_subscription_id: sub.id,
      current_period_end: end ? new Date(end * 1000).toISOString() : null,
    });
    if (plan && plan !== 'free' && ['active', 'trialing', 'past_due'].includes(sub.status)) {
      await markSubscribed(sub.metadata?.account_id, sub.customer as string);
    }
  } else if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription;
    await byAccount(sub.metadata?.account_id, sub.customer as string, { plan: 'free', plan_status: 'canceled', stripe_subscription_id: null, subscribed_at: null });
  }
  return new Response('ok');
}
