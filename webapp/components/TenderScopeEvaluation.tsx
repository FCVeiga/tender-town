import Link from 'next/link';
import AgentAvatar from '@/components/AgentAvatar';
import TenderEvaluationRunner from '@/components/TenderEvaluationRunner';
import ProposalRunner from '@/components/ProposalRunner';
import { firstInLanguage } from '@/lib/english';
import { getLocale, getTSync } from '@/lib/i18n/server';

export type Evaluation = {
  fit_score: number; verdict: string; take?: string; strengths: string[]; gaps: string[];
  partners: { role: string; why?: string }[]; next_steps: { title: string; deadline?: string | null }[];
};
const VERDICTS: Record<string, string> = { bid: 'Bid', bid_with_partner: 'Bid with a partner', consider: 'Consider', no_bid: 'No bid' };
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(getLocale(), { day: 'numeric', month: 'short', year: 'numeric' });

/** One scope's evaluation of a tender (and its proposal brief), on the tender page. */
export default function TenderScopeEvaluation({ opportunityId, scope, row, showName, canRun, signedIn, evaluatorOn, proposerOn, ready, analysedAt, locked = null }: {
  opportunityId: string; scope: { id: string; name: string }; row: any; showName: boolean; canRun: boolean; signedIn: boolean;
  locked?: 'plan' | 'member' | null;
  evaluatorOn: boolean; proposerOn: boolean; ready: boolean; analysedAt: string | null;
}) {
  const t = getTSync();
  const evaluation = (row?.evaluation ?? null) as Evaluation | null;
  const running = !!row?.evaluation_started_at && Date.now() - new Date(row.evaluation_started_at).getTime() < 5 * 60_000;
  const proposing = !!row?.proposal_started_at && Date.now() - new Date(row.proposal_started_at).getTime() < 6 * 60_000;
  const login = <p className="muted"><Link href={`/login?next=/tenders/${opportunityId}`}>{t('Log in')}</Link> {t('and create a scope to evaluate tenders against your own context.')}</p>;

  return (
    <section className="detail-block analysis-block" id={`evaluation-${scope.id}`}>
      <div className="agent-head">
        <AgentAvatar agent="tender_evaluation" working={running} off={!evaluatorOn} />
        <div className="agent-id">
          <h2>{t('Tender Evaluation')}{showName && <span className="scope-name-chip">{scope.name}</span>}</h2>
          {row?.evaluated_at && <span className="agent-name">{t('report from {date}', { date: fmtDate(row.evaluated_at) })}</span>}
        </div>
        {evaluation && <span className={`verdict eval-${evaluation.verdict}`}>{VERDICTS[evaluation.verdict] ? t(VERDICTS[evaluation.verdict]) : evaluation.verdict}</span>}
      </div>
      {!evaluation && <p className="agent-intro">{t('Scores your fit and recommends whether to bid.')}</p>}
      {evaluation && analysedAt && row?.evaluated_at && analysedAt > row.evaluated_at && (
        <p className="summary-note">{t('Requirements changed since this report — re-run it.')}</p>
      )}
      {evaluation && (
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
        : !canRun ? (!signedIn ? login
          : locked === 'member' ? <p className="muted">{t('Run by your workspace’s admins.')}</p>
          : locked === 'plan' ? <p className="muted"><Link href="/settings/account?plan=1">{t('Upgrade')}</Link> {t('to evaluate tenders against your own scope’s context.')}</p> : null)
          : <TenderEvaluationRunner opportunityId={opportunityId} scopeId={scope.id} evaluatedAt={row?.evaluated_at ?? null} running={running}
              ready={ready} lastError={row?.evaluation_error ?? null} />}

      {evaluation && proposerOn && canRun && (
        <div className="proposal-block" id={`proposal-${scope.id}`}>
          <div className="agent-head">
            <AgentAvatar agent="proposal_manager" size={36} working={proposing} />
            <div className="agent-id">
              <h3>{t('Proposal brief')}</h3>
              <span className="agent-name">{row?.proposal_at ? t('Proposal brief from {date}', { date: fmtDate(row.proposal_at) }) : t('Next step after the evaluation')}</span>
            </div>
          </div>
          <p className="agent-intro">
            {t('Writes the proposal brief for the bid team: the tender summary, deadlines and evaluation criteria; every eligibility, reference, team, technical and project requirement with the answer the scope’s context supports (who fills each role, which references and certificates); the documents to submit; the gaps and the next steps.')}
          </p>
          <ProposalRunner opportunityId={opportunityId} scopeId={scope.id} proposalAt={row?.proposal_at ?? null} running={proposing} lastError={row?.proposal_error ?? null} />
        </div>
      )}
    </section>
  );
}
