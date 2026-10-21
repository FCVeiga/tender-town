/**
 * The submission deadline on a card is the date stored for the tender.
 * A summary can keep an earlier date after a notice extends it. Rewrite only
 * the date that the summary says applies now. History ("the deadline was …")
 * stays as written.
 */

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

const CLAIM = /(?:submission|tender|bid)\s+deadline\s+is\s+|(?<![A-Za-z])deadline\s+is\s+|submission\s+is\s+due(?:\s+(?:on|by))?\s+|open\s+until\s+/gi;

const DATE = /^(?:on\s+|by\s+)?(\d{1,2}\/\d{1,2}\/20\d{2}|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+20\d{2}|20\d{2}-\d{2}-\d{2})/i;

type Parts = { year: number; month: number; day: number };

function partsOf(deadline: string): Parts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(deadline.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function readDate(token: string): Parts | null {
  const slash = /^(\d{1,2})\/(\d{1,2})\/(20\d{2})$/.exec(token);
  if (slash) return { year: Number(slash[3]), month: Number(slash[2]), day: Number(slash[1]) };
  const iso = /^(20\d{2})-(\d{2})-(\d{2})$/.exec(token);
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
  const long = /^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(20\d{2})$/i.exec(token);
  if (!long) return null;
  const word = long[2].toLowerCase();
  const index = MONTHS.findIndex((name) => name === word || (word.length >= 3 && word.length < name.length && name.startsWith(word)));
  if (index < 0) return null;
  return { year: Number(long[3]), month: index + 1, day: Number(long[1]) };
}

function same(a: Parts, b: Parts) {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

function monthLike(source: string, month: number) {
  const name = MONTHS[month - 1];
  const word = /^[A-Za-z]+$/.exec(source)?.[0] || source;
  const short = word.length <= 3;
  const base = short ? name.slice(0, 3) : name;
  if (word === word.toUpperCase()) return base.toUpperCase();
  if (word[0] === word[0].toUpperCase()) return base[0].toUpperCase() + base.slice(1);
  return base;
}

function formatLike(token: string, when: Parts) {
  if (token.includes('/')) {
    const [day, month] = token.split('/');
    const pad = (n: number, width: number) => String(n).padStart(width, '0');
    return `${pad(when.day, day.length)}/${pad(when.month, month.length)}/${when.year}`;
  }
  if (/^20\d{2}-/.test(token)) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${when.year}-${pad(when.month)}-${pad(when.day)}`;
  }
  const long = /^(\d{1,2})(st|nd|rd|th)?\s+([A-Za-z]+)\s+20\d{2}$/i.exec(token);
  if (!long) return token;
  const day = long[1].length > 1 ? String(when.day).padStart(long[1].length, '0') : String(when.day);
  const ord = long[2] ? ordinal(when.day) : '';
  return `${day}${ord} ${monthLike(long[3], when.month)} ${when.year}`;
}

function ordinal(day: number) {
  const teen = day % 100;
  if (teen >= 11 && teen <= 13) return 'th';
  return ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[day % 10] || 'th';
}

/** The summary, with the submission deadline it says applies now set to the stored date. */
export function alignSubmissionDeadline(text: string, deadline: string | null | undefined): string {
  const when = deadline ? partsOf(String(deadline)) : null;
  if (!text || !when) return text || '';
  let out = '';
  let cursor = 0;
  const claims = new RegExp(CLAIM.source, 'gi');
  let match: RegExpExecArray | null;
  while ((match = claims.exec(text))) {
    const before = text.slice(Math.max(0, match.index - 24), match.index).toLowerCase();
    if (/clarification|question/.test(before)) continue;
    const found = DATE.exec(text.slice(match.index + match[0].length));
    if (!found) continue;
    const token = found[1];
    const stated = readDate(token);
    if (!stated || same(stated, when)) continue;
    const at = match.index + match[0].length + (found[0].length - token.length);
    out += text.slice(cursor, at) + formatLike(token, when);
    cursor = at + token.length;
    claims.lastIndex = cursor;
  }
  return out + text.slice(cursor);
}
