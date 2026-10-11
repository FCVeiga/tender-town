import Link from 'next/link';
import { notFound } from 'next/navigation';
import DashChart from '@/components/dashboard/DashChart';
import { isSuperAdmin } from '@/lib/admin';
import { dashboardReport, rangeOf, RANGES, type DashAccess } from '@/lib/analytics';
import { getLocale, getT } from '@/lib/i18n/server';
import { NOINDEX } from '@/lib/seo';

const KIND: Record<DashAccess['kind'], string> = {
  home: 'Home visitors', post: 'Post pages', news: 'News pages', tender: 'Tender pages',
};
const PLAN: Record<string, string> = { free: 'Free', starter: 'Starter', pro: 'Pro', teams: 'Teams' };

export async function generateMetadata() {
  const t = await getT();
  return { title: `${t('Dashboard')} — Tender Town`, ...NOINDEX };
}

/** Counts, the chart, and the accounts behind them. Only the Google super-admin account can open this. */
export default async function DashboardPage({ searchParams }: { searchParams: { range?: string } }) {
  if (!(await isSuperAdmin())) notFound();
  const t = await getT();
  const range = rangeOf(searchParams.range);
  const report = await dashboardReport(range);
  const locale = getLocale();
  const format = new Intl.NumberFormat(locale);
  const when = (iso: string) => new Date(iso).toLocaleString(locale, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const labels = {
    home: t('Home visitors'), accounts: t('Accounts created'), posts: t('Post pages'), news: t('News pages'), tenders: t('Tender pages'),
  };
  const totals = {
    home: format.format(report.homeVisitors),
    accounts: format.format(report.accounts),
    posts: format.format(report.posts),
    news: format.format(report.news),
    tenders: format.format(report.tenders),
  };

  return (
    <div className="settings">
      <h1 className="opps-h1">{t('Dashboard')}</h1>
      <nav className="feed-sort" aria-label={t('Timeframe')}>
        {RANGES.map((item) => (
          <Link key={item.key} href={item.key === '7d' ? '/dashboard' : `/dashboard?range=${item.key}`}
            className={`feed-sort-link ${item.key === range ? 'active' : ''}`} aria-current={item.key === range ? 'page' : undefined}>
            {t(item.label)}
          </Link>
        ))}
      </nav>
      <DashChart points={report.points} labels={labels} totals={totals} locale={locale} hourly={range === '24h'} />

      <section className="dash-section">
        <h2>{t('Accounts created')} <span className="uc-count">{format.format(report.accounts)}</span></h2>
        {report.accountRows.length ? (
          <div className="dash-scroll">
            <table className="dash-table">
              <thead><tr><th>{t('Email')}</th><th>{t('Username')}</th><th>{t('Plan')}</th><th>{t('Created')}</th></tr></thead>
              <tbody>
                {report.accountRows.map((row) => (
                  <tr key={`${row.email}-${row.createdAt}`}>
                    <td>{row.email ? <a href={`mailto:${row.email}`}>{row.email}</a> : '—'}</td>
                    <td>{row.username ? <Link href={`/u/${row.username}`}>u/{row.username}</Link> : '—'}</td>
                    <td>{t(PLAN[row.plan] || row.plan)}</td>
                    <td>{when(row.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="dash-empty">{t('None in this timeframe.')}</p>}
      </section>

      <section className="dash-section">
        <h2>{t('Plans subscribed')} <span className="uc-count">{format.format(report.plans)}</span></h2>
        {report.planRows.length ? (
          <div className="dash-scroll">
            <table className="dash-table">
              <thead><tr><th>{t('Email')}</th><th>{t('Username')}</th><th>{t('Plan')}</th><th>{t('Subscribed')}</th></tr></thead>
              <tbody>
                {report.planRows.map((row) => (
                  <tr key={`${row.email}-${row.subscribedAt}`}>
                    <td>{row.email ? <a href={`mailto:${row.email}`}>{row.email}</a> : '—'}</td>
                    <td>{row.username ? <Link href={`/u/${row.username}`}>u/{row.username}</Link> : '—'}</td>
                    <td>{t(PLAN[row.plan] || row.plan)}</td>
                    <td>{when(row.subscribedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="dash-empty">{t('None in this timeframe.')}</p>}
      </section>

      <section className="dash-section">
        <h2>{t('Page accesses')}</h2>
        {report.accesses.length ? (
          <div className="dash-scroll">
            <table className="dash-table">
              <thead><tr><th>{t('When')}</th><th>{t('Page')}</th></tr></thead>
              <tbody>
                {report.accesses.map((row, i) => (
                  <tr key={`${row.at}-${i}`}>
                    <td>{when(row.at)}</td>
                    <td>{row.path ? <Link href={row.path}>{row.path}</Link> : t(KIND[row.kind])}</td>
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
