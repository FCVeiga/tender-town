import Link from 'next/link';
import DashDonut from '@/components/dashboard/DashDonut';
import DashLink from '@/components/dashboard/DashLink';
import DashMap from '@/components/dashboard/DashMap';
import RangeNav from '@/components/dashboard/RangeNav';
import type { PlanKey } from '@/lib/analytics';
import { PLAN_COLOR, PLAN_LABEL, PLANS, isPlan, rangeQuery, requireDashboard } from '@/lib/dashboard-page';
import { getT } from '@/lib/i18n/server';
import { NOINDEX } from '@/lib/seo';

export async function generateMetadata() {
  const t = await getT();
  return { title: `${t('Scopes')} — Tender Town`, ...NOINDEX };
}

export default async function ScopesPage({ searchParams }: { searchParams: { range?: string; plan?: string } }) {
  const { range, report, t, locale, format, rangeNames } = await requireDashboard(searchParams.range);
  const plan: PlanKey | 'all' = searchParams.plan && isPlan(searchParams.plan) ? searchParams.plan : 'all';
  const href = (next: PlanKey | 'all') => `/dashboard/scopes${rangeQuery(range, next === 'all' ? {} : { plan: next })}`;
  const totals = Object.fromEntries(PLANS.map((key) => [key, report.scopes.plans[key].reduce((sum, scope) => sum + scope.visits, 0)])) as Record<PlanKey, number>;
  const total = PLANS.reduce((sum, key) => sum + totals[key], 0);
  const names = new Map<string, string>();
  const byPlan = new Map<string, Record<PlanKey, number>>();
  for (const key of PLANS) {
    for (const scope of report.scopes.plans[key]) {
      names.set(scope.id, scope.name);
      const row = byPlan.get(scope.id) || { free: 0, starter: 0, pro: 0, teams: 0 };
      row[key] = scope.visits;
      byPlan.set(scope.id, row);
    }
  }
  const table = Array.from(byPlan, ([id, plans]) => ({
    id, name: names.get(id) || '', plans, total: PLANS.reduce((sum, key) => sum + plans[key], 0),
  })).filter((row) => row.name && (plan === 'all' || row.plans[plan] > 0))
    .sort((a, b) => (plan === 'all' ? b.total - a.total : b.plans[plan] - a.plans[plan]) || a.name.localeCompare(b.name));
  const geo = plan === 'all' ? report.scopeGeo.all : report.scopeGeo.plans[plan];

  return (
    <div className="settings">
      <p className="dash-back"><Link href={`/dashboard${rangeQuery(range)}`}>{t('Dashboard')}</Link></p>
      <h1 className="opps-h1">{t('Scopes')}</h1>
      <RangeNav range={range} label={t('Timeframe')} names={rangeNames} hrefFor={(key) => `/dashboard/scopes${rangeQuery(key, plan === 'all' ? {} : { plan })}`} />

      <section className="dash-section">
        <h2>{t('Plan')} <span className="uc-count">{format.format(total)}</span></h2>
        <DashDonut center={format.format(total)} slices={PLANS.map((key) => ({
          key, label: t(PLAN_LABEL[key]), display: format.format(totals[key]), value: totals[key], color: PLAN_COLOR[key], href: href(key),
        }))} />
        <nav className="feed-sort" aria-label={t('Plan')}>
          <DashLink href={href('all')} className={`feed-sort-link ${plan === 'all' ? 'active' : ''}`} current={plan === 'all'}>{t('All plans')}</DashLink>
          {PLANS.map((key) => (
            <DashLink key={key} href={href(key)} className={`feed-sort-link ${plan === key ? 'active' : ''}`} current={plan === key}>{t(PLAN_LABEL[key])}</DashLink>
          ))}
        </nav>
        {table.length ? (
          <div className="dash-scroll">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>{t('Scopes')}</th>
                  {PLANS.map((key) => <th key={key} className="num">{t(PLAN_LABEL[key])}</th>)}
                  <th className="num">{t('Views')}</th>
                </tr>
              </thead>
              <tbody>
                {table.map((row) => (
                  <tr key={row.id}>
                    <td>{t(row.name)}</td>
                    {PLANS.map((key) => <td key={key} className="num">{format.format(row.plans[key])}</td>)}
                    <td className="num">{format.format(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="dash-empty">{t('None in this timeframe.')}</p>}
      </section>

      <section className="dash-section">
        <h2>{t('By country')}</h2>
        <DashMap locale={locale} countries={geo.map((country) => ({
          code: country.code,
          value: country.visits,
          lines: [
            { label: t('Visits'), text: format.format(country.visits) },
            ...(country.scopes.length ? [{ label: t('Scopes'), text: country.scopes.map((scope) => `${t(scope.name)} ${format.format(scope.visits)}`).join(', ') }] : []),
          ],
        }))} />
      </section>
    </div>
  );
}
