'use client';

import { useState, type ReactNode } from 'react';
import { useT } from '@/lib/i18n/client';

/** One scope at a time for Requirements & fit. The select chooses which run the button starts. */
export default function FitScopeSwitch({ scopes, initialId, children }: {
  scopes: { id: string; name: string }[];
  initialId: string;
  children: ReactNode;
}) {
  const t = useT();
  const [id, setId] = useState(() => (scopes.some((scope) => scope.id === initialId) ? initialId : scopes[0]?.id ?? ''));
  if (scopes.length < 2) return <>{children}</>;
  const safe = /^[0-9a-f-]{36}$/i.test(id) ? id : scopes[0].id;

  return (
    <div className="fit-scope-root">
      <style>{`.fit-scope-root [data-fit-scope]:not([data-fit-scope="${safe}"]){display:none}`}</style>
      <label className="fit-scope-pick">
        <select value={safe} aria-label={t('Scope')} onChange={(event) => setId(event.target.value)}>
          {scopes.map((scope) => <option key={scope.id} value={scope.id}>{t(scope.name)}</option>)}
        </select>
      </label>
      {children}
    </div>
  );
}
