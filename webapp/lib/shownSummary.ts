import { firstInLanguage } from '@/lib/english';

/**
 * An analysis written before the notice or the dossier was available.
 * Every surface shows the notice summary instead, so the list and the page match.
 */
const UNREAD = /almost no information about this tender|does not include the content|were not supplied|was not supplied|not among the files read|no substantive|does not say what is being procured|are all empty|material supplied for this|material provided for this|material available for this|source material|no tender documents/i;

export function currentAnalysis(row: { tender_summary?: string | null }): string | null {
  const analysis = firstInLanguage(row.tender_summary);
  if (!analysis || UNREAD.test(analysis)) return null;
  return analysis;
}

/** The summary the list, the page, the feed and the tender page all show. */
export function shownSummary(row: { summary?: string | null; tender_summary?: string | null }): string {
  return currentAnalysis(row) || firstInLanguage(row.summary) || '';
}
