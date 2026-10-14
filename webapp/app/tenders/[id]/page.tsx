import type { Metadata } from 'next';
import Link from 'next/link';
import { permanentRedirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase';
import { Opportunity, buyerOf, oppCategoryLabel, titleOf } from '@/lib/data';
import { firstInLanguage } from '@/lib/english';
import { plainText } from '@/lib/plain';
import { DeadlineText, StatusTags } from '@/components/OpportunityCard';
import UpdateComment, { UpdateEvent } from '@/components/UpdateComment';
import TenderDocuments, { Doc } from '@/components/TenderDocuments';
import AgentAvatar from '@/components/AgentAvatar';
import { isAgentEnabled } from '@/lib/settings';
import HeartButton from '@/components/HeartButton';
import { getLikes } from '@/lib/likes';
import { getCurrentUser, siteOrigin } from '@/lib/auth';
import { getScopeItems, getViewScopes } from '@/lib/scopes';
import { getContext, getPersonalAccount } from '@/lib/accounts';
import TenderScopeEvaluation from '@/components/TenderScopeEvaluation';
import { getPlatformLanguage } from '@/lib/language';
import { getLocale, getT } from '@/lib/i18n/server';
import { UpgradeReport } from '@/components/UpgradeReport';
import { allowRequirements } from '@/lib/tenderViews';
import { PLANS } from '@/lib/plans';
import { clip, pageMeta } from '@/lib/seo';
import JsonLd from '@/components/JsonLd';
import ItemSources from '@/components/ItemSources';

// The Tender Evaluation Agent runs inside this page's server action: give it time.
export const maxDuration = 300;

// The Tender Analysis Agent's four groups; older rows without a group fall back on their category.
const REQ_GROUPS: { key: string; label: string; categories: string[] }[] = [
  { key: 'ELIGIBILITY', label: 'Eligibility criteria',
    categories: ['LEGAL', 'FINANCIAL', 'TURNOVER', 'INSURANCE', 'CERTIFICATION', 'LOCAL_PRESENCE', 'CONSORTIUM', 'SUBCONTRACTING', 'EVIDENCE'] },
  { key: 'REFERENCES', label: 'Project references', categories: ['REFERENCE', 'COMPANY_EXPERIENCE'] },
  { key: 'HUMAN_RESOURCES', label: 'Human resource requirements',
    categories: ['TEAM', 'CV', 'EDUCATION', 'PERSONAL_CERTIFICATION', 'SECURITY_CLEARANCE', 'LANGUAGE', 'FTE'] },
  { key: 'TECHNICAL', label: 'Technical & project requirements',
    categories: ['TECHNICAL', 'SECURITY', 'PRIVACY', 'EIDAS', 'EUDI', 'INTEROPERABILITY', 'HOSTING', 'SLA', 'IMPLEMENTATION'] },
];
const groupOf = (r: any) => r.requirement_group
  || REQ_GROUPS.find((g) => g.categories.includes(r.category))?.key || 'TECHNICAL';

type Evaluation = {
  fit_score: number; verdict: string; take?: string; strengths: string[]; gaps: string[];
  partners: { role: string; why?: string }[]; next_steps: { title: string; deadline?: string | null }[];
};
const VERDICTS: Record<string, string> = {
  bid: 'Bid', bid_with_partner: 'Bid with a partner', consider: 'Consider', no_bid: 'No bid',
};

function matchLabel(m: string | null) {
  if (m === 'MATCH') return 'Match';
  if (m === 'PARTNER_NEEDED') return 'Partner needed';
  if (m === 'NO_MATCH') return 'No match';
  if (m === 'PARTIAL_MATCH') return 'Partial';
  return 'Unknown';
}
function matchClass(m: string | null) {
  if (m === 'MATCH') return 'match';
  if (m === 'PARTNER_NEEDED') return 'partner';
  if (m === 'NO_MATCH') return 'no_match';
  if (m === 'PARTIAL_MATCH') return 'partner';
  return 'unknown';
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const { data } = await getSupabaseServerClient().from('opportunities')
    .select('title, title_en, language, summary, tender_summary, authority, authority_en, country')
    .eq('opportunity_id', params.id).maybeSingle();
  if (!data) return { title: 'Not found — Tender Town', robots: { index: false, follow: false } };
  const title = titleOf(data);
  const description = clip(firstInLanguage(data.tender_summary, data.summary) || [title, data.authority_en || data.authority, data.country].filter(Boolean).join(' · '));
  return pageMeta({ title: `${title} — Tender Town`, description, path: `/tenders/${params.id}`, type: 'article' });
}

export default async function OpportunityDetailPage({ params }: { params: { id: string } }) {
  await getPlatformLanguage();  // the display filter's language
  const t = await getT();
  const supabase = getSupabaseServerClient();

  const { data: o, error } = await supabase
    .from('opportunities')
    .select('*')
    .eq('opportunity_id', params.id)
    .single();

  if (error || !o) {
    return (
      <div>
        <Link className="back-link" href="/tenders">← {t('Back to Tenders')}</Link>
        <div className="detail-block"><h2>{t('Not found')}</h2><p>{error?.message || t('No tender with this ID.')}</p></div>
      </div>
    );
  }

  if (o.opportunity_type === 'signal') permanentRedirect(`/news/signals/${o.opportunity_id}`);

  const user = await getCurrentUser();

  const { data: requirements } = await supabase
    .from('requirements')
    .select('*, requirement_matches(match_status, matched_evidence, notes, scope_id, workspace_id)')
    .eq('opportunity_id', params.id);

  const { data: documents } = await supabase
    .from('documents')
    .select('*')
    .eq('opportunity_id', params.id)
    .order('publication_date', { ascending: true, nullsFirst: false });

  const { data: award } = await supabase
    .from('award_criteria')
    .select('*')
    .eq('opportunity_id', params.id)
    .order('weight', { ascending: false });

  const { data: changes } = await supabase
    .from('change_events')
    .select('*')
    .eq('opportunity_id', params.id)
    .order('detected_at', { ascending: false });

  const reqs = (requirements || []).filter((r) => firstInLanguage(r.requirement_text));
  // Scopes: the viewer's active scopes (or the default scope): relevance, evaluations, match columns.
  const [{ scopes: viewScopes, own, canRun }, ctx, account] = await Promise.all([
    getViewScopes(), getContext(), user ? getPersonalAccount(user.id) : Promise.resolve(null),
  ]);
  const plan = ctx?.plan ?? account?.plan ?? PLANS[0];
  const evaluationAllowed = plan.evaluationsPerMonth !== 0;
  const proposalsAllowed = plan.proposalsPerMonth !== 0;
  const showRequirements = user ? await allowRequirements(user.id, plan.requirementViewsPerMonth) : false;
  const locked = !ctx ? null : !ctx.canCustomize && ctx.isAdmin ? 'plan' : !ctx.isAdmin ? 'member' : null;
  const { data: scopeEvals } = await supabase.from('scope_evaluations').select('*').eq('opportunity_id', params.id)
    .in('scope_id', viewScopes.map((s) => s.id));
  const wsId = ctx?.workspace.id ?? null;
  const evalOf = (scopeId: string) => {
    const rows = (scopeEvals || []).filter((r: any) => r.scope_id === scopeId);
    return (wsId && rows.find((r: any) => r.workspace_id === wsId)) || rows.find((r: any) => !r.workspace_id) || null;
  };
  const evaluatedScopes = viewScopes.filter((s) => evalOf(s.id)?.evaluation);
  const scopeItems = await getScopeItems('tender');
  const relevance = scopeItems?.relevance.get(params.id) ?? o.opportunity_relevance_score;
  const fits = evaluatedScopes.map((s) => evalOf(s.id).evaluation.fit_score as number);
  const matchOf = (r: any, scopeId: string) => {
    const rows = (r.requirement_matches || []).filter((m: any) => m.scope_id === scopeId);
    return (wsId && rows.find((m: any) => m.workspace_id === wsId)) || rows.find((m: any) => !m.workspace_id);
  };
  const summary = plainText(firstInLanguage(o.tender_summary) ?? firstInLanguage(o.summary) ?? '')
    .split(/\n{2,}/).map((p: string) => p.trim()).filter(Boolean);
  const why = plainText(scopeItems?.reason.get(params.id) || '');
  const [{ data: countryRow }, likes, agentFlags] = await Promise.all([
    o.country ? supabase.from('countries').select('name').eq('code', o.country).maybeSingle() : Promise.resolve({ data: null as { name: string } | null }),
    getLikes('tender', [o.opportunity_id]),
    Promise.all(viewScopes.map(async (s) => [s.id, await isAgentEnabled('tender_evaluation', s.id), await isAgentEnabled('proposal_manager', s.id)] as const)),
  ]);
  const flags = new Map(agentFlags.map(([id, e, p]) => [id, { evaluator: e, proposer: p }]));

  const origin = siteOrigin();
  const headline = titleOf(o);
  return (
    <div>
      <JsonLd data={{
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline,
        description: clip(firstInLanguage(o.tender_summary, o.summary) || headline, 300),
        datePublished: o.publication_date || o.first_detected,
        dateModified: o.last_change || o.publication_date || o.first_detected,
        author: { '@type': 'Organization', name: buyerOf(o) || 'Tender Town' },
        publisher: { '@type': 'Organization', name: 'Tender Town', url: origin },
        mainEntityOfPage: `${origin}/tenders/${o.opportunity_id}`,
      }} />
      <Link className="back-link" href="/tenders">← {t('Tenders')}</Link>

      <div className="detail-head">
        <div className="detail-tags-row">
          <div className="opp-tags"><StatusTags o={o as Opportunity} /></div>
          <HeartButton type="tender" id={o.opportunity_id} liked={likes.liked.has(o.opportunity_id)} signedIn={likes.signedIn} className="page-heart" />
        </div>
        <h1>{titleOf(o)}</h1>
        <p className="page-sub">{[buyerOf(o), countryRow?.name || o.country].filter(Boolean).join(' · ') || t('International')}</p>
        {titleOf(o) !== o.title && (
          <p className="original-title"><span>{t('Original')}{o.language ? ` (${o.language.toUpperCase()})` : ''}</span> {o.title}</p>
        )}
      </div>

      <div className="stat-grid">
        <div className="stat"><div className="stat-label">{t('Relevance')}</div><div className="stat-num">{relevance ?? '—'}</div></div>
        <div className="stat"><div className="stat-label">{t('Fit')}</div><div className="stat-num">{fits.length ? Math.max(...fits) : '—'}</div></div>
        <div className="stat"><div className="stat-label">{t('Value')}</div><div className="stat-num small">{o.estimated_value ? `${o.currency || ''} ${o.estimated_value.toLocaleString(getLocale())}` : t('Not disclosed')}</div></div>
        <div className="stat"><div className="stat-label">{t('Deadline')}</div><div className="stat-num small"><DeadlineText deadline={o.deadline} /></div></div>
      </div>

      <div className="opp-detail-grid">
        <div>
          {summary.length > 0 && (
            <div className="detail-block">
              <h2>{t('Summary')}</h2>
              {summary.map((p: string, i: number) => <p key={i}>{p}</p>)}
              {why && why !== summary.join('\n\n') && (
                <p className="feed-why"><span>{t('Why this matters')}</span> {why}</p>
              )}
              {o.tender_summary
                ? <p className="summary-note">{t('Tender Analysis Agent')} · {o.official_url?.includes('ted.europa.eu') ? t('from the notice and the tender documents') : t('from the notice and the tender page')}</p>
                : <p className="summary-note">{t('Preliminary summary.')}</p>}
            </div>
          )}

          {(() => {
            const notices = ((documents || []) as Doc[])
              .filter((d) => d.document_type === 'CONTRACT_NOTICE' || d.document_type === 'CORRIGENDUM')
              .sort((a, b) => (a.publication_date || '').localeCompare(b.publication_date || '') || (a.name || '').localeCompare(b.name || ''));
            if (!notices.length) return null;
            return (
              <div className="detail-block" id="timeline">
                <h2>{t('Timeline')} <span className="uc-count">{notices.length}</span></h2>
                <ol className="timeline">
                  {notices.map((d) => (
                    <li key={d.document_id}>
                      <time>{d.publication_date ? new Date(d.publication_date).toLocaleDateString(getLocale(), { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</time>
                      {d.url
                        ? <a href={d.url} target="_blank" rel="noopener noreferrer">{firstInLanguage(d.name_en) ?? d.name}</a>
                        : <span>{firstInLanguage(d.name_en) ?? d.name}</span>}
                    </li>
                  ))}
                </ol>
              </div>
            );
          })()}

          {evaluationAllowed ? viewScopes.map((scope) => (
            <TenderScopeEvaluation key={scope.id} opportunityId={o.opportunity_id} scope={{ id: scope.id, name: scope.name }}
              row={evalOf(scope.id)} showName={viewScopes.length > 1 || !own} canRun={canRun && (!scope.isDefault || !!ctx?.isPlatformAdmin)} signedIn locked={locked}
              evaluatorOn={flags.get(scope.id)?.evaluator ?? true} proposerOn={(flags.get(scope.id)?.proposer ?? true) && proposalsAllowed}
              ready={!!o.tender_summary || reqs.length > 0} analysedAt={o.tender_analysed_at ?? null} />
          )) : (
            <section className="detail-block analysis-block" id="evaluation">
              <div className="agent-head">
                <AgentAvatar agent="tender_evaluation" />
                <div className="agent-id">
                  <h2>{t('Tender Evaluation')}</h2>
                </div>
              </div>
              <UpgradeReport signedIn={!!user} note={t('This agent reads the full tender documents and scores your fit from your company information.')} />
            </section>
          )}
          {!proposalsAllowed && (
            <section className="detail-block analysis-block" id="proposal">
              <div className="agent-head">
                <AgentAvatar agent="proposal_manager" />
                <div className="agent-id">
                  <h2>{t('Proposal brief')}</h2>
                </div>
              </div>
              <UpgradeReport signedIn={!!user} note={t('This agent writes the bid brief from the fit score: which requirements you can answer, which stay open, and which a partner has to cover.')} />
            </section>
          )}
          {changes && changes.length > 0 && (
            <div className="detail-block" id="updates">
              <h2>{t('Updates')} <span className="uc-count">{changes.length}</span></h2>
              <div className="uc-thread">
                {(changes as UpdateEvent[]).map((c) => <UpdateComment key={c.id} e={c} />)}
              </div>
            </div>
          )}
          <div className="detail-block">
            <h2>{t('Status')}</h2>
            <p>{t(oppCategoryLabel(o.opportunity_type))} — {o.status && t(o.status)}</p>
            {o.status_evidence && <p className="evidence">{o.status_evidence}</p>}
            {o.verified_at && (
              <p className="news-meta">{t('Checked against the source on {date}', { date: new Date(o.verified_at).toLocaleDateString(getLocale(), { day: 'numeric', month: 'short', year: 'numeric' }) })}</p>
            )}
          </div>
          <div className="detail-block">
            <h2>{t('Source')}</h2>
            {o.official_url
              ? <p><a className="ext-link" href={o.official_url} target="_blank" rel="noopener noreferrer">{o.official_url} ↗</a></p>
              : <p className="mono">{t('Not recorded')}</p>}
            <ItemSources type="tender" id={o.opportunity_id} skip={o.official_url} />
          </div>

          {(award || []).length > 0 && (
            <div className="detail-block">
              <h2>{t('Award criteria')}</h2>
              <div className="award-list">
                {(award || []).map((a: any) => {
                  const what = firstInLanguage(a.subcriteria?.name_en, a.subcriteria?.name, a.subcriteria?.description_en, a.subcriteria?.description);
                  return (
                    <div key={a.id} className="award-row">
                      <span className="award-label">{a.criterion}{what ? <em> — {what}</em> : null}</span>
                      <span className="award-bar"><span style={{ width: `${a.weight ?? 0}%` }} /></span>
                      <span className="award-weight">{a.weight != null ? `${a.weight}%` : '—'}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="detail-block" id="requirements">
            <h2>{evaluatedScopes.length && showRequirements ? t('Requirements & Match Status') : t('Requirements')} {showRequirements && reqs.length > 0 && <span className="uc-count">{reqs.length}</span>}</h2>
            {!showRequirements ? <UpgradeReport signedIn={!!user} /> : reqs.length === 0 ? (
              <p className="muted">
                {o.tender_analysed_at
                  ? t('None published yet.')
                  : t('Pending analysis.')}
              </p>
            ) : REQ_GROUPS.map((g) => ({ ...g, rows: reqs.filter((r) => groupOf(r) === g.key) })).filter((g) => g.rows.length).map((g) => (
              <div key={g.key} className="req-category-block">
                <div className="req-category-title">{t(g.label)} <span className="uc-count">{g.rows.length}</span></div>
                <table className="req-table">
                  <thead><tr><th>{t('Requirement')}</th><th>{t('Threshold')}</th><th>{t('Mandatory')}</th>{evaluatedScopes.map((sc) => <th key={sc.id}>{evaluatedScopes.length > 1 ? `${t('Match')} · ${sc.name}` : t('Match')}</th>)}</tr></thead>
                  <tbody>
                    {g.rows.map((r) => (
                      <tr key={r.requirement_id}>
                        <td>
                          {r.requirement_text}
                          {firstInLanguage(r.evidence_required) && <div className="req-evidence">{t('Evidence:')} {r.evidence_required}</div>}
                          {r.document && <div className="req-source">{r.document}</div>}
                        </td>
                        <td>{firstInLanguage(r.threshold) ?? ''}</td>
                        <td>{r.mandatory ? <span className="mand-yes">{t('Mandatory')}</span> : <span className="mand-no">{t('Optional')}</span>}</td>
                        {evaluatedScopes.map((sc) => {
                          const m = matchOf(r, sc.id);
                          return (
                            <td key={sc.id}>
                              <span className={`badge-match ${matchClass(m?.match_status)}`}>{t(matchLabel(m?.match_status))}</span>
                              {m?.notes && <div className="req-match-note">{m.notes}</div>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>

        <TenderDocuments docs={(documents || []) as Doc[]} />
      </div>
    </div>
  );
}
