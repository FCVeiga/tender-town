import { Suspense } from 'react';
import ScopeBanner, { ScopeBannerFallback } from '@/components/ScopeBanner';
import { resolveFocus } from '@/lib/scopeFocus';
import { createScope } from '@/app/workspaces/actions';

export async function ScopeBannerSlot() {
  const model = await resolveFocus();
  const createAction = model.create === 'ok' && model.workspaceId ? createScope.bind(null, model.workspaceId) : null;
  return <ScopeBanner model={model} createAction={createAction} />;
}

export function ScopeBannerSuspense() {
  return (
    <div className="scope-banner-slot">
      <Suspense fallback={<ScopeBannerFallback />}>
        <ScopeBannerSlot />
      </Suspense>
    </div>
  );
}
