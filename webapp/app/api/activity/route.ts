import { NextResponse } from 'next/server';
import { getActivity, refreshDueFeeds } from '@/lib/sources';
import { focusedScope } from '@/lib/scopeFocus';

export const dynamic = 'force-dynamic';

/** Live activity for the scope this page is showing. A different scope id is ignored. */
export async function GET(req: Request) {
  const asked = new URL(req.url).searchParams.get('scope');
  const picked = await focusedScope();
  if (picked.hold) return NextResponse.json({ activity: [], scopeId: asked, pending: true });
  const scopeId = picked.scope?.id ?? null;
  if (!scopeId || (asked && asked !== scopeId)) {
    return NextResponse.json({ activity: [], scopeId });
  }
  await refreshDueFeeds();
  return NextResponse.json({ activity: await getActivity(30, scopeId), scopeId });
}
