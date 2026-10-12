import { Suspense } from 'react';
import ScopeBanner from '@/components/ScopeBanner';
import { resolveFocus } from '@/lib/scopeFocus';
import { getViewScopes } from '@/lib/scopes';
import { createScope } from '@/app/workspaces/actions';

/** Signed-in accounts that already have more than one scope turned on. */
async function bannerHidden(): Promise<boolean> {
  const model = await resolveFocus();
  if (!model.signedIn) return false;
  const { scopes } = await getViewScopes();
  return scopes.length > 1;
}

export async function ScopeBannerSlot() {
  if (await bannerHidden()) return null;
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
