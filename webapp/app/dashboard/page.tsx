import Link from 'next/link';
import { notFound } from 'next/navigation';
import DashChart from '@/components/dashboard/DashChart';
import DashDonut from '@/components/dashboard/DashDonut';
import DashMap from '@/components/dashboard/DashMap';
import { isSuperAdmin } from '@/lib/admin';
import {
  REGIONS, dashboardReport, rangeOf, sectionOf, RANGES,
  type PageBundle, type PlanKey, type RangeKey, type RegionKey, type ScopeCount, type VisitSection,
} from '@/lib/analytics';
import { getLocale, getT } from '@/lib/i18n/server';
import { NOINDEX } from '@/lib/seo';

const PLAN_LABEL: Record<PlanKey, string> = { free: 'Free', starter: 'Starter', pro: 'Pro', teams: 'Teams' };
const PLAN_COLOR: Record<PlanKey, string> = { free: 'var(--subtle)', starter: 'var(--accent)', pro: 'var(--ok)', teams: 'var(--rfi)' };
const SECTION_LABEL: Record<VisitSection, string> = { home: 'Home', community: 'Community', news: 'News', tenders: 'Tenders', other: 'Other pages' };
const SECTION_COLOR: Record<VisitSection, string> = { home: 'var(--accent)', community: 'var(--rfi)', news: 'var(--grant)', tenders: 'var(--warn)', other: 'var(--subtle)' };
const REGION_COLOR: Record<RegionKey, string> = {
  Europe: 'var(--accent)', Americas: 'var(--ok)', Asia: 'var(--warn)', Africa: 'var(--rfi)', Oceania: 'var(--grant)', 'Other regions': 'var(--subtle)',
};
const PLANS: PlanKey[] = ['free', 'starter', 'pro', 'teams'];
const PAID: ('starter' | 'pro' | 'teams')[] = ['starter', 'pro', 'teams'];
const MAIN: VisitSection[] = ['home', 'community', 'news', 'tenders'];
const SCOPE_COLORS = ['var(--accent)', 'var(--rfi)', 'var(--grant)', 'var(--warn)', 'var(--ok)', 'var(--subtle)'];
const OVERVIEW = [
  { key: 'active', color: 'var(--accent)' },
  { key: 'accounts', color: 'var(--ok)' },
  { key: 'visitors', color: 'var(--rfi)' },
];

type ScopePick = { kind: 'guest' } | { kind: 'plan'; plan: PlanKey } | { kind: 'region'; region: RegionKey };
type PagePick = ScopePick | { kind: 'scope'; id: string };

function isPlan(value: string): value is PlanKey {
  return value === 'free' || value === 'starter' || value === 'pro' || value === 'teams';
}

function isRegion(value: string): value is RegionKey {
  return (REGIONS as readonly string[]).includes(value);
}

function scopePick(value: string | undefined): ScopePick {
  if (value?.startsWith('plan:')) {
    const plan = value.slice(5);
    if (isPlan(plan)) return { kind: 'plan', plan };
  }
  if (value?.startsWith('region:')) {
    const region = value.slice(7);
    if (isRegion(region)) return { kind: 'region', region };
  }
  return { kind: 'guest' };
}

function pagePick(value: string | undefined, scopeIds: Set<string>): PagePick {
  if (value?.startsWith('scope:')) {
    const id = value.slice(6);
    if (scopeIds.has(id)) return { kind: 'scope', id };
  }
  return scopePick(value);
}

function scopeToken(pick: ScopePick) {
  if (pick.kind === 'plan') return `plan:${pick.plan}`;
  if (pick.kind === 'region') return `region:${pick.region}`;
  return 'guest';
}

function pageToken(pick: PagePick) {
  if (pick.kind === 'scope') return `scope:${pick.id}`;
  return scopeToken(pick);
}

function dashHref(range: RangeKey, scopes: string, pages: string, section: VisitSection) {
  const query = new URLSearchParams();
  if (range !== '7d') query.set('range', range);
  if (scopes !== 'guest') query.set('scopes', scopes);
  if (pages !== 'guest') query.set('pages', pages);
  if (section !== 'home') query.set('section', section);
  const text = query.toString();
  return text ? `/dashboard?${text}` : '/dashboard';
}

export async function generateMetadata() {
  const t = await getT();
  return { title: `${t('Dashboard')} — Tender Town`, ...NOINDEX };
}

/** Private numbers for the platform. Only the Google super-admin account can open this. */
export default async function DashboardPage({ searchParams }: { searchParams: { range?: string; section?: string; scopes?: string; pages?: string } }) {
  if (!(await isSuperAdmin())) notFound();
  const t = await getT();
  const range = rangeOf(searchParams.range);
  const report = await dashboardReport(range);
  const locale = getLocale();
  const format = new Intl.NumberFormat(locale);
  const money = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const countryName = new Intl.DisplayNames([locale], { type: 'region' });
  const place = (code: string | null) => code ? (countryName.of(code) || code) : '—';
  const scopeIds = new Set(report.pages.scopes.map((scope) => scope.id));
  const scopes = scopePick(searchParams.scopes);
  const pagesPick = pagePick(searchParams.pages, scopeIds);
  const scopeKey = scopeToken(scopes);
  const pageKey = pageToken(pagesPick);
  const scopeColor = new Map<string, string>();
  const named = [
    ...report.active.scopes.map((scope) => [scope.id, scope.name] as const),
    ...report.scopes.guest.map((scope) => [scope.id, scope.name] as const),
    ...PLANS.flatMap((plan) => report.scopes.plans[plan].map((scope) => [scope.id, scope.name] as const)),
    ...REGIONS.flatMap((region) => report.scopes.regions[region].map((scope) => [scope.id, scope.name] as const)),
    ...report.pages.scopes.map((scope) => [scope.id, scope.name] as const),
    ...report.mcp.scopes.map((scope) => [scope.id, scope.name] as const),
  ];
  Array.from(new Map(named).entries()).sort((a, b) => a[1].localeCompare(b[1]))
    .forEach(([id], index) => scopeColor.set(id, SCOPE_COLORS[index % SCOPE_COLORS.length]));
  const colorOf = (id: string) => scopeColor.get(id) || SCOPE_COLORS[0];

  const scopeSlices = scopes.kind === 'plan' ? report.scopes.plans[scopes.plan]
    : scopes.kind === 'region' ? report.scopes.regions[scopes.region]
      : report.scopes.guest;
  const pageBundle: PageBundle = pagesPick.kind === 'plan' ? report.pages.plans[pagesPick.plan]
    : pagesPick.kind === 'region' ? report.pages.regions[pagesPick.region]
      : pagesPick.kind === 'scope' ? (report.pages.scopes.find((scope) => scope.id === pagesPick.id)?.pages || report.pages.guest)
        : report.pages.guest;
  const pageSections = pageBundle.other.some((page) => page.views > 0) ? [...MAIN, 'other' as VisitSection] : MAIN;
  const biggest = pageSections.reduce((best, key) => viewsOf(pageBundle, key) > viewsOf(pageBundle, best) ? key : best, pageSections[0]);
  const section = sectionOf(searchParams.section, biggest);
  const pageRows = pageBundle[section] || [];
  const pageTotal = pageSections.reduce((sum, key) => sum + viewsOf(pageBundle, key), 0);
  const href = (next: { scopes?: string; pages?: string; section?: VisitSection }) => dashHref(
    range, next.scopes ?? scopeKey, next.pages ?? pageKey, next.section ?? section,
  );

  return (
    <div className="settings">
      <h1 className="opps-h1">{t('Dashboard')}</h1>
      <nav className="feed-sort" aria-label={t('Timeframe')}>
        {RANGES.map((item) => (
          <Link key={item.key} href={dashHref(item.key, scopeKey, pageKey, section)}
            className={`feed-sort-link ${item.key === range ? 'active' : ''}`} aria-current={item.key === range ? 'page' : undefined}>
            {t(item.label)}
          </Link>
        ))}
      </nav>

      <div className="dash-kpis">
        <p className="dash-kpi"><span>{t('Active users')}</span><strong>{format.format(report.cards.active)}</strong></p>
        <p className="dash-kpi"><span>{t('Accounts created')}</span><strong>{format.format(report.cards.accounts)}</strong></p>
        <p className="dash-kpi"><span>{t('Revenue')}</span><strong>{money.format(report.cards.revenue)}</strong></p>
        <p className="dash-kpi"><span>{t('Website visitors')}</span><strong>{format.format(report.cards.visitors)}</strong></p>
      </div>
      <DashChart
        points={report.points}
        series={OVERVIEW}
        locale={locale}
        hourly={range === '24h'}
        labels={{ active: t('Active users'), accounts: t('Accounts created'), visitors: t('Website visitors') }}
        totals={{ active: format.format(report.cards.active), accounts: format.format(report.cards.accounts), visitors: format.format(report.cards.visitors) }}
      />

      <section className="dash-section">
        <h2>{t('Active users')} <span className="uc-count">{format.format(report.cards.active)}</span></h2>
        <div className="dash-pair">
          <div>
            <h3>{t('Plan')}</h3>
            <DashDonut center={format.format(report.cards.active)} slices={PLANS.map((plan) => ({
              key: plan, label: t(PLAN_LABEL[plan]), display: format.format(report.active.plans[plan]), value: report.active.plans[plan], color: PLAN_COLOR[plan],
            }))} />
          </div>
          <div>
            <h3>{t('Scopes')}</h3>
            {report.active.scopes.length ? (
              <DashDonut center={format.format(report.cards.active)} slices={report.active.scopes.map((scope) => ({
                key: scope.id, label: t(scope.name), display: format.format(scope.users), value: scope.users, color: colorOf(scope.id),
              }))} />
            ) : <p className="dash-empty">{t('None in this timeframe.')}</p>}
          </div>
        </div>
        {report.active.rows.length ? (
          <div className="dash-scroll">
            <table className="dash-table">
              <thead><tr><th>{t('Email')}</th><th>{t('Username')}</th><th>{t('Plan')}</th><th>{t('Country')}</th><th>{t('Scopes')}</th></tr></thead>
              <tbody>
                {report.active.rows.map((row) => (
                  <tr key={row.email || row.username}>
                    <td>{row.email ? <a href={`mailto:${row.email}`}>{row.email}</a> : '—'}</td>
                    <td>{row.username ? <Link href={`/u/${row.username}`}>u/{row.username}</Link> : '—'}</td>
                    <td>{t(PLAN_LABEL[row.plan])}</td>
                    <td>{place(row.country)}</td>
                    <td>{row.scopes.length ? row.scopes.map((name) => t(name)).join(', ') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="dash-empty">{t('None in this timeframe.')}</p>}
      </section>

      <section className="dash-section">
        <h2>{t('Revenue')} <span className="uc-count">{money.format(report.cards.revenue)}</span></h2>
        <DashDonut center={money.format(report.cards.revenue)} slices={PAID.map((plan) => ({
          key: plan, label: t(PLAN_LABEL[plan]), display: money.format(report.revenue[plan]), value: report.revenue[plan], color: PLAN_COLOR[plan],
        }))} />
      </section>

      <section className="dash-section">
        <h2>{t('Scopes')}</h2>
        <div className="dash-chip-row">
          <nav className="feed-sort" aria-label={t('Signed out')}>
            <Link href={href({ scopes: 'guest' })} className={`feed-sort-link ${scopeKey === 'guest' ? 'active' : ''}`} aria-current={scopeKey === 'guest' ? 'page' : undefined}>{t('Signed out')}</Link>
          </nav>
          <nav className="feed-sort" aria-label={t('Plan')}>
            {PLANS.map((plan) => {
              const token = `plan:${plan}`;
              return (
                <Link key={plan} href={href({ scopes: token })} className={`feed-sort-link ${scopeKey === token ? 'active' : ''}`} aria-current={scopeKey === token ? 'page' : undefined}>
                  {t(PLAN_LABEL[plan])}
                </Link>
              );
            })}
          </nav>
          <nav className="feed-sort" aria-label={t('Region')}>
            {REGIONS.map((region) => {
              const token = `region:${region}`;
              return (
                <Link key={region} href={href({ scopes: token })} className={`feed-sort-link ${scopeKey === token ? 'active' : ''}`} aria-current={scopeKey === token ? 'page' : undefined}>
                  {t(region)}
                </Link>
              );
            })}
          </nav>
        </div>
        <ScopeChart slices={scopeSlices} format={format} label={(name) => t(name)} color={colorOf} empty={t('None in this timeframe.')} />
      </section>

      <section className="dash-section">
        <h2>{t('Page visits')} <span className="uc-count">{format.format(pageTotal)}</span></h2>
        <div className="dash-chip-row">
          <nav className="feed-sort" aria-label={t('Signed out')}>
            <Link href={href({ pages: 'guest' })} className={`feed-sort-link ${pageKey === 'guest' ? 'active' : ''}`} aria-current={pageKey === 'guest' ? 'page' : undefined}>{t('Signed out')}</Link>
          </nav>
          <nav className="feed-sort" aria-label={t('Plan')}>
            {PLANS.map((plan) => {
              const token = `plan:${plan}`;
              return (
                <Link key={plan} href={href({ pages: token })} className={`feed-sort-link ${pageKey === token ? 'active' : ''}`} aria-current={pageKey === token ? 'page' : undefined}>
                  {t(PLAN_LABEL[plan])}
                </Link>
              );
            })}
          </nav>
          {report.pages.scopes.length ? (
            <nav className="feed-sort" aria-label={t('Scopes')}>
              {report.pages.scopes.map((scope) => {
                const token = `scope:${scope.id}`;
                return (
                  <Link key={scope.id} href={href({ pages: token })} className={`feed-sort-link ${pageKey === token ? 'active' : ''}`} aria-current={pageKey === token ? 'page' : undefined}>
                    {t(scope.name)}
                  </Link>
                );
              })}
            </nav>
          ) : null}
          <nav className="feed-sort" aria-label={t('Region')}>
            {REGIONS.map((region) => {
              const token = `region:${region}`;
              return (
                <Link key={region} href={href({ pages: token })} className={`feed-sort-link ${pageKey === token ? 'active' : ''}`} aria-current={pageKey === token ? 'page' : undefined}>
                  {t(region)}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="dash-split">
          <DashDonut center={format.format(pageTotal)} slices={pageSections.map((key) => ({
            key, label: t(SECTION_LABEL[key]), display: format.format(viewsOf(pageBundle, key)), value: viewsOf(pageBundle, key), color: SECTION_COLOR[key],
            href: href({ section: key }),
          }))} />
          <div>
            <nav className="feed-sort" aria-label={t('By page')}>
              {pageSections.map((key) => (
                <Link key={key} href={href({ section: key })} className={`feed-sort-link ${key === section ? 'active' : ''}`} aria-current={key === section ? 'page' : undefined}>
                  {t(SECTION_LABEL[key])}
                </Link>
              ))}
            </nav>
            {pageRows.length ? (
              <div className="dash-scroll">
                <table className="dash-table">
                  <thead><tr><th>{t('Page')}</th><th className="num">{t('Views')}</th><th className="num">{t('Likes')}</th><th className="num">{t('Comments')}</th></tr></thead>
                  <tbody>
                    {pageRows.map((row) => (
                      <tr key={row.href || row.labelKey || row.title}>
                        <td>{row.href ? <Link href={row.href}>{row.title || (row.labelKey ? t(row.labelKey) : row.href)}</Link> : (row.title || (row.labelKey ? t(row.labelKey) : '—'))}</td>
                        <td className="num">{format.format(row.views)}</td>
                        <td className="num">{row.likes == null ? '—' : format.format(row.likes)}</td>
                        <td className="num">{row.comments == null ? '—' : format.format(row.comments)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="dash-empty">{t('None in this timeframe.')}</p>}
          </div>
        </div>
      </section>

      <section className="dash-section">
        <h2>{t('By country')}</h2>
        <DashMap
          locale={locale}
          labels={{ visits: t('Visits'), active: t('Active users'), accounts: t('Accounts created'), revenue: t('Revenue'), requests: t('Requests'), scopes: t('Most used scopes') }}
          zero={{ visits: format.format(0), active: format.format(0), accounts: format.format(0), revenue: money.format(0), requests: format.format(0), scopes: '—' }}
          countries={report.countries.map((country) => ({
            code: country.code,
            visits: country.visits,
            visitsLabel: format.format(country.visits),
            active: format.format(country.active),
            accounts: format.format(country.accounts),
            revenue: money.format(country.revenue),
            requests: format.format(country.mcp),
            scopes: country.scopes.length ? country.scopes.map((scope) => `${t(scope.name)} ${format.format(scope.visits)}`).join(', ') : '—',
          }))}
        />
        {report.countries.length ? (
          <div className="dash-scroll">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>{t('Country')}</th>
                  <th className="num">{t('Visits')}</th>
                  <th className="num">{t('Active users')}</th>
                  <th className="num">{t('Accounts created')}</th>
                  <th className="num">{t('Revenue')}</th>
                  <th className="num">{t('Requests')}</th>
                  <th>{t('Most used scopes')}</th>
                </tr>
              </thead>
              <tbody>
                {report.countries.map((country) => (
                  <tr key={country.code}>
                    <td>{place(country.code)}</td>
                    <td className="num">{format.format(country.visits)}</td>
                    <td className="num">{format.format(country.active)}</td>
                    <td className="num">{format.format(country.accounts)}</td>
                    <td className="num">{money.format(country.revenue)}</td>
                    <td className="num">{format.format(country.mcp)}</td>
                    <td>{country.scopes.length ? country.scopes.map((scope) => `${t(scope.name)} ${format.format(scope.visits)}`).join(', ') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="dash-empty">{t('None in this timeframe.')}</p>}
      </section>

      <section className="dash-section">
        <h2>{t('MCP calls')} <span className="uc-count">{format.format(report.mcp.requests)}</span></h2>
        <div className="dash-kpis dash-kpis-2">
          <p className="dash-kpi"><span>{t('Agents')}</span><strong>{format.format(report.mcp.agents)}</strong></p>
          <p className="dash-kpi"><span>{t('Requests')}</span><strong>{format.format(report.mcp.requests)}</strong></p>
        </div>
        <div className="dash-grid3">
          <div>
            <h3>{t('Requests')}</h3>
            {report.mcp.tools.length ? (
              <DashDonut center={format.format(report.mcp.requests)} slices={report.mcp.tools.map((tool, index) => ({
                key: tool.tool, label: tool.tool, display: format.format(tool.requests), value: tool.requests, color: SCOPE_COLORS[index % SCOPE_COLORS.length],
              }))} />
            ) : <p className="dash-empty">{t('None in this timeframe.')}</p>}
          </div>
          <div>
            <h3>{t('Plan')}</h3>
            <DashDonut center={format.format(report.mcp.requests)} slices={PLANS.map((plan) => ({
              key: plan, label: t(PLAN_LABEL[plan]), display: format.format(report.mcp.plans[plan]), value: report.mcp.plans[plan], color: PLAN_COLOR[plan],
            }))} />
          </div>
          <div>
            <h3>{t('Region')}</h3>
            <DashDonut center={format.format(REGIONS.reduce((sum, region) => sum + report.mcp.regions[region], 0))} slices={REGIONS.map((region) => ({
              key: region, label: t(region), display: format.format(report.mcp.regions[region]), value: report.mcp.regions[region], color: REGION_COLOR[region],
            }))} />
          </div>
        </div>
        {report.mcp.scopes.length ? (
          <div className="dash-split">
            <div>
              <h3>{t('Scopes')}</h3>
              <DashDonut center={format.format(report.mcp.scopes.reduce((sum, scope) => sum + scope.requests, 0))} slices={report.mcp.scopes.map((scope) => ({
                key: scope.id, label: t(scope.name), display: format.format(scope.requests), value: scope.requests, color: colorOf(scope.id),
              }))} />
            </div>
          </div>
        ) : null}
        {report.mcp.rows.length ? (
          <div className="dash-scroll">
            <table className="dash-table">
              <thead><tr><th>{t('Email')}</th><th>{t('Username')}</th><th>{t('Plan')}</th><th>{t('Country')}</th><th>{t('Scopes')}</th><th className="num">{t('Requests')}</th></tr></thead>
              <tbody>
                {report.mcp.rows.map((row) => (
                  <tr key={row.email || row.username}>
                    <td>{row.email ? <a href={`mailto:${row.email}`}>{row.email}</a> : '—'}</td>
                    <td>{row.username ? <Link href={`/u/${row.username}`}>u/{row.username}</Link> : '—'}</td>
                    <td>{t(PLAN_LABEL[row.plan])}</td>
                    <td>{place(row.country)}</td>
                    <td>{row.scopes.length ? row.scopes.map((name) => t(name)).join(', ') : '—'}</td>
                    <td className="num">{format.format(row.requests)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function viewsOf(bundle: PageBundle, section: VisitSection) {
  return bundle[section].reduce((sum, page) => sum + page.views, 0);
}

function ScopeChart({ slices, format, label, color, empty }: {
  slices: ScopeCount[];
  format: Intl.NumberFormat;
  label: (name: string) => string;
  color: (id: string) => string;
  empty: string;
}) {
  const total = slices.reduce((sum, scope) => sum + scope.visits, 0);
  if (!slices.length) return <p className="dash-empty">{empty}</p>;
  return (
    <DashDonut center={format.format(total)} slices={slices.map((scope) => ({
      key: scope.id, label: label(scope.name), display: format.format(scope.visits), value: scope.visits, color: color(scope.id),
    }))} />
  );
}
