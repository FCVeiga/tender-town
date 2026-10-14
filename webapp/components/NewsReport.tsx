'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { startNewsReport } from '@/app/actions';
import { useT } from '@/lib/i18n/client';
import { UpgradeReport } from '@/components/UpgradeReport';

const POLL_MS = 5000;
const GIVE_UP_MS = 4 * 60_000;

/**
 * Mounted on a news page that has no report yet: starts the News Report Agent
 * (or, if another visitor already did, waits for it) and refreshes the page
 * when the summary and report are ready.
 */
export default function NewsReportRunner({ newsId, scopeId, lastError, signedIn = true }: { newsId: string; scopeId: string; lastError: string | null; signedIn?: boolean }) {
  const t = useT();
  const router = useRouter();
  const [state, setState] = useState<'working' | 'error'>('working');
  const [message, setMessage] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;  // once per page view (React strict mode mounts twice in dev)
    started.current = true;
    let poll: ReturnType<typeof setInterval> | undefined;
    startNewsReport(newsId, scopeId).then((r) => {
      if (r.status === 'done') router.refresh();
      else if (r.status === 'running') {
        const since = Date.now();
        poll = setInterval(() => {
          if (Date.now() - since > GIVE_UP_MS) { clearInterval(poll); setState('error'); setMessage(t('the run is taking too long')); return; }
          router.refresh();  // the page stops rendering this component once the report exists
        }, POLL_MS);
      } else { setState('error'); setMessage(r.message ?? t('unknown error')); }
    }).catch(() => { setState('error'); setMessage(t('the request failed')); });
    return () => { if (poll) clearInterval(poll); };
  }, [newsId, router]);

  if (state === 'error' && (message === 'plan' || lastError === 'plan')) {
    return <UpgradeReport signedIn={signedIn} note={t('This agent reads the full article and writes what your team should do about it.')} />;
  }
  if (state === 'error' && (message === 'quota' || lastError === 'quota')) {
    return <p className="muted">{t('This workspace has used its 50 news reports for this month.')}</p>;
  }
  if (state === 'error') {
    return (
      <p className="form-msg err">
        {t("The News Report Agent couldn't run: {error}. It will try again the next time this page is opened.", { error: message ?? lastError ?? '' })}
      </p>
    );
  }
  return (
    <p className="report-progress">
      <span className="dots" /> {t('The News Report Agent is reading the full article and writing the summary and its report — about a minute.')}
    </p>
  );
}
