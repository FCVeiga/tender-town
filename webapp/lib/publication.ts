/**
 * The same publication check as services/publication.py.
 * A reason that contradicts the summary is withheld. A public sentence does
 * not address the company the agents are briefed for. The name comes from the
 * company brief, so it covers whatever company the agents are configured for.
 */
import 'server-only';
import fs from 'fs';
import path from 'path';

function vendorNames(): string[] {
  const files = [
    path.join(process.cwd(), 'agents', 'company_brief.md'),
    path.join(process.cwd(), 'webapp', 'agents', 'company_brief.md'),
  ];
  for (const file of files) {
    try {
      const text = fs.readFileSync(file, 'utf8');
      return [...text.matchAll(/^#\s+([A-Za-z][A-Za-z0-9]+)\b/gm)].map((match) => match[1]).filter((name) => name.length > 2);
    } catch { /* the brief lives in one of those two places */ }
  }
  return [];
}

const VENDORS = vendorNames();

/** A catalog market and General are read by every visitor. A custom scope is not. */
export function publicScope(scope: { isDefault?: boolean; catalog?: boolean } | null | undefined): boolean {
  return !scope || !!scope.isDefault || !!scope.catalog;
}

const MONTHS: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5,
  june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8, september: 9, sep: 9, sept: 9,
  october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
};

const DATE_RE = /\b(?:(\d{1,2})(?:st|nd|rd|th)?\s+)?(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(20\d{2})\b|\b(20\d{2})-(\d{2})-(\d{2})\b/gi;
const DONE_RE = /\b(has launched|have launched|launched|went live|rolled out|rollout completed|completed by|already (?:live|launched|completed)|was completed|has been completed)\b/i;
const PLAN_RE = /\b(plans? to|planned to|scheduled to|will launch|set to launch|expected to|due to launch|to be launched|launch(?:es)? on|scheduled for)\b/i;
const NO_PROC_RE = /\bno (?:open |direct |specific )?(?:tender|procurement|rfp|call\b)|not a procurement|no procurement|no vendor engagement|contains no direct procurement\b/i;
const OPEN_RE = /\b(?:tender is open|bids are open|open for bids|call is open)\b/i;
const BUYER_RE = /\b(?:buyer|contracting authority)\s*(?:is\b|:)\s*([^.;\n]{3,80})/gi;

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

function stated(pattern: RegExp, text: string): boolean {
  for (const hit of text.matchAll(new RegExp(pattern.source, 'gi'))) {
    if (hit.index == null) continue;
    const window = text.slice(Math.max(0, hit.index - 40), hit.index);
    if (!/\b(?:no|not|without|never)\b|n't/i.test(window)) return true;
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
  const noProc = [stated(NO_PROC_RE, summary), stated(NO_PROC_RE, reason)];
  const opened = [stated(OPEN_RE, summary), stated(OPEN_RE, reason)];
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

const LIVE_RE = /\b(?:open tender|currently open|still open|live tender|active tender|live procurement|active procurement|open procurement|bids are open|open for bids|bidding is open|remains open|openly tendering|is tendering)\b|\blive\b(?:\s+\w+){0,6}\s+tender\b|\bactive\b(?:\s+\w+){0,6}\s+tender\b/i;
const SHUT_RE = /\b(?:bidding has closed|deadline has passed|no longer open|tender is closed|tender has closed|expired tender)\b/i;
const ADDS_RE = /\b(?:suggests?|could|might|may|watch|monitor|renewal|a later|partner|roles?)\b/i;
const MONEY_RE = /(?:estimated\s+(?:contract\s+)?value|contract\s+value|total\s+value|estimated\s+budget|budget\s+of)\s*(?:of|is|:)?\s*(?:approximately\s+|approx\.?\s+)?(€|EUR|euro|USD|\$|GBP|£)?\s*(\d{1,3}(?:[ .,\u00a0]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)\s*(€|EUR|euro|USD|\$|GBP|£)?(?:\s*(million|mio|billion|bn))?/i;

export type Stage = 'open' | 'closed' | 'signal' | 'uncertain';

/** The stage the page shows, from the record — not from the written interpretation. */
export function stageOf(row: { status?: string | null; opportunity_type?: string | null; deadline?: string | Date | null } | null | undefined): Stage {
  if (!row) return 'uncertain';
  const state = (row.status || '').toUpperCase();
  const kind = (row.opportunity_type || '').toLowerCase();
  if (state === 'UNVERIFIED') return 'uncertain';
  if (state === 'SIGNAL' || kind === 'signal') return 'signal';
  if (state === 'CLOSED' || state === 'AWARDED' || state === 'REJECTED') return 'closed';
  if (row.deadline) {
    const when = row.deadline instanceof Date ? row.deadline : new Date(row.deadline);
    if (!Number.isNaN(when.getTime()) && when.getTime() < Date.now()) return 'closed';
  }
  if (state === 'OPEN') return 'open';
  return 'uncertain';
}

function lifecycleConflict(stage: string | null | undefined, reason: string): boolean {
  if (!stage || !reason) return false;
  const live = stated(LIVE_RE, reason);
  const shut = stated(SHUT_RE, reason);
  if (stage === 'closed') return live;
  if (stage === 'open') return shut;
  if (stage === 'signal' || stage === 'uncertain') return live || shut;
  return false;
}

function restates(summary: string, reason: string): boolean {
  if (!reason || ADDS_RE.test(reason)) return false;
  const words = (text: string) => new Set((text.toLowerCase().match(/[a-z0-9]{5,}/g) || []).filter((word) => !['about', 'after', 'which', 'their', 'there', 'these', 'those', 'would', 'other'].includes(word)));
  const found = words(reason);
  if (found.size < 8) return false;
  const known = words(summary);
  let shared = 0;
  found.forEach((word) => { if (known.has(word)) shared += 1; });
  return shared / found.size >= 0.8;
}

function amountOf(raw: string): number | null {
  let text = raw.replace(/\u00a0/g, '').replace(/ /g, '');
  if (text.includes(',') && text.includes('.')) {
    text = text.lastIndexOf(',') > text.lastIndexOf('.') ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
  } else if (text.includes(',')) {
    const parts = text.split(',');
    text = parts[parts.length - 1].length === 3 ? text.replace(/,/g, '') : text.replace(',', '.');
  } else if ((text.match(/\./g) || []).length > 1) {
    text = text.replace(/\./g, '');
  }
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/** A value the summary itself calls the contract or estimated value. */
export function statedValue(text: string | null | undefined): { amount: number; currency: string } | null {
  const hit = MONEY_RE.exec(text || '');
  MONEY_RE.lastIndex = 0;
  if (!hit) return null;
  let amount = amountOf(hit[2]);
  if (amount == null || amount <= 0) return null;
  const scale = (hit[4] || '').toLowerCase();
  if (scale === 'million' || scale === 'mio') amount *= 1_000_000;
  else if (scale === 'billion' || scale === 'bn') amount *= 1_000_000_000;
  const mark = (hit[1] || hit[3] || 'EUR').toUpperCase();
  const currency = ({ '€': 'EUR', EUR: 'EUR', EURO: 'EUR', '$': 'USD', USD: 'USD', '£': 'GBP', GBP: 'GBP' } as Record<string, string>)[mark] || 'EUR';
  return { amount, currency };
}

/** The interpretation to show. Empty when it contradicts the summary or the record's stage.
 * A public market drops the configured company. A custom scope may keep it. */
export function shownWhy(summary: string | null | undefined, reason: string | null | undefined, open = true, stage?: string | null): string {
  const facts = publicText(summary || '');
  const text = open ? publicText(reason || '') : (reason || '').trim();
  if (!text || contradicts(facts, text) || restates(facts, text) || lifecycleConflict(stage, text)) return '';
  return text;
}
