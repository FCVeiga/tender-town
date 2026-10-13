import Link from 'next/link';
import DashChart from '@/components/dashboard/DashChart';
import RangeNav from '@/components/dashboard/RangeNav';
import { rangeQuery, requireDashboard } from '@/lib/dashboard-page';
import { getT } from '@/lib/i18n/server';
import { NOINDEX } from '@/lib/seo';

const OVERVIEW = [
  { key: 'active', color: 'var(--accent)' },
  { key: 'accounts', color: 'var(--ok)' },
  { key: 'visitors', color: 'var(--rfi)' },
];

const ENTRIES = [
  { href: '/dashboard/active', label: 'Active users' },
  { href: '/dashboard/visits', label: 'Page visits' },
  { href: '/dashboard/scopes', label: 'Scopes' },
  { href: '/dashboard/mcp', label: 'MCP calls' },
];

export async function generateMetadata() {
  const t = await getT();
  return { title: `${t('Dashboard')} — Tender Town`, ...NOINDEX };
}

/** Totals and the chart. Each report below opens on its own page. */
export default async function DashboardPage({ searchParams }: { searchParams: { range?: string } }) {
  const { range, report, t, locale, format, money, rangeNames } = await requireDashboard(searchParams.range);
  const query = rangeQuery(range);
  return (
    <div className="settings">
      <h1 className="opps-h1">{t('Dashboard')}</h1>
      <RangeNav range={range} label={t('Timeframe')} names={rangeNames} hrefFor={(key) => `/dashboard${rangeQuery(key)}`} />
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
      <nav className="dash-entries" aria-label={t('Dashboard')}>
        {ENTRIES.map((entry) => (
          <Link key={entry.href} href={`${entry.href}${query}`}>{t(entry.label)}</Link>
        ))}
      </nav>
    </div>
  );
}
