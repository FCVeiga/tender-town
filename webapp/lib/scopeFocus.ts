/**
 * The one scope Home, Tenders and News are showing.
 * Guests may open any published scope. Signed-in accounts may open General and
 * the scopes their workspace has turned on, within the owner's plan. A scope
 * they could still turn on stays selectable; choosing it uses that allowance.
 * A link or a direct request never loads a scope the plan or the workspace forbids.
 */
import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { getContext } from '@/lib/accounts';
import { getCurrentUser } from '@/lib/auth';
import {
  FOCUS_COOKIE, FOCUS_USER_COOKIE, GUEST_GENERAL, SCOPE_QUERY_HEADER, scopeSlug,
} from '@/lib/guestScope';
import {
  getCatalogScopes, getGeneralScope, getViewScopes, getWorkspaceScopes, replacesCatalogPick, workspaceScopeUse, type Scope,
} from '@/lib/scopes';

const UNLIMITED = 1000;

export function scopeLock(input: { entitled: boolean; general: boolean; isAdmin: boolean; room: boolean }): null | 'plan' | 'permission' {
  if (input.general || input.entitled) return null;
  if (!input.isAdmin) return 'permission';
  if (input.room) return null;
  return 'plan';
}

export type ScopeChoice = {
  id: string;
  name: string;
  description: string;
  slug: string | null;
  group: 'public' | 'yours';
  locked: null | 'plan' | 'permission';
};

export type FocusModel = {
  current: Scope | null;
  /** Set when a link names a scope an admin may still turn on. The page waits instead of showing another scope. */
  hold: Scope | null;
  publicSlug: string | null;
  choices: ScopeChoice[];
  signedIn: boolean;
  create: 'ok' | 'signup' | 'plan' | 'limit' | 'permission';
  workspaceId: string | null;
  planName: string;
  allowance: number | null;
  used: number;
  deny: null | { kind: 'plan' | 'permission'; scopeId: string; scopeName: string };
};

/** One sentence on what the scope monitors. A leading market claim is left off. */
const blurb = (instructions: string | null) => {
  let line = (instructions || '').split('\n').map((s) => s.trim()).find(Boolean) || '';
  const colon = line.indexOf(':');
  let stripped = false;
  if (colon > 0 && /\b(markets?|compet|busiest|largest|billions?)/i.test(line.slice(0, colon))) {
    line = line.slice(colon + 1).trim();
    stripped = true;
  }
  let sentence = (line.split(/(?<=\.)\s/)[0] || line).trim();
  if (stripped && sentence) sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1);
  if (sentence.length <= 140) return sentence;
  const cut = sentence.slice(0, 137).replace(/\s+\S*$/, '');
  return `${cut}…`;
};

function matchScope(raw: string, scopes: Scope[]): Scope | null {
  const q = raw.trim().toLowerCase();
  if (!q) return null;
  if (q === GUEST_GENERAL || q === 'default') return scopes.find((s) => s.isDefault) || null;
  return scopes.find((s) => s.id.toLowerCase() === q || scopeSlug(s.name) === q) || null;
}

export const resolveFocus = cache(async (): Promise<FocusModel> => {
  const [general, catalog, user] = await Promise.all([getGeneralScope(), getCatalogScopes(), getCurrentUser()]);
  const publics = [...(general ? [general] : []), ...catalog.filter((s) => !s.isDefault)];

  if (!user) {
    const { scopes } = await getViewScopes();
    const current = scopes[0] || general || catalog[0] || null;
    return {
      current, hold: null, publicSlug: current ? scopeSlug(current.name) : null,
      choices: publics.map((s) => ({
        id: s.id, name: s.name, description: blurb(s.instructions), slug: scopeSlug(s.name), group: 'public', locked: null,
      })),
      signedIn: false, create: 'signup', workspaceId: null, planName: 'Free', allowance: 0, used: 0, deny: null,
    };
  }

  const ctx = await getContext();
  const [{ scopes: view }, own, use] = await Promise.all([
    getViewScopes(),
    ctx ? getWorkspaceScopes(ctx.workspace.id) : Promise.resolve([] as Scope[]),
    ctx ? workspaceScopeUse(ctx.workspace.id) : Promise.resolve({ custom: 0, pickIds: [] as string[] }),
  ]);
  const entitled = new Set(view.map((s) => s.id));
  if (general) entitled.add(general.id);
  const limit = !ctx || ctx.isDefault ? UNLIMITED : ctx.plan.scopes;
  const unlimited = limit >= UNLIMITED;
  const used = use.custom + use.pickIds.length;
  const isAdmin = !!ctx?.isAdmin;
  const slotFree = unlimited || used < limit;
  // A template uses a slot on every plan, including Free. On a one-slot plan the
  // picker can replace the template already on. Creating a scope still needs a plan that allows it.
  const catalogRoom = isAdmin && (slotFree || replacesCatalogPick(limit, use.custom, use.pickIds.length));
  const customRoom = isAdmin && !!ctx?.canCustomize && slotFree;
  const custom = own.filter((s) => !s.isDefault && !s.catalog);
  const pool = [...publics, ...custom];

  const choice = (s: Scope, group: 'public' | 'yours'): ScopeChoice => ({
    id: s.id, name: s.name, description: blurb(s.instructions),
    slug: group === 'public' ? scopeSlug(s.name) : null, group,
    locked: scopeLock({ entitled: entitled.has(s.id), general: s.isDefault, isAdmin, room: group === 'yours' ? customRoom : catalogRoom }),
  });

  const requested = (headers().get(SCOPE_QUERY_HEADER) || '').trim();
  const cookieOn = cookies().get(FOCUS_USER_COOKIE)?.value === '1';
  const stored = cookieOn ? (cookies().get(FOCUS_COOKIE)?.value || '') : '';
  const fromUrl = requested ? matchScope(requested, pool) : null;
  const fromCookie = stored ? matchScope(stored, pool) : null;
  const fallback = view.find((s) => !s.isDefault) || view.find((s) => s.isDefault) || general || null;

  const allowed = (s: Scope | null) => !!s && (s.isDefault || entitled.has(s.id));
  let current = allowed(fromUrl) ? fromUrl : (allowed(fromCookie) ? fromCookie : fallback);
  let hold: Scope | null = null;
  let deny: FocusModel['deny'] = null;
  if (fromUrl && !allowed(fromUrl)) {
    const locked = scopeLock({ entitled: false, general: fromUrl.isDefault, isAdmin, room: fromUrl.catalog || fromUrl.isDefault ? catalogRoom : customRoom });
    if (!locked) hold = fromUrl;
    else deny = { kind: locked, scopeId: fromUrl.id, scopeName: fromUrl.name };
  }

  const create = !ctx ? 'permission'
    : !isAdmin ? 'permission'
    : !ctx.canCustomize ? 'plan'
    : !unlimited && used >= limit ? 'limit'
    : 'ok';

  const showing = hold || current;
  return {
    current, hold,
    publicSlug: showing && (showing.isDefault || showing.catalog) ? scopeSlug(showing.name) : (current && (current.isDefault || current.catalog) ? scopeSlug(current.name) : null),
    choices: [...publics.map((s) => choice(s, 'public')), ...custom.map((s) => choice(s, 'yours'))],
    signedIn: true, create, workspaceId: ctx?.workspace.id ?? null,
    planName: ctx?.plan.name ?? 'Free', allowance: unlimited ? null : limit, used, deny,
  };
});

/** The scope whose tenders and news the list pages may show. `hold` means show none yet. */
export async function focusedScope(): Promise<{ scope: Scope | null; hold: boolean }> {
  const model = await resolveFocus();
  if (model.hold) return { scope: null, hold: true };
  return { scope: model.current, hold: false };
}

/** Whether choosing this scope is allowed, and whether that turns it on for the workspace. */
export async function gateScope(id: string): Promise<
  | { ok: true; slug: string | null; enable: 'pick' | 'activate' | null; workspaceId: string | null }
  | { ok: false; kind: 'plan' | 'permission' }
> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, kind: 'permission' };
  const model = await resolveFocus();
  const choice = model.choices.find((c) => c.id === id);
  if (!choice) return { ok: false, kind: 'permission' };
  if (choice.locked) return { ok: false, kind: choice.locked };
  if (!model.signedIn) return { ok: true, slug: choice.slug, enable: null, workspaceId: null };
  const { scopes } = await getViewScopes();
  const isOn = choice.slug === GUEST_GENERAL || scopes.some((s) => s.id === id);
  if (isOn) return { ok: true, slug: choice.slug, enable: null, workspaceId: model.workspaceId };
  if (!model.workspaceId) return { ok: false, kind: 'permission' };
  if (choice.group === 'yours') return { ok: true, slug: null, enable: 'activate', workspaceId: model.workspaceId };
  return { ok: true, slug: choice.slug, enable: 'pick', workspaceId: model.workspaceId };
}
