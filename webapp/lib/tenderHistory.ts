type Notice = { url: string | null; publication_date: string | null };
type Change = { id: number; notice_url: string | null; detected_at: string | null };

export type HistoryEntry<N extends Notice, C extends Change> = {
  at: string;
  notice: N | null;
  change: C | null;
};

/** One row per event. A change that points at a notice replaces that notice, it does not repeat it. */
export function tenderHistory<N extends Notice, C extends Change>(notices: N[], changes: C[]): HistoryEntry<N, C>[] {
  const used = new Set<number>();
  const entries: HistoryEntry<N, C>[] = notices.map((notice) => {
    const change = changes.find((item) => !used.has(item.id) && !!item.notice_url && item.notice_url === notice.url);
    if (change) used.add(change.id);
    return { at: notice.publication_date || change?.detected_at || '', notice, change: change ?? null };
  });
  for (const change of changes) {
    if (used.has(change.id)) continue;
    entries.push({ at: change.detected_at || '', notice: null, change });
  }
  return entries.sort((a, b) => a.at.localeCompare(b.at));
}
