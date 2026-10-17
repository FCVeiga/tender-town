'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AgentAvatar from '@/components/AgentAvatar';
import { startCompanyFind } from '@/app/find/actions';
import { useT } from '@/lib/i18n/client';

/** After the account exists, the real run happens here, then the tender opens. */
export default function FindRun() {
  const t = useT();
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    async function go() {
      const result = await startCompanyFind();
      if (stop) return;
      if (result.status === 'done') {
        router.replace(`/tenders/${result.id}#evaluation`);
        return;
      }
      if (result.status === 'running') {
        timer = setTimeout(go, 5000);
        return;
      }
      setMessage(result.message);
    }
    go();
    return () => { stop = true; clearTimeout(timer); };
  }, [router]);

  return (
    <div className="find-run">
      <div className="agent-head">
        <AgentAvatar agent="search" size={36} working={!message} />
        <div className="agent-id"><h2>{t('Find a tender')}</h2></div>
      </div>
      {message ? (
        <p className="form-msg err">{message}</p>
      ) : (
        <p className="report-progress"><span className="dots" /> {t('Finding the best open tender for your company, then writing the evaluation and the proposal brief.')}</p>
      )}
    </div>
  );
}
