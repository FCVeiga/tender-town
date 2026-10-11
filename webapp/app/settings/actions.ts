'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseServerClient } from '@/lib/supabase';
import { authClient, getCurrentUser, safeNext, siteOrigin } from '@/lib/auth';
import { getPersonalAccount, isPlatformAdmin } from '@/lib/accounts';
import { PLANS, planOf } from '@/lib/plans';
import { billingReady, priceId, stripe, type BillingInterval } from '@/lib/billing';
import { getT, setPrefCookies } from '@/lib/i18n/server';
import { isTheme, isUiLang } from '@/lib/i18n/languages';
import { createMcpToken, revokeMcpToken } from '@/lib/mcpTokens';

export type SettingsState = { ok: boolean; message: string } | null;
export type Result = { error?: string };
const db = () => getSupabaseServerClient();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENDERS = ['woman', 'man', 'non_binary', 'other', 'prefer_not'];

/** The signed-in auth user (with identities), or null. */
async function authUser() {
  const { data: { user } } = await authClient().auth.getUser();
  return user;
}
const hasPassword = (u: any) => (u?.identities || []).some((i: any) => i.provider === 'email');

/** Checks a password without touching the browser's session (a throwaway client). */
async function passwordOk(email: string, password: string) {
  const c = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (data.session) await c.auth.admin.signOut(data.session.access_token).catch(() => {});
  return !error;
}

async function updateProfile(fields: Record<string, unknown>, paths: string[] = ['/settings']): Promise<Result> {
  const t = await getT();
  const user = await getCurrentUser();
  if (!user) return { error: t('Your session expired — log in again.') };
  const { error } = await db().from('profiles').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', user.id);
  if (error) return { error: error.message };
  for (const p of [...paths, `/u/${user.username}`]) revalidatePath(p);
  return {};
}

/* ---------------- Account ---------------- */

export async function changeEmail(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  const t = await getT();
  const user = await authUser();
  if (!user?.email) return { ok: false, message: t('Your session expired — log in again.') };
  const email = String(form.get('email') || '').trim().toLowerCase();
  if (!EMAIL.test(email)) return { ok: false, message: t('Enter a valid email address.') };
  if (email === user.email.toLowerCase()) return { ok: false, message: t('That’s already your email.') };
  if (hasPassword(user) && !(await passwordOk(user.email, String(form.get('password') || '')))) return { ok: false, message: t('Your current password is wrong.') };
  // Applied straight away: confirmation emails need an email provider on Supabase (see Help).
  const { error } = await db().auth.admin.updateUserById(user.id, { email, email_confirm: true });
  if (error) return { ok: false, message: /already|registered|exists/i.test(error.message) ? t('Another account uses that email.') : error.message };
  revalidatePath('/settings');
  return { ok: true, message: t('Your email is now {email}.', { email }) };
}

export async function changePassword(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  const t = await getT();
  const user = await authUser();
  if (!user?.email) return { ok: false, message: t('Your session expired — log in again.') };
  const password = String(form.get('password') || '');
  if (password.length < 8) return { ok: false, message: t('Use a password of at least 8 characters.') };
  if (password !== String(form.get('confirm') || '')) return { ok: false, message: t('The new passwords don’t match.') };
  if (hasPassword(user) && !(await passwordOk(user.email, String(form.get('current') || '')))) return { ok: false, message: t('Your current password is wrong.') };
  const { error } = await db().auth.admin.updateUserById(user.id, { password });
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: hasPassword(user) ? t('Password changed.') : t('Password set — you can now also log in with your email.') };
}

export async function setBirthday(value: string | null): Promise<Result> {
  const t = await getT();
  if (value) {
    const d = new Date(`${value}T00:00:00Z`);
    const age = (Date.now() - d.getTime()) / (365.25 * 86400_000);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || isNaN(d.getTime()) || age < 13 || age > 120) return { error: t('Enter a valid date of birth.') };
  }
  return updateProfile({ birthday: value || null });
}

export async function setGender(value: string | null): Promise<Result> {
  if (value && !GENDERS.includes(value)) return { error: (await getT())('Unknown option.') };
  return updateProfile({ gender: value || null });
}

/** Signs out every browser and device, this one included. */
export async function logOutEverywhere() {
  await authClient().auth.signOut({ scope: 'global' });
  revalidatePath('/', 'layout');
  redirect('/login');
}

/** Authorization: connect Google (identity linking) — needs the Google provider enabled on Supabase. */
export async function connectGoogle(): Promise<Result> {
  const t = await getT();
  const settings = await fetch(`${process.env.SUPABASE_URL}/auth/v1/settings`, {
    headers: { apikey: process.env.SUPABASE_SERVICE_KEY! }, cache: 'no-store',
  }).then((r) => r.json()).catch(() => null);
  if (!settings?.external?.google) return { error: t('Google sign-in isn’t switched on for Tender Town yet.') };
  const { data, error } = await authClient().auth.linkIdentity({
    provider: 'google', options: { redirectTo: `${siteOrigin()}/auth/callback?next=${encodeURIComponent(safeNext('/settings/account'))}` },
  });
  if (error || !data?.url) return { error: error?.message || t('Could not reach Google.') };
  redirect(data.url);
}

export async function disconnectGoogle(): Promise<Result> {
  const t = await getT();
  const user = await authUser();
  if (!user) return { error: t('Your session expired — log in again.') };
  const google = (user.identities || []).find((i) => i.provider === 'google');
  if (!google) return {};
  if (!hasPassword(user)) return { error: t('Set a password first — Google is how you log in.') };
  const { error } = await authClient().auth.unlinkIdentity(google);
  if (error) return { error: error.message };
  revalidatePath('/settings/account');
  return {};
}

/* ---------------- Profile ---------------- */

export async function setDisplayName(value: string): Promise<Result> {
  const t = await getT();
  const v = value.trim().slice(0, 60);
  if (v.length < 2) return { error: t('Use at least 2 characters.') };
  const r = await updateProfile({ display_name: v });
  if (!r.error) revalidatePath('/', 'layout');
  return r;
}

export async function setBio(value: string): Promise<Result> {
  return updateProfile({ bio: value.trim().slice(0, 1000) || null });
}

function socialUrl(raw: string, label: string, hosts: string[], handleBase?: string) {
  const v = raw.trim();
  if (!v) return null;
  const handle = v.replace(/^@/, '');
  if (handleBase && /^[A-Za-z0-9_.-]{1,60}$/.test(handle)) return `${handleBase}${handle}`;
  let url: URL;
  try { url = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`); } catch { throw new Error(`${label}: invalid link`); }
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  if (hosts.length && !hosts.some((h) => host === h || host.endsWith(`.${h}`))) throw new Error(`${label}: ${hosts[0]}`);
  url.protocol = 'https:';
  return url.toString().slice(0, 300);
}

export async function setSocialLinks(links: { website: string; linkedin: string; x: string; github: string }): Promise<Result> {
  const t = await getT();
  try {
    return await updateProfile({
      website_url: socialUrl(links.website, 'Website', []),
      linkedin_url: socialUrl(links.linkedin, 'LinkedIn', ['linkedin.com']),
      x_url: socialUrl(links.x, 'X', ['x.com', 'twitter.com'], 'https://x.com/'),
      github_url: socialUrl(links.github, 'GitHub', ['github.com'], 'https://github.com/'),
    });
  } catch (e: any) {
    const [label, host] = String(e.message).split(': ');
    return { error: host === 'invalid link' ? t('{label}: that isn’t a valid link.', { label: t(label) }) : t('{label}: use a link on {host}.', { label: t(label), host }) };
  }
}

export async function setWorkDetails(v: { company: string; role: string; location: string; expertise: string }): Promise<Result> {
  const text = (s: string, max: number) => s.trim().slice(0, max) || null;
  const expertise = Array.from(new Set(v.expertise.split(',').map((x) => x.trim().slice(0, 40)).filter(Boolean))).slice(0, 15);
  return updateProfile({ company: text(v.company, 100), role: text(v.role, 100), location: text(v.location, 100), expertise });
}

/* ---------------- Privacy ---------------- */

export async function setChatPermission(value: string): Promise<Result> {
  if (!['everyone', 'workspace', 'nobody'].includes(value)) return { error: (await getT())('Unknown option.') };
  return updateProfile({ chat_permission: value });
}

export async function setSearchable(on: boolean): Promise<Result> {
  return updateProfile({ searchable: !!on });
}

/* ---------------- Preferences ---------------- */

export async function setUiLanguage(code: string): Promise<Result> {
  if (!isUiLang(code)) return { error: (await getT())('Unknown language.') };
  const r = await updateProfile({ ui_language: code });
  if (r.error) return r;
  setPrefCookies({ lang: code });
  revalidatePath('/', 'layout');
  return {};
}

export async function setTheme(value: string): Promise<Result> {
  if (!isTheme(value)) return { error: (await getT())('Unknown option.') };
  const r = await updateProfile({ theme: value });
  if (r.error) return r;
  setPrefCookies({ theme: value });
  revalidatePath('/', 'layout');
  return {};
}

/* ---------------- Plan & billing ---------------- */

export async function startCheckout(plan: string, interval: BillingInterval = 'month'): Promise<Result> {
  const t = await getT();
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/signup?next=${encodeURIComponent(`/checkout?plan=${plan}&interval=${interval}`)}`);
  }
  const account = await getPersonalAccount(user.id);
  const p = planOf(plan);
  if (!account || p.key === 'free' || (interval !== 'month' && interval !== 'year')) return { error: t('That plan isn’t available.') };
  const s = stripe();
  const price = priceId(p.key, interval);
  if (!s || !billingReady(p.key, interval) || !price) return { error: t('Online payments aren’t set up yet — contact us to change your plan.') };
  let customer = account.stripeCustomerId;
  if (!customer) {
    const c = await s.customers.create({ email: user.email, name: user.displayName, metadata: { account_id: account.id } });
    customer = c.id;
    await db().from('accounts').update({ stripe_customer_id: customer }).eq('id', account.id);
  }
  // Already subscribed: plan changes and cancellations go through the billing portal.
  if (account.planKey !== 'free' && account.planStatus !== 'comped' && account.planStatus !== 'canceled') {
    const portal = await s.billingPortal.sessions.create({ customer, return_url: `${siteOrigin()}/pricing` });
    redirect(portal.url);
  }
  const session = await s.checkout.sessions.create({
    mode: 'subscription', customer,
    customer_update: { address: 'auto', name: 'auto' },
    billing_address_collection: 'required',
    tax_id_collection: { enabled: true },
    automatic_tax: { enabled: true },
    line_items: [{ price, quantity: 1 }],
    success_url: `${siteOrigin()}/settings/account?billing=success`,
    cancel_url: `${siteOrigin()}/pricing`,
    metadata: { account_id: account.id, plan: p.key },
    subscription_data: { metadata: { account_id: account.id, plan: p.key } },
    allow_promotion_codes: true,
  });
  if (!session.url) return { error: t('Online payments aren’t set up yet — contact us to change your plan.') };
  redirect(session.url);
}

/** Pricing-page subscribe button. Guests go through sign-up, then Stripe. */
export async function subscribeFromPricing(_prev: Result | null, form: FormData): Promise<Result> {
  const plan = String(form.get('plan') || '');
  const interval: BillingInterval = form.get('interval') === 'year' ? 'year' : 'month';
  return startCheckout(plan, interval);
}

export async function openBillingPortal(): Promise<Result> {
  const t = await getT();
  const user = await getCurrentUser();
  const account = user ? await getPersonalAccount(user.id) : null;
  const s = stripe();
  if (!s || !account?.stripeCustomerId) return { error: t('No billing account yet.') };
  const portal = await s.billingPortal.sessions.create({ customer: account.stripeCustomerId, return_url: `${siteOrigin()}/settings/account` });
  redirect(portal.url);
}

/** Internal: assign a plan by hand (complimentary), e.g. before Stripe is set up. */
export async function adminSetPlan(userId: string, plan: string): Promise<Result> {
  const t = await getT();
  if (!(await isPlatformAdmin())) return { error: t('Not allowed.') };
  if (!PLANS.some((p) => p.key === plan)) return { error: t('Unknown plan.') };
  await db().from('accounts').update({ plan, plan_status: plan === 'free' ? 'active' : 'comped' }).eq('kind', 'personal').eq('owner_id', userId);
  if (plan !== 'free') {
    await db().from('accounts').update({ subscribed_at: new Date().toISOString() }).eq('kind', 'personal').eq('owner_id', userId).is('subscribed_at', null);
  }
  revalidatePath('/', 'layout');
  return {};
}

export type McpTokenState = { ok: boolean; message: string; token?: string } | null;

/** A bearer token for the MCP server. The secret is returned once. */
export async function createAccessToken(_prev: McpTokenState, form: FormData): Promise<McpTokenState> {
  const t = await getT();
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: t('Your session expired — log in again.') };
  const result = await createMcpToken(user.id, String(form.get('name') || ''));
  revalidatePath('/settings/account');
  if ('error' in result) return { ok: false, message: t(result.error) };
  return { ok: true, message: t('Copy this token now. It is shown once.'), token: result.token };
}

export async function revokeAccessToken(id: string) {
  const user = await getCurrentUser();
  if (!user) return;
  await revokeMcpToken(user.id, id);
  revalidatePath('/settings/account');
}
