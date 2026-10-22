/**
 * Tender Analysis — one tender, on demand.
 *
 * The daily job stores award-criterion weights from the notice XML and does
 * not call a model. This runs when someone starts a Tender Evaluation: it
 * reads the notice and the tender documents and writes the summary and the
 * requirements that the evaluation then scores. A tender already analysed,
 * with no newer clarifications or specifications, is left as it is.
 */
import { readFile } from 'fs/promises';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import JSZip from 'jszip';
import { fileText } from '@/lib/fileText';
import { getPlatformLanguage } from '@/lib/language';
import { alignSubmissionDeadline } from '@/lib/deadlineCopy';
import { publicText, statedValue } from '@/lib/publication';
import { isAgentEnabled } from '@/lib/settings';
import { getSupabaseServerClient } from '@/lib/supabase';

const MODEL = 'claude-opus-5-5';
const GROUPS = new Set(['ELIGIBILITY', 'REFERENCES', 'HUMAN_RESOURCES', 'TECHNICAL']);
const CATEGORIES = new Set(['LEGAL', 'FINANCIAL', 'TURNOVER', 'INSURANCE', 'CERTIFICATION', 'COMPANY_EXPERIENCE', 'REFERENCE', 'TEAM', 'CV', 'EDUCATION', 'PERSONAL_CERTIFICATION', 'SECURITY_CLEARANCE', 'LANGUAGE', 'FTE', 'LOCAL_PRESENCE', 'TECHNICAL', 'SECURITY', 'PRIVACY', 'EIDAS', 'EUDI', 'INTEROPERABILITY', 'HOSTING', 'SLA', 'IMPLEMENTATION', 'CONSORTIUM', 'SUBCONTRACTING', 'EVIDENCE']);
const READ_ORDER = ['TENDER_SPECIFICATIONS', 'TECHNICAL_SPECIFICATIONS', 'AWARD_CRITERIA', 'FORM', 'Q_AND_A', 'CLARIFICATION', 'ANNEX'];
const NEW_DOC_TYPES = ['CONTRACT_NOTICE', 'CLARIFICATION', 'Q_AND_A', 'CORRIGENDUM', 'TENDER_SPECIFICATIONS', 'TECHNICAL_SPECIFICATIONS'];
const DOC_CHARS = 60_000;
const MAIN_DOC_CHARS = 100_000;
const TOTAL_CHARS = 260_000;
const TED_SEARCH = 'https://api.ted.europa.eu/v3/notices/search';
const UA = 'Mozilla/5.0 TenderTown/1.0';

function buyerFile(url: string | null | undefined) {
  if (!url) return false;
  if (url.includes('downloadContractDocument') || url.includes('/de/documents/') || url.includes('/ethics/publicTenderDoc/')) return true;
  return /\.(pdf|docx?|xlsx?|zip|odt)(?:$|[?#&])/i.test(url.split('#')[0]);
}

const clean = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

function parseJson(text: string) {
  const start = text.indexOf('{');
  for (let end = text.lastIndexOf('}'); end > start; end = text.lastIndexOf('}', end - 1)) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch { /* a shorter span */ }
  }
  throw new Error('The agent did not return a readable requirements list.');
}

async function analysisPrompt() {
  const db = getSupabaseServerClient();
  const [{ data }, language] = await Promise.all([
    db.from('agent_settings').select('prompt_override, default_prompt').eq('agent_key', 'tender_analysis').maybeSingle(),
    getPlatformLanguage(),
  ]);
  let text = data?.prompt_override || data?.default_prompt || '';
  if (!text) {
    for (const rel of ['prompts/tender_requirements.md', '../prompts/tender_requirements.md']) {
      try { text = await readFile(path.join(process.cwd(), rel), 'utf8'); break; } catch { /* the other path */ }
    }
  }
  if (!text) throw new Error('The tender analysis prompt is missing.');
  return text.replaceAll('{language}', language.name);
}

function noticeDescription(xml: string) {
  const out: string[] = [];
  for (const b of xml.match(/<cac:ProcurementProject>([\s\S]*?)<\/cac:ProcurementProject>/g) || []) {
    const name = b.match(/<cbc:Name[^>]*>([\s\S]*?)<\/cbc:Name>/);
    const desc = b.match(/<cbc:Description[^>]*>([\s\S]*?)<\/cbc:Description>/);
    const dur = b.match(/<cbc:DurationMeasure unitCode="(\w+)">(\d+)</);
    const line = [name ? clean(name[1]) : '', desc ? clean(desc[1]) : '', dur ? `duration ${dur[2]} ${dur[1].toLowerCase()}` : ''].filter(Boolean).join(' — ');
    if (line) out.push(line);
  }
  return [...new Set(out)].join('\n');
}

function noticeCriteria(xml: string) {
  const grab = (blockRe: RegExp) => {
    const lines: string[] = [];
    for (const block of xml.match(blockRe) || []) {
      for (const d of block.match(/<cbc:Description[^>]*>([\s\S]*?)<\/cbc:Description>/g) || []) {
        const text = clean(d.replace(/<\/?cbc:Description[^>]*>/g, ''));
        if (text.length > 15) lines.push(text);
      }
    }
    return [...new Set(lines)];
  };
  const award = [];
  for (const b of xml.match(/<cac:SubordinateAwardingCriterion>([\s\S]*?)<\/cac:SubordinateAwardingCriterion>/g) || []) {
    const kind = b.match(/<cbc:AwardingCriterionTypeCode[^>]*>([^<]+)</);
    const weight = b.match(/<efbc:ParameterNumeric>([\d.]+)</);
    const name = b.match(/<cbc:Name[^>]*>([\s\S]*?)<\/cbc:Name>/);
    const desc = b.match(/<cbc:Description[^>]*>([\s\S]*?)<\/cbc:Description>/);
    award.push({
      type: kind?.[1] || null,
      weight: weight ? Number(weight[1]) : null,
      name: name ? clean(name[1]) : null,
      description: desc ? clean(desc[1]) : null,
    });
  }
  return {
    selection: grab(/<efac:SelectionCriteria>[\s\S]*?<\/efac:SelectionCriteria>/g),
    tenderer: grab(/<cac:SpecificTendererRequirement>[\s\S]*?<\/cac:SpecificTendererRequirement>/g),
    award,
  };
}

function noticeLabel(kind: string, index: number) {
  if (kind.startsWith('can-') || kind.startsWith('veat')) return 'Contract award notice';
  if (kind.startsWith('pin-')) return 'Prior information notice';
  if (kind === 'pmc') return 'Market consultation notice';
  if (index > 0 && kind.startsWith('cn-')) return 'Change notice';
  return 'Contract notice';
}

function changeNote(xml: string) {
  const block = xml.match(/<efac:Changes>([\s\S]*?)<\/efac:Changes>/);
  if (!block) return '';
  const texts = (tag: string) => [...block[1].matchAll(new RegExp(`<efbc:${tag}[^>]*>([\\s\\S]*?)<\\/efbc:${tag}>`, 'g'))].map((m) => clean(m[1]));
  const parts = [];
  const reason = texts('ReasonDescription').join(' ');
  const changes = texts('ChangeDescription').join(' ');
  if (reason) parts.push(`Reason: ${reason}`);
  if (changes) parts.push(`Changes: ${changes}`);
  if (/<efbc:ProcurementDocumentsChangeIndicator>true</.test(block[1])) parts.push('The procurement documents were updated.');
  return parts.join(' ').slice(0, 500);
}

async function fetchXml(publication: string) {
  const r = await fetch(`https://ted.europa.eu/en/notice/${publication}/xml`, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`TED notice ${publication} returned ${r.status}`);
  return r.text();
}

async function loadProcedure(officialUrl: string, reference: string | null) {
  const pub = officialUrl.replace(/\/$/, '').split('/').pop() || '';
  const proc = reference?.startsWith('TED:') && reference.length > 4 ? reference.slice(4) : null;
  let notices: { 'publication-number': string; 'publication-date'?: string; 'notice-type'?: string }[] = [];
  if (proc) {
    try {
      const r = await fetch(TED_SEARCH, {
        method: 'POST', headers: { 'content-type': 'application/json', 'User-Agent': UA },
        body: JSON.stringify({ query: `procedure-identifier=${proc}`, fields: ['publication-number', 'publication-date', 'notice-type'], limit: 50 }),
      });
      if (r.ok) {
        const json = await r.json();
        notices = (json.notices || []).sort((a: { 'publication-date'?: string }, b: { 'publication-date'?: string }) => String(a['publication-date'] || '').localeCompare(String(b['publication-date'] || '')));
      }
    } catch { /* the current notice still stands */ }
  }
  if (!notices.length) notices = [{ 'publication-number': pub, 'publication-date': '', 'notice-type': '' }];
  const xml = await fetchXml(notices[0]['publication-number']);
  let criteria = noticeCriteria(xml);
  if (!criteria.selection.length && !criteria.tenderer.length && !criteria.award.length && notices.length > 1) {
    try {
      const latest = noticeCriteria(await fetchXml(notices[notices.length - 1]['publication-number']));
      if (latest.selection.length || latest.tenderer.length || latest.award.length) criteria = latest;
    } catch { /* keep the first notice */ }
  }
  const lines: string[] = [];
  for (const [i, n] of notices.slice(0, 12).entries()) {
    let extra = '';
    if (i > 0) {
      try { extra = changeNote(await fetchXml(n['publication-number'])); } catch { extra = ''; }
    }
    lines.push(`- ${(n['publication-date'] || '').slice(0, 10)} ${noticeLabel(n['notice-type'] || '', i)} TED ${n['publication-number']}${extra ? ` — ${extra}` : ''}`);
  }
  return { description: noticeDescription(xml), criteria, timeline: lines.join('\n') };
}

function recency(name: string) {
  const d = name.match(/(\d{1,2})\.(\d{1,2})\.(20\d\d)/) || name.match(/(20\d\d)-(\d\d)-(\d\d)/);
  if (d) {
    const [a, b, c] = [Number(d[1]), Number(d[2]), Number(d[3])];
    return c > 1000 ? c * 10000 + b * 100 + a : a * 10000 + b * 100 + c;
  }
  const n = name.match(/\d+/g);
  return n ? Number(n[n.length - 1]) : 0;
}

async function readFileBody(name: string, data: Buffer) {
  if (data.subarray(0, 2).toString() === 'PK' && !/\.(docx|xlsx|pptx)$/i.test(name)) {
    const zip = await JSZip.loadAsync(data);
    const inner = Object.keys(zip.files).filter((n) => /\.(pdf|docx|xlsx)$/i.test(n)).slice(0, 8);
    const parts: string[] = [];
    for (const n of inner) {
      const buf = Buffer.from(await zip.files[n].async('uint8array'));
      parts.push(`[${n}]\n${await fileText(n, buf)}`);
    }
    return parts.join('\n\n');
  }
  return fileText(name, data);
}

async function documentTexts(opportunityId: string) {
  const db = getSupabaseServerClient();
  const { data } = await db.from('documents').select('name, document_type, url').eq('opportunity_id', opportunityId);
  const rank = new Map(READ_ORDER.map((t, i) => [t, i]));
  const rows = (data || [])
    .filter((r) => rank.has(r.document_type) && buyerFile(r.url))
    .sort((a, b) => (rank.get(a.document_type)! - rank.get(b.document_type)!) || (recency(b.name || '') - recency(a.name || '')));
  const picked: { name: string; body: string }[] = [];
  const seen = new Map<string, number>();
  let total = 0;
  for (const r of rows) {
    const kind = r.document_type as string;
    if ((kind === 'Q_AND_A' || kind === 'CLARIFICATION') && (seen.get(kind) || 0) >= 4) continue;
    let resp: Response;
    try { resp = await fetch(r.url, { headers: { 'User-Agent': UA } }); } catch { continue; }
    if (!resp.ok) continue;
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length > 30_000_000) continue;
    let body = '';
    try { body = (await readFileBody(r.name || 'document', buf)).replace(/[ \t]+/g, ' ').trim(); } catch { continue; }
    body = body.slice(0, READ_ORDER.slice(0, 2).includes(kind) ? MAIN_DOC_CHARS : DOC_CHARS);
    if (body.length < 200) continue;
    if (total + body.length > TOTAL_CHARS) body = body.slice(0, Math.max(0, TOTAL_CHARS - total));
    if (!body) break;
    picked.push({ name: r.name || 'document', body });
    seen.set(kind, (seen.get(kind) || 0) + 1);
    total += body.length;
  }
  return picked;
}

const SUBMISSION_ORDER = ['FORM', 'FINANCIAL_PROPOSAL', 'ANNEX', 'TENDER_SPECIFICATIONS', 'TECHNICAL_SPECIFICATIONS', 'AWARD_CRITERIA'];
const SUBMISSION_CAP: Record<string, number> = {
  FORM: 40_000, FINANCIAL_PROPOSAL: 40_000, ANNEX: 40_000,
  TENDER_SPECIFICATIONS: 24_000, TECHNICAL_SPECIFICATIONS: 24_000, AWARD_CRITERIA: 12_000,
};
const SUBMISSION_KIND_CAP: Record<string, number> = {
  FORM: 6, FINANCIAL_PROPOSAL: 4, ANNEX: 8, TENDER_SPECIFICATIONS: 2, TECHNICAL_SPECIFICATIONS: 2, AWARD_CRITERIA: 2,
};

/** Forms, annexes and the specifications that define them, so a brief can follow the buyer's template. */
export async function submissionDocumentTexts(opportunityId: string) {
  const db = getSupabaseServerClient();
  const { data } = await db.from('documents').select('name, document_type, url').eq('opportunity_id', opportunityId);
  const rank = new Map(SUBMISSION_ORDER.map((t, i) => [t, i]));
  const rows = (data || [])
    .filter((r) => rank.has(r.document_type) && buyerFile(r.url))
    .sort((a, b) => (rank.get(a.document_type)! - rank.get(b.document_type)!) || (recency(b.name || '') - recency(a.name || '')));
  const picked: { name: string; type: string; body: string }[] = [];
  const seen = new Map<string, number>();
  let total = 0;
  for (const r of rows) {
    const kind = r.document_type as string;
    if ((seen.get(kind) || 0) >= (SUBMISSION_KIND_CAP[kind] || 1)) continue;
    let resp: Response;
    try { resp = await fetch(r.url, { headers: { 'User-Agent': UA } }); } catch { continue; }
    if (!resp.ok) continue;
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length > 30_000_000) continue;
    let body = '';
    try { body = (await readFileBody(r.name || 'document', buf)).replace(/[ \t]+/g, ' ').trim(); } catch { continue; }
    body = body.slice(0, SUBMISSION_CAP[kind] || DOC_CHARS);
    if (body.length < 200) continue;
    if (total + body.length > 140_000) body = body.slice(0, Math.max(0, 140_000 - total));
    if (!body) break;
    picked.push({ name: r.name || 'document', type: kind, body });
    seen.set(kind, (seen.get(kind) || 0) + 1);
    total += body.length;
  }
  return picked;
}

async function pageText(url: string) {
  const key = process.env.TAVILY_API_KEY;
  if (key) {
    try {
      const r = await fetch('https://api.tavily.com/extract', {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({ urls: [url] }),
      });
      const body = (await r.json())?.results?.[0]?.raw_content || '';
      if (body.length > 300) return String(body).slice(0, DOC_CHARS);
    } catch { /* the page itself */ }
  }
  try {
    const page = await (await fetch(url, { headers: { 'User-Agent': UA } })).text();
    return clean(page.replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, ' ')).slice(0, DOC_CHARS);
  } catch { return ''; }
}

function plainSummary(value: string) {
  return (value || '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/^#{1,6}\s+/gm, '').trim();
}

function statedContract(out: { estimated_value?: unknown; currency?: string }, summary: string) {
  let value = Number(out.estimated_value);
  if (!Number.isFinite(value) || value <= 0) {
    const parsed = statedValue(summary);
    if (!parsed) return { value: null as number | null, currency: null as string | null };
    return parsed.currency === 'USD' || parsed.currency === 'GBP' || parsed.currency === 'EUR'
      ? { value: parsed.amount, currency: parsed.currency }
      : { value: parsed.amount, currency: 'EUR' };
  }
  let currency = (out.currency || '').trim().toUpperCase().slice(0, 8);
  if (currency !== 'EUR' && currency !== 'USD' && currency !== 'GBP') currency = 'EUR';
  return { value, currency };
}

/** Write this tender's summary and requirements, unless a current analysis is already stored. */
export async function ensureTenderAnalysis(opportunityId: string) {
  if (!(await isAgentEnabled('tender_analysis'))) return;
  const db = getSupabaseServerClient();
  const { data: o } = await db.from('opportunities').select('opportunity_id, official_url, reference, tender_analysed_at, authority, authority_en, country, estimated_value, deadline').eq('opportunity_id', opportunityId).maybeSingle();
  if (!o?.official_url) throw new Error('This tender has no source to read.');
  if (o.tender_analysed_at) {
    const { count, error } = await db.from('documents').select('document_id', { count: 'exact', head: true })
      .eq('opportunity_id', opportunityId).gt('downloaded_at', o.tender_analysed_at).in('document_type', NEW_DOC_TYPES);
    if (error) throw new Error(error.message);
    if (!count) return;
  }
  const ted = o.official_url.includes('ted.europa.eu');
  let description = '';
  let timeline = '';
  let criteria = { selection: [] as string[], tenderer: [] as string[], award: [] as { type: string | null; weight: number | null; name: string | null; description: string | null }[] };
  if (ted) {
    const bundle = await loadProcedure(o.official_url, o.reference);
    description = bundle.description;
    timeline = bundle.timeline;
    criteria = bundle.criteria;
    if (criteria.award.length) {
      await db.from('award_criteria').delete().eq('opportunity_id', opportunityId);
      await db.from('award_criteria').insert(criteria.award.map((a) => ({
        opportunity_id: opportunityId,
        criterion: ({ price: 'Price', cost: 'Cost', quality: 'Quality' } as Record<string, string>)[a.type || ''] || (a.type || 'Criterion'),
        weight: a.weight,
        subcriteria: { type: a.type, name: a.name, description: a.description },
      })));
    }
  }
  const { data: nameRows } = await db.from('documents').select('name').eq('opportunity_id', opportunityId);
  const names = (nameRows || []).map((r) => r.name).filter(Boolean) as string[];
  let docs = await documentTexts(opportunityId);
  if (!ted) {
    const body = await pageText(o.official_url);
    if (body) docs = [{ name: `Opportunity page ${o.official_url}`, body }, ...docs];
  }
  const deadlineOn = o.deadline ? String(o.deadline).slice(0, 10) : '';
  const listing = [
    '## Current facts',
    deadlineOn
      ? `Submission deadline: ${deadlineOn}. This is the date bids are due now. An earlier submission date in a notice is history.`
      : 'Submission deadline: not stated.',
    '## Procedure history',
    'Every official notice of this procedure, from the first publication to the latest update.',
    'Describe the tender as first published, then the changes that still stand.',
    timeline || '(single notice)',
    '## Notice', 'Procurement description:', description || '(none)',
    'Selection criteria:', ...criteria.selection.map((s) => `- ${s.slice(0, 2000)}`),
    'Other tenderer requirements:', ...criteria.tenderer.map((s) => `- ${s.slice(0, 2000)}`),
    'Award criteria:', ...criteria.award.map((a) => `- ${a.type} ${a.weight}%: ${a.name || ''} ${a.description || ''}`),
    'All published documents:', ...names.slice(0, 80).map((d) => `- ${d}`),
    ...docs.map((d) => `\n## Document: ${d.name}\n${d.body}`),
  ].join('\n');

  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not configured on the server.');
  const client = new Anthropic({
    defaultHeaders: process.env.ANTHROPIC_WORKSPACE_ID ? { 'anthropic-workspace-id': process.env.ANTHROPIC_WORKSPACE_ID } : undefined,
  });
  const response: any = await client.beta.messages.create({
    model: MODEL, max_tokens: 16000, system: await analysisPrompt(),
    messages: [{ role: 'user', content: listing }],
    betas: ['server-side-fallback-2026-07-01'],
    output_config: { effort: 'medium' },
    fallbacks: 'default',
  } as any);
  if (response.stop_reason === 'refusal') throw new Error('The agent declined to read this tender.');
  const out = parseJson((response.content as any[]).filter((b) => b.type === 'text').map((b) => b.text).join(''));

  const { data: old } = await db.from('requirements').select('requirement_id').eq('opportunity_id', opportunityId);
  const oldIds = (old || []).map((r) => r.requirement_id);
  if (oldIds.length) await db.from('requirement_matches').delete().in('requirement_id', oldIds);
  await db.from('requirements').delete().eq('opportunity_id', opportunityId);
  const rows = (Array.isArray(out.requirements) ? out.requirements : [])
    .filter((r: any) => r?.text && GROUPS.has(String(r.group || '').toUpperCase()))
    .map((r: any) => {
      const cat = String(r.category || '').toUpperCase();
      return {
        requirement_id: `${opportunityId}-${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`,
        opportunity_id: opportunityId,
        requirement_group: String(r.group).toUpperCase(),
        category: CATEGORIES.has(cat) ? cat : null,
        requirement_text: String(r.text).slice(0, 2000),
        mandatory: r.mandatory !== false,
        threshold: r.threshold ? String(r.threshold).slice(0, 256) : null,
        evidence_required: r.evidence || null,
        document: r.source ? String(r.source).slice(0, 512) : null,
        source_url: o.official_url,
        confidence: 'INFERRED',
      };
    });
  if (rows.length) {
    const { error } = await db.from('requirements').insert(rows);
    if (error) throw new Error(error.message);
  }
  const { data: storedAward } = await db.from('award_criteria').select('id, weight, subcriteria').eq('opportunity_id', opportunityId);
  const created: any[] = [];
  for (const a of Array.isArray(out.award_criteria) ? out.award_criteria : []) {
    if (!a?.criterion) continue;
    const weight = a.weight == null || a.weight === '' ? null : Number(a.weight);
    const row = (storedAward || []).find((s) => {
      const sub = s.subcriteria && typeof s.subcriteria === 'object' ? s.subcriteria : {};
      if (sub.type === 'grid') return false;
      return (s.weight == null && weight == null) || Number(s.weight) === weight;
    });
    if (row) {
      await db.from('award_criteria').update({
        subcriteria: { ...(row.subcriteria && typeof row.subcriteria === 'object' ? row.subcriteria : {}), name_en: String(a.criterion), description_en: a.description ? String(a.description) : null },
      }).eq('id', row.id);
    } else if (!(storedAward || []).length) {
      created.push({
        opportunity_id: opportunityId,
        criterion: String(a.criterion).slice(0, 256),
        weight,
        subcriteria: { name: String(a.criterion), name_en: String(a.criterion), description: a.description ? String(a.description) : null, description_en: a.description ? String(a.description) : null },
      });
    }
  }
  if (created.length) {
    const { error: awardError } = await db.from('award_criteria').insert(created);
    if (awardError) throw new Error(awardError.message);
  }
  const summary = alignSubmissionDeadline(publicText(plainSummary(out.summary || '')), o.deadline) || null;
  const money = statedContract(out, summary || '');
  const deadline = /^\d{4}-\d{2}-\d{2}$/.test(String(out.deadline || '').slice(0, 10)) ? String(out.deadline).slice(0, 10) : null;
  const country = String(out.country || '').trim().toUpperCase();
  const patch: Record<string, unknown> = { tender_summary: summary, tender_analysed_at: new Date().toISOString() };
  if (!o.authority && out.buyer) patch.authority = String(out.buyer).trim();
  if (!o.authority_en && out.buyer_en) patch.authority_en = String(out.buyer_en).trim();
  if (!o.country && /^[A-Z]{2}$/.test(country)) patch.country = country;
  if (o.estimated_value == null && money.value != null) {
    patch.estimated_value = money.value;
    patch.currency = money.currency;
    patch.value_source = 'summary';
  }
  if (!o.deadline && deadline) patch.deadline = deadline;
  const { error } = await db.from('opportunities').update(patch).eq('opportunity_id', opportunityId);
  if (error) throw new Error(error.message);
}
