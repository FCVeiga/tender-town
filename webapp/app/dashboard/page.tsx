import DiagnosisView from '@/components/dashboard/Diagnosis';
import { isSuperAdmin } from '@/lib/admin';
import { getLocale, getT } from '@/lib/i18n/server';
import { diagnosisReport, revenueReport } from '@/lib/productReport';
import { NOINDEX } from '@/lib/seo';
import { notFound } from 'next/navigation';

export async function generateMetadata() {
  const t = await getT();
  return { title: `${t('Dashboard')} — Tender Town`, ...NOINDEX };
}

export default async function DashboardPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  if (!(await isSuperAdmin())) notFound();
  const [{ filters, report, scopes, capped }, revenue, t] = await Promise.all([diagnosisReport(searchParams), revenueReport(searchParams), getT()]);
  const format = new Intl.NumberFormat(getLocale());
  const money = new Intl.NumberFormat(getLocale(), { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  return <DiagnosisView t={t} format={format} money={money} filters={filters} report={report} revenue={revenue} scopes={scopes} query={searchParams} capped={capped} />;
}
