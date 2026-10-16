import 'server-only';
import { randomBytes } from 'node:crypto';
import { getSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser, siteOrigin } from '@/lib/auth';
import { getContext, getPersonalAccount, getWorkspaceContext, getMyWorkspaces } from '@/lib/accounts';
import {
  SCOPE_AGENT_KEYS, getCatalogScopes, getEditableScope, getScopeAgents, getViewScopes, getViewableScope, getWorkspaceScopes, replacesCatalogPick, workspaceScopeUse,
} from '@/lib/scopes';
import { AGENTS } from '@/lib/agents';
import { planIncludes } from '@/lib/plans';
import { getCommentTree } from '@/lib/comments';
import { buyerOf, titleOf } from '@/lib/data';
import { friendlyError, parseSearchScope, tunePrompt, validateSearchConfig } from '@/lib/configAgent';
import { newsReportAllowance } from '@/lib/newsQuota';
import { startProposalBrief, startTenderEvaluation } from '@/app/actions';
import { ensureNewsReport } from '@/lib/newsReport';
import { publicText } from '@/lib/publication';

const db = () => getSupabaseServerClient();
const ID = /^[0-9a-f-]{36}$/i;

export class McpDenied extends Error {}

async function signedIn() {
  const user = await getCurrentUser();
  if (!user) throw new McpDenied('This token does not belong to an account.');
  return user;
}

async function monthUsage(accountId: string) {
  const month = new Date().toISOString().slice(0, 7);
  const [{ data: runs }, { data: news }] = await Promise.all([
    db().from('agent_run_usage').select('agent_key, runs').eq('account_id', accountId).eq('month', month),
    db().from('news_report_usage').select('reports').eq('account_id', accountId).eq('month', month).maybeSingle(),
  ]);
  const used = (key: string) => (runs || []).find((r: any) => r.agent_key === key)?.runs ?? 0;
  return { evaluations: used('tender_evaluation'), proposals: used('proposal_manager'), newsReports: news?.reports ?? 0 };
}

function room(limit: number | null, used: number) {
  if (limit == null) return { limit: null, used, remaining: null };
  return { limit, used, remaining: Math.max(0, limit - used) };
}

export async function getAccount() {
  const user = await signedIn();
  const account = await getPersonalAccount(user.id);
  if (!account) throw new McpDenied('This account is not set up yet.');
  const mine = await getMyWorkspaces();
  const usage = await monthUsage(account.id);
  const plan = account.plan;
  return {
    username: user.username,
    email: user.email,
    plan: plan.key,
    planStatus: account.planStatus,
    limits: {
      workspaces: plan.workspaces,
      scopes: plan.scopes >= 1000 ? null : plan.scopes,
      members: plan.members,
      customize: plan.customize,
      evaluations: room(plan.evaluationsPerMonth, usage.evaluations),
      proposals: room(plan.proposalsPerMonth, usage.proposals),
      newsReports: room(plan.newsReportsPerMonth, usage.newsReports),
    },
    workspaces: mine.map((m) => ({ id: m.workspace.id, name: m.workspace.name, role: m.role, plan: m.plan.key })),
  };
}

export async function listWorkspaces() {
  await signedIn();
  const mine = await getMyWorkspaces();
  return mine.map((m) => ({
    id: m.workspace.id, name: m.workspace.name, role: m.role, owner: m.owner.username, plan: m.plan.key,
  }));
}

export async function createWorkspace(name: string) {
  const user = await signedIn();
  const label = name.trim().slice(0, 80);
  if (label.length < 2) throw new McpDenied('Give the workspace a name.');
  const account = await getPersonalAccount(user.id);
  if (!account) throw new McpDenied('This account is not set up yet.');
  const owned = (await getMyWorkspaces()).filter((m) => m.workspace.ownerId === user.id && !m.isDefault).length;
  if (account.plan.workspaces !== null && owned >= account.plan.workspaces) {
    const n = account.plan.workspaces;
    throw new McpDenied(`The ${account.plan.name} plan includes ${n} workspace${n === 1 ? '' : 's'}. Teams has unlimited workspaces.`);
  }
  const { data: ws, error } = await db().from('workspaces').insert({ account_id: account.id, owner_id: user.id, name: label, created_by: user.id }).select('id').single();
  if (error || !ws) throw new McpDenied(error?.message || 'Could not create the workspace.');
  await db().from('workspace_members').insert({ workspace_id: ws.id, user_id: user.id, role: 'admin' });
  return { id: ws.id, name: label };
}

export async function inviteMember(workspaceId: string, email: string | null, role: 'admin' | 'member') {
  if (!ID.test(workspaceId)) throw new McpDenied('Unknown workspace.');
  const ctx = await getWorkspaceContext(workspaceId);
  if (!ctx?.isAdmin) throw new McpDenied('Only this workspace’s admins can add people.');
  if (!ctx.canAddMembers) throw new McpDenied('Adding team members needs the Teams plan.');
  const user = await signedIn();
  const account = await getPersonalAccount(ctx.workspace.ownerId);
  if (!account) throw new McpDenied('This account is not set up yet.');
  const token = randomBytes(24).toString('base64url');
  const clean = email?.trim().toLowerCase().slice(0, 200) || null;
  const { error } = await db().from('account_invites').insert({
    account_id: account.id, workspace_id: workspaceId, email: clean, role, token, invited_by: user.id,
  });
  if (error) throw new McpDenied(error.message);
  return { link: `${siteOrigin()}/invite/${token}`, role, expiresInDays: 14 };
}

async function workspaceOf(workspaceId: string) {
  if (!ID.test(workspaceId)) throw new McpDenied('Unknown workspace.');
  const ctx = await getWorkspaceContext(workspaceId);
  if (!ctx) throw new McpDenied('You are not in this workspace.');
  return ctx;
}

export async function listScopes(workspaceId: string) {
  const ctx = await workspaceOf(workspaceId);
  const [own, catalog, use, { data: defRows }, { data: ws }] = await Promise.all([
    getWorkspaceScopes(workspaceId), getCatalogScopes(), workspaceScopeUse(workspaceId),
    db().from('scopes').select('id, name, active').eq('is_default', true).limit(1),
    db().from('workspaces').select('show_default').eq('id', workspaceId).maybeSingle(),
  ]);
  const picked = new Set(use.pickIds);
  const general = (defRows || [])[0];
  const custom = own.filter((s) => !s.isDefault && !s.catalog);
  const otherOn = custom.some((s) => s.active) || picked.size > 0;
  const generalOn = ws?.show_default !== false || !otherOn;
  return {
    planScopes: ctx.plan.scopes >= 1000 ? null : ctx.plan.scopes,
    used: use.custom + use.pickIds.length,
    canCustomize: ctx.canCustomize,
    scopes: [
      ...(general ? [{ id: general.id, name: general.name, kind: 'general', active: generalOn, editable: false }] : []),
      ...catalog.map((s) => ({ id: s.id, name: s.name, kind: 'catalog', active: picked.has(s.id), editable: false })),
      ...custom.map((s) => ({ id: s.id, name: s.name, kind: 'custom', active: s.active, editable: ctx.canCustomize && ctx.isAdmin })),
    ],
  };
}

export async function createScope(workspaceId: string, name: string, instructions?: string) {
  const ctx = await workspaceOf(workspaceId);
  if (!ctx.canCustomize) throw new McpDenied('Custom scopes start on Starter.');
  const use = await workspaceScopeUse(workspaceId);
  if (!ctx.isDefault && use.custom + use.pickIds.length >= ctx.plan.scopes) {
    throw new McpDenied(`The ${ctx.plan.name} plan includes ${ctx.plan.scopes} scope${ctx.plan.scopes === 1 ? '' : 's'} besides General.`);
  }
  const label = name.trim().slice(0, 120);
  if (!label) throw new McpDenied('Give the scope a name.');
  const user = await signedIn();
  const { data, error } = await db().from('scopes').insert({
    owner_id: user.id, workspace_id: workspaceId, name: label, instructions: instructions?.trim().slice(0, 30_000) || null, active: true,
  }).select('id').single();
  if (error || !data) throw new McpDenied(error?.message || 'Could not create the scope.');
  return { id: data.id, name: label };
}

export async function updateScope(scopeId: string, patch: { name?: string; instructions?: string; active?: boolean }) {
  if (!ID.test(scopeId)) throw new McpDenied('Unknown scope.');
  const { data: row } = await db().from('scopes').select('id, is_default, catalog').eq('id', scopeId).maybeSingle();
  if (!row) throw new McpDenied('Unknown scope.');
  if (row.is_default) {
    if (patch.name != null || patch.instructions != null) throw new McpDenied('Shared scopes cannot be edited.');
    if (patch.active == null) return { id: scopeId };
    const ctx = await getContext();
    if (!ctx?.isAdmin) throw new McpDenied('Only this workspace’s admins can change it.');
    if (!patch.active) {
      const use = await workspaceScopeUse(ctx.workspace.id);
      const { count } = await db().from('scopes').select('id', { count: 'exact', head: true })
        .eq('workspace_id', ctx.workspace.id).eq('active', true).eq('is_default', false).eq('catalog', false);
      if (!count && !use.pickIds.length) throw new McpDenied('Turn on another scope before switching off General.');
    }
    await db().from('workspaces').update({ show_default: patch.active }).eq('id', ctx.workspace.id);
    return { id: scopeId, active: patch.active };
  }
  const scope = await getEditableScope(scopeId);
  if (!scope) throw new McpDenied(row.catalog ? 'Shared scopes cannot be edited.' : 'Only this workspace’s admins can change it, on a plan that allows customizing.');
  const next: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name != null) {
    const name = patch.name.trim().slice(0, 120);
    if (!name) throw new McpDenied('Give the scope a name.');
    next.name = name;
  }
  if (patch.instructions != null) next.instructions = patch.instructions.trim().slice(0, 30_000) || null;
  if (patch.active != null) next.active = patch.active;
  await db().from('scopes').update(next).eq('id', scopeId);
  return { id: scopeId, ...patch };
}

export async function setCatalogScope(workspaceId: string, scopeId: string, enabled: boolean) {
  const ctx = await workspaceOf(workspaceId);
  if (!ctx.isAdmin) throw new McpDenied('Only this workspace’s admins can change it.');
  const { data: scope } = await db().from('scopes').select('id, catalog, active').eq('id', scopeId).maybeSingle();
  if (!scope?.catalog || !scope.active) throw new McpDenied('Unknown catalog scope.');
  if (!enabled) {
    await db().from('workspace_scope_picks').delete().eq('workspace_id', workspaceId).eq('scope_id', scopeId);
    return { scopeId, enabled: false };
  }
  const use = await workspaceScopeUse(workspaceId);
  if (use.pickIds.includes(scopeId)) return { scopeId, enabled: true };
  const limit = ctx.isDefault ? 1000 : ctx.plan.scopes;
  const replacing = replacesCatalogPick(limit, use.custom, use.pickIds.length);
  if (!replacing && use.custom + use.pickIds.length >= limit) {
    throw new McpDenied(`The ${ctx.plan.name} plan includes ${ctx.plan.scopes} scope${ctx.plan.scopes === 1 ? '' : 's'} besides General.`);
  }
  if (replacing) {
    const { error: removed } = await db().from('workspace_scope_picks').delete().eq('workspace_id', workspaceId).neq('scope_id', scopeId);
    if (removed) throw new McpDenied(removed.message);
  }
  const { error } = await db().from('workspace_scope_picks').upsert(
    { workspace_id: workspaceId, scope_id: scopeId }, { onConflict: 'workspace_id,scope_id', ignoreDuplicates: true });
  if (error) throw new McpDenied(error.message);
  return { scopeId, enabled: true };
}

export async function listScopeAgents(scopeId: string) {
  const user = await signedIn();
  const scope = await getViewableScope(scopeId);
  if (!scope) throw new McpDenied('Unknown scope.');
  const ctx = await getContext();
  const plan = ctx?.plan ?? (await getPersonalAccount(user.id))?.plan;
  const rows = await getScopeAgents(scopeId);
  return {
    scopeId, editable: scope.editable,
    agents: AGENTS.filter((a) => SCOPE_AGENT_KEYS.includes(a.key)).map((a) => {
      const row = rows.get(a.key);
        const included = !!plan && !agentIncluded(a.key, plan);
      return {
        key: a.key, name: a.name, role: a.role, runs: a.runs, included,
        enabled: included && (row?.enabled ?? true),
        instructions: row?.instructions ?? null,
        customised: !!row?.prompt_override,
      };
    }),
  };
}

function agentIncluded(key: string, plan: { evaluationsPerMonth: number | null; proposalsPerMonth: number | null; newsReportsPerMonth: number | null }) {
  if (key === 'tender_evaluation' && !planIncludes(plan.evaluationsPerMonth)) return 'This plan does not include Tender Evaluation.';
  if (key === 'proposal_manager' && !planIncludes(plan.proposalsPerMonth)) return 'Proposal briefs are included on Teams.';
  if (key === 'news_report' && !planIncludes(plan.newsReportsPerMonth)) return 'The News Report Agent is included on Pro and Teams.';
  return null;
}

export async function configureScopeAgent(input: {
  scopeId: string; agent: string; enabled?: boolean; instructions?: string; searchConfig?: unknown;
}) {
  const scope = await getEditableScope(input.scopeId);
  if (!scope) throw new McpDenied('Only this workspace’s admins can change it, on a plan that allows customizing.');
  if (!SCOPE_AGENT_KEYS.includes(input.agent)) throw new McpDenied('Unknown scope agent.');
  const ctx = await getWorkspaceContext(scope.workspaceId);
  if (!ctx) throw new McpDenied('You are not in this workspace.');
  if (input.enabled) {
    const why = agentIncluded(input.agent, ctx.plan);
    if (why) throw new McpDenied(why);
  }
  const now = new Date().toISOString();
  if (input.agent === 'search') {
    if (input.searchConfig != null) {
      let parsed;
      try { parsed = validateSearchConfig(input.searchConfig); }
      catch (e: any) { throw new McpDenied(e.message || 'That search configuration is not valid.'); }
      await db().from('scopes').update({ search_config: parsed, search_status: 'applied', search_error: null, search_parsed_at: now, updated_at: now }).eq('id', scope.id);
    }
    if (input.instructions != null) {
      const text = input.instructions.trim().slice(0, 8000);
      if (!text) {
        await db().from('scopes').update({ search_scope: null, search_config: null, search_status: null, search_error: null, updated_at: now }).eq('id', scope.id);
      } else {
        try {
          const { data: triage } = await db().from('agent_settings').select('default_prompt').eq('agent_key', 'triage').maybeSingle();
          const config = await parseSearchScope(text, triage?.default_prompt || '');
          await db().from('scopes').update({ search_scope: text, search_config: config, search_status: 'applied', search_error: null, search_parsed_at: now, updated_at: now }).eq('id', scope.id);
        } catch (e) {
          const message = friendlyError(e);
          await db().from('scopes').update({ search_scope: text, search_status: 'error', search_error: message, updated_at: now }).eq('id', scope.id);
          throw new McpDenied(`Saved the text, but it could not be applied: ${message}`);
        }
      }
    }
  } else if (input.instructions != null) {
    const agent = AGENTS.find((a) => a.key === input.agent);
    const instructions = input.instructions.trim().slice(0, 6000);
    const { data: defaults } = await db().from('agent_settings').select('default_prompt').eq('agent_key', input.agent).maybeSingle();
    const base = defaults?.default_prompt as string | undefined;
    if (!instructions) {
      await db().from('scope_agent_settings').upsert({ scope_id: scope.id, agent_key: input.agent, instructions: null, prompt_override: null, status: null, error: null, updated_at: now }, { onConflict: 'scope_id,agent_key' });
    } else if (!base || !agent) {
      throw new McpDenied('This agent’s default configuration is not ready yet.');
    } else {
      try {
        const { data: row } = await db().from('scope_agent_settings').select('prompt_override').eq('scope_id', scope.id).eq('agent_key', input.agent).maybeSingle();
        const { prompt } = await tunePrompt(agent.name, agent.role, base, row?.prompt_override || base, instructions);
        await db().from('scope_agent_settings').upsert({ scope_id: scope.id, agent_key: input.agent, instructions, prompt_override: prompt, status: 'applied', error: null, updated_at: now }, { onConflict: 'scope_id,agent_key' });
      } catch (e) {
        const message = friendlyError(e);
        await db().from('scope_agent_settings').upsert({ scope_id: scope.id, agent_key: input.agent, instructions, status: 'error', error: message, updated_at: now }, { onConflict: 'scope_id,agent_key' });
        throw new McpDenied(`Saved the text, but it could not be applied: ${message}`);
      }
    }
  }
  if (input.enabled != null) {
    await db().from('scope_agent_settings').upsert({ scope_id: scope.id, agent_key: input.agent, enabled: input.enabled, updated_at: now }, { onConflict: 'scope_id,agent_key' });
  }
  return { scopeId: scope.id, agent: input.agent, enabled: input.enabled ?? null };
}

async function scopedIds(type: 'tender' | 'news', limit: number) {
  const { scopes } = await getViewScopes();
  if (!scopes.length) return { scopes: [], ids: [] as { id: string; relevance: number }[] };
  const { data } = await db().from('scope_items').select('item_id, relevance').eq('item_type', type).in('scope_id', scopes.map((s) => s.id)).order('relevance', { ascending: false }).limit(Math.min(limit * 4, 200));
  const best = new Map<string, number>();
  for (const r of data || []) best.set(r.item_id, Math.max(best.get(r.item_id) ?? -1, r.relevance ?? 0));
  const ids = Array.from(best, ([id, relevance]) => ({ id, relevance })).sort((a, b) => b.relevance - a.relevance).slice(0, limit);
  return { scopes, ids };
}

export async function listTenders(limit: number) {
  await signedIn();
  const { ids } = await scopedIds('tender', limit);
  if (!ids.length) return [];
  const { data } = await db().from('opportunities').select('opportunity_id, title, title_en, language, country, authority, authority_en, opportunity_type, status, deadline, estimated_value, currency, publication_date').in('opportunity_id', ids.map((i) => i.id));
  const byId = new Map((data || []).map((o: any) => [o.opportunity_id, o]));
  return ids.map(({ id, relevance }) => {
    const o = byId.get(id);
    if (!o) return null;
    return { id, title: titleOf(o), buyer: buyerOf(o), country: o.country, type: o.opportunity_type, status: o.status, deadline: o.deadline, value: o.estimated_value, currency: o.currency, published: o.publication_date, relevance };
  }).filter(Boolean);
}

export async function getTender(id: string) {
  const user = await signedIn();
  const ctx = await getContext();
  const plan = ctx?.plan ?? (await getPersonalAccount(user.id))?.plan;
  if (!plan) throw new McpDenied('This account is not set up yet.');
  const { data: o } = await db().from('opportunities').select('opportunity_id, title, title_en, language, country, authority, authority_en, opportunity_type, status, summary, tender_summary, deadline, estimated_value, currency, publication_date, official_url').eq('opportunity_id', id).maybeSingle();
  if (!o) throw new McpDenied('Unknown tender.');
  const { data: requirementRows } = await db().from('requirements').select('requirement_group, category, requirement_text, mandatory').eq('opportunity_id', id).limit(200);
  const requirements = requirementRows || [];
  const { scopes } = await getViewScopes();
  let evaluation: unknown = null;
  let proposal: unknown = null;
  if (scopes.length && planIncludes(plan.evaluationsPerMonth)) {
    const { data: rows } = await db().from('scope_evaluations').select('scope_id, workspace_id, evaluation, proposal_brief, proposal_at').eq('opportunity_id', id).in('scope_id', scopes.map((s) => s.id));
    const ws = ctx?.workspace.id;
    const pick = (rows || []).find((r: any) => ws && r.workspace_id === ws) || (rows || []).find((r: any) => !r.workspace_id);
    evaluation = pick?.evaluation ?? null;
    proposal = planIncludes(plan.proposalsPerMonth) ? pick?.proposal_brief ?? null : null;
  }
  const comments = await getCommentTree('tender', id, user.id);
  return {
    id: o.opportunity_id, title: titleOf(o), buyer: buyerOf(o), country: o.country, type: o.opportunity_type, status: o.status,
    summary: publicText(o.tender_summary || o.summary || ''), deadline: o.deadline, value: o.estimated_value, currency: o.currency, published: o.publication_date, url: o.official_url,
    requirements, evaluation, proposal, comments: comments.tree, commentCount: comments.total,
  };
}

export async function listNews(limit: number) {
  await signedIn();
  const { ids } = await scopedIds('news', limit);
  if (!ids.length) return [];
  const { data } = await db().from('news_items').select('news_id, title, title_en, language, category, source_name, published_date, excerpt').in('news_id', ids.map((i) => i.id));
  const byId = new Map((data || []).map((n: any) => [n.news_id, n]));
  return ids.map(({ id, relevance }) => {
    const n = byId.get(id);
    if (!n) return null;
    return { id, title: titleOf(n), category: n.category, source: n.source_name, published: n.published_date, excerpt: publicText(n.excerpt || ''), relevance };
  }).filter(Boolean);
}

export async function getNews(id: string) {
  const user = await signedIn();
  const ctx = await getContext();
  const plan = ctx?.plan ?? (await getPersonalAccount(user.id))?.plan;
  if (!plan) throw new McpDenied('This account is not set up yet.');
  const { data: n } = await db().from('news_items').select('news_id, title, title_en, language, category, source_name, published_date, excerpt, summary, summary_long, source_url').eq('news_id', id).maybeSingle();
  if (!n) throw new McpDenied('Unknown story.');
  const allowed = planIncludes(plan.newsReportsPerMonth);
  let reports: unknown[] = [];
  if (allowed) {
    const { scopes } = await getViewScopes();
    if (scopes.length) {
      const { data } = await db().from('scope_news_reports').select('scope_id, analysis, analysed_at, error').eq('news_id', id).in('scope_id', scopes.map((s) => s.id));
      reports = data || [];
    }
  }
  const comments = await getCommentTree('news', id, user.id);
  return {
    id: n.news_id, title: titleOf(n), category: n.category, source: n.source_name, published: n.published_date,
    excerpt: publicText(n.excerpt || ''), summary: publicText(n.summary || ''), reportSummary: allowed ? publicText(n.summary_long || '') : null, url: n.source_url, reports, comments: comments.tree, commentCount: comments.total,
  };
}

export async function listPosts(limit: number) {
  await signedIn();
  const { data } = await db().from('posts').select('id, title, body, tags, like_count, created_at, user_id').order('created_at', { ascending: false }).limit(limit);
  const ids = Array.from(new Set((data || []).map((p: any) => p.user_id)));
  const { data: people } = ids.length ? await db().from('profiles').select('id, username, display_name').in('id', ids) : { data: [] as any[] };
  const who = new Map((people || []).map((p: any) => [p.id, p.display_name || p.username]));
  return (data || []).map((p: any) => ({
    id: p.id, title: p.title, excerpt: String(p.body || '').replace(/\s+/g, ' ').slice(0, 280), tags: p.tags || [], likes: p.like_count || 0, createdAt: p.created_at, author: who.get(p.user_id) || null,
  }));
}

export async function getPost(id: string) {
  const user = await signedIn();
  if (!ID.test(id)) throw new McpDenied('Unknown post.');
  const { data: post } = await db().from('posts').select('id, title, body, tags, like_count, created_at, user_id').eq('id', id).maybeSingle();
  if (!post) throw new McpDenied('Unknown post.');
  const { data: author } = await db().from('profiles').select('username, display_name').eq('id', post.user_id).maybeSingle();
  const comments = await getCommentTree('post', id, user.id);
  return {
    id: post.id, title: post.title, body: post.body, tags: post.tags || [], likes: post.like_count || 0, createdAt: post.created_at,
    author: author?.display_name || author?.username || null, comments: comments.tree, commentCount: comments.total,
  };
}

export async function getComments(itemType: 'post' | 'news' | 'tender', itemId: string) {
  const user = await signedIn();
  return getCommentTree(itemType, itemId, user.id);
}

export async function getScopeReport(scopeId: string, kind: 'tender_evaluation' | 'proposal_brief' | 'news_report', itemId: string) {
  const user = await signedIn();
  const scope = await getViewableScope(scopeId);
  if (!scope) throw new McpDenied('Unknown scope.');
  const ctx = await getContext();
  const plan = ctx?.plan ?? (await getPersonalAccount(user.id))?.plan;
  if (!plan) throw new McpDenied('This account is not set up yet.');
  const why = agentIncluded(kind === 'proposal_brief' ? 'proposal_manager' : kind, plan);
  if (why) throw new McpDenied(why);
  if (kind === 'news_report') {
    const { data } = await db().from('scope_news_reports').select('analysis, analysed_at, error').match({ scope_id: scopeId, news_id: itemId }).maybeSingle();
    return { scopeId, kind, itemId, report: data?.analysis ?? null, at: data?.analysed_at ?? null, error: data?.error ?? null };
  }
  const ws = ctx?.workspace.id;
  const { data: rows } = await db().from('scope_evaluations').select('workspace_id, evaluation, proposal_brief, proposal_at').match({ scope_id: scopeId, opportunity_id: itemId });
  const pick = (rows || []).find((r: any) => ws && r.workspace_id === ws) || (rows || []).find((r: any) => !r.workspace_id);
  if (kind === 'proposal_brief') return { scopeId, kind, itemId, report: pick?.proposal_brief ?? null, at: pick?.proposal_at ?? null };
  return { scopeId, kind, itemId, report: pick?.evaluation ?? null };
}

export async function runScopeAgent(scopeId: string, agent: 'tender_evaluation' | 'proposal_manager' | 'news_report', itemId: string) {
  await signedIn();
  const ctx = await getContext();
  if (!ctx) throw new McpDenied('Choose a workspace you belong to.');
  const why = agentIncluded(agent, ctx.plan);
  if (why) throw new McpDenied(why);
  if (agent === 'news_report') {
    const allowance = await newsReportAllowance();
    if (allowance.block === 'plan') throw new McpDenied('The News Report Agent is included on Pro and Teams.');
    if (allowance.block === 'quota') throw new McpDenied(`This workspace has used its ${allowance.limit} news reports for this month.`);
    const result = await ensureNewsReport(itemId, scopeId);
    if (result.status === 'error' && result.message === 'plan') return { status: 'error' as const, message: 'The News Report Agent is included on Pro and Teams.' };
    if (result.status === 'error' && result.message === 'quota') return { status: 'error' as const, message: `This workspace has used its ${allowance.limit} news reports for this month.` };
    return result;
  }
  if (agent === 'tender_evaluation') return startTenderEvaluation(itemId, scopeId);
  return startProposalBrief(itemId, scopeId);
}
