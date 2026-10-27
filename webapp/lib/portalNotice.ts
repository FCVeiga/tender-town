/** A procurement-portal notice, matching agents/official_notice.py is_portal_url. */
const PORTALS = new Set([
  'ted.europa.eu', 'contractsfinder.service.gov.uk', 'find-tender.service.gov.uk',
  'publiccontractsscotland.gov.uk', 'boamp.fr', 'tenderned.nl', 'ecepp.ebrd.com',
  'bbg.gv.at', 'publicprocurement.be', 'aop.bg', 'simap.ch', 'eprocurement.gov.cy',
  'portal-vz.cz', 'udbud.dk', 'riigihanked.riik.ee', 'contrataciondelestado.es',
  'hankintailmoitukset.fi', 'eaadhsy.gr', 'javnanabava.hr', 'kozbeszerzes.hu',
  'etenders.gov.ie', 'utbodsvefur.is', 'anticorruzione.it', 'vpt.lt', 'marches.public.lu',
  'iub.gov.lv', 'contracts.gov.mt', 'doffin.no', 'uzp.gov.pl', 'base.gov.pt',
  'e-licitatie.ro', 'upphandlingsmyndigheten.se', 'enarocanje.si', 'uvo.gov.sk',
  'op.europa.eu', 'ungm.org', 'ethics.dk',
]);
const TED_PUB = /\/(\d{5,7}-\d{4})(?:[/?#]|$)/;
const CFT = /tender-details\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const ASSET = /\.(css|js|mjs|png|jpe?g|gif|svg|webp|ico|woff2?|map|ttf)$/i;
const GOV_HOST = /(?:^|\.)gov(?:\.[a-z]{2})?$|(?:^|\.)gouv\.[a-z]{2}$|(?:^|\.)gob(?:\.[a-z]{2})?$|(?:^|\.)go\.[a-z]{2}$|e\.gov\.|(?:^|\.)europa\.eu$/i;
const NOTICE_PATH = /\/(?:procurement-notices|procurement-notice|tender-notices)\/[^/?#]{3,}/i;

function govProcurementNotice(host: string, pathname: string): boolean {
  if (!GOV_HOST.test(host)) return false;
  const path = pathname.replace(/\/$/, '');
  if ((path.match(/\//g) || []).length < 2) return false;
  return NOTICE_PATH.test(path);
}

export function isProcurementNotice(url: string | null | undefined, reference?: string | null): boolean {
  if ((reference || '').startsWith('TED:')) return true;
  if (!url) return false;
  if (CFT.test(url)) return true;
  let parsed: URL;
  try { parsed = new URL(url); } catch { return false; }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (host === 'ted.europa.eu' || host.endsWith('.ted.europa.eu')) return TED_PUB.test(url);
  if (ASSET.test(parsed.pathname)) return false;
  if (parsed.pathname.includes('/epps/') && /\d/.test(parsed.pathname + parsed.search)) return true;
  if (host.endsWith('.europa.eu') && parsed.pathname.toLowerCase().includes('/procurement/')) return true;
  if (govProcurementNotice(host, parsed.pathname)) return true;
  const portal = host === 'ted.europa.eu' || [...PORTALS].some((name) => host === name || host.endsWith('.' + name));
  // The notice id is often in the query (etenders resourceId) or the hash (ETHICS).
  if ((parsed.pathname === '/' || parsed.pathname === '') && !parsed.hash) return false;
  return portal && /\d/.test(parsed.pathname + parsed.search + parsed.hash);
}
