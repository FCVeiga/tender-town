import Link from 'next/link';
import { isSuperAdmin } from '@/lib/admin';
import { getT } from '@/lib/i18n/server';
import { journeyEvents } from '@/lib/productReport';
import { REPORT_TZ } from '@/lib/productModel';
import { NOINDEX } from '@/lib/seo';
import { notFound } from 'next/navigation';

export async function generateMetadata() {
  const t = await getT();
  return { title: `${t('Journey')} — Tender Town`, ...NOINDEX };
}

export default async function JourneyPage({ searchParams }: { searchParams: { visitor?: string } }) {
  if (!(await isSuperAdmin())) notFound();
  const t = await getT();
  const visitor = (searchParams.visitor || '').trim();
  const rows = visitor ? await journeyEvents(visitor) : [];
  return (
    <div className="settings diag">
      <p><Link href="/dashboard">{t('Dashboard')}</Link></p>
      <h1 className="opps-h1">{t('Look up a visitor')}</h1>
      <p className="diag-note">{t('The id is the browser cookie, not a name or an email.')}</p>
      <form method="get" className="diag-filters">
        <label>{t('Visitor')}<input name="visitor" defaultValue={visitor} /></label>
        <button className="btn primary" type="submit">{t('Apply')}</button>
      </form>
      {visitor && !rows.length && <p className="diag-empty">{t('No events for that visitor.')}</p>}
      {!!rows.length && (
        <table className="diag-table">
          <thead><tr><th>{t('Time')}</th><th>{t('Event')}</th><th>{t('Page')}</th><th>{t('Source')}</th><th>{t('Traffic')}</th></tr></thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                <td>{new Date(row.created_at).toLocaleString('en-GB', { timeZone: REPORT_TZ })}</td>
                <td>{row.name}{row.demo ? ' · demo' : ''}{row.backfilled ? ' · recovered' : ''}</td>
                <td>{row.path || '—'}</td>
                <td>{row.source || '—'}</td>
                <td>{row.traffic}{row.error_code ? ` · ${row.error_code}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
