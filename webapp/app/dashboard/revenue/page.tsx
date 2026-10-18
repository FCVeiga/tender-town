import Link from 'next/link';
import { isSuperAdmin } from '@/lib/admin';
import { getLocale, getT } from '@/lib/i18n/server';
import { revenueReport } from '@/lib/productReport';
import { NOINDEX } from '@/lib/seo';
import { notFound } from 'next/navigation';

const LABELS = { starter: 'Starter', pro: 'Pro', teams: 'Teams' } as const;

export async function generateMetadata() {
  const t = await getT();
  return { title: `${t('Revenue')} — Tender Town`, ...NOINDEX };
}

export default async function RevenuePage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  if (!(await isSuperAdmin())) notFound();
  const [report, t] = await Promise.all([revenueReport(searchParams), getT()]);
  const format = new Intl.NumberFormat(getLocale());
  const money = new Intl.NumberFormat(getLocale(), { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) if (value) query.set(key, value);
  const back = query.toString() ? `/dashboard?${query}` : '/dashboard';
  return (
    <div className="settings diag">
      <p className="dash-back"><Link href={back}>{t('Dashboard')}</Link></p>
      <h1 className="opps-h1">{t('Revenue')}</h1>
      <table className="diag-table">
        <thead><tr><th>{t('Plan')}</th><th>{t('Accounts')}</th><th>{t('Revenue')}</th></tr></thead>
        <tbody>
          {report.plans.map((row) => (
            <tr key={row.plan}>
              <td>{t(LABELS[row.plan])}</td>
              <td>{format.format(row.count)}</td>
              <td>{money.format(row.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
