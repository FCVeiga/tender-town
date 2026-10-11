import Link from 'next/link';
import { notFound } from 'next/navigation';
import DashChart from '@/components/dashboard/DashChart';
import DashDonut from '@/components/dashboard/DashDonut';
import DashMap from '@/components/dashboard/DashMap';
import { isSuperAdmin } from '@/lib/admin';
import { dashboardReport, rangeOf, RANGES, sectionOf, type PlanKey, type RangeKey, type VisitSection } from '@/lib/analytics';
import { getLocale, getT } from '@/lib/i18n/server';
import { NOINDEX } from '@/lib/seo';

const PLAN_LABEL: Record<PlanKey, string> = { free: 'Free', starter: 'Starter', pro: 'Pro', teams: 'Teams' };
const PLAN_COLOR: Record<PlanKey, string> = { free: 'var(--subtle)', starter: 'var(--accent)', pro: 'var(--ok)', teams: 'var(--rfi)' };
const SECTION_LABEL: Record<VisitSection, string> = { home: 'Home', community: 'Community', news: 'News', tenders: 'Tenders' };
const SECTION_COLOR: Record<VisitSection, string> = { home: 'var(--accent)', community: 'var(--rfi)', news: 'var(--grant)', tenders: 'var(--warn)' };
const SECTIONS: VisitSection[] = ['home', 'community', 'news', 'tenders'];
const PLANS: PlanKey[] = ['free', 'starter', 'pro', 'teams'];
const PAID: ('starter' | 'pro' | 'teams')[] = ['starter', 'pro', 'teams'];
const SCOPE_COLORS = ['var(--accent)', 'var(--rfi)', 'var(--grant)', 'var(--warn)', 'var(--ok)', 'var(--subtle)'];

function dashHref(range: RangeKey, section: VisitSection) {
  const query = new URLSearchParams();
  if (range !== '7d') query.set('range', range);
  query.set('section', section);
  return `/dashboard?${query}`;
}

export async function generateMetadata() {
  const t = await getT();
  return { title: `${t('Dashboard')} — Tender Town`, ...NOINDEX };
}

/** Visits, accounts, revenue, and each page. Only the Google super-admin account can open this. */
export default async function DashboardPage({ searchParams }: { searchParams: { range?: string; section?: string } }) {
  if (!(await isSuperAdmin())) notFound();
  const t = await getT();
  const range = rangeOf(searchParams.range);
  const report = await dashboardReport(range);
  const biggest = SECTIONS.reduce((best, key) => report.visits[key] > report.visits[best] ? key : best, 'news' as VisitSection);
  const section = sectionOf(searchParams.section, biggest);
  const locale = getLocale();
  const format = new Intl.NumberFormat(locale);
  const money = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const when = (iso: string) => new Date(iso).toLocaleString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  const labels = { home: t('Home'), community: t('Community'), news: t('News'), tenders: t('Tenders') };
  const totals = {
    home: format.format(report.visits.home),
    community: format.format(report.visits.community),
    news: format.format(report.visits.news),
    tenders: format.format(report.visits.tenders),
  };
  const revenueTotal = PAID.reduce((sum, plan) => sum + report.revenue[plan], 0);
  const pages = report.pages[section];
  const scopeColor = new Map<string, string>();
  Array.from(new Map([...report.audiences.guest.scopes, ...report.audiences.user.scopes].map((scope) => [scope.id, scope.name])).entries())
    .sort((a, b) => a[1].localeCompare(b[1]))
    .forEach(([id], index) => scopeColor.set(id, SCOPE_COLORS[index % SCOPE_COLORS.length]));

  return (
    <div className="settings">
      <h1 className="opps-h1">{t('Dashboard')}</h1>
      <nav className="feed-sort" aria-label={t('Timeframe')}>
        {RANGES.map((item) => (
          <Link key={item.key} href={dashHref(item.key, section)}
            className={`feed-sort-link ${item.key === range ? 'active' : ''}`} aria-current={item.key === range ? 'page' : undefined}>
            {t(item.label)}
          </Link>
        ))}
      </nav>

      <section className="dash-section">
        <h2>{t('Visits')}</h2>
        <DashChart points={report.points} labels={labels} totals={totals} locale={locale} hourly={range === '24h'} />
      </section>

      <section className="dash-section">
        <h2>{t('Scopes')}</h2>
        <div className="dash-pair">
          {(['guest', 'user'] as const).map((key) => {
            const audience = report.audiences[key];
            return (
              <div key={key}>
                <h3>{t(key === 'guest' ? 'Signed out' : 'Signed in')} <span className="uc-count">{format.format(audience.visits)}</span></h3>
                {audience.scopes.length ? (
                  <DashDonut center={format.format(audience.visits)} slices={audience.scopes.map((scope) => ({
                    key: scope.id, label: t(scope.name), display: format.format(scope.visits), value: scope.visits, color: scopeColor.get(scope.id) || SCOPE_COLORS[0],
                  }))} />
                ) : <p className="dash-empty">{t('None in this timeframe.')}</p>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="dash-section">
        <h2>{t('Accounts created')} <span className="uc-count">{format.format(report.accounts.length)}</span></h2>
        <div className="dash-split">
          <DashDonut center={format.format(report.accounts.length)} slices={PLANS.map((plan) => ({
            key: plan, label: t(PLAN_LABEL[plan]), display: format.format(report.plans[plan]), value: report.plans[plan], color: PLAN_COLOR[plan],
          }))} />
          {report.accounts.length ? (
            <div className="dash-scroll">
              <table className="dash-table">
                <thead><tr><th>{t('Email')}</th><th>{t('Username')}</th><th>{t('Plan')}</th><th>{t('Created')}</th></tr></thead>
                <tbody>
                  {report.accounts.map((row) => (
                    <tr key={`${row.email}-${row.createdAt}`}>
                      <td>{row.email ? <a href={`mailto:${row.email}`}>{row.email}</a> : '—'}</td>
                      <td>{row.username ? <Link href={`/u/${row.username}`}>u/{row.username}</Link> : '—'}</td>
                      <td>{t(PLAN_LABEL[row.plan])}</td>
                      <td>{when(row.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="dash-empty">{t('None in this timeframe.')}</p>}
        </div>
      </section>

      <section className="dash-section">
        <h2>{t('Revenue')} <span className="uc-count">{money.format(revenueTotal)}</span></h2>
        <DashDonut center={money.format(revenueTotal)} slices={PAID.map((plan) => ({
          key: plan, label: t(PLAN_LABEL[plan]), display: money.format(report.revenue[plan]), value: report.revenue[plan], color: PLAN_COLOR[plan],
        }))} />
      </section>

      <section className="dash-section">
        <h2>{t('Countries')}</h2>
        <DashMap
          locale={locale}
          labels={{ visits: t('Visits'), accounts: t('Accounts created'), revenue: t('Revenue'), scopes: t('Most used scopes') }}
          zero={{ visits: format.format(0), accounts: format.format(0), revenue: money.format(0), scopes: '—' }}
          countries={report.countries.map((country) => ({
            code: country.code,
            visits: country.visits,
            visitsLabel: format.format(country.visits),
            accounts: format.format(country.accounts),
            revenue: money.format(country.revenue),
            scopes: country.scopes.length ? country.scopes.map((scope) => `${t(scope.name)} ${format.format(scope.visits)}`).join(', ') : '—',
          }))}
        />
        {report.countries.length ? (
          <div className="dash-scroll">
            <table className="dash-table">
              <thead><tr><th>{t('Country')}</th><th className="num">{t('Visits')}</th><th className="num">{t('Accounts created')}</th><th className="num">{t('Revenue')}</th><th>{t('Most used scopes')}</th></tr></thead>
              <tbody>
                {report.countries.map((country) => (
                  <tr key={country.code}>
                    <td>{new Intl.DisplayNames([locale], { type: 'region' }).of(country.code) || country.code}</td>
                    <td className="num">{format.format(country.visits)}</td>
                    <td className="num">{format.format(country.accounts)}</td>
                    <td className="num">{money.format(country.revenue)}</td>
                    <td>{country.scopes.length ? country.scopes.map((scope) => `${t(scope.name)} ${format.format(scope.visits)}`).join(', ') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="dash-empty">{t('None in this timeframe.')}</p>}
      </section>

      <section className="dash-section">
        <h2>{t('By page')}</h2>
        <div className="dash-split">
          <DashDonut center={format.format(SECTIONS.reduce((sum, key) => sum + report.visits[key], 0))} slices={SECTIONS.map((key) => ({
            key, label: t(SECTION_LABEL[key]), display: format.format(report.visits[key]), value: report.visits[key], color: SECTION_COLOR[key], href: dashHref(range, key),
          }))} />
          <div>
            <nav className="feed-sort" aria-label={t('By page')}>
              {SECTIONS.map((key) => (
                <Link key={key} href={dashHref(range, key)} className={`feed-sort-link ${key === section ? 'active' : ''}`} aria-current={key === section ? 'page' : undefined}>
                  {t(SECTION_LABEL[key])}
                </Link>
              ))}
            </nav>
            {pages.length ? (
              <div className="dash-scroll">
                <table className="dash-table">
                  <thead><tr><th>{t('Page')}</th><th className="num">{t('Views')}</th><th className="num">{t('Likes')}</th><th className="num">{t('Comments')}</th></tr></thead>
                  <tbody>
                    {pages.map((row) => (
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
    </div>
  );
}
