'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { startProposalBrief } from '@/app/actions';
import { useT } from '@/lib/i18n/client';

const POLL_MS = 5000;
const GIVE_UP_MS = 6 * 60_000;

/** The Proposal Manager Agent's button: writes the proposal brief, then offers it as a download. */
export default function ProposalRunner({ opportunityId, scopeId, proposalAt, running, lastError }: {
  opportunityId: string; scopeId: string; proposalAt: string | null; running: boolean; lastError: string | null;
}) {
  const router = useRouter();
  const t = useT();
  const [state, setState] = useState<'idle' | 'working' | 'error'>(running ? 'working' : 'idle');
  const [message, setMessage] = useState<string | null>(lastError);
  const poll = useRef<ReturnType<typeof setInterval>>();
  const seen = useRef(proposalAt);

  useEffect(() => {
    if (proposalAt !== seen.current) { clearInterval(poll.current); setState('idle'); setMessage(null); seen.current = proposalAt; }
  }, [proposalAt]);
  useEffect(() => () => clearInterval(poll.current), []);

  function waitForBrief() {
    const since = Date.now();
    poll.current = setInterval(() => {
      if (Date.now() - since > GIVE_UP_MS) { clearInterval(poll.current); setState('error'); setMessage(t('the run is taking too long')); return; }
      router.refresh();
    }, POLL_MS);
  }
  useEffect(() => { if (running) waitForBrief(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  async function run() {
    setState('working'); setMessage(null);
    try {
      const r = await startProposalBrief(opportunityId, scopeId);
      if (r.status === 'done') { setState('idle'); router.refresh(); }
      else if (r.status === 'running') waitForBrief();
      else { setState('error'); setMessage(r.message ?? t('unknown error')); }
    } catch { setState('error'); setMessage(t('the request failed')); }
  }

  if (state === 'working') {
    return (
      <p className="report-progress">
        <span className="dots" /> {t('The Proposal Manager is reading the tender templates and filling the submission from your company file.')}
      </p>
    );
  }
  return (
    <div className="eval-run">
      {proposalAt && <a className="btn primary" href={`/tenders/${opportunityId}/proposal?scope=${scopeId}`} download>{t('Download proposal brief (.md)')}</a>}
      <button type="button" className="btn primary" onClick={run}>
        {t('Run agent')}
      </button>
      {message && <span className="form-msg err">{t('Couldn\'t run: {message}.', { message })}</span>}
    </div>
  );
}
