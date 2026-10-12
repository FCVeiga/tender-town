'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { BANNER_COOKIE, FOCUS_COOKIE, FOCUS_USER_COOKIE, INTENT_COOKIE } from '@/lib/guestScope';
import { gateScope } from '@/lib/scopeFocus';
import { getCurrentUser } from '@/lib/auth';
import { getContext } from '@/lib/accounts';
import { workspaceScopeUse } from '@/lib/scopes';
import { createScope, setCatalogPick, setScopeActive } from '@/app/workspaces/actions';

const year = { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' as const, httpOnly: true };

export async function chooseScope(id: string): Promise<{ ok: true; slug: string | null } | { ok: false; kind: 'plan' | 'permission' }> {
  const gate = await gateScope(id);
  if (!gate.ok) return gate;
  if (gate.enable === 'pick' && gate.workspaceId) {
    const turned = await setCatalogPick(gate.workspaceId, id, true);
    if (turned.upgrade) return { ok: false, kind: 'plan' };
    if (turned.error) return { ok: false, kind: 'permission' };
  }
  if (gate.enable === 'activate') {
    const turned = await setScopeActive(id, true);
    if (turned.error) return { ok: false, kind: 'permission' };
  }
  const user = await getCurrentUser();
  cookies().set(FOCUS_COOKIE, id, year);
  if (user) cookies().set(FOCUS_USER_COOKIE, '1', year);
  else cookies().set(FOCUS_USER_COOKIE, '', { path: '/', maxAge: 0 });
  revalidatePath('/', 'layout');
  return { ok: true, slug: gate.slug };
}

/** Keep a scope the address bar already showed, without turning a new one on. */
export async function rememberFocus(id: string) {
  const gate = await gateScope(id);
  if (!gate.ok || gate.enable) return;
  const user = await getCurrentUser();
  if (!user) return;
  if (cookies().get(FOCUS_COOKIE)?.value === id && cookies().get(FOCUS_USER_COOKIE)?.value === '1') return;
  cookies().set(FOCUS_COOKIE, id, year);
  cookies().set(FOCUS_USER_COOKIE, '1', year);
}

/** Remember whether the scope banner is collapsed. Shared by Home, Tenders and News. */
export async function setBannerCompact(compact: boolean) {
  cookies().set(BANNER_COOKIE, compact ? '1' : '0', year);
}

export async function rememberIntent(intent: string) {
  if (intent !== 'create' && !/^switch:[0-9a-f-]{36}$/i.test(intent)) return;
  cookies().set(INTENT_COOKIE, intent, { path: '/', maxAge: 60 * 60, sameSite: 'lax', httpOnly: true });
}

/** After checkout, continue the scope the person was trying to open or create. */
export async function resumeScopeIntent(): Promise<{ wait?: boolean }> {
  const intent = cookies().get(INTENT_COOKIE)?.value || '';
  if (!intent) return {};
  if (intent === 'create') {
    const ctx = await getContext();
    if (!ctx?.canCustomize) return { wait: true };
    const use = await workspaceScopeUse(ctx.workspace.id);
    const limit = ctx.isDefault ? 1000 : ctx.plan.scopes;
    if (use.custom + use.pickIds.length >= limit) return { wait: true };
    cookies().set(INTENT_COOKIE, '', { path: '/', maxAge: 0 });
    await createScope(ctx.workspace.id);
  }
  if (intent.startsWith('switch:')) {
    const result = await chooseScope(intent.slice(7));
    if (!result.ok) return { wait: true };
    cookies().set(INTENT_COOKIE, '', { path: '/', maxAge: 0 });
    redirect(result.slug ? `/?scope=${encodeURIComponent(result.slug)}` : '/');
  }
  return {};
}
