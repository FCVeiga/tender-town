'use server';

import { cookies } from 'next/headers';
import { FIND_COOKIE } from '@/lib/guestScope';
import { deliverFind, matchOpenTender, parseFindBrief } from '@/lib/findTender';
import { getT } from '@/lib/i18n/server';

const cookie = { path: '/', maxAge: 60 * 60 * 6, sameSite: 'lax' as const, httpOnly: true };

/** Pick the open tender that fits what they just wrote. No account. */
export async function matchCompanyTender(name: string, website: string, notes: string) {
  const t = await getT();
  const brief = parseFindBrief(JSON.stringify({ name, website, notes }));
  if (!brief) return { error: t('Add the company name, and a website or a short note.') };
  try {
    const match = await matchOpenTender(brief);
    if (!match) return { error: t('No open tender matches that yet.') };
    return { match };
  } catch {
    return { error: t('The search did not finish.') };
  }
}

/** Keep the answers. Nothing is searched until the person has an account. */
export async function saveFindBrief(name: string, website: string, notes: string) {
  const t = await getT();
  const brief = parseFindBrief(JSON.stringify({ name, website, notes }));
  if (!brief) return { error: t('Add the company name, and a website or a short note.') };
  cookies().set(FIND_COOKIE, JSON.stringify(brief), cookie);
  return {};
}

/** Run the search, the evaluation and the brief, then point at that tender. */
export async function startCompanyFind() {
  const t = await getT();
  const brief = parseFindBrief(cookies().get(FIND_COOKIE)?.value);
  if (!brief) return { status: 'error' as const, message: t('Tell the agent about your company first.') };
  const result = await deliverFind(brief);
  if (result.status === 'done') cookies().set(FIND_COOKIE, '', { path: '/', maxAge: 0 });
  return result;
}
