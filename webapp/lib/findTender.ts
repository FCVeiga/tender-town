/**
 * The onboarding search. A visitor describes the company and this picks one
 * open tender. After they have an account, deliverFind also runs the
 * evaluation and the brief.
 */
import 'server-only';
import { getSupabaseServerClient } from '@/lib/supabase';
import { getContext } from '@/lib/accounts';
import { getGeneralScope, getScopeItems } from '@/lib/scopes';
import { wordsOf } from '@/lib/guestScope';
import { ensureEvaluation } from '@/lib/tenderEvaluation';
import { ensureProposal } from '@/lib/proposalManager';
import { getLocale, getT } from '@/lib/i18n/server';
import { buyerOf, cardFreshness, daysUntil, oppCategoryLabel, opportunityPath, titleOf, type Opportunity } from '@/lib/data';
import { plainText } from '@/lib/plain';
import { publicText, stageOf } from '@/lib/publication';
import { shownSummary } from '@/lib/shownSummary';

const EXTRA_STOP = new Set('company companies business services service software public tender tenders work works your with from that this have will into about over more than also only their there what when which while them they make makes made using used'.split(' '));

const COUNTRIES: Record<string, string> = {
  portugal: 'PT', portuguese: 'PT', spain: 'ES', spanish: 'ES', france: 'FR', french: 'FR',
  germany: 'DE', german: 'DE', italy: 'IT', italian: 'IT', netherlands: 'NL', dutch: 'NL',
  belgium: 'BE', ireland: 'IE', malta: 'MT', austria: 'AT', poland: 'PL', sweden: 'SE',
  denmark: 'DK', finland: 'FI', greece: 'GR', czechia: 'CZ', romania: 'RO', hungary: 'HU',
  europe: 'EU', european: 'EU', 'united kingdom': 'GB', britain: 'GB', uk: 'GB',
  'united states': 'US', usa: 'US', america: 'US',
};

export type FindBrief = { name: string; website: string; notes: string };

export function parseFindBrief(raw: string | undefined): FindBrief | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    const name = String(data?.name || '').trim().slice(0, 80);
    const website = String(data?.website || '').trim().slice(0, 200);
    const notes = String(data?.notes || '').trim().slice(0, 1200);
    if (name.length < 2 || (notes.length < 8 && website.length < 4)) return null;
    return { name, website, notes };
  } catch {
    return null;
  }
}

function wantedCountry(place: string) {
  const text = ` ${place.toLowerCase()} `;
  for (const [name, code] of Object.entries(COUNTRIES)) {
    if (text.includes(` ${name} `)) return code;
  }
  return null;
}

function scoreRow(row: { title?: string | null; title_en?: string | null; summary?: string | null; tender_summary?: string | null; country?: string | null; opportunity_relevance_score?: number | null }, words: string[], country: string | null) {
  const title = `${row.title_en || ''} ${row.title || ''}`.toLowerCase();
  const body = `${row.tender_summary || ''} ${row.summary || ''}`.toLowerCase();
  let score = 0;
  for (const word of words) {
    if (title.includes(word)) score += 4;
    else if (body.includes(word)) score += 1;
  }
  if (country && country !== 'EU' && row.country === country) score += 6;
  score += Math.min(5, Number(row.opportunity_relevance_score || 0) / 20);
  return score;
}

/** The open tender whose title and summary share the most with what the company said. */
export async function pickOpenTender(brief: FindBrief) {
  const db = getSupabaseServerClient();
  const now = new Date().toISOString();
  const words = wordsOf(`${brief.name} ${brief.notes} ${brief.website}`).filter((word) => !EXTRA_STOP.has(word)).sort((a, b) => b.length - a.length).slice(0, 5);
  const country = wantedCountry(`${brief.notes} ${brief.website}`);
  let query = db.from('opportunities')
    .select('opportunity_id, title, title_en, summary, tender_summary, country, opportunity_relevance_score')
    .eq('status', 'OPEN')
    .in('opportunity_type', ['rfp', 'rfi'])
    .or(`deadline.is.null,deadline.gte.${now}`)
    .order('opportunity_relevance_score', { ascending: false })
    .limit(40);
  if (words.length) {
    const or = words.flatMap((word) => ['title', 'title_en', 'summary', 'tender_summary'].map((field) => `${field}.ilike.*${word}*`)).join(',');
    query = query.or(or);
  }
  const { data } = await query;
  let rows = data || [];
  if (!rows.length) {
    const broad = await db.from('opportunities')
      .select('opportunity_id, title, title_en, summary, tender_summary, country, opportunity_relevance_score')
      .eq('status', 'OPEN')
      .in('opportunity_type', ['rfp', 'rfi'])
      .or(`deadline.is.null,deadline.gte.${now}`)
      .order('opportunity_relevance_score', { ascending: false })
      .limit(30);
    rows = broad.data || [];
  }
  const ranked = rows.map((row) => ({ id: row.opportunity_id as string, score: scoreRow(row, words, country) }))
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.id || null;
}

export type FindMatch = {
  href: string;
  title: string;
  summary: string;
  buyer: string | null;
  countryName: string | null;
  countryCode: string | null;
  typeLabel: string | null;
  typeSlug: string | null;
  durationMonths: number | null;
  fresh: 'new' | 'updated' | null;
  relevance: number | null;
  fit: number | null;
  value: string | null;
  days: number | null;
  deadlineLabel: string | null;
};

function money(value: number | null, currency: string | null) {
  if (!value) return null;
  const sym = currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : currency === 'USD' ? '$' : `${currency ?? ''} `;
  if (value >= 1e9) return `${sym}${(value / 1e9).toFixed(1).replace(/\.0$/, '')}B`;
  if (value >= 1e6) return `${sym}${(value / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (value >= 1e3) return `${sym}${Math.round(value / 1e3)}K`;
  return `${sym}${value}`;
}

/** The same tender row the tenders page shows, for the company the visitor just described. */
export async function matchOpenTender(brief: FindBrief): Promise<FindMatch | null> {
  const id = await pickOpenTender(brief);
  if (!id) return null;
  const db = getSupabaseServerClient();
  const { data } = await db.from('opportunities').select('opportunity_id, title, title_en, language, country, authority, authority_en, opportunity_type, status, summary, tender_summary, deadline, publication_date, first_detected, last_change, estimated_value, currency, duration_months, opportunity_relevance_score').eq('opportunity_id', id).maybeSingle();
  if (!data) return null;
  const o = data as Opportunity;
  const [items, country] = await Promise.all([
    getScopeItems('tender', true),
    o.country
      ? db.from('countries').select('name').eq('code', o.country).maybeSingle()
      : Promise.resolve({ data: null as { name: string } | null }),
  ]);
  const scoped = items?.relevance.has(id) ? items.relevance.get(id) ?? null : null;
  const stage = stageOf(o);
  const days = daysUntil(o.deadline);
  const countryName = country.data?.name ?? null;
  return {
    href: opportunityPath(o),
    title: titleOf(o),
    summary: publicText(plainText(shownSummary(o))),
    buyer: buyerOf(o),
    countryName,
    countryCode: o.country,
    typeLabel: o.opportunity_type && o.opportunity_type !== 'signal' ? oppCategoryLabel(o.opportunity_type) : null,
    typeSlug: o.opportunity_type,
    durationMonths: o.duration_months,
    fresh: stage === 'closed' || o.opportunity_type === 'signal' ? null : cardFreshness(o),
    relevance: scoped ?? o.opportunity_relevance_score ?? null,
    fit: null,
    value: money(o.estimated_value, o.currency),
    days: days != null && days >= 0 ? days : null,
    deadlineLabel: o.deadline ? new Date(o.deadline).toLocaleDateString(getLocale(), { day: 'numeric', month: 'short', year: 'numeric' }) : null,
  };
}

/** Save what they said as this workspace's company note on General, then run both agents once. */
export async function deliverFind(brief: FindBrief): Promise<{ status: 'done'; id: string } | { status: 'running' } | { status: 'error'; message: string }> {
  const t = await getT();
  const ctx = await getContext();
  const scope = await getGeneralScope();
  if (!ctx || !scope) return { status: 'error', message: t('This account is not set up yet.') };
  const db = getSupabaseServerClient();
  const workspaceId = ctx.workspace.id;
  const lines = [brief.name];
  if (brief.website) lines.push(`Website: ${brief.website}`);
  if (brief.notes) lines.push('', brief.notes);
  lines.push('', 'Nothing else is known about this company. A missing certificate, product, person or country is unknown, not a capability.');
  const text = lines.join('\n');
  const { data: recent } = await db.from('scope_evaluations')
    .select('opportunity_id, evaluation, proposal_brief, evaluated_at')
    .eq('scope_id', scope.id).eq('workspace_id', workspaceId)
    .not('evaluation', 'is', null)
    .order('evaluated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recent?.proposal_brief && recent.evaluated_at && Date.now() - new Date(recent.evaluated_at).getTime() < 12 * 60 * 60 * 1000) {
    return { status: 'done', id: recent.opportunity_id };
  }
  await db.from('company_documents').delete().eq('scope_id', scope.id).eq('workspace_id', workspaceId).eq('name', 'Company note');
  const { error: docError } = await db.from('company_documents').insert({
    scope_id: scope.id,
    workspace_id: workspaceId,
    kind: 'presentation',
    name: 'Company note',
    storage_path: `find/${workspaceId}/company.txt`,
    text_content: text,
    chars: text.length,
  });
  if (docError) return { status: 'error', message: docError.message };
  const { recordProductEvent } = await import('@/lib/productRecord');
  const { getCurrentUser } = await import('@/lib/auth');
  const user = await getCurrentUser();
  await recordProductEvent({ name: 'company_context_saved', userId: user?.id || null, scopeId: scope.id, path: '/find', pageType: 'find', ok: true, entitlement: 'onboard' });
  const id = await pickOpenTender(brief);
  if (!id) return { status: 'error', message: t('No open tender matches that yet.') };
  const evaluation = await ensureEvaluation(id, scope.id, workspaceId, true);
  if (evaluation.status !== 'done') return evaluation.status === 'running' ? { status: 'running' } : { status: 'error', message: evaluation.message || t('The evaluation did not finish.') };
  const proposal = await ensureProposal(id, scope.id, workspaceId, true);
  if (proposal.status !== 'done') return proposal.status === 'running' ? { status: 'running' } : { status: 'error', message: proposal.message || t('The proposal brief did not finish.') };
  return { status: 'done', id };
}
