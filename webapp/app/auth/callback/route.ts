import { NextResponse } from 'next/server';
import { authClient, safeNext } from '@/lib/auth';
import { countryFrom } from '@/lib/guestScope';
import { clientIp } from '@/lib/internal';
import { ensureProfile } from '@/lib/profiles';
import { applyProfilePrefs } from '@/lib/i18n/server';
import { getSupabaseServerClient } from '@/lib/supabase';
import { recordProductEvent } from '@/lib/productRecord';

export const dynamic = 'force-dynamic';

/** Where Google sign-in and password-reset links land: swap the code for a session. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = safeNext(url.searchParams.get('next'));
  if (code) {
    const { data, error } = await authClient().auth.exchangeCodeForSession(code);
    await recordProductEvent({ name: 'oauth_callback_received', cta: 'google', ok: !error && !!data.user, errorCode: error ? 'oauth_exchange_failed' : null, path: '/auth/callback' });
    if (!error && data.user) {
      const ip = clientIp((name) => request.headers.get(name));
      const existing = await getSupabaseServerClient().from('profiles').select('id').eq('id', data.user.id).maybeSingle();
      await ensureProfile(data.user.id, data.user.email || '', data.user.user_metadata, countryFrom(request.headers.get('x-vercel-ip-country'), request.headers.get('accept-language'), null), ip);
      await applyProfilePrefs(data.user.id);
      if (existing.data) await recordProductEvent({ name: 'login_completed', userId: data.user.id, cta: 'google', ok: true, path: '/auth/callback', dedupe: `login:${data.user.id}:${Date.now()}` });
      else await recordProductEvent({ name: 'account_created', userId: data.user.id, cta: 'google', ok: true, path: '/auth/callback', dedupe: `account:${data.user.id}` });
      return NextResponse.redirect(new URL(next, url.origin));
    }
    await recordProductEvent({ name: 'authentication_failed', cta: 'google', ok: false, errorCode: 'oauth_exchange_failed', path: '/auth/callback' });
  } else {
    await recordProductEvent({ name: 'authentication_failed', cta: 'google', ok: false, errorCode: 'oauth_incomplete', path: '/auth/callback' });
  }
  return NextResponse.redirect(new URL('/login?error=link', url.origin));
}
