import { buildDiagnosis } from '@/lib/productFunnel';
import { filtersOf, touchOf, trackingAllowed, trafficOf, type AccountFact, type Fact, type Filters, type LogFact } from '@/lib/productModel';

const hour = 60 * 60 * 1000;
const start = Date.parse('2026-10-10T00:00:00Z');
let n = 0;
function fact(partial: Partial<Fact> & { name: string; visitor: string; at: number }): Fact {
  n += 1;
  return {
    session: partial.session || partial.visitor, userId: null, flow: null, pageType: null, path: '/', landing: '/',
    referrerHost: null, source: 'direct', medium: 'none', campaign: null, firstSource: 'direct', firstMedium: 'none', firstCampaign: null,
    device: 'desktop', country: 'PT', scopeId: null, contentId: null, cta: null, placement: null, plan: 'free', entitlement: null,
    ok: true, errorCode: null, demo: false, traffic: 'human', backfilled: false, newVisitor: true, signedIn: false, durationMs: null, scrollPct: null,
    ...partial,
  };
}

const filters = filtersOf({ range: 'custom', from: '2026-10-10', to: '2026-10-16' }, start + 7 * 24 * hour);
const wide: Filters = { ...filters, start: start, end: start + 8 * 24 * hour, noise: false, only: null };

function run(facts: Fact[], accounts: AccountFact[] = [], extra?: Partial<Parameters<typeof buildDiagnosis>[0]>) {
  return buildDiagnosis({
    facts, previousFacts: [], accounts, previousAccounts: [], log: [], filters: wide,
    instrumentAt: start - hour, ingestErrors: 0, duplicates: 0, ...extra,
  });
}

const article = [
  fact({ name: 'session_started', visitor: 'a', at: start + hour, landing: '/blog/how', path: '/blog/how', pageType: 'article', firstSource: 'linkedin', firstMedium: 'social', source: 'linkedin', medium: 'social' }),
  fact({ name: 'page_viewed', visitor: 'a', at: start + hour, path: '/blog/how', pageType: 'article', landing: '/blog/how' }),
  fact({ name: 'page_viewed', visitor: 'a', at: start + 2 * hour, path: '/', pageType: 'home' }),
  fact({ name: 'tender_viewed', visitor: 'a', at: start + 3 * hour, path: '/tenders/1', pageType: 'tender', contentId: '1' }),
  fact({ name: 'signup_cta_clicked', visitor: 'a', at: start + 4 * hour, placement: 'article' }),
  fact({ name: 'signup_page_viewed', visitor: 'a', at: start + 4 * hour }),
  fact({ name: 'signup_form_started', visitor: 'a', at: start + 4 * hour, flow: 'f1' }),
  fact({ name: 'signup_submitted', visitor: 'a', at: start + 5 * hour, flow: 'f1', cta: 'email' }),
  fact({ name: 'account_created', visitor: 'a', at: start + 5 * hour, flow: 'f1', userId: 'user-a', cta: 'email', signedIn: true }),
];
const google = [
  fact({ name: 'session_started', visitor: 'g', at: start + hour, landing: '/', pageType: 'home' }),
  fact({ name: 'page_viewed', visitor: 'g', at: start + hour, path: '/', pageType: 'home' }),
  fact({ name: 'oauth_started', visitor: 'g', at: start + 2 * hour, cta: 'google', flow: 'fg' }),
  fact({ name: 'oauth_callback_received', visitor: 'g', at: start + 2 * hour, cta: 'google', flow: 'fg' }),
  fact({ name: 'account_created', visitor: 'g', at: start + 2 * hour, cta: 'google', userId: 'user-g', flow: 'fg', signedIn: true }),
];
const invalid = [
  fact({ name: 'signup_submitted', visitor: 'bad', at: start + hour, flow: 'fb', cta: 'email' }),
  fact({ name: 'signup_validation_failed', visitor: 'bad', at: start + hour, flow: 'fb', errorCode: 'password', ok: false }),
];
const login = [fact({ name: 'login_completed', visitor: 'old', at: start + hour, userId: 'user-old', cta: 'email', signedIn: true })];
const gate = [
  fact({ name: 'session_started', visitor: 's', at: start + hour }),
  fact({ name: 'scope_selected', visitor: 's', at: start + 2 * hour, scopeId: 'scope-1' }),
  fact({ name: 'tender_viewed', visitor: 's', at: start + 3 * hour, contentId: '9' }),
  fact({ name: 'gate_viewed', visitor: 's', at: start + 4 * hour, entitlement: 'plan_restriction' }),
];
const sample = [fact({ name: 'example_evaluation_completed', visitor: 'ex', at: start + hour, demo: true, userId: 'user-ex' })];
const real = [
  fact({ name: 'evaluation_completed', visitor: 'ok', at: start + 2 * hour, userId: 'user-ok', demo: false, plan: 'free' }),
  fact({ name: 'evaluation_failed', visitor: 'no', at: start + 3 * hour, userId: 'user-no', demo: false, ok: false, errorCode: 'run_failed', plan: 'free' }),
];
const tagged = [fact({
  name: 'account_created', visitor: 'ref', at: start + hour, userId: 'user-ref', signedIn: true,
  firstSource: 'reddit', firstMedium: 'social', firstCampaign: 'launch', source: 'reddit', medium: 'social', campaign: 'launch',
})];
const returning = [
  fact({ name: 'session_started', visitor: 'ret', at: start + hour, newVisitor: false, firstSource: 'cursor', firstMedium: 'directory', source: 'direct', medium: 'none' }),
  fact({ name: 'account_created', visitor: 'ret', at: start + 30 * hour, userId: 'user-ret', newVisitor: false, firstSource: 'cursor', firstMedium: 'directory', signedIn: true }),
];
const noise = [
  fact({ name: 'page_viewed', visitor: 'bot', at: start + hour, traffic: 'bot' }),
  fact({ name: 'page_viewed', visitor: 'staff', at: start + hour, traffic: 'internal' }),
  fact({ name: 'page_viewed', visitor: 'who', at: start + hour, traffic: 'unknown' }),
  fact({ name: 'page_viewed', visitor: 'human', at: start + hour, traffic: 'human' }),
  fact({ name: 'page_viewed', visitor: 'human', at: start + hour + 1000, traffic: 'human' }),
];

const one = run([...article, ...google, ...invalid, ...login, ...gate, ...sample, ...real, ...tagged, ...returning], [
  { id: 'user-a', at: start + 5 * hour, country: 'PT', internal: false },
  { id: 'user-g', at: start + 2 * hour, country: 'PT', internal: false },
  { id: 'user-ref', at: start + hour, country: 'PT', internal: false },
  { id: 'user-ret', at: start + 30 * hour, country: 'PT', internal: false },
  { id: 'user-db-only', at: start + 6 * hour, country: null, internal: false },
]);
if (one.funnel.find((step) => step.key === 'account_created')!.count < 1) throw new Error('email journey did not reach an account');
if (one.signup.googleAccounts !== 1) throw new Error('google account missing');
if (one.signup.validation[0]?.code !== 'password') throw new Error('validation failure missing');
if (one.signup.logins !== 1) throw new Error('login counted as something else');
if (one.cards.activated !== 1) throw new Error(`sample or failure counted as activation: ${one.cards.activated}`);
if (one.acquisition.some((row) => String(row.source).includes('reddit') && row.accounts !== 1)) throw new Error('tagged referral lost');
if (!one.acquisition.some((row) => String(row.source).includes('cursor'))) throw new Error('first touch was overwritten');
if (!one.observations.some((note) => note.text.includes('database'))) throw new Error('database gap not reported');

const hidden = run(noise);
if (hidden.cards.visitors !== 2) throw new Error(`bot or internal leaked, or unknown dropped: ${hidden.cards.visitors}`);
const shown = run(noise, [], { filters: { ...wide, noise: true } });
if ((shown.cards.visitors || 0) < 4) throw new Error('include-all dropped someone');

const consent = trackingAllowed('no') === false && trackingAllowed(undefined) === true;
if (!consent) throw new Error('consent gate failed');
const bot = trafficOf('curl/8', false).traffic === 'bot';
const human = trafficOf('Mozilla/5.0', false).traffic === 'human';
const staff = trafficOf('Mozilla/5.0', true).traffic === 'internal';
if (!bot || !human || !staff) throw new Error('traffic class failed');
const touch = touchOf({ host: 'tendertown.io', utmSource: 'reddit', utmMedium: 'social', utmCampaign: 'launch', referrer: null, landing: '/blog/how' });
if (touch.source !== 'reddit' || touch.campaign !== 'launch') throw new Error('utm lost');
const bare = touchOf({ host: 'tendertown.io', utmSource: null, utmMedium: null, utmCampaign: null, referrer: null, landing: '/' });
if (bare.source !== 'direct') throw new Error('missing referrer was not direct/unknown');
const ignored = filtersOf({ medium: 'social', campaign: 'launch', landing: '/', device: 'mobile', country: 'PT', visitor: 'new', auth: 'anon', source: 'reddit' });
if (ignored.medium || ignored.device || ignored.country || ignored.visitor !== 'all' || ignored.auth !== 'all' || ignored.source !== 'reddit') throw new Error('removed filters still apply');

const scopeId = '11111111-1111-1111-1111-111111111111';
const otherId = '22222222-2222-2222-2222-222222222222';
const log: LogFact[] = [
  { at: start + hour, visitor: 'guest', path: '/', kind: 'page', country: 'PT', referrer: null, signedIn: false, userId: null, scopeIds: [scopeId] },
  { at: start + 2 * hour, visitor: 'guest', path: '/', kind: 'page', country: 'PT', referrer: null, signedIn: null, userId: null, scopeIds: [scopeId] },
  { at: start + hour, visitor: 'member', path: '/', kind: 'page', country: 'PT', referrer: null, signedIn: true, userId: 'user-1', scopeIds: [scopeId, otherId] },
  { at: start + hour, visitor: 'blank', path: '/', kind: 'page', country: null, referrer: null, signedIn: false, userId: null, scopeIds: [] },
];
const scopes = run([], [], { log });
const guest = scopes.guestScopes.find((row) => row.id === scopeId);
const member = scopes.memberScopes.find((row) => row.id === otherId);
if (!guest || guest.visits !== 2 || guest.people !== 1) throw new Error('guest scopes mixed audiences');
if (!member || member.visits !== 1 || member.people !== 1) throw new Error('signed-in scope was not counted');
if (scopes.memberScopes.some((row) => row.id === scopeId && row.people !== 1)) throw new Error('guest visit counted as a signed-in scope');
if (scopes.guestScopes.some((row) => row.id === otherId)) throw new Error('active signed-in scope counted as a guest visit');
const phone = run([fact({ name: 'page_viewed', visitor: 'm', at: start + hour, device: 'mobile' })]);
if (phone.devices?.mobile !== 1 || phone.devices.desktop !== 0) throw new Error('device mix missing');

console.log('diagnosis checks passed');
