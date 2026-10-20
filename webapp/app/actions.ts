'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { getEditableScope, getViewScopes } from '@/lib/scopes';
import { refreshDueFeeds, resolveSource } from '@/lib/sources';
import { FREQUENCIES, METHODS, Method, NOT_CONNECTABLE, SOURCE_TYPES } from '@/lib/sourceMeta';
import { getT } from '@/lib/i18n/server';

export type SaveSourceState = { ok: boolean; message: string } | null;

/** Add a source (no source_id) or update one, from the Following sidebar's modal. */
export async function saveSource(_prev: SaveSourceState, form: FormData): Promise<SaveSourceState> {
  const tr = await getT();
  if (!(await getCurrentUser())) return { ok: false, message: tr('Log in to add or change sources.') };
  const id = String(form.get('source_id') || '');
  const type = String(form.get('source_type') || '');
  const name = String(form.get('name') || '').trim();
  const input = String(form.get('url') || '').trim();
  const country = String(form.get('country') || '') || null;
  const requested = String(form.get('method') || 'auto');
  const every = Number(form.get('check_every_days') || 7);
  const enabled = form.get('enabled') === 'on';

  if (!SOURCE_TYPES.some((t) => t.value === type)) return { ok: false, message: tr('Pick a type.') };
  if (!input) return { ok: false, message: tr('Enter a URL or handle.') };
  if (!(FREQUENCIES as readonly number[]).includes(every)) return { ok: false, message: tr('Pick how often to check.') };
  if (requested !== 'auto' && !(requested in METHODS)) return { ok: false, message: tr('Pick a monitoring method.') };

  const supabase = getSupabaseServerClient();
  const current = id ? (await supabase.from('sources').select('*').eq('source_id', id).single()).data : null;
  if (id && !current) return { ok: false, message: tr('That source no longer exists.') };

  // Resolve the feed / method when adding, when the address changed, or on "auto".
  let resolved = current
    ? { url: current.url, handle: current.handle, feedUrl: current.feed_url, method: current.method as Method }
    : null;
  const addressChanged = !current || input !== (current.handle || current.url);
  if (addressChanged || requested === 'auto') {
    try {
      resolved = await resolveSource(type, input);
    } catch (e: any) {
      return { ok: false, message: String(e?.message || e) };
    }
  }
  let method: Method = requested === 'auto' ? resolved!.method : (requested as Method);
  if (current?.method === 'ted') method = 'ted';  // TED keeps its API
  if (NOT_CONNECTABLE.includes(type)) method = 'off';
  if (method === 'rss' && !resolved!.feedUrl) return { ok: false, message: tr('No RSS/Atom feed found at that address — use site search instead.') };
  if (method === 'site_search' && !resolved!.url) return { ok: false, message: tr('Site search needs a website URL.') };

  if (!current) {
    const { data: dupe } = await supabase.from('sources').select('name')
      .or(`url.eq."${resolved!.url}",handle.eq."${resolved!.handle ?? '__none__'}"`).limit(1);  // quoted: URLs may hold commas
    if (dupe?.length) return { ok: false, message: tr('Already following this as “{name}”.', { name: dupe[0].name }) };
  }

  const row = {
    name: name || resolved!.handle || new URL(resolved!.url!).hostname.replace(/^www\./, ''),
    source_type: type, country, url: resolved!.url, handle: resolved!.handle, feed_url: resolved!.feedUrl,
    method, enabled, check_every_days: method === 'rss' || method === 'ted' ? 1 : every,
    rss_available: !!resolved!.feedUrl,
    // a changed address or method means the next run should check it straight away
    ...(addressChanged || method !== current?.method ? { last_checked: null, last_error: null } : {}),
  };
  const { error } = current
    ? await supabase.from('sources').update(row).eq('source_id', id)
    : await supabase.from('sources').insert({
        ...row, source_id: `USR-${Date.now().toString(36)}`, status: 'ACTIVE', priority: 3,
      });
  if (error) return { ok: false, message: error.message };

  // A new source is followed by the scope it was added from — or, from the sidebar, by the viewer's active scopes they may edit.
  if (!current) {
    const sourceId = (await supabase.from('sources').select('source_id').or(`url.eq."${resolved!.url}",handle.eq."${resolved!.handle ?? '__none__'}"`).limit(1)).data?.[0]?.source_id;
    const scopeId = String(form.get('scope_id') || '');
    const targets = scopeId ? [scopeId] : (await getViewScopes()).scopes.map((sc) => sc.id);
    const editable = (await Promise.all(targets.map((t) => getEditableScope(t)))).filter(Boolean).map((sc) => sc!.id);
    if (sourceId && editable.length) await supabase.from('scope_sources').upsert(editable.map((sid) => ({ scope_id: sid, source_id: sourceId })), { onConflict: 'scope_id,source_id', ignoreDuplicates: true });
  }
  if (method === 'rss' && enabled) await refreshDueFeeds();  // feed items show up straight away
  revalidatePath('/', 'layout');
  const how = method === 'off'
    ? NOT_CONNECTABLE.includes(type) ? tr('listed — this platform needs API access before it can be monitored') : tr('listed, not monitored')
    : method === 'rss' ? tr('monitored through its feed') : method === 'ted' ? tr('monitored through the TED API')
      : every === 1 ? tr('searched every day') : tr('searched every {n} days', { n: every });
  return { ok: true, message: `${row.name}: ${enabled ? how : tr('paused')}.` };
}

/** Opening a news page starts the News Report Agent for a scope the viewer is looking through. */
export async function startNewsReport(newsId: string, scopeId: string) {
  const t = await getT();
  if (!/^[0-9a-f]{16}$/.test(newsId)) return { status: 'error' as const, message: t('unknown news item') };
  const { scopes } = await getViewScopes();
  if (!scopes.some((s) => s.id === scopeId)) return { status: 'error' as const, message: t('that scope isn’t one you’re viewing') };
  const { ensureNewsReport } = await import('@/lib/newsReport');
  const result = await ensureNewsReport(newsId, scopeId);
  if (result.status === 'done') revalidatePath(`/news/${newsId}`);
  return result;
}

/** Running on-click agents is for the active workspace's admins, on a plan that includes evaluation. */
async function evaluationTarget(scopeId: string): Promise<{ workspaceId: string | null } | { error: string }> {
  const t = await getT();
  const { getContext } = await import('@/lib/accounts');
  const ctx = await getContext();
  const { scopes } = await getViewScopes();
  const scope = scopes.find((s) => s.id === scopeId);
  if (!ctx?.isAdmin || !scope) return { error: t('only the workspace’s admins can run this agent') };
  return { workspaceId: scope.isDefault || scope.catalog ? ctx.workspace.id : null };
}

export async function startTenderEvaluation(opportunityId: string, scopeId: string) {
  const t = await getT();
  const target = await evaluationTarget(scopeId);
  if ('error' in target) return { status: 'error' as const, message: target.error };
  if (!/^[0-9a-f]{12,40}$/.test(opportunityId)) return { status: 'error' as const, message: t('unknown opportunity') };
  const { ensureEvaluation } = await import('@/lib/tenderEvaluation');
  const result = await ensureEvaluation(opportunityId, scopeId, target.workspaceId);
  if (result.status === 'done') {
    revalidatePath(`/tenders/${opportunityId}`);
    revalidatePath(`/news/signals/${opportunityId}`);
  }
  return result;
}

/** The tender page's "Prepare proposal brief" button: starts the Proposal Manager Agent for one of your scopes. */
export async function startProposalBrief(opportunityId: string, scopeId: string) {
  const t = await getT();
  const target = await evaluationTarget(scopeId);
  if ('error' in target) return { status: 'error' as const, message: target.error };
  if (!/^[0-9a-f]{12,40}$/.test(opportunityId)) return { status: 'error' as const, message: t('unknown tender') };
  const { ensureProposal } = await import('@/lib/proposalManager');
  const result = await ensureProposal(opportunityId, scopeId, target.workspaceId);
  if (result.status === 'done') {
    revalidatePath(`/tenders/${opportunityId}`);
    revalidatePath(`/news/signals/${opportunityId}`);
  }
  return result;
}

/** Scope page → Following: follow or unfollow a source of the shared registry. */
export async function setSourceFollowed(scopeId: string, sourceId: string, on: boolean): Promise<{ error?: string }> {
  if (!(await getEditableScope(scopeId))) return { error: (await getT())('Only this workspace’s admins can change what it follows.') };
  const db = getSupabaseServerClient();
  const { error } = on
    ? await db.from('scope_sources').upsert({ scope_id: scopeId, source_id: sourceId }, { onConflict: 'scope_id,source_id', ignoreDuplicates: true })
    : await db.from('scope_sources').delete().match({ scope_id: scopeId, source_id: sourceId });
  if (error) return { error: error.message };
  revalidatePath('/', 'layout');
  return {};
}
