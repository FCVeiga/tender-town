import Link from 'next/link';
import DashDonut from '@/components/dashboard/DashDonut';
import DashLink from '@/components/dashboard/DashLink';
import DashMap from '@/components/dashboard/DashMap';
import RangeNav from '@/components/dashboard/RangeNav';
import { sectionOf, type VisitSection } from '@/lib/analytics';
import { regionOf } from '@/lib/analytics';
import {
  MAIN, PLAN_LABEL, PLANS, SECTION_COLOR, SECTION_LABEL, audienceOf, audienceToken, rangeQuery, requireDashboard, scopeColors, viewsOf,
} from '@/lib/dashboard-page';
import { REGIONS } from '@/lib/analytics';
import { getT } from '@/lib/i18n/server';
import { NOINDEX } from '@/lib/seo';

export async function generateMetadata() {
  const t = await getT();
  return { title: `${t('Page visits')} — Tender Town`, ...NOINDEX };
}

export default async function VisitsPage({ searchParams }: { searchParams: { range?: string; pages?: string; section?: string } }) {
  const { range, report, t, locale, format, rangeNames } = await requireDashboard(searchParams.range);
  const scopeIds = new Set(report.pages.scopes.map((scope) => scope.id));
  const pick = audienceOf(searchParams.pages, scopeIds);
  const token = audienceToken(pick);
  const bundle = pick.kind === 'plan' ? report.pages.plans[pick.plan]
    : pick.kind === 'region' ? report.pages.regions[pick.region]
      : pick.kind === 'scope' ? (report.pages.scopes.find((scope) => scope.id === pick.id)?.pages || report.pages.guest)
        : report.pages.guest;
  const sections = bundle.other.some((page) => page.views > 0) ? [...MAIN, 'other' as VisitSection] : MAIN;
  const biggest = sections.reduce((best, key) => viewsOf(bundle, key) > viewsOf(bundle, best) ? key : best, sections[0]);
  const section = sectionOf(searchParams.section, biggest);
  const rows = bundle[section] || [];
  const total = sections.reduce((sum, key) => sum + viewsOf(bundle, key), 0);
  const kept = (pages: string, nextSection: VisitSection) => {
    const extra: Record<string, string> = {};
    if (pages !== 'guest') extra.pages = pages;
    if (nextSection !== 'home') extra.section = nextSection;
    return extra;
  };
  const href = (pages: string, nextSection: VisitSection = section) => `/dashboard/visits${rangeQuery(range, kept(pages, nextSection))}`;
  const color = scopeColors([
    ...report.pages.scopes.map((scope) => [scope.id, scope.name] as [string, string]),
    ...PLANS.flatMap((plan) => report.scopes.plans[plan].map((scope) => [scope.id, scope.name] as [string, string])),
    ...report.scopes.guest.map((scope) => [scope.id, scope.name] as [string, string]),
  ]);
  const scopeSlices = pick.kind === 'plan' ? report.scopes.plans[pick.plan]
    : pick.kind === 'region' ? report.scopes.regions[pick.region]
      : pick.kind === 'scope' ? report.pages.scopes.filter((scope) => scope.id === pick.id).map((scope) => ({ id: scope.id, name: scope.name, visits: viewsOf(scope.pages, 'home') + viewsOf(scope.pages, 'community') + viewsOf(scope.pages, 'news') + viewsOf(scope.pages, 'tenders') + viewsOf(scope.pages, 'other') }))
        : report.scopes.guest;
  const geo = pick.kind === 'plan' ? report.visitGeo.plans[pick.plan]
    : pick.kind === 'region' ? report.visitGeo.regions[pick.region]
      : pick.kind === 'scope' ? (report.visitGeo.scopes.find((scope) => scope.id === pick.id)?.countries || [])
        : report.visitGeo.guest;
  const sources = new Map<string, number>();
  for (const row of report.referrers) {
    const match = pick.kind === 'plan' ? row.plan === pick.plan
      : pick.kind === 'region' ? !!row.country && regionOf(row.country) === pick.region
        : pick.kind === 'guest' ? row.signedIn !== true
          : true;
    if (!match) continue;
    const key = `${row.from}\n${row.path}`;
    sources.set(key, (sources.get(key) || 0) + row.views);
  }
  const referrers = Array.from(sources, ([key, views]) => {
    const [from, path] = key.split('\n');
    return { from, path, views };
  }).sort((a, b) => b.views - a.views || a.from.localeCompare(b.from)).slice(0, 100);

  return (
    <div className="settings">
      <p className="dash-back"><Link href={`/dashboard${rangeQuery(range)}`}>{t('Dashboard')}</Link></p>
      <h1 className="opps-h1">{t('Page visits')}</h1>
      <RangeNav range={range} label={t('Timeframe')} names={rangeNames} hrefFor={(key) => `/dashboard/visits${rangeQuery(key, kept(token, section))}`} />

      <div className="dash-chip-row">
        <nav className="feed-sort" aria-label={t('Signed out')}>
          <DashLink href={href('guest')} className={`feed-sort-link ${token === 'guest' ? 'active' : ''}`} current={token === 'guest'}>{t('Signed out')}</DashLink>
        </nav>
        <nav className="feed-sort" aria-label={t('Plan')}>
          {PLANS.map((plan) => {
            const value = `plan:${plan}`;
            return <DashLink key={plan} href={href(value)} className={`feed-sort-link ${token === value ? 'active' : ''}`} current={token === value}>{t(PLAN_LABEL[plan])}</DashLink>;
          })}
        </nav>
        {report.pages.scopes.length ? (
          <nav className="feed-sort" aria-label={t('Scopes')}>
            {report.pages.scopes.map((scope) => {
              const value = `scope:${scope.id}`;
              return <DashLink key={scope.id} href={href(value)} className={`feed-sort-link ${token === value ? 'active' : ''}`} current={token === value}>{t(scope.name)}</DashLink>;
            })}
          </nav>
        ) : null}
        <nav className="feed-sort" aria-label={t('Region')}>
          {REGIONS.map((region) => {
            const value = `region:${region}`;
            return <DashLink key={region} href={href(value)} className={`feed-sort-link ${token === value ? 'active' : ''}`} current={token === value}>{t(region)}</DashLink>;
          })}
        </nav>
      </div>

      <section className="dash-section">
        <h2>{t('Came from')}</h2>
        {referrers.length ? (
          <div className="dash-scroll">
            <table className="dash-table">
              <thead><tr><th>{t('Came from')}</th><th>{t('Page')}</th><th className="num">{t('Views')}</th></tr></thead>
              <tbody>
                {referrers.map((row) => (
                  <tr key={`${row.from}:${row.path}`}>
                    <td>{row.from.startsWith('http') ? <a href={row.from} target="_blank" rel="noopener noreferrer">{row.from}</a> : row.from}</td>
                    <td>{row.path ? <Link href={row.path}>{row.path}</Link> : '—'}</td>
                    <td className="num">{format.format(row.views)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="dash-empty">{t('None in this timeframe.')}</p>}
      </section>

      <section className="dash-section">
        <h2>{t('Page visits')} <span className="uc-count">{format.format(total)}</span></h2>
        <div className="dash-split">
          <DashDonut center={format.format(total)} slices={sections.map((key) => ({
            key, label: t(SECTION_LABEL[key]), display: format.format(viewsOf(bundle, key)), value: viewsOf(bundle, key), color: SECTION_COLOR[key],
            href: href(token, key),
          }))} />
          <div>
            <nav className="feed-sort" aria-label={t('By page')}>
              {sections.map((key) => (
                <DashLink key={key} href={href(token, key)} className={`feed-sort-link ${key === section ? 'active' : ''}`} current={key === section}>{t(SECTION_LABEL[key])}</DashLink>
              ))}
            </nav>
            {rows.length ? (
              <div className="dash-scroll">
                <table className="dash-table">
                  <thead><tr><th>{t('Page')}</th><th className="num">{t('Views')}</th><th className="num">{t('Likes')}</th><th className="num">{t('Comments')}</th></tr></thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.href || row.labelKey || row.title}>
                        <td>{row.href ? <Link href={row.href}>{row.title || (row.labelKey ? t(row.labelKey) : row.href)}</Link> : (row.title || (row.labelKey ? t(row.labelKey) : '—'))}</td>
                        <td className="num">{format.format(row.views)}</td>
                        <td className="num">{row.likes == null ? '—' : format.format(row.likes)}</td>
                        <td className="num">{row.comments == null ? '—' : format.format(row.comments)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="dash-empty">{t('None in this timeframe.')}</p>}
          </div>
        </div>
      </section>

      <section className="dash-section">
        <h2>{t('Scopes')}</h2>
        {scopeSlices.length ? (
          <DashDonut center={format.format(scopeSlices.reduce((sum, scope) => sum + scope.visits, 0))} slices={scopeSlices.map((scope) => ({
            key: scope.id, label: t(scope.name), display: format.format(scope.visits), value: scope.visits, color: color(scope.id),
          }))} />
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
