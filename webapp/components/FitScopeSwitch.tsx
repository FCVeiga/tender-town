'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { useT } from '@/lib/i18n/client';

const FitScopeContext = createContext<{
  scopes: { id: string; name: string }[];
  id: string;
  setId: (id: string) => void;
} | null>(null);

/** The scope menu, rendered on the same line as the run button. */
export function FitScopeSelect() {
  const choice = useContext(FitScopeContext);
  const t = useT();
  if (!choice || choice.scopes.length < 2) return null;
  const safe = /^[0-9a-f-]{36}$/i.test(choice.id) ? choice.id : choice.scopes[0].id;
  return (
    <label className="fit-scope-pick">
      <select value={safe} aria-label={t('Scope')} onChange={(event) => choice.setId(event.target.value)}>
        {choice.scopes.map((scope) => <option key={scope.id} value={scope.id}>{t(scope.name)}</option>)}
      </select>
    </label>
  );
}

/** One scope at a time for Requirements & fit. The select chooses which run the button starts. */
export default function FitScopeSwitch({ scopes, initialId, children }: {
  scopes: { id: string; name: string }[];
  initialId: string;
  children: ReactNode;
}) {
  const [id, setId] = useState(() => (scopes.some((scope) => scope.id === initialId) ? initialId : scopes[0]?.id ?? ''));
  if (scopes.length < 2) return <>{children}</>;
  const safe = /^[0-9a-f-]{36}$/i.test(id) ? id : scopes[0].id;

  return (
    <FitScopeContext.Provider value={{ scopes, id: safe, setId }}>
      <div className="fit-scope-root">
        <style>{`.fit-scope-root [data-fit-scope]:not([data-fit-scope="${safe}"]){display:none}`}</style>
        {children}
      </div>
    </FitScopeContext.Provider>
  );
}
