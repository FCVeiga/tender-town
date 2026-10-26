import Link from 'next/link';
import { OPP_CATEGORIES, TENDER_CATEGORIES, NEW_WINDOW_DAYS, cardFreshness, getActiveOpportunities, isNew, type Opportunity } from '@/lib/data';
import { getSupabaseServerClient } from '@/lib/supabase';
import { getScopeItems } from '@/lib/scopes';
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
import AgentLoader from '@/components/AgentLoader';
import ScopePicker from '@/components/ScopePicker';
import ScopeView from './ScopeView';
import ScopeStatus from './ScopeStatus';
import { collectionKind, scopeRun } from '@/lib/scopeStatus';
import { stageOf } from '@/lib/publication';
type View = 'all' | 'new' | (typeof OPP_CATEGORIES)[number]['slug'];

/** New, then updated, then the other open tenders. */
function compareOpen(a: Opportunity, b: Opportunity, now: Date) {
  const rank = (o: Opportunity) => {
    const fresh = cardFreshness(o, now);
    return fresh === 'new' ? 0 : fresh === 'updated' ? 1 : 2;
  };
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (ra < 2) {
    const stamp = (o: Opportunity) => new Date((ra === 1 ? o.last_change : o.first_detected) || o.publication_date || 0).getTime();
    return stamp(b) - stamp(a);
  }
  return (b.opportunity_relevance_score ?? 0) - (a.opportunity_relevance_score ?? 0);
}

const TITLES: Record<string, string> = {
  all: 'Tenders', new: 'New tenders',
  ...Object.fromEntries(OPP_CATEGORIES.map((c) => [c.slug, c.label])),
};

export default async function OpportunitiesView({ view }: { view: View }) {
  return (
    <div className="list-page">
      <ScopeBannerSuspense />
      <Suspense fallback={<ListSkeleton />}>
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
  const active = all.filter((o) => stageOf(o) === 'open');
  const now = new Date();
  const newOnes = active.filter((o) => isNew(o, now));
  const list = view === 'all' ? active : view === 'new' ? newOnes : active.filter((o) => o.opportunity_type === view);
  const shown = [...list].sort((a, b) => compareOpen(a, b, now));
  const scopeItems = await getScopeItems('tender', true);
  const liveIds = new Set(all.map((o) => o.opportunity_id));
  const archiveIds = (scopeItems?.ids || []).filter((id) => !liveIds.has(id)).slice(0, 200);
  const db = getSupabaseServerClient();
  const { data: archiveRows } = archiveIds.length
    ? await db.from('opportunities').select('*').in('opportunity_id', archiveIds)
    : { data: [] as Opportunity[] };
  const archivedAll = ((archiveRows || []) as Opportunity[])
    .filter((o) => stageOf(o) !== 'signal')
    .sort((a, b) => String(b.publication_date || b.first_detected || '').localeCompare(String(a.publication_date || a.first_detected || '')))
    .slice(0, 20);
  const archived = view === 'new' ? [] : view === 'all' ? archivedAll : archivedAll.filter((o) => o.opportunity_type === view);

  const tabs = [
    { href: scope('/tenders'), label: t('All active'), count: active.length },
    { href: scope('/tenders/new'), label: t('New'), count: newOnes.length },
    ...TENDER_CATEGORIES.map((c) => ({
      href: scope(`/tenders/${c.path}`),
      label: t(c.label),
      count: active.filter((o) => o.opportunity_type === c.slug).length,
    })),
  ];
  const ids = [...shown.map((o) => o.opportunity_id), ...archived.map((o) => o.opportunity_id)];
  const [{ data: countries }, { data: changes }] = await Promise.all([
    db.from('countries').select('code, name'),
    ids.length ? db.from('change_events').select('*').in('opportunity_id', ids).order('detected_at', { ascending: false }) : Promise.resolve({ data: [] as any[] }),
  ]);
  const likes = await getLikes('tender', ids);
  const updates = new Map<string, UpdateEvent[]>();
  for (const c of (changes || []) as UpdateEvent[]) updates.set(c.opportunity_id, [...(updates.get(c.opportunity_id) || []), c]);
  const names = new Map((countries || []).map((c: any) => [c.code, c.name]));

  const activeHref = scope(view === 'all' ? '/tenders' : view === 'new' ? '/tenders/new'
    : `/tenders/${OPP_CATEGORIES.find((c) => c.slug === view)!.path}`);
  const run = scopeRun(focus.current);
  const kind = collectionKind(run, active.length > 0 || archivedAll.length > 0, !!focus.hold);
  const noOpen = !error && (kind === 'ready' || kind === 'stale') && shown.length === 0 && active.length === 0 && archived.length > 0;
  const scopeId = focus.hold?.id ?? focus.current?.id ?? null;

  return (
    <ScopeView scopeId={scopeId}>
      <h1 className="opps-h1">{t(TITLES[view])}</h1>
      <ScopePicker model={focus} />
      <SectionTabs tabs={tabs} active={activeHref} />

      {error && (
        <div className="callout error"><strong>{t('Error loading tenders.')}</strong> {error.message}</div>
      )}
      {kind === 'loading' && <AgentLoader />}
      {!error && (kind === 'pending' || kind === 'failed' || kind === 'empty') && (
        <ScopeStatus kind={kind} scopeName={focus.current?.name || ''} surface="tenders" signedIn={focus.signedIn} />
      )}
      {!error && kind === 'stale' && (
        <ScopeStatus kind="stale" scopeName={focus.current?.name || ''} surface="tenders" signedIn={focus.signedIn} />
      )}
      {noOpen && (
        <div className="callout">
          <strong>{t('No open tenders in {scope} right now.', { scope: focus.current?.name || '' })}</strong>
          <p>
            {t('Past buyers are listed below.')}{' '}
            <Link href={scope('/news/signals')}>{t('Follow upcoming procurement.')}</Link>{' '}
            {t('Change what this scope follows if these buyers are wrong.')}
          </p>
        </div>
      )}
      {!error && (kind === 'ready' || kind === 'stale') && shown.length === 0 && !noOpen && (
        <div className="callout">
          <strong>{t('Nothing in this section right now.')}</strong>
          {view === 'new' && <> {t('None in the last {n} days.', { n: NEW_WINDOW_DAYS })}</>}
        </div>
      )}
      <RingGradients />
      <div className="opp-rows">
        {(kind === 'ready' || kind === 'stale') && shown.map((o) => (
          <OpportunityRow key={o.opportunity_id} o={o}
                          like={{ liked: likes.liked.has(o.opportunity_id), signedIn: likes.signedIn }}
                          countryName={o.country ? names.get(o.country) ?? null : null}
                          updates={updates.get(o.opportunity_id) ?? []} />
        ))}
      </div>
      {(kind === 'ready' || kind === 'stale') && archived.length > 0 && (
        <section className="market-section">
          <h2 className="search-h2">{t('Archived')}</h2>
          <div className="opp-rows">
            {archived.map((o) => (
              <OpportunityRow key={o.opportunity_id} o={o} archived
                              like={{ liked: likes.liked.has(o.opportunity_id), signedIn: likes.signedIn }}
                              countryName={o.country ? names.get(o.country) ?? null : null} />
            ))}
          </div>
        </section>
      )}
    </ScopeView>
  );
}
