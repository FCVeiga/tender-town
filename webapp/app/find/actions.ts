'use server';

import { cookies } from 'next/headers';
import { FIND_COOKIE } from '@/lib/guestScope';
import { deliverFind, parseFindBrief } from '@/lib/findTender';
import { getT } from '@/lib/i18n/server';

const cookie = { path: '/', maxAge: 60 * 60 * 6, sameSite: 'lax' as const, httpOnly: true };

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
