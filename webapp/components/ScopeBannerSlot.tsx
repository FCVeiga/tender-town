import { Suspense } from 'react';
import ScopeBanner from '@/components/ScopeBanner';
import { resolveFocus } from '@/lib/scopeFocus';
import { createScope } from '@/app/workspaces/actions';

export async function ScopeBannerSlot() {
  const model = await resolveFocus();
  const createAction = model.create === 'ok' && model.workspaceId ? createScope.bind(null, model.workspaceId) : null;
  return (
    <div className="scope-banner-slot">
      <ScopeBanner model={model} createAction={createAction} />
    </div>
  );
}

export function ScopeBannerSuspense() {
  return (
    <Suspense fallback={null}>
      <ScopeBannerSlot />
    </Suspense>
  );
}
