import { Suspense } from 'react';
import { cookies } from 'next/headers';
import ScopeBanner from '@/components/ScopeBanner';
import { BannerSkeleton } from '@/components/ContentSkeleton';
import { resolveFocus } from '@/lib/scopeFocus';
import { BANNER_COOKIE } from '@/lib/guestScope';
export async function ScopeBannerSlot({ saved }: { saved?: string }) {
  const model = await resolveFocus();
  const compact = saved === '1';
  return (
    <div className="scope-banner-slot">
      <ScopeBanner model={model} compact={compact} />
    </div>
  );
}

export async function ScopeBannerSuspense() {
  const saved = cookies().get(BANNER_COOKIE)?.value;
  return (
    <Suspense fallback={<BannerSkeleton compact={saved === '1'} />}>
      <ScopeBannerSlot saved={saved} />
    </Suspense>
  );
}
