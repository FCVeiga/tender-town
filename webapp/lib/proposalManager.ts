/**
 * Proposal Manager Agent — the bid manager for one tender.
 * Runs only after a fit evaluation, and only when the scope has company
 * information. Reads the buyer's forms and annexes and writes the submission:
 * the document list, each document filled from the company file, and the
 * each document filled from the company file, and the next steps.
 * (prompt: agents/proposal_manager.md; company material: Settings.)
 */
import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseServerClient } from '@/lib/supabase';
import { agentPrompt, companyBrief, isAgentEnabled, namedCompany } from '@/lib/settings';
import { friendly, lockEvaluation, unlockEvaluation } from '@/lib/scopeWork';
import { getScope } from '@/lib/scopes';
import { agentRunAllowance, recordAgentRun } from '@/lib/agentQuota';
import { getT } from '@/lib/i18n/server';
import { getCurrentUser } from '@/lib/auth';
import { recordProductEvent } from '@/lib/productRecord';
import { submissionDocumentTexts } from '@/lib/tenderAnalysis';
import { normaliseBrief, parseProposalBrief } from '@/lib/proposalBrief';

const MODEL = 'claude-opus-5-5';
const LOCK_MINUTES = 6;
const GROUPS: Record<string, string> = {
  ELIGIBILITY: 'Eligibility', REFERENCES: 'Project references', HUMAN_RESOURCES: 'Human resources', TECHNICAL: 'Technical & project',
};
const NEED_CONTEXT = 'Add your company information on this scope before a proposal brief.';

export type ProposalStatus = 'done' | 'running' | 'error';

async function hasCompanyContext(scopeId: string) {
  const scope = await getScope(scopeId);
  if (!scope || scope.isDefault || scope.catalog) return true;
  if (scope.instructions?.trim()) return true;
  const { count } = await getSupabaseServerClient().from('company_documents').select('id', { count: 'exact', head: true })
    .eq('scope_id', scopeId).is('workspace_id', null);
  return (count ?? 0) > 0;
}

async function proposalWorkspace(scopeId: string, workspaceId: string | null): Promise<string | null> {
  if (!workspaceId) return null;
  const scope = await getScope(scopeId);
  if (!scope?.isDefault && !scope?.catalog) return null;
  const { count } = await getSupabaseServerClient().from('company_documents').select('id', { count: 'exact', head: true })
    .eq('scope_id', scopeId).eq('workspace_id', workspaceId);
  return (count ?? 0) > 0 ? workspaceId : null;
}

export async function ensureProposal(opportunityId: string, scopeId: string, workspaceId: string | null = null, onboard = false): Promise<{ status: ProposalStatus; message?: string }> {
  if (!(await isAgentEnabled('proposal_manager', scopeId))) return { status: 'error', message: 'the Proposal Manager Agent is switched off for this scope' };
  const allowance = await agentRunAllowance('proposal_manager');
  const t = await getT();
  const user = await getCurrentUser();
  const base = { userId: user?.id || null, scopeId, contentId: opportunityId, path: `/tenders/${opportunityId}`, pageType: 'tender' as const, demo: false };
  if (!onboard && allowance.block) {
    const entitlement = allowance.block === 'quota' ? 'usage_exhausted' : 'plan_restriction';
    await recordProductEvent({ ...base, name: 'gate_viewed', entitlement, errorCode: allowance.block, ok: false });
    await recordProductEvent({ ...base, name: 'proposal_brief_failed', entitlement, errorCode: allowance.block, ok: false });
    return { status: 'error', message: t('Proposal briefs are included on Teams.') };
  }
  const owner = await proposalWorkspace(scopeId, workspaceId);
  const { data: existing } = await (owner
    ? getSupabaseServerClient().from('scope_evaluations').select('evaluation').match({ scope_id: scopeId, opportunity_id: opportunityId, workspace_id: owner })
    : getSupabaseServerClient().from('scope_evaluations').select('evaluation').eq('scope_id', scopeId).eq('opportunity_id', opportunityId).is('workspace_id', null)
  ).maybeSingle();
  if (!existing?.evaluation) {
    await recordProductEvent({ ...base, name: 'gate_viewed', entitlement: 'missing_evaluation', errorCode: 'prerequisite', ok: false });
    await recordProductEvent({ ...base, name: 'proposal_brief_failed', entitlement: 'missing_evaluation', errorCode: 'prerequisite', ok: false });
    return { status: 'error', message: 'run the Tender Evaluation Agent for this scope first' };
  }
  if (!(await hasCompanyContext(scopeId))) {
    await recordProductEvent({ ...base, name: 'gate_viewed', entitlement: 'missing_company_context', errorCode: 'context', ok: false });
    await recordProductEvent({ ...base, name: 'proposal_brief_failed', entitlement: 'missing_company_context', errorCode: 'context', ok: false });
    return { status: 'error', message: t(NEED_CONTEXT) };
  }
  if (!(await lockEvaluation(scopeId, opportunityId, owner, 'proposal_started_at', 'proposal_error', LOCK_MINUTES))) return { status: 'running' };
  try {
    await recordProductEvent({ ...base, name: 'proposal_brief_requested', entitlement: onboard ? 'onboard' : null, ok: true });
    await runProposal(opportunityId, scopeId, owner);
    if (!onboard && allowance.accountId && allowance.limit != null) await recordAgentRun(allowance.accountId, 'proposal_manager');
    await unlockEvaluation(scopeId, opportunityId, owner, 'proposal_started_at', 'proposal_error', null);
    await recordProductEvent({ ...base, name: 'proposal_brief_completed', entitlement: onboard ? 'onboard' : 'included', ok: true });
    return { status: 'done' };
  } catch (e: any) {
    const message = friendly(e);
    await unlockEvaluation(scopeId, opportunityId, owner, 'proposal_started_at', 'proposal_error', message);
    await recordProductEvent({ ...base, name: 'proposal_brief_failed', errorCode: 'run_failed', ok: false });
    return { status: 'error', message };
  }
}

async function runProposal(opportunityId: string, scopeId: string, workspaceId: string | null) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not configured on the server.');
  const db = getSupabaseServerClient();
  const [{ data: o }, { data: reqs }, { data: award }, { data: docs }, { data: se }, templates] = await Promise.all([
    db.from('opportunities').select('*').eq('opportunity_id', opportunityId).single(),
    db.from('requirements').select('requirement_group, category, requirement_text, mandatory, threshold, evidence_required, document, requirement_matches(match_status, notes, scope_id, workspace_id)')
      .eq('opportunity_id', opportunityId),
    db.from('award_criteria').select('criterion, weight, subcriteria').eq('opportunity_id', opportunityId).order('weight', { ascending: false }),
    db.from('documents').select('name, name_en, document_type, url').eq('opportunity_id', opportunityId),
    (workspaceId
      ? db.from('scope_evaluations').select('evaluation').match({ scope_id: scopeId, opportunity_id: opportunityId, workspace_id: workspaceId })
      : db.from('scope_evaluations').select('evaluation').eq('scope_id', scopeId).eq('opportunity_id', opportunityId).is('workspace_id', null)
    ).maybeSingle(),
    submissionDocumentTexts(opportunityId),
  ]);
  if (!o) throw new Error('Tender not found.');
  if (!se?.evaluation) throw new Error('run the Tender Evaluation Agent for this scope first');

  const ev = se.evaluation;
  const title = o.title_en || o.title;
  const reqLines = (reqs || []).map((r: any, i: number) => {
    const matches = (r.requirement_matches || []).filter((x: any) => x.scope_id === scopeId);
    const m = (workspaceId && matches.find((x: any) => x.workspace_id === workspaceId)) || matches.find((x: any) => !x.workspace_id);
    return `R${i + 1} [${GROUPS[r.requirement_group] ?? r.category}${r.mandatory ? ', mandatory' : ', optional'}] ${r.requirement_text}`
      + (r.threshold ? ` — threshold: ${r.threshold}` : '') + (r.evidence_required ? ` — evidence: ${r.evidence_required}` : '')
      + (r.document ? ` — source: ${r.document}` : '') + (m ? ` — evaluation: ${m.match_status}${m.notes ? ` (${m.notes})` : ''}` : '');
  });
  const tender = [
    `Title: ${title}`, `Buyer: ${o.authority_en || o.authority || 'unknown'} (${o.country || 'international'})`,
    `Value: ${o.estimated_value ? `${o.currency || ''} ${o.estimated_value}` : 'not disclosed'}`,
    `Submission deadline: ${o.deadline ? String(o.deadline).slice(0, 10) : 'not stated'}`,
    `Official notice: ${o.official_url || '—'}`,
    `\nTender summary:\n${o.tender_summary || o.summary || '(none)'}`,
    `\nAward criteria:\n${(award || []).map((a: any) => `- ${a.criterion} ${a.weight ?? '?'}%: ${a.subcriteria?.name_en || a.subcriteria?.name || ''} ${a.subcriteria?.description_en || a.subcriteria?.description || ''}`).join('\n') || '(none published)'}`,
    `\nRequirements:\n${reqLines.join('\n') || '(none extracted)'}`,
    `\nEvaluation report: fit ${ev.fit_score}/100, verdict ${ev.verdict}. ${ev.take || ''}`,
    ev.strengths?.length && `Strengths:\n${ev.strengths.map((s: string) => `- ${s}`).join('\n')}`,
    ev.gaps?.length && `Gaps:\n${ev.gaps.map((s: string) => `- ${s}`).join('\n')}`,
    ev.partners?.length && `Partners:\n${ev.partners.map((p: any) => `- ${p.role}: ${p.why || ''}`).join('\n')}`,
    `\nPublished tender documents:\n${(docs || []).map((d: any) => `- [${d.document_type}] ${d.name_en || d.name} | ${d.url || 'no url'}`).join('\n') || '(none listed)'}`,
    templates.length
      ? `\nTemplate text read from the tender files. Follow these headings, tables and fields:\n${templates.map((d) => `\n### [${d.type}] ${d.name}\n${d.body}`).join('\n')}`
      : '\nNo template file could be read. Draft only from the document names and the requirements, and say the template was not in the files read.',
  ].filter(Boolean).join('\n');

  const [prompt, brief] = await Promise.all([
    namedCompany(scopeId, workspaceId).then((name) => agentPrompt('proposal_manager', 'proposal_manager.md', scopeId, name)),
    companyBrief({ withDocuments: true, scopeId, workspaceId }),
  ]);
  const client = new Anthropic({
    defaultHeaders: process.env.ANTHROPIC_WORKSPACE_ID ? { 'anthropic-workspace-id': process.env.ANTHROPIC_WORKSPACE_ID } : undefined,
  });
  // A long document: stream it, so the request isn't held to the non-streaming time limit.
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 24000,
    system: prompt.replace('{company_brief}', brief).replaceAll('{tender title}', title),
    messages: [{ role: 'user', content: tender }],
    betas: ['server-side-fallback-2026-07-01'],
    output_config: { effort: 'high' },
    fallbacks: 'default',
  } as any);
  const response: any = await stream.finalMessage();
  if (response.stop_reason === 'refusal') throw new Error('The agent declined to write this brief.');
  const text = (response.content as any[]).filter((b) => b.type === 'text').map((b) => b.text).join('').trim()
    .replace(/^```(?:json)?\s*\n/, '').replace(/\n```\s*$/, '');
  const parsed = parseProposalBrief(text);
  if (!parsed) throw new Error(response.stop_reason === 'max_tokens' ? 'The brief was cut short. Run it again.' : 'The agent did not return a brief.');
  const allowed = new Set((docs || []).map((d: any) => d.url).filter(Boolean));
  if (o.official_url) allowed.add(o.official_url);
  const submission = normaliseBrief(parsed, allowed);
  if (!submission.pack.length || !submission.documents.length) throw new Error('The agent did not return a brief.');

  let saved = db.from('scope_evaluations').update({
    proposal_brief: JSON.stringify(submission), proposal_at: new Date().toISOString(), proposal_error: null,
  }).eq('scope_id', scopeId).eq('opportunity_id', opportunityId);
  saved = workspaceId ? saved.eq('workspace_id', workspaceId) : saved.is('workspace_id', null);
  const { error } = await saved;
  if (error) throw new Error(error.message);
}
