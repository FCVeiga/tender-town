/**
 * The same publication check as services/publication.py.
 * A reason that contradicts the summary is withheld. A public sentence does
 * not address the company the agents are briefed for.
 */
const VENDORS = ['WalliD'];

const MONTHS: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5,
  june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8, september: 9, sep: 9, sept: 9,
  october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
};

const DATE_RE = /\b(?:(\d{1,2})(?:st|nd|rd|th)?\s+)?(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(20\d{2})\b|\b(20\d{2})-(\d{2})-(\d{2})\b/gi;
const DONE_RE = /\b(has launched|have launched|launched|went live|rolled out|rollout completed|completed by|already (?:live|launched|completed)|was completed|has been completed)\b/i;
const PLAN_RE = /\b(plans? to|planned to|scheduled to|will launch|set to launch|expected to|due to launch|to be launched|launch(?:es)? on|scheduled for)\b/i;
const NO_PROC_RE = /\bno (?:open |direct |specific )?(?:tender|procurement|rfp|call\b)|not a procurement|no procurement|no vendor engagement|contains no direct procurement\b/i;
const OPEN_RE = /\b(?:tender is open|bids are open|open for bids|call is open|has been awarded|contract was awarded|awarded the contract)\b/i;
const BUYER_RE = /\b(?:buyer|contracting authority)\s*(?:is|:)\s*([^.;\n]{3,80})/gi;

function asDate(match: RegExpExecArray): Date | null {
  if (match[4]) {
    const day = new Date(Date.UTC(Number(match[4]), Number(match[5]) - 1, Number(match[6])));
    return Number.isNaN(day.getTime()) ? null : day;
  }
  const month = MONTHS[(match[2] || '').toLowerCase()];
  if (!month) return null;
  const day = new Date(Date.UTC(Number(match[3]), month - 1, Number(match[1] || 1)));
  return Number.isNaN(day.getTime()) ? null : day;
}

function dates(text: string): { at: number; day: Date }[] {
  DATE_RE.lastIndex = 0;
  const found: { at: number; day: Date }[] = [];
  for (const match of text.matchAll(DATE_RE)) {
    const day = asDate(match);
    if (day && match.index != null) found.push({ at: match.index, day });
  }
  return found;
}

function near(text: string, cue: RegExp, window = 80): Date[] {
  const days: Date[] = [];
  for (const hit of text.matchAll(new RegExp(cue.source, 'gi'))) {
    if (hit.index == null) continue;
    const slice = text.slice(Math.max(0, hit.index - window), Math.min(text.length, hit.index + hit[0].length + window));
    days.push(...dates(slice).map((item) => item.day));
  }
  return days;
}

function completedBefore(text: string): boolean {
  for (const sentence of text.split(/[.!?]/)) {
    const done = DONE_RE.exec(sentence);
    DONE_RE.lastIndex = 0;
    if (!done || done.index == null) continue;
    const dated = dates(sentence);
    if (dated.length < 2) continue;
    const rest = sentence.slice(done.index + done[0].length);
    const by = /\bby\b/i.exec(rest);
    if (!by || by.index == null) continue;
    const at = done.index + done[0].length + by.index;
    const before = dated.filter((item) => item.at < at).map((item) => item.day.getTime());
    const after = dated.filter((item) => item.at >= at).map((item) => item.day.getTime());
    if (before.length && after.length && Math.max(...before) > Math.min(...after)) return true;
  }
  return false;
}

/** True when the interpretation disagrees with the summary. */
export function contradicts(summary: string, reason: string): boolean {
  if (!reason.trim()) return false;
  if (completedBefore(reason)) return true;
  const planned = near(summary, PLAN_RE);
  if (planned.length && DONE_RE.test(reason)) {
    const done = near(reason, DONE_RE);
    const marks = done.length ? done : dates(reason).map((item) => item.day);
    if (!marks.length || Math.max(...planned.map((day) => day.getTime())) > Math.min(...marks.map((day) => day.getTime()))) return true;
  }
  const noProc = [NO_PROC_RE.test(summary), NO_PROC_RE.test(reason)];
  const opened = [OPEN_RE.test(summary), OPEN_RE.test(reason)];
  if ((noProc[0] && opened[1]) || (opened[0] && noProc[1])) return true;
  const buyers = (text: string) => {
    BUYER_RE.lastIndex = 0;
    return [...text.matchAll(BUYER_RE)].map((match) => match[1].toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim());
  };
  const left = buyers(summary)[0];
  const right = buyers(reason)[0];
  if (left && right && !left.includes(right) && !right.includes(left)) return true;
  return false;
}

/** Drop a configured company from a public sentence. */
export function publicText(text: string): string {
  if (!text || !VENDORS.some((name) => new RegExp(`\\b${name}\\b`).test(text))) return text.trim();
  const kept: string[] = [];
  for (const sentence of text.trim().split(/(?<=[.!?])\s+/)) {
    if (!VENDORS.some((name) => new RegExp(`\\b${name}\\b`).test(sentence))) {
      kept.push(sentence);
      continue;
    }
    let cleaned = sentence;
    for (const name of VENDORS) {
      cleaned = cleaned.replace(new RegExp(`\\bFor ${name},?\\s*`, 'g'), '');
      cleaned = cleaned.replace(new RegExp(`\\s*[—-]\\s*exactly the scope ${name} targets`, 'g'), '');
      cleaned = cleaned.replace(new RegExp(`\\b(?:for|to) ${name}\\b`, 'g'), 'for a supplier in this market');
      cleaned = cleaned.replace(new RegExp(`\\b${name}(?:'s)?\\b`, 'g'), '');
    }
    cleaned = cleaned.replace(/\s{2,}/g, ' ').replace(/\s+([,.])/g, '$1').replace(/\(\s*\)/g, '').replace(/^[\s,—-]+|[\s,—-]+$/g, '');
    if (cleaned.replace(/[^A-Za-z]/g, '').length < 25) continue;
    if (cleaned && !/[.!?]$/.test(cleaned)) cleaned += '.';
    if (cleaned[0] && cleaned[0] === cleaned[0].toLowerCase()) cleaned = cleaned[0].toUpperCase() + cleaned.slice(1);
    kept.push(cleaned);
  }
  return kept.join(' ').trim();
}

/** The interpretation to show. Empty when it contradicts the summary. */
export function shownWhy(summary: string | null | undefined, reason: string | null | undefined): string {
  const facts = publicText(summary || '');
  const text = publicText(reason || '');
  if (!text || contradicts(facts, text)) return '';
  return text;
}
