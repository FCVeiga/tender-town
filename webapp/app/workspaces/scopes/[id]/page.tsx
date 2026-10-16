import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AGENTS } from '@/lib/agents';
import { getCurrentUser } from '@/lib/auth';
import { SCOPE_AGENT_KEYS, getScopeAgents, getViewableScope, workspaceScopeUse } from '@/lib/scopes';
import { getContext, getPersonalAccount, getWorkspaceContext } from '@/lib/accounts';
import { getSupabaseServerClient } from '@/lib/supabase';
import { DOC_KINDS, getAgentDefaults, getScopeDocs } from '@/lib/settings';
import AgentCard from '@/components/settings/AgentCard';
import ScopeCard from '@/components/settings/ScopeCard';
import { DeleteScopeForm, DocumentGroup, ScopeForm } from '@/components/settings/SettingsForms';
import FollowingSection from '@/components/settings/FollowingSection';
import { getCountryOptions, getFollowedSourceIds, getSources } from '@/lib/sources';
import { getT } from '@/lib/i18n/server';
import { newsReportAllowance } from '@/lib/newsQuota';
import { planIncludes } from '@/lib/plans';

// The Config Agent runs inside this page's server actions: give it time.
export const maxDuration = 300;

/** One scope: name and instructions, context documents, and its agents. */
export default async function ScopePage({ params, searchParams }: { params: { id: string }; searchParams: { from?: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/workspaces/scopes/${params.id}`);
  const scope = await getViewableScope(params.id);
  if (!scope) notFound();
  const from = searchParams.from && /^[0-9a-f-]{36}$/.test(searchParams.from) ? searchParams.from : null;
  const ctx = await getContext();
  const opened = from ? await getWorkspaceContext(from) : null;
  const back = opened ? `/workspaces/${from}` : '/workspaces';
  const ws = opened ?? ctx;
  const locked = !scope.editable;
  const shared = scope.isDefault || scope.catalog;
  const docWorkspace = shared ? ctx?.workspace.id ?? null : null;
  const docsEditable = shared ? !!ctx?.isAdmin && !!docWorkspace : !locked;
  const account = await getPersonalAccount(user.id);
  const viewerPlan = { key: account?.planKey ?? 'free', status: account?.planStatus ?? 'active', periodEnd: account?.periodEnd ?? null, hasBilling: !!account?.stripeCustomerId };
  const upgrade = { userId: user.id, admin: !!ctx?.isPlatformAdmin, plan: viewerPlan };
  const t = await getT();
  const [agents, defaults, docs, sources, countries, allowance] = await Promise.all([
    getScopeAgents(scope.id), getAgentDefaults(), getScopeDocs(scope.id, docWorkspace), getSources(), getCountryOptions(), newsReportAllowance(),
  ]);
  const followed = Array.from(await getFollowedSourceIds([scope.id]));
  const cfg = scope.searchConfig;
  let scopeOn = scope.active;
  let canToggle = scope.editable;
  let showDefaultFor: string | null = null;
  let catalogFor: string | null = null;
  let atLimit = false;
  if (ws && (scope.isDefault || scope.catalog)) {
    const db = getSupabaseServerClient();
    const use = await workspaceScopeUse(ws.workspace.id);
    const { count } = await db.from('scopes').select('id', { count: 'exact', head: true })
      .eq('workspace_id', ws.workspace.id).eq('active', true).eq('is_default', false).eq('catalog', false);
    const otherActive = (count ?? 0) > 0 || use.pickIds.length > 0;
    if (scope.isDefault) {
      const { data: wsRow } = await db.from('workspaces').select('show_default').eq('id', ws.workspace.id).maybeSingle();
      scopeOn = wsRow?.show_default !== false || !otherActive;
      canToggle = ws.isAdmin && otherActive;
      showDefaultFor = ws.workspace.id;
    } else {
      scopeOn = use.pickIds.includes(scope.id);
      canToggle = ws.isAdmin;
      catalogFor = ws.workspace.id;
      const limit = ws.isDefault ? Infinity : ws.plan.scopes;
      atLimit = !scopeOn && use.custom + use.pickIds.length >= limit;
    }
  }

  return (
    <div className="settings">
      <Link className="back-link" href={back}>← {t('Workspace')}</Link>
      <div className="scope-page-head">
        <h1 className="opps-h1">{scope.name}</h1>
        <ScopeCard bare scope={{ id: scope.id, name: scope.name, instructions: scope.instructions, active: scopeOn, isDefault: scope.isDefault, catalog: scope.catalog, topic: cfg?.topic ?? null }}
          docs={0} agentsOn={0} agentsTotal={0} items={0}
          canToggle={canToggle} showDefaultFor={showDefaultFor} catalogFor={catalogFor} atLimit={atLimit}
          upgrade={ws?.isAdmin ? upgrade : null} />
      </div>

      <section className="detail-block" id="scope">
        <h2>{t('Scope')}</h2>
        {locked
          ? <p className="scope-readonly-text">{scope.instructions || t('No instructions yet.')}</p>
          : <ScopeForm scopeId={scope.id} name={scope.name} instructions={scope.instructions ?? ''} />}
      </section>

      <section className="detail-block" id="context">
        <h2>{t('Scope context')}</h2>
        {DOC_KINDS.map((k) => (
          <DocumentGroup key={k.kind} scopeId={scope.id} workspaceId={docWorkspace} kind={k.kind} label={k.label} hint={k.hint} docs={docs.filter((d) => d.kind === k.kind)} readOnly={!docsEditable} />
        ))}
        {docsEditable && <p className="field-hint">{t('PDF, Word, PowerPoint, Excel or text · up to 50 MB · private')}</p>}
      </section>

      <section className="detail-block" id="agents">
        <h2>{t('Agents')}</h2>
        <div className="agent-grid">
          {AGENTS.filter((a) => SCOPE_AGENT_KEYS.includes(a.key)).map((a) => {
            const s = agents.get(a.key);
            const planLocked = (a.key === 'news_report' && allowance.block === 'plan')
              || (a.key === 'tender_evaluation' && !planIncludes(ctx?.plan.evaluationsPerMonth))
              || (a.key === 'proposal_manager' && !planIncludes(ctx?.plan.proposalsPerMonth));
            if (a.key === 'search') {
              return (
                <AgentCard key={a.key} scopeId={scope.id} agent={a} enabled={s?.enabled ?? true} instructions={scope.searchScope}
                  config={cfg ? JSON.stringify(cfg, null, 2) : defaults.get('search')?.default_prompt ?? null} custom={!!cfg}
                  status={scope.searchStatus} error={scope.searchError} readOnly={locked} upgrade={upgrade} />
              );
            }
            return (
              <AgentCard key={a.key} scopeId={scope.id} agent={a} enabled={planLocked ? false : (s?.enabled ?? true)} instructions={s?.instructions ?? null}
                config={s?.prompt_override || defaults.get(a.key)?.default_prompt || null} custom={!!s?.prompt_override}
                status={s?.status ?? null} error={s?.error ?? null} locked={planLocked} readOnly={locked} upgrade={upgrade} />
            );
          })}
        </div>
      </section>

      <FollowingSection scopeId={scope.id} sources={sources} followed={followed} countries={countries} readOnly={locked} />

      {scope.editable && !scope.isDefault && !scope.catalog && (
        <section className="detail-block danger-zone">
          <h2>{t('Delete scope')}</h2>
          <DeleteScopeForm scopeId={scope.id} name={scope.name} />
        </section>
      )}
    </div>
  );
}
