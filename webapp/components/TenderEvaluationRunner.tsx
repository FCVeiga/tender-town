'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { startTenderEvaluation } from '@/app/actions';
import { useT } from '@/lib/i18n/client';

const POLL_MS = 5000;
const GIVE_UP_MS = 4 * 60_000;

/**
 * The Tender Evaluation Agent's button. Starts the agent (or, if someone
 * already did, waits for it) and refreshes the page when the report is in.
 */
export default function TenderEvaluationRunner({ opportunityId, scopeId, evaluatedAt, running, lastError, label = 'Run agent' }: {
  opportunityId: string; scopeId: string; evaluatedAt: string | null; running: boolean; lastError: string | null; label?: string;
}) {
  const router = useRouter();
  const t = useT();
  const [state, setState] = useState<'idle' | 'working' | 'error'>(running ? 'working' : 'idle');
  const [message, setMessage] = useState<string | null>(lastError);
  const poll = useRef<ReturnType<typeof setInterval>>();
  const firstSeen = useRef(evaluatedAt);

  // A new report arrived (this run or someone else's): stop waiting.
  useEffect(() => {
    if (evaluatedAt !== firstSeen.current) { clearInterval(poll.current); setState('idle'); setMessage(null); firstSeen.current = evaluatedAt; }
  }, [evaluatedAt]);
  useEffect(() => () => clearInterval(poll.current), []);

  function waitForReport() {
    const since = Date.now();
    poll.current = setInterval(() => {
      if (Date.now() - since > GIVE_UP_MS) { clearInterval(poll.current); setState('error'); setMessage(t('the run is taking too long')); return; }
      router.refresh();
    }, POLL_MS);
  }
  useEffect(() => { if (running) waitForReport(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  async function run() {
    setState('working'); setMessage(null);
    try {
      const r = await startTenderEvaluation(opportunityId, scopeId);
      if (r.status === 'done') { setState('idle'); router.refresh(); }
      else if (r.status === 'running') waitForReport();
      else { setState('error'); setMessage(r.message ?? t('unknown error')); }
    } catch { setState('error'); setMessage(t('the request failed')); }
  }

  if (state === 'working') {
    return (
      <p className="report-progress">
        <span className="dots" /> {t('The Tender Evaluation Agent is reading the tender and checking it against your scope. This takes a few minutes.')}
      </p>
    );
  }
  return (
    <div className="eval-run">
      <button className="btn primary" onClick={run}>
        {t(label)}
      </button>
      {message && <span className="form-msg err">{t('Couldn\'t run: {message}.', { message })}</span>}
    </div>
  );
}
