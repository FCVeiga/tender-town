import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isSuperAdmin } from '@/lib/admin';
import { dashboardCounts, rangeOf, RANGES } from '@/lib/analytics';
import { getLocale, getT } from '@/lib/i18n/server';
import { NOINDEX } from '@/lib/seo';

export async function generateMetadata() {
  const t = await getT();
  return { title: `${t('Dashboard')} — Tender Town`, ...NOINDEX };
}

/** Counts for the platform. Only the Google super-admin account can open this. */
export default async function DashboardPage({ searchParams }: { searchParams: { range?: string } }) {
  if (!(await isSuperAdmin())) notFound();
  const t = await getT();
  const range = rangeOf(searchParams.range);
  const counts = await dashboardCounts(range);
  const format = new Intl.NumberFormat(getLocale());
  const n = (value: number) => format.format(value);
  const rows: { label: string; value: number; sub?: boolean }[] = [
    { label: 'Home visitors', value: counts.homeVisitors },
    { label: 'Accounts created', value: counts.accounts },
    { label: 'Plans subscribed', value: counts.plans },
    { label: 'Starter', value: counts.byPlan.starter, sub: true },
    { label: 'Pro', value: counts.byPlan.pro, sub: true },
    { label: 'Teams', value: counts.byPlan.teams, sub: true },
    { label: 'Post pages', value: counts.posts },
    { label: 'News pages', value: counts.news },
    { label: 'Tender pages', value: counts.tenders },
  ];

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
      <table className="dash-rows">
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className={row.sub ? 'sub' : undefined}>
              <td>{t(row.label)}</td>
              <td className="num">{n(row.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
