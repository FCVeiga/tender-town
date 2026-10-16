import { getSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { getContext, getMembership, getWorkspaceContext } from '@/lib/accounts';
import { getT } from '@/lib/i18n/server';
import { planIncludes } from '@/lib/plans';
import { briefToMarkdown, parseProposalBrief } from '@/lib/proposalBrief';

export const dynamic = 'force-dynamic';

/** A scope's proposal brief as a Markdown file download — for members of the scope's workspace only (it maps their team and references). */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const t = await getT();
  const scopeId = new URL(req.url).searchParams.get('scope') || '';
  const user = await getCurrentUser();
  if (!/^[0-9a-f]{12,40}$/.test(params.id) || !user || !/^[0-9a-f-]{36}$/.test(scopeId)) return new Response(t('Not found'), { status: 404 });
  const db = getSupabaseServerClient();
  const { data: scope } = await db.from('scopes').select('workspace_id, is_default, catalog').eq('id', scopeId).maybeSingle();
  const shared = !!(scope?.is_default || scope?.catalog);
  const ctx = shared ? await getContext() : null;
  const mine = shared ? !!ctx : !!scope?.workspace_id && !!(await getMembership(scope.workspace_id));
  if (!mine) return new Response(t('Not found'), { status: 404 });
  const ws = shared ? ctx : await getWorkspaceContext(scope!.workspace_id);
  if (!planIncludes(ws?.plan.proposalsPerMonth)) return new Response(t('Proposal briefs are included on Teams.'), { status: 403 });
  const wsId = shared ? ctx!.workspace.id : null;
  const [{ data: rows }, { data: o }] = await Promise.all([
    db.from('scope_evaluations').select('proposal_brief, workspace_id').eq('scope_id', scopeId).eq('opportunity_id', params.id),
    db.from('opportunities').select('title, title_en').eq('opportunity_id', params.id).maybeSingle(),
  ]);
  const row = (wsId && (rows || []).find((r: any) => r.workspace_id === wsId && r.proposal_brief))
    || (rows || []).find((r: any) => !r.workspace_id && r.proposal_brief);
  if (!row?.proposal_brief) return new Response(t('No proposal brief yet.'), { status: 404 });
  const slug = String(o?.title_en || o?.title || 'tender').normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  const parsed = parseProposalBrief(row.proposal_brief);
  return new Response(parsed ? briefToMarkdown(parsed) : row.proposal_brief, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="proposal-brief-${slug || params.id}.md"`,
      'Cache-Control': 'no-store',
    },
  });
}
