'use client';

import { useEffect, useRef } from 'react';
import { resumeScopeIntent } from '@/app/scope/actions';

/** After a paid checkout, open the scope the person was creating or switching to. */
export default function ResumeScopeIntent({ active }: { active: boolean }) {
  const started = useRef(false);
  useEffect(() => {
    if (!active || started.current) return;
    started.current = true;
    let tries = 0;
    const run = () => {
      resumeScopeIntent().then((result) => {
        if (result?.wait && tries < 8) {
          tries += 1;
          window.setTimeout(run, 2000);
        }
      }).catch(() => { /* a redirect ends the call */ });
    };
    run();
  }, [active]);
  return null;
}
