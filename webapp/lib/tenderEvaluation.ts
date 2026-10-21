/**
 * Tender Evaluation Agent — per scope, run from a tender's page with a button.
 * Reads the tender (the Tender Analysis Agent's summary and requirements,
 * plus the award criteria) against the scope's instructions and context
 * documents, and writes — for that scope — a match status for each
 * requirement, a fit score and a bid report (scope_evaluations).
 * (prompt: agents/tender_evaluation.md, or the scope's fine-tuned version.)
 */
import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseServerClient } from '@/lib/supabase';
import { agentPrompt, companyBrief, isAgentEnabled, namedCompany } from '@/lib/settings';
import { friendly, lockEvaluation, unlockEvaluation } from '@/lib/scopeWork';
import { getScope } from '@/lib/scopes';
import { agentRunAllowance, recordAgentRun } from '@/lib/agentQuota';
import { getT } from '@/lib/i18n/server';
import { getCurrentUser } from '@/lib/auth';
import { alignSubmissionDeadline } from '@/lib/deadlineCopy';
import { recordProductEvent } from '@/lib/productRecord';

export const EVALUATION_AGENT = 'Tender Evaluation Agent';
const MODEL = 'claude-opus-5-5';
const MATCHES = ['MATCH', 'PARTIAL_MATCH', 'PARTNER_NEEDED', 'NO_MATCH', 'UNKNOWN'];
const VERDICTS = ['bid', 'bid_with_partner', 'consider', 'no_bid'];
// A run that started longer ago than this is presumed dead and may be retried.
const LOCK_MINUTES = 5;

export type EvaluationStatus = 'done' | 'running' | 'error';

// Its fine-tuned prompt from Settings (or agents/tender_evaluation.md), with the company's
// context and uploaded material in place of {company_brief}.
async function systemPrompt(scopeId: string, workspaceId: string | null) {
  const [prompt, brief] = await Promise.all([
    namedCompany(scopeId, workspaceId).then((name) => agentPrompt('tender_evaluation', 'tender_evaluation.md', scopeId, name)),
    companyBrief({ withDocuments: true, scopeId, workspaceId }),
  ]);
  return prompt.replace('{company_brief}', brief);
}

/** A custom scope with no instructions and no company documents has nothing to score against. */
async function hasCompanyContext(scopeId: string) {
  const scope = await getScope(scopeId);
  if (!scope || scope.isDefault || scope.catalog) return true;
  if (scope.instructions?.trim()) return true;
  const { count } = await getSupabaseServerClient().from('company_documents').select('id', { count: 'exact', head: true })
    .eq('scope_id', scopeId).is('workspace_id', null);
  return (count ?? 0) > 0;
}

/** A shared scope uses one evaluation until this workspace has its own documents. */
async function evaluationWorkspace(scopeId: string, workspaceId: string | null): Promise<string | null> {
  if (!workspaceId) return null;
  const scope = await getScope(scopeId);
  if (!scope?.isDefault && !scope?.catalog) return null;
  const { count } = await getSupabaseServerClient().from('company_documents').select('id', { count: 'exact', head: true })
    .eq('scope_id', scopeId).eq('workspace_id', workspaceId);
  return (count ?? 0) > 0 ? workspaceId : null;
}

function parseJson(text: string) {
  const start = text.indexOf('{');
  for (let end = text.lastIndexOf('}'); end > start; end = text.lastIndexOf('}', end - 1)) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch { /* try a shorter span */ }
  }
  throw new Error('The agent did not return a readable report.');
}

/**
 * Run the evaluation unless one is already running (two clicks, or two
 * people, share one run: the second gets 'running' and waits for the page).
 */
export async function ensureEvaluation(opportunityId: string, scopeId: string, workspaceId: string | null = null, onboard = false): Promise<{ status: EvaluationStatus; message?: string }> {
  if (!(await isAgentEnabled('tender_evaluation', scopeId))) return { status: 'error', message: 'the Tender Evaluation Agent is switched off for this scope' };
  const allowance = await agentRunAllowance('tender_evaluation');
  const t = await getT();
  const user = await getCurrentUser();
  const base = { userId: user?.id || null, scopeId, contentId: opportunityId, path: `/tenders/${opportunityId}`, pageType: 'tender' as const, demo: false };
  if (!onboard && allowance.block === 'plan') {
    await recordProductEvent({ ...base, name: 'gate_viewed', entitlement: 'plan_restriction', errorCode: 'plan', ok: false });
    await recordProductEvent({ ...base, name: 'evaluation_failed', entitlement: 'plan_restriction', errorCode: 'plan', ok: false });
    return { status: 'error', message: t('This plan does not include Tender Evaluation.') };
  }
  if (!onboard && allowance.block === 'quota') {
    await recordProductEvent({ ...base, name: 'gate_viewed', entitlement: 'usage_exhausted', errorCode: 'quota', ok: false });
    await recordProductEvent({ ...base, name: 'evaluation_failed', entitlement: 'usage_exhausted', errorCode: 'quota', ok: false });
    return { status: 'error', message: t('This workspace has used its {n} tender evaluations for this month.', { n: allowance.limit ?? 0 }) };
  }
  const owner = await evaluationWorkspace(scopeId, workspaceId);
  if (workspaceId && !owner) {
    const db = getSupabaseServerClient();
    await db.from('scope_evaluations').delete().match({ scope_id: scopeId, opportunity_id: opportunityId, workspace_id: workspaceId });
    const { data: reqs } = await db.from('requirements').select('requirement_id').eq('opportunity_id', opportunityId);
    const reqIds = (reqs || []).map((r: any) => r.requirement_id);
    if (reqIds.length) await db.from('requirement_matches').delete().eq('scope_id', scopeId).eq('workspace_id', workspaceId).in('requirement_id', reqIds);
  }
  if (!(await lockEvaluation(scopeId, opportunityId, owner, 'evaluation_started_at', 'evaluation_error', LOCK_MINUTES))) return { status: 'running' };
  try {
    const { ensureTenderAnalysis } = await import('@/lib/tenderAnalysis');
    await ensureTenderAnalysis(opportunityId);
    if (!(await hasCompanyContext(scopeId))) {
      const db = getSupabaseServerClient();
      let mark = db.from('scope_evaluations').update({
        evaluated_at: new Date().toISOString(), evaluation_error: null,
      }).eq('scope_id', scopeId).eq('opportunity_id', opportunityId);
      mark = owner ? mark.eq('workspace_id', owner) : mark.is('workspace_id', null);
      const { error } = await mark;
      if (error) throw new Error(error.message);
      await unlockEvaluation(scopeId, opportunityId, owner, 'evaluation_started_at', 'evaluation_error', null);
      await recordProductEvent({ ...base, name: 'gate_viewed', entitlement: 'missing_company_context', errorCode: 'context', ok: false });
      return { status: 'done' };
    }
    await recordProductEvent({ ...base, name: 'evaluation_requested', entitlement: onboard ? 'onboard' : null, ok: true });
    await runEvaluation(opportunityId, scopeId, owner);
    if (!onboard && allowance.accountId && allowance.limit != null) await recordAgentRun(allowance.accountId, 'tender_evaluation');
    await unlockEvaluation(scopeId, opportunityId, owner, 'evaluation_started_at', 'evaluation_error', null);
    await recordProductEvent({ ...base, name: 'evaluation_completed', entitlement: onboard ? 'onboard' : 'included', ok: true, dedupe: `eval-live:${scopeId}:${opportunityId}:${owner || 'shared'}:${Date.now()}` });
    return { status: 'done' };
  } catch (e: any) {
    const message = friendly(e);
    await unlockEvaluation(scopeId, opportunityId, owner, 'evaluation_started_at', 'evaluation_error', message);
    await recordProductEvent({ ...base, name: 'evaluation_failed', errorCode: 'run_failed', ok: false });
    return { status: 'error', message };
  }
}

async function runEvaluation(opportunityId: string, scopeId: string, workspaceId: string | null) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not configured on the server.');
  const db = getSupabaseServerClient();
  const [{ data: o }, { data: reqs }, { data: award }] = await Promise.all([
    db.from('opportunities').select('*').eq('opportunity_id', opportunityId).single(),
    db.from('requirements').select('requirement_id, requirement_group, category, requirement_text, mandatory, threshold, evidence_required')
      .eq('opportunity_id', opportunityId),
    db.from('award_criteria').select('criterion, weight, subcriteria').eq('opportunity_id', opportunityId),
  ]);
  if (!o) throw new Error('Tender not found.');
  if (!o.tender_summary && !(reqs || []).length) {
    throw new Error('the Tender Analysis Agent has not read this tender yet');
  }

  // Short ids keep the prompt and the answer compact.
  const ids = new Map<string, string>();
  const reqLines = (reqs || []).map((r: any, i: number) => {
    ids.set(`R${i + 1}`, r.requirement_id);
    return `R${i + 1} [${r.requirement_group || r.category}${r.mandatory ? ', mandatory' : ', optional'}] ${r.requirement_text}`
      + (r.threshold ? ` — threshold: ${r.threshold}` : '') + (r.evidence_required ? ` — evidence: ${r.evidence_required}` : '');
  });
  const tender = [
    `Title: ${o.title_en || o.title}`, `Buyer: ${o.authority_en || o.authority || 'unknown'} (${o.country || 'international'})`,
    o.estimated_value && `Value: ${o.currency || ''} ${o.estimated_value}`, o.deadline && `Deadline: ${String(o.deadline).slice(0, 10)}`,
    `\nSummary:\n${alignSubmissionDeadline(o.tender_summary || o.summary || '', o.deadline) || '(none)'}`,
    `\nAward criteria:\n${(award || []).map((a: any) => `- ${a.criterion} ${a.weight ?? '?'}%: ${a.subcriteria?.name_en || a.subcriteria?.name || ''} ${a.subcriteria?.description_en || ''}`).join('\n') || '(none)'}`,
    `\nRequirements:\n${reqLines.join('\n') || '(none extracted)'}`,
  ].filter(Boolean).join('\n');

  const client = new Anthropic({
    defaultHeaders: process.env.ANTHROPIC_WORKSPACE_ID ? { 'anthropic-workspace-id': process.env.ANTHROPIC_WORKSPACE_ID } : undefined,
  });
  const response: any = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: await systemPrompt(scopeId, workspaceId),
    messages: [{ role: 'user', content: tender }],
    betas: ['server-side-fallback-2026-07-01'],
    output_config: { effort: 'medium' },
    fallbacks: 'default',
  } as any);
  if (response.stop_reason === 'refusal') throw new Error('The agent declined to evaluate this tender.');
  const out = parseJson((response.content as any[]).filter((b) => b.type === 'text').map((b) => b.text).join(''));

  const matches = (Array.isArray(out.matches) ? out.matches : [])
    .filter((m: any) => ids.has(m?.id))
    .map((m: any) => ({
      requirement_id: ids.get(m.id)!, scope_id: scopeId, workspace_id: workspaceId,
      match_status: MATCHES.includes(String(m.match).toUpperCase()) ? String(m.match).toUpperCase() : 'UNKNOWN',
      notes: m.note ? String(m.note).slice(0, 1000) : null,
    }));
  const reqIds = Array.from(ids.values());
  if (reqIds.length) {
    let del = db.from('requirement_matches').delete().eq('scope_id', scopeId).in('requirement_id', reqIds);
    del = workspaceId ? del.eq('workspace_id', workspaceId) : del.is('workspace_id', null);
    const { error } = await del;
    if (error) throw new Error(error.message);
  }
  if (matches.length) {
    const { error } = await db.from('requirement_matches').insert(matches);
    if (error) throw new Error(error.message);
  }

  const fit = Math.max(0, Math.min(100, Math.round(Number(out.fit_score) || 0)));
  const list = (x: any) => (Array.isArray(x) ? x : []);
  const evaluation = {
    agent: EVALUATION_AGENT,
    fit_score: fit,
    verdict: VERDICTS.includes(out.verdict) ? out.verdict : 'consider',
    take: String(out.take || '').trim(),
    strengths: list(out.strengths).map(String).slice(0, 8),
    gaps: list(out.gaps).map(String).slice(0, 10),
    partners: list(out.partners).filter((p: any) => p?.role).slice(0, 6),
    next_steps: list(out.next_steps).filter((s: any) => s?.title).slice(0, 8),
    model: response.model ?? MODEL,
  };
  let saved = db.from('scope_evaluations').update({
    evaluation, evaluated_at: new Date().toISOString(), evaluation_error: null,
  }).eq('scope_id', scopeId).eq('opportunity_id', opportunityId);
  saved = workspaceId ? saved.eq('workspace_id', workspaceId) : saved.is('workspace_id', null);
  const { error } = await saved;
  if (error) throw new Error(error.message);
}
