/**
 * A public sentence does not address the company the agents are briefed for.
 * The name comes from the company brief, so it covers whatever company the
 * agents are configured for.
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

const VAT_VALUE_RE = /\b(?:estimated value|contract value|total value|estimated budget|budget of)\b/i;
const VAT_EXCL_RE = /\b(?:excl\.?|excluding|exclusive of|ex\.)\s+VAT\b|\bVAT\s+excl/i;
const VAT_INCL_RE = /\b(?:incl\.?|including|inclusive of)\s+VAT\b|\bVAT\s+incl/i;

/** VAT treatment only when it sits with the sentence that states the contract value. */
export function vatTreatment(text: string | null | undefined): 'excl' | 'incl' | null {
  if (!text) return null;
  for (const hit of text.matchAll(new RegExp(VAT_VALUE_RE.source, 'ig'))) {
    if (hit.index == null) continue;
    const slice = text.slice(hit.index, Math.min(text.length, hit.index + 180));
    if (VAT_EXCL_RE.test(slice)) return 'excl';
    if (VAT_INCL_RE.test(slice)) return 'incl';
  }
  return null;
}
