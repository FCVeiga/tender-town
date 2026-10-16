import Link from 'next/link';
import AgentAvatar from '@/components/AgentAvatar';
import TenderEvaluationRunner from '@/components/TenderEvaluationRunner';
import ProposalRunner from '@/components/ProposalRunner';
import RunFitAnalysis from '@/components/RunFitAnalysis';
import { firstInLanguage } from '@/lib/english';
import { getLocale, getTSync } from '@/lib/i18n/server';

export type Evaluation = {
  fit_score: number; verdict: string; take?: string; strengths: string[]; gaps: string[];
  partners: { role: string; why?: string }[]; next_steps: { title: string; deadline?: string | null }[];
};
const VERDICTS: Record<string, string> = { bid: 'Bid', bid_with_partner: 'Bid with a partner', consider: 'Consider', no_bid: 'No bid' };
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(getLocale(), { day: 'numeric', month: 'short', year: 'numeric' });

type ScopeEvalProps = {
  opportunityId: string; scope: { id: string; name: string }; row: any; canRun: boolean; signedIn: boolean;
  locked?: 'plan' | 'member' | null;
  evaluatorOn: boolean; proposerOn: boolean; analysedAt: string | null;
  lead?: string | null;
  archived?: boolean;
  contextHref?: string | null;
  /** Set on the first scope when the month still has runs. */
  runsLeft?: number | null;
  runsLimit?: number | null;
  /** Monthly cap, once it is used up. */
  quotaLimit?: number | null;
};

function blockedCopy(t: ReturnType<typeof getTSync>, opportunityId: string, signedIn: boolean, locked: 'plan' | 'member' | null, loginLabel: string) {
  if (!signedIn) {
    return <div className="eval-run"><Link className="btn primary" href={`/login?next=/tenders/${opportunityId}`}>{t(loginLabel)}</Link></div>;
  }
  if (locked === 'member') return <p className="muted">{t('Run by your workspace\u2019s admins.')}</p>;
  if (locked === 'plan') return <p className="muted"><Link href="/settings/account?plan=1">{t('Upgrade')}</Link> {t('to evaluate tenders against your own scope\u2019s context.')}</p>;
  return null;
}

/** One scope's evaluation of a tender. The proposal brief is a separate section. */
export default function TenderScopeEvaluation({ opportunityId, scope, row, canRun, signedIn, evaluatorOn, analysedAt, locked = null, lead = null, archived = false, contextHref = null, runsLeft = null, runsLimit = null, quotaLimit = null }: ScopeEvalProps) {
  const t = getTSync();
  const evaluation = (row?.evaluation ?? null) as Evaluation | null;
  const running = !!row?.evaluation_started_at && Date.now() - new Date(row.evaluation_started_at).getTime() < 5 * 60_000;
  const analysed = !!row?.evaluated_at || !!evaluation;
  const showReport = !!evaluation && !contextHref;

  return (
    <div className="eval-scope">
      <div className="agent-head">
        <AgentAvatar agent="tender_evaluation" working={running} off={!evaluatorOn} />
        <div className="agent-id">
          <h2>{t('Tender Evaluation')}</h2>
          {row?.evaluated_at && <span className="agent-name">{t('report from {date}', { date: fmtDate(row.evaluated_at) })}</span>}
        </div>
        {showReport && <span className={`verdict eval-${evaluation.verdict}`}>{VERDICTS[evaluation.verdict] ? t(VERDICTS[evaluation.verdict]) : evaluation.verdict}</span>}
      </div>
      {lead && <p className="agent-intro">{lead}</p>}
      {archived && <p className="summary-note">{t('This tender is archived.')}</p>}
      {showReport && analysedAt && row?.evaluated_at && analysedAt > row.evaluated_at && (
        <p className="summary-note">{t('Requirements changed since this report — re-run it.')}</p>
      )}
      {showReport && (
        <div className="eval-report">
          <div className="eval-score"><span className="eval-score-num">{evaluation.fit_score}</span><span className="eval-score-label">{t('Fit score')}</span></div>
          {firstInLanguage(evaluation.take) && <p className="analysis-take">{evaluation.take}</p>}
          <div className="eval-cols">
            {evaluation.strengths.length > 0 && <div><h3>{t('Strengths')}</h3><ul>{evaluation.strengths.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
            {evaluation.gaps.length > 0 && <div><h3>{t('Gaps & to confirm')}</h3><ul>{evaluation.gaps.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
          </div>
          {evaluation.partners.length > 0 && <div><h3>{t('Partners needed')}</h3><ul>{evaluation.partners.map((p, i) => <li key={i}><strong>{p.role}</strong>{p.why ? ` — ${p.why}` : ''}</li>)}</ul></div>}
          {evaluation.next_steps.length > 0 && (
            <div><h3>{t('Next steps')}</h3><ul>{evaluation.next_steps.map((n, i) => (
              <li key={i}>{n.title}{n.deadline ? <span className="action-deadline"> {t('by {date}', { date: fmtDate(n.deadline) })}</span> : null}</li>
            ))}</ul></div>
          )}
        </div>
      )}
      {!evaluatorOn ? <p className="muted">{t('Agent off for this scope.')}</p>
        : quotaLimit != null ? (
          <p className="muted">{t('This workspace has used its {n} tender evaluations for this month.', { n: quotaLimit })} <Link href="/settings/account?plan=1">{t('Upgrade')}</Link></p>
        )
        : !canRun ? blockedCopy(t, opportunityId, signedIn, locked, 'Log in to run agent')
          : contextHref && analysed ? <RunFitAnalysis href={contextHref} />
          : (
            <>
              {runsLeft != null && runsLimit != null && (
                <p className="eval-note">{t('{n} of {limit} left this month.', { n: runsLeft, limit: runsLimit })}</p>
              )}
              <TenderEvaluationRunner opportunityId={opportunityId} scopeId={scope.id} evaluatedAt={row?.evaluated_at ?? null} running={running}
                lastError={row?.evaluation_error ?? null} label={analysed && !evaluation ? 'Run Fit analysis' : 'Run agent'} />
            </>
          )}
    </div>
  );
}

/** The proposal brief for one scope that already has an evaluation. */
export function ProposalSlot({ opportunityId, scope, row, showName, canRun, signedIn, locked = null, proposerOn }: {
  opportunityId: string; scope: { id: string; name: string }; row: any; showName: boolean; canRun: boolean; signedIn: boolean;
  locked?: 'plan' | 'member' | null; proposerOn: boolean;
}) {
  const t = getTSync();
  const proposing = !!row?.proposal_started_at && Date.now() - new Date(row.proposal_started_at).getTime() < 6 * 60_000;
  return (
    <div className="proposal-block">
      {showName && (
        <div className="agent-head">
          <AgentAvatar agent="proposal_manager" size={36} working={proposing} />
          <div className="agent-id"><h3>{scope.name}</h3></div>
        </div>
      )}
      {!proposerOn ? <p className="muted">{t('Agent off for this scope.')}</p>
        : !canRun ? blockedCopy(t, opportunityId, signedIn, locked, 'Log in to run agent')
          : <ProposalRunner opportunityId={opportunityId} scopeId={scope.id} proposalAt={row?.proposal_at ?? null} running={proposing} lastError={row?.proposal_error ?? null} />}
    </div>
  );
}
