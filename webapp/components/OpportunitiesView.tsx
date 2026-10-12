import { OPP_CATEGORIES, TENDER_CATEGORIES, NEW_WINDOW_DAYS, getActiveOpportunities, isNew } from '@/lib/data';
import { getSupabaseServerClient } from '@/lib/supabase';
import { getLikes } from '@/lib/likes';
import OpportunityRow, { RingGradients } from './OpportunityRow';
import type { UpdateEvent } from './UpdateComment';
import SectionTabs from './SectionTabs';
import { getT } from '@/lib/i18n/server';
import { withPublicScope } from '@/lib/guestScope';
import { resolveFocus } from '@/lib/scopeFocus';
import { Suspense } from 'react';
import { ScopeBannerSuspense } from './ScopeBannerSlot';
import { ListSkeleton } from './ContentSkeleton';
import ScopeView from './ScopeView';
import ScopeStatus, { CheckedLine } from './ScopeStatus';
import { collectionKind, scopeRun } from '@/lib/scopeStatus';

type View = 'all' | 'new' | (typeof OPP_CATEGORIES)[number]['slug'];

const TITLES: Record<string, string> = {
  all: 'Tenders', new: 'New tenders',
  ...Object.fromEntries(OPP_CATEGORIES.map((c) => [c.slug, c.label])),
};

export default async function OpportunitiesView({ view }: { view: View }) {
  const t = await getT();
  return (
    <div>
      <ScopeBannerSuspense />
      <h1 className="opps-h1">{t(TITLES[view])}</h1>
      <Suspense fallback={<ListSkeleton rows="tenders" />}>
        <OpportunitiesBody view={view} />
      </Suspense>
    </div>
  );
}

async function OpportunitiesBody({ view }: { view: View }) {
  const t = await getT();
  const focus = await resolveFocus();
  const scope = (href: string) => withPublicScope(href, focus.publicSlug);
  // One query for the whole active set: the tab counts and the list come from it.
  const { opportunities: all, error } = await getActiveOpportunities();
  const active = all.filter((o) => o.opportunity_type !== 'signal');  // signals: home feed and News
  const now = new Date();
  const newOnes = active.filter((o) => isNew(o, now));
  const shown =
    view === 'all' ? active : view === 'new' ? newOnes : active.filter((o) => o.opportunity_type === view);

  const tabs = [
    { href: scope('/tenders'), label: t('All active'), count: active.length },
    { href: scope('/tenders/new'), label: t('New'), count: newOnes.length },
    ...TENDER_CATEGORIES.map((c) => ({
      href: scope(`/tenders/${c.path}`),
      label: t(c.label),
      count: active.filter((o) => o.opportunity_type === c.slug).length,
    })),
  ];
  // Agent-written copy (informative description, English headline) and country names.
  const db = getSupabaseServerClient();
  const ids = shown.map((o) => o.opportunity_id);
  const [{ data: posts }, { data: countries }, { data: changes }] = await Promise.all([
    ids.length ? db.from('feed_posts').select('post_id, headline, body').in('post_id', ids.map((id) => `opp:${id}`)) : Promise.resolve({ data: [] as any[] }),
    db.from('countries').select('code, name'),
    ids.length ? db.from('change_events').select('*').in('opportunity_id', ids).order('detected_at', { ascending: false }) : Promise.resolve({ data: [] as any[] }),
  ]);
  const likes = await getLikes('tender', ids);
  const updates = new Map<string, UpdateEvent[]>();
  for (const c of (changes || []) as UpdateEvent[]) updates.set(c.opportunity_id, [...(updates.get(c.opportunity_id) || []), c]);
  const copy = new Map((posts || []).map((p: any) => [p.post_id.slice(4), p]));
  const names = new Map((countries || []).map((c: any) => [c.code, c.name]));

  const activeHref = scope(view === 'all' ? '/tenders' : view === 'new' ? '/tenders/new'
    : `/tenders/${OPP_CATEGORIES.find((c) => c.slug === view)!.path}`);
  const run = scopeRun(focus.current);
  const kind = collectionKind(run, active.length > 0, !!focus.hold);
  const scopeId = focus.hold?.id ?? focus.current?.id ?? null;

  return (
    <ScopeView scopeId={scopeId}>
      <SectionTabs tabs={tabs} active={activeHref} />

      {error && (
        <div className="callout error"><strong>{t('Error loading tenders.')}</strong> {error.message}</div>
      )}
      {kind === 'loading' && <div className="callout" aria-busy="true">{t('Loading scope')}</div>}
      {!error && (kind === 'pending' || kind === 'failed' || kind === 'empty') && (
        <ScopeStatus kind={kind} scopeName={focus.current?.name || ''} lastSuccessAt={run.lastSuccessAt} surface="tenders" signedIn={focus.signedIn} />
      )}
      {!error && kind === 'stale' && (
        <ScopeStatus kind="stale" scopeName={focus.current?.name || ''} lastSuccessAt={run.lastSuccessAt} surface="tenders" signedIn={focus.signedIn} />
      )}
      {!error && (kind === 'ready' || kind === 'stale') && shown.length === 0 && (
        <div className="callout">
          <strong>{t('Nothing in this section right now.')}</strong>
          {view === 'new' && <> {t('None in the last {n} days.', { n: NEW_WINDOW_DAYS })}</>}
        </div>
      )}
      {kind === 'ready' && <CheckedLine iso={run.lastSuccessAt} surface="tenders" />}
      <RingGradients />
      <div className="opp-rows">
        {(kind === 'ready' || kind === 'stale') && shown.map((o) => (
          <OpportunityRow key={o.opportunity_id} o={o} copy={copy.get(o.opportunity_id)}
                          like={{ liked: likes.liked.has(o.opportunity_id), signedIn: likes.signedIn }}
                          countryName={o.country ? names.get(o.country) ?? null : null}
                          updates={updates.get(o.opportunity_id) ?? []} />
        ))}
      </div>
    </ScopeView>
  );
}
