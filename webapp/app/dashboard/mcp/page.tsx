import Link from 'next/link';
import DashDonut from '@/components/dashboard/DashDonut';
import RangeNav from '@/components/dashboard/RangeNav';
import { PLAN_COLOR, PLAN_LABEL, PLANS, rangeQuery, requireDashboard } from '@/lib/dashboard-page';
import { getT } from '@/lib/i18n/server';
import { NOINDEX } from '@/lib/seo';

const COLORS = ['var(--accent)', 'var(--rfi)', 'var(--grant)', 'var(--warn)', 'var(--ok)', 'var(--subtle)'];

export async function generateMetadata() {
  const t = await getT();
  return { title: `${t('MCP calls')} — Tender Town`, ...NOINDEX };
}

export default async function McpPage({ searchParams }: { searchParams: { range?: string } }) {
  const { range, report, t, format, place, rangeNames } = await requireDashboard(searchParams.range);
  return (
    <div className="settings">
      <p className="dash-back"><Link href={`/dashboard${rangeQuery(range)}`}>{t('Dashboard')}</Link></p>
      <h1 className="opps-h1">{t('MCP calls')}</h1>
      <RangeNav range={range} label={t('Timeframe')} names={rangeNames} hrefFor={(key) => `/dashboard/mcp${rangeQuery(key)}`} />

      <div className="dash-kpis dash-kpis-2">
        <p className="dash-kpi"><span>{t('Agents')}</span><strong>{format.format(report.mcp.agents)}</strong></p>
        <p className="dash-kpi"><span>{t('Requests')}</span><strong>{format.format(report.mcp.requests)}</strong></p>
      </div>

      <div className="dash-pair">
        <section className="dash-section">
          <h2>{t('Requests')}</h2>
          {report.mcp.tools.length ? (
            <DashDonut center={format.format(report.mcp.requests)} slices={report.mcp.tools.map((tool, index) => ({
              key: tool.tool, label: tool.tool, display: format.format(tool.requests), value: tool.requests, color: COLORS[index % COLORS.length],
            }))} />
          ) : <p className="dash-empty">{t('None in this timeframe.')}</p>}
        </section>
        <section className="dash-section">
          <h2>{t('Plan')}</h2>
          <DashDonut center={format.format(report.mcp.requests)} slices={PLANS.map((plan) => ({
            key: plan, label: t(PLAN_LABEL[plan]), display: format.format(report.mcp.plans[plan]), value: report.mcp.plans[plan], color: PLAN_COLOR[plan],
          }))} />
        </section>
      </div>

      <section className="dash-section">
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
        ) : <p className="dash-empty">{t('None in this timeframe.')}</p>}
      </section>
    </div>
  );
}
