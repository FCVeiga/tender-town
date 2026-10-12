'use client';

import { useEffect, useState } from 'react';
import AgentLoader from '@/components/AgentLoader';

/** Hides the previous scope's lists as soon as a switch starts, until this render is that scope. */
export default function ScopeView({ scopeId, children }: { scopeId: string | null; children: React.ReactNode }) {
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    const onPending = (event: Event) => setPending(String((event as CustomEvent).detail || ''));
    const onCancel = (event: Event) => {
      const id = String((event as CustomEvent).detail || '');
      setPending((current) => (current === id ? null : current));
    };
    window.addEventListener('tt-scope-pending', onPending);
    window.addEventListener('tt-scope-cancel', onCancel);
    return () => {
      window.removeEventListener('tt-scope-pending', onPending);
      window.removeEventListener('tt-scope-cancel', onCancel);
    };
  }, []);

  useEffect(() => {
    if (pending && scopeId && pending === scopeId) setPending(null);
  }, [pending, scopeId]);

  if (pending && pending !== scopeId) {
    return <AgentLoader />;
  }
  return <>{children}</>;
}
