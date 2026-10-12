/** What the last collection of a scope actually did. Times come from the scope row; never invented. */
export type ScopeRun = {
  lastSuccessAt: string | null;
  error: string | null;
};

export type CollectionKind = 'loading' | 'pending' | 'failed' | 'empty' | 'stale' | 'ready';

export function scopeRun(scope: { lastSuccessAt?: string | null; lastRunError?: string | null } | null): ScopeRun {
  return {
    lastSuccessAt: scope?.lastSuccessAt || null,
    error: scope?.lastRunError || null,
  };
}

/**
 * loading — this request is still resolving the scope.
 * pending — no successful collection yet, and the last attempt did not fail.
 * failed — the last attempt failed and there is nothing from an earlier success to keep.
 * stale — the last attempt failed, but an earlier success still has items to show.
 * empty — the last success found nothing that is open now.
 * ready — the last success has items.
 */
export function collectionKind(run: ScopeRun, hasItems: boolean, loading: boolean): CollectionKind {
  if (loading) return 'loading';
  if (run.error && hasItems) return 'stale';
  if (run.error) return 'failed';
  if (!hasItems && !run.lastSuccessAt) return 'pending';
  if (!hasItems) return 'empty';
  return 'ready';
}
