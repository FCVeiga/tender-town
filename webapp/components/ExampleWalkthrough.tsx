'use client';

import { useState, type ReactNode } from 'react';
import AgentAvatar from '@/components/AgentAvatar';
import { EXAMPLE_EVAL, exampleBrief, exampleMatch, type BriefSource, type ExampleMatch } from '@/lib/exampleRun';
import { briefToMarkdown } from '@/lib/proposalBrief';
import ProposalBriefView from '@/components/ProposalBriefView';
import EvaluationCriteria from '@/components/EvaluationCriteria';
import type { ShownCriterion } from '@/lib/award';
import { useT } from '@/lib/i18n/client';
import TenderView from '@/components/TenderView';
import { track } from '@/components/Track';

export type ExampleRequirement = {
  id: string;
  group: string;
  groupLabel: string;
  category: string;
  text: string;
  threshold: string;
  evidence: string;
  document: string;
  mandatory: boolean;
};

const GROUPS = [
  { key: 'ELIGIBILITY', label: 'Eligibility criteria' },
  { key: 'REFERENCES', label: 'Project references' },
  { key: 'HUMAN_RESOURCES', label: 'Human resource requirements' },
  { key: 'TECHNICAL', label: 'Technical & project requirements' },
];

function matchLabel(status: ExampleMatch['status']) {
  if (status === 'MATCH') return 'Match';
  if (status === 'PARTIAL_MATCH') return 'Partial';
  if (status === 'PARTNER_NEEDED') return 'Partner needed';
  return 'No match';
}
function matchClass(status: ExampleMatch['status']) {
  if (status === 'MATCH') return 'match';
  if (status === 'NO_MATCH') return 'no_match';
  return 'partner';
}

function briefMarkdown(deadline: string, docs: BriefSource[]) {
  return briefToMarkdown(exampleBrief(deadline, docs));
}

/** The same sections as a tender page. The buttons play a finished evaluation and brief for the sample company. */
export default function ExampleWalkthrough({ requirements, deadline, archived, relevance, valueText, valueNote, documentCount, summary, documents, history, sources, sourceDocs = [], criteria = [] }: {
  requirements: ExampleRequirement[];
  deadline: string;
  archived: boolean;
  relevance: number | null;
  valueText: string;
  valueNote: string | null;
  documentCount: number;
  summary: ReactNode;
  documents: ReactNode;
  history: ReactNode;
  sources: ReactNode;
  sourceDocs?: BriefSource[];
  criteria?: ShownCriterion[];
}) {
  const t = useT();
  const [phase, setPhase] = useState<'idle' | 'evaluating' | 'evaluated' | 'briefing' | 'briefed'>('idle');
  const evaluated = phase === 'evaluated' || phase === 'briefing' || phase === 'briefed';
  const groups = GROUPS.map((group) => ({ ...group, rows: requirements.filter((row) => row.group === group.key) })).filter((group) => group.rows.length);

  function runEvaluation() {
    track('example_evaluation_started', { path: '/example', pageType: 'example', demo: true });
    setPhase('evaluating');
    window.setTimeout(() => { track('example_evaluation_completed', { path: '/example', pageType: 'example', demo: true }); setPhase('evaluated'); }, 2200);
  }
  function runBrief() {
    track('example_brief_started', { path: '/example', pageType: 'example', demo: true });
    setPhase('briefing');
    window.setTimeout(() => { track('example_brief_completed', { path: '/example', pageType: 'example', demo: true }); setPhase('briefed'); }, 2600);
  }
  function download() {
    const file = new Blob([briefMarkdown(deadline, sourceDocs)], { type: 'text/markdown' });
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'harborline-proposal-brief.md';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="stat-grid">
        <div className="stat">
          <div className="stat-label">{t('Deadline')}</div>
          <div className="stat-num small">{deadline}</div>
          {archived && <div className="stat-label">{t('Archived')}</div>}
        </div>
        <div className="stat">
          <div className="stat-label">{t('Estimated value')}</div>
          <div className="stat-num small">{valueText}</div>
          {valueNote && <div className="stat-label">{valueNote}</div>}
        </div>
        <div className="stat">
          <div className="stat-label">{t('Market relevance')}</div>
          <div className={`stat-num ${relevance == null ? 'small' : ''}`}>{relevance ?? t('not scored yet')}</div>
        </div>
        <div className="stat">
          <div className="stat-label">{t('Company fit')}</div>
          <div className={`stat-num ${evaluated ? '' : 'small'}`}>{evaluated ? EXAMPLE_EVAL.fit_score : t('Not assessed')}</div>
        </div>
      </div>
      <TenderView
        documentCount={documentCount}
        summary={(
          <>
            {summary}
            {history}
            {sources}
          </>
        )}
        fit={(
        <section className="detail-block" id="requirements">
          {evaluated && (
          <>
          <h2>{t('Requirements & Match Status')} {requirements.length > 0 && <span className="uc-count">{requirements.length}</span>}</h2>
          {groups.map((group) => (
            <div key={group.key} className="req-category-block">
              <h3 className="req-category-title">{t(group.label)} <span className="uc-count">{group.rows.length}</span></h3>
              <div className="req-table-wrap">
                <table className="req-table">
                  <thead>
                    <tr>
                      <th>{t('Requirement')}</th>
                      <th>{t('Threshold')}</th>
                      <th>{t('Mandatory')}</th>
                      {evaluated && <th>{t('Match')}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((row) => {
                      const match = exampleMatch(row);
                      return (
                        <tr key={row.id}>
                          <td>
                            {row.text}
                            {row.evidence && <div className="req-evidence">{t('Evidence:')} {row.evidence}</div>}
                            {row.document && <div className="req-source">{row.document}</div>}
                          </td>
                          <td>{row.threshold}</td>
                          <td>{row.mandatory ? <span className="mand-yes">{t('Mandatory')}</span> : <span className="mand-no">{t('Optional')}</span>}</td>
                          {evaluated && (
                            <td>
                              <span className={`badge-match ${matchClass(match.status)}`}>{t(matchLabel(match.status))}</span>
                              <div className="req-match-note">{match.note}</div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          <EvaluationCriteria rows={criteria} />
          </>
          )}
          <div className="analysis-block" id="evaluation">
          <div className="agent-head">
            <AgentAvatar agent="tender_evaluation" working={phase === 'evaluating'} />
            <div className="agent-id">
              <h2>{t('Tender Evaluation')}</h2>
            </div>
            {evaluated && <span className={`verdict eval-${EXAMPLE_EVAL.verdict}`}>{t('Bid with a partner')}</span>}
          </div>
          <p className="agent-intro">{t('Get the requirements and eligibility criteria, and a fit assessment against your company information.')}</p>
          {evaluated && (
            <div className="eval-report">
              <div className="eval-score"><span className="eval-score-num">{EXAMPLE_EVAL.fit_score}</span><span className="eval-score-label">{t('Fit score')}</span></div>
              <p className="analysis-take">{EXAMPLE_EVAL.take}</p>
              <div className="eval-cols">
                <div><h3>{t('Strengths')}</h3><ul>{EXAMPLE_EVAL.strengths.map((item) => <li key={item}>{item}</li>)}</ul></div>
                <div><h3>{t('Gaps & to confirm')}</h3><ul>{EXAMPLE_EVAL.gaps.map((item) => <li key={item}>{item}</li>)}</ul></div>
              </div>
              <div><h3>{t('Partners needed')}</h3><ul>{EXAMPLE_EVAL.partners.map((item) => <li key={item.role}><strong>{item.role}</strong> — {item.why}</li>)}</ul></div>
              <div><h3>{t('Next steps')}</h3><ul>{EXAMPLE_EVAL.next_steps.map((item) => <li key={item}>{item}</li>)}</ul></div>
            </div>
          )}
          {phase === 'evaluating' ? (
            <p className="report-progress"><span className="dots" /> {t('The Tender Evaluation Agent is reading the tender and checking it against your scope. This takes a few minutes.')}</p>
          ) : (
            <div className="eval-run">
              <button type="button" className="btn primary" onClick={runEvaluation}>{t('Run agent')}</button>
            </div>
          )}
          </div>
        </section>
        )}
        brief={(
        <section className="detail-block analysis-block" id="proposal-brief">
          <div className="agent-head">
            <AgentAvatar agent="proposal_manager" size={36} working={phase === 'briefing'} />
            <div className="agent-id"><h2>{t('Proposal brief')}</h2></div>
          </div>
          <p className="agent-intro">{t('Prepare the submission pack from the tender’s templates, fill each document from your company file, and list the next steps.')}</p>
          {!evaluated ? (
            <>
              <p className="eval-run"><button type="button" className="btn primary btn-locked" disabled aria-describedby="brief-lock">{t('Run agent')}</button></p>
              <p className="brief-lock" id="brief-lock">{t('Run the evaluation agent in the Requirements & fit section to unlock this agent pipeline.')}</p>
            </>
          ) : phase === 'briefed' ? (
            <>
              <div className="eval-run">
                <button type="button" className="btn primary" onClick={download}>{t('Download proposal brief (.md)')}</button>
                <button type="button" className="btn primary" onClick={runBrief}>{t('Run agent')}</button>
              </div>
              <ProposalBriefView brief={exampleBrief(deadline, sourceDocs)} />
            </>
          ) : phase === 'briefing' ? (
            <p className="report-progress"><span className="dots" /> {t('The Proposal Manager is reading the tender templates and filling the submission from your company file.')}</p>
          ) : (
            <div className="eval-run">
              <button type="button" className="btn primary" onClick={runBrief}>{t('Run agent')}</button>
            </div>
          )}
        </section>
        )}
        documents={documents}
      />
    </>
  );
}
