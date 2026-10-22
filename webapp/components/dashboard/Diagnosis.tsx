import Link from 'next/link';
import type { Diagnosis, Row, Step } from '@/lib/productFunnel';
import type { RevenueReport } from '@/lib/productReport';
import type { Filters } from '@/lib/productModel';
import { REPORT_TZ } from '@/lib/productModel';

type T = (key: string, vars?: Record<string, string | number>) => string;
type Query = Record<string, string | undefined>;

const TABS = [
  ['overview', 'Overview'],
  ['acquisition', 'Acquisition'],
  ['journeys', 'Journeys & content'],
  ['signup', 'Signup & activation'],
  ['health', 'Technical health'],
] as const;

const CENTROIDS: Record<string, [number, number]> = {
  PT: [-8, 39.5], ES: [-3.7, 40.4], FR: [2.2, 46.2], DE: [10.4, 51.1], IT: [12.5, 42.5], GB: [-1.5, 53], IE: [-8, 53.1],
  NL: [5.3, 52.1], BE: [4.5, 50.5], CH: [8.2, 46.8], AT: [14.1, 47.6], PL: [19.4, 52], SE: [15.2, 62], NO: [8.5, 60.5],
  DK: [10, 56], FI: [26, 64], GR: [22, 39], US: [-97, 38], CA: [-106, 56], BR: [-51, -10], MX: [-102, 23], AR: [-64, -34],
  IN: [79, 22], CN: [104, 35], JP: [138, 36], AU: [134, -25], ZA: [25, -29], NG: [8, 10], AE: [54, 24], SG: [104, 1.3],
  unknown: [0, -60],
};

function withQuery(query: Query, patch: Record<string, string | null>, path = '/dashboard') {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value) next.set(key, value);
  for (const [key, value] of Object.entries(patch)) {
    if (!value) next.delete(key);
    else next.set(key, value);
  }
  const text = next.toString();
  return text ? `${path}?${text}` : path;
}

function pct(value: number | null) {
  return value == null ? '—' : `${Math.round(value * 100)}%`;
}

function duration(ms: number | null, t: T) {
  if (ms == null) return t('Not enough timing data');
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)} h`;
  return `${Math.round(ms / 86_400_000)} d`;
}

function Delta({ current, previous, t }: { current: number | null; previous: number | null; t: T }) {
  if (current == null || previous == null) return <em>{t('Not collected yet')}</em>;
  if (previous === 0) return <em>{t('No previous baseline')}</em>;
  const change = Math.round(((current - previous) / previous) * 100);
  return <em>{change > 0 ? `+${change}%` : `${change}%`}</em>;
}

function Tip({ text }: { text: string }) {
  return <abbr className="diag-tip" title={text}>?</abbr>;
}

function Card({ label, tip, value, previous, extra, t, format, display, href }: {
  label: string; tip: string; value: number | null; previous: number | null; extra?: string; t: T; format: Intl.NumberFormat; display?: string; href?: string;
}) {
  const body = (
    <p className="dash-kpi">
      <span>{label} <Tip text={tip} /></span>
      <strong>{value == null ? t('Not collected yet') : display || format.format(value)}</strong>
      <Delta current={value} previous={previous} t={t} />
      {extra && <small>{extra}</small>}
    </p>
  );
  return href ? <Link href={href} className="dash-kpi-link">{body}</Link> : body;
}

function Chart({ points, aName, bName, aColor, bColor }: {
  points: { t: string; a: number; b: number }[]; aName: string; bName: string; aColor: string; bColor: string;
}) {
  const w = 640;
  const h = 160;
  const maxA = Math.max(1, ...points.map((point) => point.a));
  const maxB = Math.max(1, ...points.map((point) => point.b));
  const x = (index: number) => points.length <= 1 ? w / 2 : (index / (points.length - 1)) * w;
  const line = (pick: (point: { a: number; b: number }) => number, max: number) => points.map((point, index) => `${x(index)},${h - (pick(point) / max) * (h - 16)}`).join(' ');
  return (
    <figure className="diag-chart">
      <figcaption><i style={{ background: aColor }} />{aName}<i style={{ background: bColor }} />{bName}</figcaption>
      <svg viewBox={`0 0 ${w} ${h + 28}`} role="img">
        <polyline fill="none" stroke={aColor} strokeWidth="2" points={line((point) => point.a, maxA)} />
        <polyline fill="none" stroke={bColor} strokeWidth="2" points={line((point) => point.b, maxB)} />
        {points.map((point, index) => <text key={point.t} x={x(index)} y={h + 16} textAnchor="middle">{point.t.slice(5)}</text>)}
      </svg>
    </figure>
  );
}

function Steps({ rows, t }: { rows: Step[]; t: T }) {
  if (!rows.length) return <p className="diag-empty">{t('Not collected yet')}</p>;
  return (
    <table className="diag-table">
      <thead><tr><th>{t('Step')}</th><th>{t('Count')}</th><th>{t('From previous')}</th><th>{t('From the start')}</th><th>{t('Lost')}</th><th>{t('Typical time')}</th></tr></thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}><td>{t(row.label)}</td><td>{row.count}</td><td>{pct(row.fromPrev)}</td><td>{pct(row.fromFirst)}</td><td>{row.lost || '—'}</td><td>{duration(row.medianMs, t)}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

function Table({ columns, rows }: { columns: [string, string][]; rows: Row[] }) {
  if (!rows.length) return null;
  return (
    <div className="diag-scroll">
      <table className="diag-table">
        <thead><tr>{columns.map(([key, label]) => <th key={key}>{label}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>{columns.map(([key]) => <td key={key}>{row[key] == null ? '—' : typeof row[key] === 'number' && key === 'conversion' ? pct(row[key] as number) : String(row[key])}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScopeLists({ report, names, t, format }: { report: Diagnosis; names: Map<string, string>; t: T; format: Intl.NumberFormat }) {
  const table = (rows: Diagnosis['guestScopes'], people: string) => rows.length ? (
    <table className="diag-table">
      <thead><tr><th>{t('Scope')}</th><th>{t('Visits')}</th><th>{t(people)}</th></tr></thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}><td>{names.get(row.id) || row.id}</td><td>{format.format(row.visits)}</td><td>{format.format(row.people)}</td></tr>
        ))}
      </tbody>
    </table>
  ) : <p className="diag-empty">{t('Not collected yet')}</p>;
  return (
    <div className="diag-split">
      <section>
        <h2>{t('Guest scopes')} <Tip text={t('The scope a signed-out visitor was browsing. One visit counts once.')} /></h2>
        {table(report.guestScopes, 'Visitors')}
      </section>
      <section>
        <h2>{t('Signed-in scopes')} <Tip text={t('Every scope that was active on a signed-in visit. One visit can count under more than one scope.')} /></h2>
        {table(report.memberScopes, 'Accounts')}
      </section>
    </div>
  );
}

function CountryMap({ countries, metric, t }: { countries: Diagnosis['countries']; metric: Filters['metric']; t: T }) {
  const max = Math.max(1, ...countries.map((row) => row[metric]));
  return (
    <figure className="diag-map">
      <svg viewBox="0 0 360 180" role="img" aria-label={t('Countries')}>
        <rect width="360" height="180" fill="var(--fill)" />
        {countries.filter((row) => CENTROIDS[row.code]).map((row) => {
          const [lon, lat] = CENTROIDS[row.code];
          const value = row[metric];
          return <circle key={row.code} cx={((lon + 180) / 360) * 360} cy={((90 - lat) / 180) * 180} r={Math.max(2, Math.sqrt(value / max) * 14)} fill="var(--accent)"><title>{`${row.code} ${value}`}</title></circle>;
        })}
      </svg>
      <figcaption>{t('Location can be a VPN or a proxy. It does not show buying intent. Unknown locations stay in the table.')}</figcaption>
    </figure>
  );
}

export default function DiagnosisView({
  t, format, money, filters, report, revenue, scopes, query, capped,
}: {
  t: T; format: Intl.NumberFormat; money: Intl.NumberFormat; filters: Filters; report: Diagnosis; revenue: RevenueReport; scopes: { id: string; name: string }[]; query: Query; capped: boolean;
}) {
  const scopeName = new Map(scopes.map((scope) => [scope.id, scope.name]));
  const cards = report.cards;
  const visitors = cards.visitors;
  const ratio = (count: number | null, den: number | null) => count == null || den == null || den === 0 ? null : `${format.format(count)} / ${format.format(den)}`;
  return (
    <div className="settings diag">
      <h1 className="opps-h1">{t('Dashboard')}</h1>
      <p className="dash-back"><Link href="/dashboard/accounts">{t('Accounts')}</Link></p>
      {capped && <p className="diag-note">{t('This range hit the event cap. Narrow the dates before treating the totals as complete.')}</p>}
      <nav className="diag-tabs" aria-label={t('Dashboard')}>
        {TABS.map(([key, label]) => <Link key={key} href={withQuery(query, { tab: key === 'overview' ? null : key })} aria-current={filters.tab === key ? 'page' : undefined}>{t(label)}</Link>)}
      </nav>
      <form className="diag-filters" method="get" action="/dashboard">
        <input type="hidden" name="tab" value={filters.tab === 'overview' ? '' : filters.tab} />
        <label>{t('Timeframe')}<select name="range" defaultValue={query.range || '7d'}><option value="24h">{t('24 hours')}</option><option value="7d">{t('7 days')}</option><option value="30d">{t('30 days')}</option><option value="90d">{t('90 days')}</option><option value="custom">{t('Custom')}</option></select></label>
        <label>{t('From')}<input name="from" type="date" defaultValue={query.from || ''} /></label>
        <label>{t('To')}<input name="to" type="date" defaultValue={query.to || ''} /></label>
        <label>{t('Source')}<input name="source" defaultValue={query.source || ''} /></label>
        <label>{t('Scope')}<select name="scope" defaultValue={query.scope || ''}><option value="">{t('Any')}</option>{scopes.map((scope) => <option key={scope.id} value={scope.id}>{scope.name}</option>)}</select></label>
        <label>{t('Traffic')}<select name="only" defaultValue={query.only || ''}><option value="">{t('Human-likely')}</option><option value="unknown">{t('Unknown')}</option><option value="bot">{t('Bot-likely')}</option><option value="internal">{t('Internal')}</option></select></label>
        <label className="diag-check"><input type="checkbox" name="noise" value="1" defaultChecked={query.noise === '1'} />{t('Include bots and internal')}</label>
        <button className="btn primary" type="submit">{t('Apply')}</button>
      </form>
      {report.devices && (
        <p className="diag-excluded">{t('Devices, estimated visitors: desktop {desktop}, mobile {mobile}, tablet {tablet}, unknown {unknown}.', report.devices)}</p>
      )}
      {filters.scope && <p className="diag-note">{t('Accounts created stay unfiltered by scope. An account is not stored against one scope. The scope lists show every scope in the range.')}</p>}

      {filters.tab === 'overview' && (
        <>
          <div className="dash-kpis diag-kpis">
            <Card t={t} format={format} label={t('Estimated unique visitors')} tip={cards.visitorNote === 'events' ? t('Distinct browser cookies in the event stream. Not a count of people.') : t('Distinct cookies in the older page log. Bots and internal visits were not stored. Not a count of people.')} value={visitors} previous={report.previous.visitors} />
            <Card t={t} format={format} label={t('Sessions')} tip={t('A session starts on the first page and ends after 30 minutes of inactivity.')} value={cards.sessions} previous={report.previous.sessions} />
            <Card t={t} format={format} label={t('Engaged sessions')} tip={t('A session with at least 10 seconds visible, or a meaningful action. Time in a background tab does not count.')} value={cards.engaged} previous={report.previous.engaged} />
            <Card t={t} format={format} label={t('Signup CTA clicks')} tip={t('Clicks on a signup action, from the header, sidebar, a gate, an article or the example.')} value={cards.cta} previous={report.previous.cta} extra={ratio(cards.cta, cards.sessions) || undefined} />
            <Card t={t} format={format} label={t('Signup starts')} tip={t('A person started the email form, submitted it, or was sent to Google.')} value={cards.starts} previous={report.previous.starts} extra={ratio(cards.starts, visitors) || undefined} />
            <Card t={t} format={format} label={t('Accounts created')} tip={t('Rows created in the account database. A click or a redirect is not an account.')} value={cards.accounts} previous={report.previous.accounts} extra={ratio(cards.accounts, visitors) || undefined} href="/dashboard/accounts" />
            <Card t={t} format={format} label={t('Activated accounts')} tip={t('Accounts with a company-specific tender evaluation. The public example does not count.')} value={cards.activated} previous={report.previous.activated} extra={cards.activatedBackfill ? t('{n} recovered from saved evaluations', { n: cards.activatedBackfill }) : ratio(cards.activated, cards.accounts) || undefined} />
            <Card t={t} format={format} label={t('Revenue')} tip={t('Paid subscriptions that started in this range, at the monthly price.')} value={revenue.total} previous={revenue.previous} display={money.format(revenue.total)} href={withQuery(query, { tab: null }, '/dashboard/revenue')} />
          </div>
          <div className="diag-charts">
            <Chart aName={t('Estimated unique visitors')} bName={t('Sessions')} aColor="var(--accent)" bColor="var(--rfi)" points={report.points.map((point) => ({ t: point.t, a: point.visitors, b: point.sessions }))} />
            <Chart aName={t('Signup starts')} bName={t('Accounts created')} aColor="var(--warn)" bColor="var(--ok)" points={report.points.map((point) => ({ t: point.t, a: point.starts, b: point.accounts }))} />
          </div>
          <p className="diag-note">{t('The two charts use separate scales, so a handful of accounts stays visible next to the traffic.')} {filters.hourly ? t('Hours, Europe/Lisbon.') : t('Days, Europe/Lisbon.')}</p>
          <ScopeLists report={report} names={scopeName} t={t} format={format} />
          <h2>{t('Main funnel')} <Tip text={t('Ordered events for the same visitor, within 7 days of the session. Someone who signs up without this path is counted separately.')} /></h2>
          <Steps rows={report.funnel} t={t} />
          <h2>{t('Find a tender')} <Tip text={t('People who clicked Find best tender for your company now, then sent a company name with a website or a note. One person counts once.')} /></h2>
          <Steps rows={report.find} t={t} />
          <h2>{t('Direct signup')} <Tip text={t('People who opened signup or Google without a product action first. They are not missing data.')} /></h2>
          <Steps rows={report.direct} t={t} />
          <p className="diag-note">{t('{n} accounts in this range have no live signup event. That includes accounts from before this tracking and any direct creation.', { n: report.bypass })}</p>
          <h2>{t('What needs attention')}</h2>
          {report.observations.length ? (
            <ul className="diag-notes">
              {report.observations.map((note) => <li key={note.text}>{note.text} <Link href={note.href}>{t('Open the supporting view')}</Link></li>)}
            </ul>
          ) : <p className="diag-empty">{t('Nothing strong enough to call out in this range.')}</p>}
        </>
      )}

      {filters.tab === 'acquisition' && (
        <>
          <Table columns={[['source', t('Source')], ['campaign', t('Campaign')], ['visitors', t('Visitors')], ['sessions', t('Sessions')], ['engaged', t('Engaged sessions')], ['tenders', t('Tender views')], ['examples', t('Example')], ['starts', t('Signup starts')], ['accounts', t('Accounts created')], ['activations', t('Activations')], ['conversion', t('Visitor to account')]]} rows={report.acquisition} />
          <h2>{t('Landing pages')}</h2>
          <Table columns={[['landing', t('Landing page')], ['visits', t('Sessions')], ['engaged', t('Engaged sessions')], ['product', t('Product actions')], ['starts', t('Signup starts')], ['accounts', t('Accounts created')]]} rows={report.landings} />
          <h2>{t('Countries')}</h2>
          <p>
            <Link href={withQuery(query, { metric: null })}>{t('Visitors')}</Link> · <Link href={withQuery(query, { metric: 'engaged' })}>{t('Engaged sessions')}</Link> · <Link href={withQuery(query, { metric: 'accounts' })}>{t('Accounts created')}</Link>
          </p>
          <CountryMap countries={report.countries} metric={filters.metric} t={t} />
          <Table columns={[['code', t('Country')], ['visitors', t('Visitors')], ['engaged', t('Engaged sessions')], ['accounts', t('Accounts created')]]} rows={report.countries.map((row) => ({ ...row }))} />
          {report.coverage !== 'full' && (
            <>
              <h2>{t('Recovered from the page log')}</h2>
              <p className="diag-note">{t('Referrers saved before campaign tags. Not first-touch, and not proof the address was typed.')}</p>
              <Table columns={[['host', t('Source')], ['views', t('Page views')], ['visitors', t('Visitors')]]} rows={report.legacy.referrers} />
            </>
          )}
        </>
      )}

      {filters.tab === 'journeys' && (
        <>
          <p className="diag-note">{t('Paths use page types for this session, not first-touch. An exit is the last page after 30 minutes idle. A session still inside that window says “in progress”. An exit is not a complaint.')}</p>
          <p><Link href={withQuery(query, { steps: null })}>{t('3 steps')}</Link> · <Link href={withQuery(query, { steps: '5' })}>{t('5 steps')}</Link></p>
          <ul className="diag-paths">
            {report.paths.map((path) => <li key={path.path}>{path.path} <strong>{path.count}</strong></li>)}
          </ul>
          {!report.paths.length && <p className="diag-empty">{t('Not collected yet')}</p>}
          <h2>{t('Pages')}</h2>
          <Table columns={[['path', t('Page')], ['type', t('Type')], ['entrances', t('Entrances')], ['views', t('Page views')], ['visitors', t('Visitors')], ['engaged', t('Seconds visible')], ['scroll', t('Scroll %')], ['cta', t('Signup clicks')], ['exits', t('Exits')], ['assists', t('Assisted signups')]]} rows={report.content} />
          <ScopeLists report={report} names={scopeName} t={t} format={format} />
        </>
      )}

      {filters.tab === 'signup' && (
        <>
          <div className="dash-kpis">
            <p className="dash-kpi"><span>{t('Email starts')}</span><strong>{format.format(report.signup.emailStarts)}</strong></p>
            <p className="dash-kpi"><span>{t('Google starts')}</span><strong>{format.format(report.signup.googleStarts)}</strong></p>
            <p className="dash-kpi"><span>{t('Email accounts')}</span><strong>{format.format(report.signup.emailAccounts)}</strong></p>
            <p className="dash-kpi"><span>{t('Google accounts')}</span><strong>{format.format(report.signup.googleAccounts)}</strong></p>
          </div>
          <p className="diag-note">{t('A login is an existing account. It is not a new account. An unfinished Google handoff may be a cancellation, not a broken callback.')}</p>
          <p>{t('Existing logins')}: {format.format(report.signup.logins)}. {t('Google handoffs with no return')}: {format.format(report.signup.incompleteOauth)}. {t('Attempts with no terminal outcome')}: {format.format(report.signup.noOutcome)}. {t('Typical create time')}: {duration(report.signup.latencyMs, t)}.</p>
          <h2>{t('Validation failures')}</h2>
          <Table columns={[['code', t('Code')], ['count', t('Count')]]} rows={report.signup.validation} />
          {!report.signup.validation.length && <p className="diag-empty">{t('None in this range.')}</p>}
          <h2>{t('Authentication failures')}</h2>
          <Table columns={[['code', t('Code')], ['count', t('Count')]]} rows={report.signup.errors} />
          <h2>{t('By device')}</h2>
          <Table columns={[['device', t('Device')], ['attempts', t('Attempts')], ['failures', t('Failures')]]} rows={report.signup.byDevice} />
          <h2>{t('After the account')}</h2>
          <Steps rows={report.activation} t={t} />
          <h2>{t('Gates')}</h2>
          <Table columns={[['code', t('Code')], ['count', t('Count')]]} rows={report.gates} />
          {!report.gates.length && <p className="diag-empty">{t('None in this range.')}</p>}
          <h2>{t('Free plan')}</h2>
          <p className="diag-note">{t('Counts are Free accounts that hit each state. The plan is the one stored on the event.')}</p>
          <ul className="diag-paths">
            <li>{t('Saved company information')}: {report.free.context}</li>
            <li>{t('Hit a plan or allowance gate')}: {report.free.restricted}</li>
            <li>{t('Evaluation failed')}: {report.free.failed}</li>
            <li>{t('Evaluation completed')}: {report.free.completed}</li>
            <li>{t('Came back on a later day')}: {report.free.returned}</li>
          </ul>
        </>
      )}

      {filters.tab === 'health' && (
        <>
          <ul className="diag-paths">
            <li>{t('Last event')}: {report.health.lastAt ? new Date(report.health.lastAt).toLocaleString('en-GB', { timeZone: REPORT_TZ }) : t('Not collected yet')}</li>
            <li>{t('Ingest errors in range')}: {format.format(report.health.ingestErrors)}</li>
            <li>{t('Page log views / event page views')}: {format.format(report.health.logViews)} / {format.format(report.health.eventViews)}</li>
            <li>{t('Page log visitors / event visitors')}: {format.format(report.health.logVisitors)} / {format.format(report.health.eventVisitors)}</li>
            <li>{t('Database accounts / live signup events')}: {format.format(report.health.dbAccounts)} / {format.format(report.health.liveEventAccounts)}</li>
            <li>{t('Events marked recovered')}: {format.format(report.health.backfilled)}</li>
            <li>{t('Sessions missing a source tag')}: {format.format(report.health.missingAttribution)} / {format.format(report.health.eventViews || 0)}</li>
            <li>{t('Unknown device events')}: {format.format(report.health.unknownDevice)}</li>
            <li>{t('Unknown country events')}: {format.format(report.health.unknownCountry)}</li>
            <li>{t('Excluded bot-likely')}: {format.format(report.excluded.bot)} · {t('Excluded internal')}: {format.format(report.excluded.internal)} · {t('Unknown traffic, still shown')}: {format.format(report.excluded.unknown)}</li>
          </ul>
          <h2>{t('Definitions')}</h2>
          <ul className="diag-paths">
            {report.limitations.map((line) => <li key={line}>{line}</li>)}
            <li>{t('There is no consent banner. Measurement stays on unless the tt_consent cookie is “no”. Passwords, form text, documents, proposal text and tokens are not stored.')}</li>
            <li>{t('Recovered rows are accounts and company-specific evaluations already in the database. Old page views were not rewritten as journeys.')}</li>
          </ul>
          <p><Link href="/dashboard/operations">{t('Operations')}</Link> · <Link href="/dashboard/journey">{t('Look up a visitor')}</Link></p>
        </>
      )}
    </div>
  );
}
