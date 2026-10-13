'use server';

import { redirect } from 'next/navigation';
import { getCurrentUser, siteOrigin } from '@/lib/auth';
import { issueCode, resolveAuthorize, successRedirect } from '@/lib/oauth';

export async function allowOauth(form: FormData) {
  const user = await getCurrentUser();
  const request = String(form.get('request') || '');
  if (!user) redirect(`/login?next=${encodeURIComponent(`/oauth/authorize?${request}`)}`);
  const origin = siteOrigin();
  const checked = await resolveAuthorize(origin, new URLSearchParams(request));
  if (!checked.ok) {
    if ('redirect' in checked && checked.redirect) redirect(checked.redirect);
    redirect('/oauth/authorize');
  }
  const code = await issueCode(user.id, checked.client);
  redirect(successRedirect(origin, checked.client, code));
}
