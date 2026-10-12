import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getContext, getMyWorkspaces, getPersonalAccount, getWorkspaceContext } from '@/lib/accounts';
import { getSupabaseServerClient } from '@/lib/supabase';
import { SCOPE_AGENT_KEYS, getCatalogScopes, getWorkspaceScopes, replacesCatalogPick, workspaceScopeUse } from '@/lib/scopes';
import ScopeCard from '@/components/settings/ScopeCard';
import { AddMemberButton, DeleteWorkspace, MemberRow, RevokeInviteButton, WorkspaceName } from '@/components/settings/WorkspaceControls';
import { createScope, switchWorkspace } from '../actions';
import { UpgradeReport } from '@/components/UpgradeReport';
import { PlanUpgradeButton } from '@/components/settings/PlanPanel';
import SignUpGate from '@/components/SignUpGate';
import { getLocale, getT } from '@/lib/i18n/server';

const fmt = (iso: string) => new Date(iso).toLocaleDateString(getLocale(), { day: 'numeric', month: 'short', year: 'numeric' });

/** One workspace: its scopes and its team members (Teams). */
export default async function WorkspaceDetailPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) {
    const t = await getT();
    return (
      <div className="settings">
        <h1 className="opps-h1">{t('Workspaces')}</h1>
        <SignUpGate />
      </div>
    );
  }
  const ctx = await getWorkspaceContext(params.id);
  if (!ctx) notFound();
  const t = await getT();
  const db = getSupabaseServerClient();
  const wsId = ctx.workspace.id;
  const [ownScopes, catalog, use] = await Promise.all([getWorkspaceScopes(wsId), getCatalogScopes(), workspaceScopeUse(wsId)]);
  const { data: wsRow } = await db.from('workspaces').select('show_default').eq('id', wsId).maybeSingle();
  const picked = new Set(use.pickIds);
  const otherActive = ownScopes.some((s) => s.active && !s.isDefault && !s.catalog) || picked.size > 0;
  const showDefault = wsRow?.show_default !== false || !otherActive;
  const { data: defaultRow } = await db.from('scopes').select('*').eq('is_default', true).maybeSingle();
  const general = ownScopes.find((s) => s.isDefault) || (defaultRow?.active ? {
    id: defaultRow.id, ownerId: defaultRow.owner_id, name: defaultRow.name, instructions: defaultRow.instructions,
    active: true, isDefault: true, catalog: false, searchScope: defaultRow.search_scope, searchConfig: defaultRow.search_config,
    searchStatus: defaultRow.search_status, searchError: defaultRow.search_error, parsedAt: defaultRow.search_parsed_at, createdAt: defaultRow.created_at,
  } : null);
  const custom = ownScopes.filter((s) => !s.isDefault && !s.catalog);
  const scopes = [
    ...(general ? [{ ...general, active: showDefault }] : []),
    ...catalog.map((s) => ({ ...s, active: picked.has(s.id) })),
    ...custom,
  ];
  const ids = scopes.map((s) => s.id);
  const teams = ctx.plan.key === 'teams';
  const [mine, current, account, { data: docs }, { data: agentRows }, { data: items }, { data: memberRows }, { data: invites }] = await Promise.all([
    getMyWorkspaces(),
    getContext(),
    getPersonalAccount(user.id),
    ids.length ? db.from('company_documents').select('scope_id, workspace_id').in('scope_id', ids) : Promise.resolve({ data: [] as any[] }),
    ids.length ? db.from('scope_agent_settings').select('scope_id, agent_key, enabled').in('scope_id', ids) : Promise.resolve({ data: [] as any[] }),
    ids.length ? db.from('scope_items').select('scope_id').in('scope_id', ids).limit(50000) : Promise.resolve({ data: [] as any[] }),
    db.from('workspace_members').select('user_id, role').eq('workspace_id', wsId),
    ctx.canAddMembers
      ? db.from('account_invites').select('id, email, role, expires_at').eq('workspace_id', wsId).is('accepted_at', null).gt('expires_at', new Date().toISOString())
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const { data: profiles } = await db.from('profiles').select('id, username, display_name, avatar_url').in('id', (memberRows || []).map((m: any) => m.user_id));
  const members = (memberRows || []).map((m: any) => {
    const p = (profiles || []).find((x: any) => x.id === m.user_id);
    return { userId: m.user_id, role: m.role, username: p?.username ?? 'user', displayName: p?.display_name || p?.username || 'user', avatarUrl: p?.avatar_url ?? null };
  }).sort((a, b) => Number(b.userId === ctx.workspace.ownerId) - Number(a.userId === ctx.workspace.ownerId)
    || (a.role === b.role ? a.username.localeCompare(b.username) : a.role === 'admin' ? -1 : 1));

  const count = (rows: any[] | null, id: string) => (rows || []).filter((r) => r.scope_id === id).length;
  const docCount = (id: string, shared: boolean) => (docs || []).filter((r: any) => r.scope_id === id && (shared ? r.workspace_id === wsId : !r.workspace_id)).length;
  const plan = ctx.plan;
  const limit = ctx.isDefault ? Infinity : plan.scopes;
  const slotsUsed = use.custom + use.pickIds.length;
  const canAdd = ctx.canCustomize && slotsUsed < limit;
  const showSlots = Number.isFinite(limit) && limit < 1000;
  const viewerPlan = { key: account?.planKey ?? 'free', status: account?.planStatus ?? 'active', periodEnd: account?.periodEnd ?? null, hasBilling: !!account?.stripeCustomerId };
  const owned = mine.filter((m) => m.workspace.ownerId === user.id && !m.isDefault);
  const addScope = createScope.bind(null, wsId);
  const onSite = current?.workspace.id === wsId;
  const defaults = scopes.filter((s) => s.isDefault || s.catalog).sort((a, b) => Number(b.active) - Number(a.active));
  const customs = scopes.filter((s) => !s.isDefault && !s.catalog);
  const scopeControl = (s: (typeof scopes)[number]) => {
    const on = SCOPE_AGENT_KEYS.filter((k) => (agentRows || []).find((r: any) => r.scope_id === s.id && r.agent_key === k)?.enabled ?? true).length;
    const isDefaultCard = s.isDefault;
    const isCatalog = !!s.catalog && !isDefaultCard;
    const locked = isDefaultCard || isCatalog;
    return (
      <ScopeCard key={s.id} href={`/workspaces/scopes/${s.id}?from=${wsId}`}
        readOnly={locked || !ctx.canCustomize}
        canToggle={isDefaultCard ? ctx.isAdmin && otherActive : isCatalog ? ctx.isAdmin : undefined}
        showDefaultFor={isDefaultCard ? wsId : null}
        catalogFor={isCatalog ? wsId : null}
        atLimit={isCatalog && !s.active && slotsUsed >= limit && !replacesCatalogPick(limit, use.custom, use.pickIds.length)}
        upgrade={ctx.isAdmin ? { userId: user.id, admin: ctx.isPlatformAdmin, plan: viewerPlan } : null}
        scope={{ id: s.id, name: s.name, instructions: s.instructions, active: isDefaultCard ? showDefault : s.active, isDefault: s.isDefault, catalog: s.catalog, topic: s.searchConfig?.topic ?? null }}
        docs={docCount(s.id, isDefaultCard || isCatalog)} agentsOn={on} agentsTotal={SCOPE_AGENT_KEYS.length} items={count(items, s.id)} />
    );
  };

  return (
    <div className="settings">
      <Link className="back-link" href="/workspaces">← {t('Workspaces')}</Link>
      <div className="community-head">
        <div>
          <WorkspaceName id={wsId} name={ctx.workspace.name} canRename={ctx.isAdmin} />
        </div>
        <div className="ws-head-actions">
          {onSite ? <span className="ws-active-badge">{t('Active workspace')}</span>
            : <form action={switchWorkspace.bind(null, wsId, `/workspaces/${wsId}`)}><button type="submit" className="btn primary">{t('Switch to this workspace')}</button></form>}
        </div>
      </div>

      {!ctx.isAdmin && <p className="callout">{t('View only — admins configure this workspace.')}</p>}

      {/* ---------- Scopes ---------- */}
      <section className="detail-block" id="scopes">
        <div className="section-head">
          <h2>{t('Scopes')} {showSlots && <span className="uc-count">{slotsUsed}/{limit}</span>}</h2>
          {scopes.length > 0 && (canAdd
            ? <form action={addScope}><button type="submit" className="btn primary">{t('New scope')}</button></form>
            : ctx.isAdmin && <PlanUpgradeButton label={t('New scope')} userId={user.id} admin={ctx.isPlatformAdmin} plan={viewerPlan} />)}
        </div>
        {scopes.length === 0 ? (
          <div className="profile-empty">
            <p className="profile-empty-title">{t('No scopes in this workspace')}</p>
            {canAdd ? <form action={addScope}><button type="submit" className="btn primary profile-empty-cta">{t('Create the first scope')}</button></form>
              : ctx.isAdmin && <PlanUpgradeButton label={t('Create the first scope')} className="btn primary profile-empty-cta" userId={user.id} admin={ctx.isPlatformAdmin} plan={viewerPlan} />}
          </div>
        ) : (
          <>
            <div className="scope-rail-block">
              <h3 className="scope-rail-label">{t('Default')}</h3>
              <div className="scope-rail" tabIndex={0} aria-label={t('Default')}>
                {defaults.map(scopeControl)}
              </div>
            </div>
            {customs.length > 0 && (
              <div className="scope-rail-block">
                <h3 className="scope-rail-label">{t('Custom')}</h3>
                <div className="scope-rail" tabIndex={0} aria-label={t('Custom')}>
                  {customs.map(scopeControl)}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* ---------- Team members ---------- */}
      <section className="detail-block" id="members">
        <div className="section-head">
          <h2>{t('Team members')} {teams && <span className="uc-count">{members.length}</span>}</h2>
          {ctx.canAddMembers && <AddMemberButton workspaceId={wsId} />}
        </div>
        {teams ? (
          <>
            <ul className="member-list">
              {members.map((m) => (
                <MemberRow key={m.userId} workspaceId={wsId} member={m} canManage={ctx.isAdmin}
                  isSelf={m.userId === user.id} isOwner={m.userId === ctx.workspace.ownerId} />
              ))}
            </ul>
            {(invites || []).length > 0 && (
              <ul className="member-list invites">
                {(invites || []).map((i: any) => (
                  <li key={i.id} className="member-row">
                    <span className="member-who"><strong>{i.email || t('Anyone with the link')}</strong><em>{t('Invited')} · {i.role === 'admin' ? t('admin') : t('member')} · {t('expires {date}', { date: fmt(i.expires_at) })}</em></span>
                    <RevokeInviteButton id={i.id} />
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <UpgradeReport title="Upgrade Plan to add team members" />
        )}
      </section>

      {ctx.isOwner && (
        <section className="detail-block danger-zone" id="delete">
          <h2>{t('Delete workspace')}</h2>
          <DeleteWorkspace id={wsId} name={ctx.workspace.name}
            blocked={ctx.isDefault ? t('This workspace holds the default scope, so it can’t be deleted.')
              : owned.length <= 1 ? t('This is your only workspace — create another before deleting it.') : null} />
        </section>
      )}
    </div>
  );
}
