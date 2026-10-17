/**
 * The onboarding search. A visitor describes the company; after they have an
 * account, this picks one open tender and runs the evaluation and the brief.
 * The conversation before the account is scripted and does not call a model.
 */
import 'server-only';
import { getSupabaseServerClient } from '@/lib/supabase';
import { getContext } from '@/lib/accounts';
import { getGeneralScope } from '@/lib/scopes';
import { wordsOf } from '@/lib/guestScope';
import { ensureEvaluation } from '@/lib/tenderEvaluation';
import { ensureProposal } from '@/lib/proposalManager';
import { getT } from '@/lib/i18n/server';

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
  const id = await pickOpenTender(brief);
  if (!id) return { status: 'error', message: t('No open tender matches that yet.') };
  const evaluation = await ensureEvaluation(id, scope.id, workspaceId, true);
  if (evaluation.status !== 'done') return evaluation.status === 'running' ? { status: 'running' } : { status: 'error', message: evaluation.message || t('The evaluation did not finish.') };
  const proposal = await ensureProposal(id, scope.id, workspaceId, true);
  if (proposal.status !== 'done') return proposal.status === 'running' ? { status: 'running' } : { status: 'error', message: proposal.message || t('The proposal brief did not finish.') };
  return { status: 'done', id };
}
