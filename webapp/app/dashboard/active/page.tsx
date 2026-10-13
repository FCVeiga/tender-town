import Link from 'next/link';
import DashDonut from '@/components/dashboard/DashDonut';
import DashMap from '@/components/dashboard/DashMap';
import RangeNav from '@/components/dashboard/RangeNav';
import type { CreatedBlock, PlanKey } from '@/lib/analytics';
import { PLAN_COLOR, PLAN_LABEL, PLANS, rangeQuery, requireDashboard } from '@/lib/dashboard-page';
import { getT } from '@/lib/i18n/server';
import { NOINDEX } from '@/lib/seo';

export async function generateMetadata() {
  const t = await getT();
  return { title: `${t('Active users')} — Tender Town`, ...NOINDEX };
}

export default async function ActiveUsersPage({ searchParams }: { searchParams: { range?: string } }) {
  const { range, report, t, locale, format, place, rangeNames } = await requireDashboard(searchParams.range);
  const when = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <div className="settings">
      <p className="dash-back"><Link href={`/dashboard${rangeQuery(range)}`}>{t('Dashboard')}</Link></p>
      <h1 className="opps-h1">{t('Active users')}</h1>
      <RangeNav range={range} label={t('Timeframe')} names={rangeNames} hrefFor={(key) => `/dashboard/active${rangeQuery(key)}`} />

      <section className="dash-section">
        <h2>{t('Plan')} <span className="uc-count">{format.format(report.cards.active)}</span></h2>
        <DashDonut center={format.format(report.cards.active)} slices={PLANS.map((plan) => ({
          key: plan, label: t(PLAN_LABEL[plan]), display: format.format(report.active.plans[plan]), value: report.active.plans[plan], color: PLAN_COLOR[plan],
        }))} />
      </section>

      <section className="dash-section">
        <h2>{t('Account details')}</h2>
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
        <h2>{t('By country')}</h2>
        <DashMap locale={locale} countries={report.countries.filter((country) => country.active > 0).map((country) => ({
          code: country.code,
          value: country.active,
          lines: [{ label: t('Active users'), text: format.format(country.active) }],
        }))} />
      </section>

      <Created title={t('Workspaces created')} block={report.created.workspaces} t={t} format={format} place={place} when={when} />
      <Created title={t('Scopes created')} block={report.created.scopes} t={t} format={format} place={place} when={when} />
    </div>
  );
}

function Created({ title, block, t, format, place, when }: {
  title: string;
  block: CreatedBlock;
  t: (key: string) => string;
  format: Intl.NumberFormat;
  place: (code: string | null) => string;
  when: (iso: string) => string;
}) {
  const total = PLANS.reduce((sum, plan) => sum + block.plans[plan], 0);
  return (
    <section className="dash-section">
      <h2>{title} <span className="uc-count">{format.format(total)}</span></h2>
      {total === 0 ? <p className="dash-empty">{t('None in this timeframe.')}</p> : (
        <>
          <DashDonut center={format.format(total)} slices={PLANS.map((plan: PlanKey) => ({
            key: plan, label: t(PLAN_LABEL[plan]), display: format.format(block.plans[plan]), value: block.plans[plan], color: PLAN_COLOR[plan],
          }))} />
          <div className="dash-scroll">
            <table className="dash-table">
              <thead><tr><th>{t('Name')}</th><th>{t('Plan')}</th><th>{t('Country')}</th><th>{t('When')}</th></tr></thead>
              <tbody>
                {block.rows.map((row) => (
                  <tr key={row.id}>
                    <td>{t(row.name)}</td>
                    <td>{t(PLAN_LABEL[row.plan])}</td>
                    <td>{place(row.country)}</td>
                    <td>{when(row.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
