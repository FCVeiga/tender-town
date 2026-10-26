import Link from 'next/link';
import { getSupabaseServerClient } from '@/lib/supabase';
import { Opportunity, buyerOf, titleOf } from '@/lib/data';
import { firstInLanguage } from '@/lib/english';
import { plainText } from '@/lib/plain';
import { alignSubmissionDeadline } from '@/lib/deadlineCopy';
import { publicText, stageOf, statedValue, vatTreatment } from '@/lib/publication';
import { currentAnalysis, shownSummary } from '@/lib/shownSummary';
import { DeadlineText, StatusTags } from '@/components/OpportunityCard';
import { UpdateEvent } from '@/components/UpdateComment';
import TenderDocuments, { Doc } from '@/components/TenderDocuments';
import AgentAvatar from '@/components/AgentAvatar';
import { isAgentEnabled } from '@/lib/settings';
import HeartButton from '@/components/HeartButton';
import { getLikes } from '@/lib/likes';
import { getCurrentUser, siteOrigin } from '@/lib/auth';
import { getScopeItems, getViewScopes } from '@/lib/scopes';
import { getContext, getPersonalAccount } from '@/lib/accounts';
import TenderScopeEvaluation, { ProposalSlot } from '@/components/TenderScopeEvaluation';
import TenderView from '@/components/TenderView';
import EvaluationCriteria from '@/components/EvaluationCriteria';
import { shownCriteria } from '@/lib/award';
import TenderHistory from '@/components/TenderHistory';
import PostMarkdown from '@/components/social/PostMarkdown';
import CommentsSection from '@/components/social/CommentsSection';
import { agentRunAllowance } from '@/lib/agentQuota';
import { getPlatformLanguage } from '@/lib/language';
import { getLocale, getT } from '@/lib/i18n/server';
import { UpgradeReport } from '@/components/UpgradeReport';
import { PLANS, planIncludes } from '@/lib/plans';
import { clip } from '@/lib/seo';
import JsonLd from '@/components/JsonLd';
import ItemSources from '@/components/ItemSources';
import FitScopeSwitch from '@/components/FitScopeSwitch';
import { resolveFocus } from '@/lib/scopeFocus';

// The Tender Analysis Agent's four groups; older rows without a group fall back on their category.
const REQ_GROUPS: { key: string; label: string; categories: string[] }[] = [
  { key: 'ELIGIBILITY', label: 'Eligibility criteria',
    categories: ['LEGAL', 'FINANCIAL', 'TURNOVER', 'INSURANCE', 'CERTIFICATION', 'LOCAL_PRESENCE', 'CONSORTIUM', 'SUBCONTRACTING', 'EVIDENCE'] },
  { key: 'REFERENCES', label: 'Project references', categories: ['REFERENCE', 'COMPANY_EXPERIENCE'] },
  { key: 'HUMAN_RESOURCES', label: 'Human resource requirements',
    categories: ['TEAM', 'CV', 'EDUCATION', 'PERSONAL_CERTIFICATION', 'SECURITY_CLEARANCE', 'LANGUAGE', 'FTE'] },
  { key: 'TECHNICAL', label: 'Technical & project requirements',
    categories: ['TECHNICAL', 'SECURITY', 'PRIVACY', 'EIDAS', 'EUDI', 'INTEROPERABILITY', 'HOSTING', 'SLA', 'IMPLEMENTATION'] },
];
const groupOf = (r: any) => r.requirement_group
  || REQ_GROUPS.find((g) => g.categories.includes(r.category))?.key || 'TECHNICAL';

function matchLabel(m: string | null) {
  if (m === 'MATCH') return 'Match';
  if (m === 'PARTNER_NEEDED') return 'Partner needed';
  if (m === 'NO_MATCH') return 'No match';
  if (m === 'PARTIAL_MATCH') return 'Partial';
  return 'Unknown';
}
function matchClass(m: string | null) {
  if (m === 'MATCH') return 'match';
  if (m === 'PARTNER_NEEDED') return 'partner';
  if (m === 'NO_MATCH') return 'no_match';
  if (m === 'PARTIAL_MATCH') return 'partner';
  return 'unknown';
}
const CONFIDENCE: Record<string, string> = { INFERRED: 'Inferred', UNCLEAR: 'Unclear', NOT_DISCLOSED: 'Not disclosed' };

/** Tender page and signal page share this layout. News-only signals leave the agent sections quiet. */
export default async function OpportunityDetail({ id, backHref, backLabel, path, agentTasks }: {
  id: string;
  backHref: string;
  backLabel: string;
  path: string;
  agentTasks: boolean;
}) {
  await getPlatformLanguage();  // the display filter's language
  const t = await getT();
  const supabase = getSupabaseServerClient();

  const { data: o, error } = await supabase
    .from('opportunities')
    .select('*')
    .eq('opportunity_id', id)
    .single();

  if (error || !o) {
    return (
      <div>
        <Link className="back-link" href={backHref}>← {t(backLabel)}</Link>
        <div className="detail-block"><h2>{t('Not found')}</h2><p>{error?.message || t('No tender with this ID.')}</p></div>
      </div>
    );
  }

  const user = await getCurrentUser();

  const { data: requirements } = await supabase
    .from('requirements')
    .select('*, requirement_matches(match_status, matched_evidence, notes, scope_id, workspace_id)')
    .eq('opportunity_id', id);

  const { data: documents } = await supabase
    .from('documents')
    .select('*')
    .eq('opportunity_id', id)
    .order('publication_date', { ascending: true, nullsFirst: false });

  const { data: award } = await supabase
    .from('award_criteria')
    .select('*')
    .eq('opportunity_id', id)
    .order('weight', { ascending: false });

  const { data: changes } = await supabase
    .from('change_events')
    .select('*')
    .eq('opportunity_id', id)
    .order('detected_at', { ascending: false });

  const reqs = (requirements || []).filter((r) => firstInLanguage(r.requirement_text));
  // Scopes: the viewer's active scopes (or the default scope): relevance, evaluations, match columns.
  const [{ scopes: viewScopes, own, canRun }, ctx, account] = await Promise.all([
    getViewScopes(), getContext(), user ? getPersonalAccount(user.id) : Promise.resolve(null),
  ]);
  const plan = ctx?.plan ?? account?.plan ?? PLANS[0];
  const evaluationAllowed = planIncludes(plan.evaluationsPerMonth);
  const proposalsAllowed = planIncludes(plan.proposalsPerMonth);
  const locked = !ctx ? null : !ctx.canCustomize && ctx.isAdmin ? 'plan' : !ctx.isAdmin ? 'member' : null;
  const { data: scopeEvals } = await supabase.from('scope_evaluations').select('*').eq('opportunity_id', id)
    .in('scope_id', viewScopes.map((s) => s.id));
  const wsId = ctx?.workspace.id ?? null;
  const evalOf = (scopeId: string) => {
    const rows = (scopeEvals || []).filter((r: any) => r.scope_id === scopeId);
    return (wsId && rows.find((r: any) => r.workspace_id === wsId)) || rows.find((r: any) => !r.workspace_id) || null;
  };
  const evaluatedScopes = user ? viewScopes.filter((s) => evalOf(s.id)?.evaluation) : [];
  const scopeItems = await getScopeItems('tender');
  const relevance = scopeItems?.relevance.get(id) ?? o.opportunity_relevance_score;
  const matchOf = (r: any, scopeId: string) => {
    const rows = (r.requirement_matches || []).filter((m: any) => m.scope_id === scopeId);
    return (wsId && rows.find((m: any) => m.workspace_id === wsId)) || rows.find((m: any) => !m.workspace_id);
  };
  const analysis = currentAnalysis(o);
  const summaryRaw = alignSubmissionDeadline(publicText(plainText(shownSummary(o))), o.deadline);
  const summaryPlain = plainText(summaryRaw);
  const stage = stageOf(o);
  const stated = o.estimated_value ? null : statedValue(summaryRaw);
  const vat = vatTreatment(summaryRaw);
  const amount = o.estimated_value ?? stated?.amount ?? null;
  const valueCurrency = o.estimated_value ? o.currency : stated?.currency ?? null;
  const estimated = (!o.estimated_value && !!stated) || o.value_source === 'summary';
  const shownStatus = stage === 'closed' && (o.status === 'OPEN' || !o.status) ? 'CLOSED'
    : stage === 'uncertain' && !o.status ? 'UNVERIFIED'
    : o.status === 'AWARDED' ? 'AWARDED'
    : stage === 'closed' ? 'CLOSED'
    : stage === 'signal' ? 'SIGNAL'
    : stage === 'uncertain' ? 'UNVERIFIED'
    : o.status || 'OPEN';
  const [{ data: countryRow }, likes, agentFlags] = await Promise.all([
    o.country ? supabase.from('countries').select('name').eq('code', o.country).maybeSingle() : Promise.resolve({ data: null as { name: string } | null }),
    getLikes('tender', [o.opportunity_id]),
    Promise.all(viewScopes.map(async (s) => [s.id, await isAgentEnabled('tender_evaluation', s.id), await isAgentEnabled('proposal_manager', s.id)] as const)),
  ]);
  const flags = new Map(agentFlags.map(([id, e, p]) => [id, { evaluator: e, proposer: p }]));
  const ownScopes = viewScopes.filter((s) => !s.isDefault && !s.catalog);
  const [evalAllowance, companyDocRows] = await Promise.all([
    evaluationAllowed ? agentRunAllowance('tender_evaluation') : Promise.resolve(null),
    ownScopes.length
      ? supabase.from('company_documents').select('scope_id').in('scope_id', ownScopes.map((s) => s.id)).is('workspace_id', null)
      : Promise.resolve({ data: [] as { scope_id: string }[] }),
  ]);
  const withContext = new Set((companyDocRows.data || []).map((row: { scope_id: string }) => row.scope_id));
  const contextHrefOf = (scope: { id: string; isDefault: boolean; catalog: boolean; instructions: string | null }) =>
    (!scope.isDefault && !scope.catalog && !scope.instructions?.trim() && !withContext.has(scope.id)) ? `/workspaces/scopes/${scope.id}` : null;
  const readyScopes = user ? viewScopes.filter((s) => {
    const row = evalOf(s.id);
    return !!(row?.evaluation || row?.evaluated_at);
  }) : [];
  const fitScopes = readyScopes.filter((s) => evalOf(s.id)?.evaluation && !contextHrefOf(s));
  const fits = fitScopes.map((s) => evalOf(s.id).evaluation.fit_score as number);
  const runsLeft = evalAllowance && evalAllowance.limit != null && !evalAllowance.block ? Math.max(0, evalAllowance.limit - evalAllowance.used) : null;
  const criteria = shownCriteria(award);
  const notices = ((documents || []) as Doc[])
    .filter((d) => d.document_type === 'CONTRACT_NOTICE' || d.document_type === 'CORRIGENDUM')
    .sort((a, b) => (a.publication_date || '').localeCompare(b.publication_date || '') || (a.name || '').localeCompare(b.name || ''));
  const submitDocs = ((documents || []) as Doc[]).filter((d) => d.document_type === 'FORM' || d.document_type === 'FINANCIAL_PROPOSAL');
  const docCount = (documents || []).length;
  const compare = t('Get the requirements and eligibility criteria, and a fit assessment against your company information.');
  const briefLead = t('Prepare the submission pack from the tender’s templates, fill each document from your company file, and list the next steps.');
  const scopeCanRun = (scope: { id: string; isDefault: boolean }) => canRun && (!scope.isDefault || !!ctx?.isPlatformAdmin);
  const planBlocksEvaluation = !evaluationAllowed || locked === 'plan';
  const runnableScopes = viewScopes.filter((scope) => scopeCanRun(scope) || !!evalOf(scope.id)?.evaluation);
  const evaluationScopes = runnableScopes.length ? runnableScopes : viewScopes.slice(0, 1);
  const storedEvaluations = planBlocksEvaluation ? viewScopes.filter((scope) => !!evalOf(scope.id)?.evaluation) : [];
  const pickerScopes = !planBlocksEvaluation && evaluationScopes.length ? evaluationScopes : storedEvaluations;
  const focus = await resolveFocus();
  const initialFitScope = (focus.current && pickerScopes.some((scope) => scope.id === focus.current?.id) ? focus.current.id : null)
    || pickerScopes.find((scope) => evalOf(scope.id)?.evaluation)?.id
    || pickerScopes[0]?.id
    || '';

  const origin = siteOrigin();
  const headline = titleOf(o);
  return (
    <div className="tender-page">
      <JsonLd data={{
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline,
        description: clip(summaryPlain || headline, 300),
        datePublished: o.publication_date || o.first_detected,
        dateModified: o.last_change || o.publication_date || o.first_detected,
        author: { '@type': 'Organization', name: buyerOf(o) || 'Tender Town' },
        publisher: { '@type': 'Organization', name: 'Tender Town', url: origin },
        mainEntityOfPage: `${origin}${path}`,
      }} />
      <Link className="back-link" href={backHref}>← {t(backLabel)}</Link>

      <div className="detail-head">
        <div className="detail-tags-row">
          <div className="opp-tags">
            <StatusTags o={o as Opportunity} archived={stage === 'closed' && o.status !== 'AWARDED'} />
            {stage === 'open' && shownStatus && <span className="tag">{t(shownStatus)}</span>}
          </div>
          <HeartButton type="tender" id={o.opportunity_id} liked={likes.liked.has(o.opportunity_id)} signedIn={likes.signedIn} className="page-heart" />
        </div>
        <h1>{titleOf(o)}</h1>
        <p className="page-sub">{[buyerOf(o), countryRow?.name || o.country].filter(Boolean).join(' · ') || t('International')}</p>
        {titleOf(o) !== o.title && !!o.title && (
          <details className="original-notice">
            <summary>{t('Original notice title')}</summary>
            <p>{o.title}</p>
          </details>
        )}
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="stat-label">{t('Deadline')}</div>
          <div className="stat-num small">{o.status === 'AWARDED' && !o.deadline ? t('Awarded') : <DeadlineText deadline={o.deadline} closed={stage === 'closed'} />}</div>
          {stage === 'closed' && o.status !== 'AWARDED' && <div className="stat-label">{t('Archived')}</div>}
        </div>
        <div className="stat">
          <div className="stat-label">{t('Estimated value')}</div>
          <div className="stat-num small">{amount != null && amount > 0 ? `${valueCurrency ? `${valueCurrency} ` : ''}${amount.toLocaleString(getLocale())}` : t('Not disclosed')}</div>
          {(vat || (estimated && amount != null && amount > 0)) && (
            <div className="stat-label">{[vat === 'excl' ? t('Excl. VAT') : vat === 'incl' ? t('Incl. VAT') : null, estimated && amount != null && amount > 0 ? t('From the summary') : null].filter(Boolean).join(' · ')}</div>
          )}
        </div>
        <div className="stat">
          <div className="stat-label">{t('Market relevance')}</div>
          <div className={`stat-num ${relevance == null ? 'small' : ''}`}>{relevance ?? t('not scored yet')}</div>
        </div>
        <div className="stat">
          <div className="stat-label">{t('Company fit')}</div>
          <div className={`stat-num ${fits.length ? '' : 'small'}`}>{fits.length ? Math.max(...fits) : t('Not assessed')}</div>
        </div>
      </div>
      <TenderView
        documentCount={docCount}
        summary={(
          <>
            {summaryRaw && (
              <section className="detail-block" id="summary">
                <h2>{t('Summary')}</h2>
                <PostMarkdown>{summaryRaw}</PostMarkdown>
                {analysis
                  ? <p className="summary-note">{t('Tender Analysis Agent')} · {o.official_url?.includes('ted.europa.eu') ? t('from the notice and the tender documents') : t('from the notice and the tender page')}</p>
                  : summaryRaw ? <p className="summary-note">{t('Preliminary summary.')}</p> : null}
              </section>
            )}
            <TenderHistory
              notices={notices}
              changes={(changes || []) as UpdateEvent[]}
              archived={stage === 'closed' && o.status !== 'AWARDED'}
              evidence={o.status_evidence}
              verifiedAt={o.verified_at}
              note={stage === 'uncertain' ? t('The bidding status is not confirmed.') : null}
              linked={!!user}
            />
            <section className="detail-block" id="sources">
              <h2>{t('Sources')}</h2>
              {user ? (
                <ul className="source-list">
                  <ItemSources type="tender" id={o.opportunity_id} official={o.official_url} itemsOnly />
                </ul>
              ) : !agentTasks && o.official_url ? (
                <ul className="source-list">
                  <li><a className="ext-link" href={o.official_url} target="_blank" rel="noopener noreferrer">{o.official_url} ↗</a></li>
                </ul>
              ) : (
                <p className="muted"><Link className="text-link" href={`/signup?next=${encodeURIComponent(path)}`} data-track="signup_cta_clicked" data-placement="tender_sources" data-cta="signup">{t('Sign up')}</Link> {t('to see the sources.')}</p>
              )}
            </section>
          </>
        )}
        fit={!agentTasks ? (
          <section className="detail-block analysis-block" id="evaluation">
            <div className="agent-head">
              <AgentAvatar agent="tender_evaluation" />
              <div className="agent-id"><h2>{t('Tender Evaluation')}</h2></div>
            </div>
            <p className="agent-intro">{t('No agent tasks for this signal')}</p>
          </section>
        ) : (
          <section className="detail-block" id="requirements">
            <FitScopeSwitch scopes={pickerScopes.map((scope) => ({ id: scope.id, name: scope.name }))} initialId={initialFitScope}>
            {readyScopes.length > 0 && (
              <>
                <h2>{fitScopes.length ? t('Requirements & Match Status') : t('Requirements')} {reqs.length > 0 && <span className="uc-count">{reqs.length}</span>}</h2>
                {reqs.length === 0 ? (
                  <p className="muted">{t('None published yet.')}</p>
                ) : REQ_GROUPS.map((g) => ({ ...g, rows: reqs.filter((r) => groupOf(r) === g.key) })).filter((g) => g.rows.length).map((g) => (
                  <div key={g.key} className="req-category-block">
                    <h3 className="req-category-title">{t(g.label)} <span className="uc-count">{g.rows.length}</span></h3>
                    <div className="req-table-wrap">
                      <table className="req-table">
                        <thead><tr><th>{t('Requirement')}</th><th>{t('Threshold')}</th><th>{t('Mandatory')}</th>{fitScopes.map((sc) => <th key={sc.id} data-fit-scope={pickerScopes.length > 1 ? sc.id : undefined}>{t('Match')}</th>)}</tr></thead>
                        <tbody>
                          {g.rows.map((r) => (
                            <tr key={r.requirement_id}>
                              <td>
                                {r.requirement_text}
                                {firstInLanguage(r.evidence_required) && <div className="req-evidence">{t('Evidence:')} {r.evidence_required}</div>}
                                {r.document && <div className="req-source">{r.document}</div>}
                                {r.confidence && r.confidence !== 'CONFIRMED' && CONFIDENCE[r.confidence] && <div className="req-source">{t(CONFIDENCE[r.confidence])}</div>}
                              </td>
                              <td>{firstInLanguage(r.threshold) ?? ''}</td>
                              <td>{r.mandatory ? <span className="mand-yes">{t('Mandatory')}</span> : <span className="mand-no">{t('Optional')}</span>}</td>
                              {fitScopes.map((sc) => {
                                const m = matchOf(r, sc.id);
                                return (
                                  <td key={sc.id} data-fit-scope={pickerScopes.length > 1 ? sc.id : undefined}>
                                    <span className={`badge-match ${matchClass(m?.match_status)}`}>{t(matchLabel(m?.match_status))}</span>
                                    {m?.notes && <div className="req-match-note">{m.notes}</div>}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
                <EvaluationCriteria rows={criteria} />
                {submitDocs.length > 0 && (
                  <div className="req-category-block">
                    <h3 className="req-category-title">{t('Documents to submit')} <span className="uc-count">{submitDocs.length}</span></h3>
                    <ul className="submit-docs">
                      {submitDocs.map((d) => (
                        <li key={d.document_id}>
                          {d.url
                            ? <a href={d.url} target="_blank" rel="noopener noreferrer">{firstInLanguage(d.name_en) ?? d.name}</a>
                            : <span>{firstInLanguage(d.name_en) ?? d.name}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
              <div className="analysis-block" id="evaluation">
                {pickerScopes.length > 0 ? pickerScopes.map((scope) => (
                  <div key={scope.id} data-fit-scope={pickerScopes.length > 1 ? scope.id : undefined}>
                    <TenderScopeEvaluation opportunityId={o.opportunity_id} scope={{ id: scope.id, name: scope.name }}
                      row={user ? evalOf(scope.id) : null} canRun={!planBlocksEvaluation && scopeCanRun(scope)} signedIn={!!user} locked={planBlocksEvaluation ? null : locked} chrome named={false}
                      evaluatorOn={flags.get(scope.id)?.evaluator ?? true} proposerOn={!planBlocksEvaluation && (flags.get(scope.id)?.proposer ?? true) && proposalsAllowed}
                      analysedAt={o.tender_analysed_at ?? null}
                      lead={compare} archived={stage === 'closed' && o.status !== 'AWARDED'} awarded={o.status === 'AWARDED'}
                      contextHref={!planBlocksEvaluation && scopeCanRun(scope) ? contextHrefOf(scope) : null}
                      runsLeft={!planBlocksEvaluation ? runsLeft : null}
                      runsLimit={!planBlocksEvaluation && evalAllowance?.limit != null && !evalAllowance.block ? evalAllowance.limit : null}
                      quotaLimit={!planBlocksEvaluation && evalAllowance?.block === 'quota' ? evalAllowance.limit : null} />
                  </div>
                )) : (
                  <>
                    <div className="agent-head">
                      <AgentAvatar agent="tender_evaluation" />
                      <div className="agent-id"><h2>{t('Tender Evaluation')}</h2></div>
                    </div>
                    <p className="agent-intro">{compare}</p>
                    {o.status === 'AWARDED' ? <p className="summary-note">{t('This contract has been awarded.')}</p> : stage === 'closed' ? <p className="summary-note">{t('This tender is archived.')}</p> : null}
                  </>
                )}
                {(pickerScopes.length === 0 || planBlocksEvaluation) && (
                  <UpgradeReport signedIn={!!user} buttonOnly actionLabel={user ? undefined : 'Log in to run agent'} loginHref={user ? undefined : `/login?next=${path}`} />
                )}
              </div>
            </FitScopeSwitch>
          </section>
        )}
        brief={!agentTasks ? (
          <section className="detail-block analysis-block" id="proposal-brief">
            <div className="agent-head">
              <AgentAvatar agent="proposal_manager" size={36} />
              <div className="agent-id"><h2>{t('Proposal brief')}</h2></div>
            </div>
            <p className="agent-intro">{t('No agent tasks for this signal')}</p>
          </section>
        ) : (
          <section className="detail-block analysis-block" id="proposal-brief">
            <div className="agent-head">
              <AgentAvatar agent="proposal_manager" size={36} />
              <div className="agent-id"><h2>{t('Proposal brief')}</h2></div>
            </div>
            <p className="agent-intro">{briefLead}</p>
            {o.status === 'AWARDED' ? <p className="summary-note">{t('This contract has been awarded.')}</p> : stage === 'closed' ? <p className="summary-note">{t('This tender is archived.')}</p> : null}
            {!proposalsAllowed ? (
              <UpgradeReport signedIn={!!user} buttonOnly actionLabel={user ? undefined : 'Log in to run agent'} loginHref={user ? undefined : `/login?next=${path}`} />
            ) : (
              <>
                {!evaluatedScopes.length && (
                  <>
                    <p className="eval-run"><button type="button" className="btn primary btn-locked" disabled aria-describedby="brief-lock">{t('Run agent')}</button></p>
                    <p className="brief-lock" id="brief-lock">{t('Run the evaluation agent in the Requirements & fit section to unlock this agent pipeline.')}</p>
                  </>
                )}
                {viewScopes.filter((scope) => evalOf(scope.id)?.evaluation).map((scope) => (
                  <ProposalSlot key={scope.id} opportunityId={o.opportunity_id} scope={{ id: scope.id, name: scope.name }}
                    row={evalOf(scope.id)} showName={viewScopes.length > 1 || !own} canRun={scopeCanRun(scope)} signedIn={!!user} locked={locked}
                    proposerOn={(flags.get(scope.id)?.proposer ?? true) && proposalsAllowed} contextHref={scopeCanRun(scope) ? contextHrefOf(scope) : null} />
                ))}
              </>
            )}
          </section>
        )}
        documents={<TenderDocuments docs={(documents || []) as Doc[]} signedIn={!!user} signupHref={`/signup?next=${encodeURIComponent(path)}`} />}
        comments={<CommentsSection itemType="tender" itemId={o.opportunity_id} loginNext={path} />}
      />
    </div>
  );
}
