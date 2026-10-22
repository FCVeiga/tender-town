import Link from 'next/link';
import DashLink from '@/components/dashboard/DashLink';
import { accountList, billingKey } from '@/lib/accountList';
import { isSuperAdmin } from '@/lib/admin';
import { PLAN_LABEL, PLANS, isPlan } from '@/lib/dashboard-page';
import type { PlanKey } from '@/lib/plans';
import { getLocale, getT } from '@/lib/i18n/server';
import { NOINDEX } from '@/lib/seo';
import { notFound } from 'next/navigation';

export async function generateMetadata() {
  const t = await getT();
  return { title: `${t('Accounts')} — Tender Town`, ...NOINDEX };
}

export default async function AccountsPage({ searchParams }: { searchParams: { plan?: string } }) {
  if (!(await isSuperAdmin())) notFound();
  const [rows, t, locale] = await Promise.all([accountList(), getT(), Promise.resolve(getLocale())]);
  const plan: PlanKey | 'all' = searchParams.plan && isPlan(searchParams.plan) ? searchParams.plan : 'all';
  const href = (next: PlanKey | 'all') => next === 'all' ? '/dashboard/accounts' : `/dashboard/accounts?plan=${next}`;
  const shown = plan === 'all' ? rows : rows.filter((row) => row.plan === plan);
  const when = (iso: string) => iso ? new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const counts = Object.fromEntries(PLANS.map((key) => [key, rows.filter((row) => row.plan === key).length])) as Record<PlanKey, number>;

  return (
    <div className="settings">
      <p className="dash-back"><Link href="/dashboard">{t('Dashboard')}</Link></p>
      <h1 className="opps-h1">{t('Accounts')} <span className="uc-count">{shown.length}</span></h1>
      <nav className="feed-sort" aria-label={t('Plan')}>
        <DashLink href={href('all')} className={`feed-sort-link ${plan === 'all' ? 'active' : ''}`} current={plan === 'all'}>{t('All plans')} {rows.length}</DashLink>
        {PLANS.map((key) => (
          <DashLink key={key} href={href(key)} className={`feed-sort-link ${plan === key ? 'active' : ''}`} current={plan === key}>{t(PLAN_LABEL[key])} {counts[key]}</DashLink>
        ))}
      </nav>
      {shown.length ? (
        <div className="dash-scroll">
          <table className="dash-table">
            <thead>
              <tr>
                <th>{t('Email')}</th>
                <th>{t('Username')}</th>
                <th>{t('Plan')}</th>
                <th>{t('Billing')}</th>
                <th>{t('Signed up')}</th>
                <th>{t('Came from')}</th>
                <th>{t('Journey')}</th>
                <th>{t('After signup')}</th>
                <th>{t('Company')}</th>
                <th>{t('Scopes')}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => {
                const billing = billingKey(row.plan, row.status);
                return (
                  <tr key={row.id}>
                    <td>{row.email ? <a href={`mailto:${row.email}`}>{row.email}</a> : '—'}</td>
                    <td>{row.username ? <Link href={`/u/${row.username}`}>u/{row.username}</Link> : '—'}</td>
                    <td>{t(PLAN_LABEL[row.plan])}</td>
                    <td>{billing ? t(billing) : '—'}</td>
                    <td>{when(row.signedUp)}</td>
                    <td>{row.origin ? (row.origin.knownSource ? t(row.origin.source) : row.origin.source) : t('Not collected yet')}</td>
                    <td className="dash-path">{row.origin?.steps.length ? row.origin.steps.map((step) => t(step)).join(' → ') : '—'}</td>
                    <td className="dash-path">{row.after.length ? row.after.map((step) => t(step)).join(' → ') : t('Not collected yet')}</td>
                    <td>{row.company || '—'}</td>
                    <td>{row.scopes.length ? row.scopes.map((scope) => scope.catalog ? t(scope.name) : scope.name).join(', ') : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="dash-empty">{t('No accounts')}</p>}
    </div>
  );
}
