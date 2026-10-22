/**
 * The path from the first recorded visit to the moment the account exists,
 * plus the company name they left on the profile or in a company note.
 * Visits after signup are not part of this path.
 */
import { sourceLabel } from '@/lib/productModel';

export type JourneyEvent = {
  name: string;
  path: string | null;
  landing: string | null;
  firstSource: string | null;
  firstMedium: string | null;
  at: string;
  backfilled: boolean;
  cta: string | null;
};

export type AccountOrigin = {
  source: string;
  knownSource: boolean;
  steps: string[];
};

const KNOWN_SOURCE = new Set(['Direct or unknown', 'Unknown']);

/** A page name the interface already translates. Anything else is left out. */
export function pageKey(path: string | null | undefined): string | null {
  if (!path) return null;
  const clean = path.split('?')[0].split('#')[0];
  if (clean === '/' || clean === '') return 'Home';
  if (clean === '/signup' || clean.startsWith('/signup/')) return 'Sign up';
  if (clean === '/login' || clean.startsWith('/login/')) return 'Log in';
  if (clean === '/find' || clean.startsWith('/find/')) return 'Find a tender';
  if (clean.startsWith('/tenders')) return 'Tenders';
  if (clean.startsWith('/news/signals') || clean.startsWith('/signals')) return 'Signals';
  if (clean === '/news' || clean.startsWith('/news/')) return 'News';
  if (clean.startsWith('/blog')) return 'Blog';
  if (clean.startsWith('/community') || clean.startsWith('/posts')) return 'Community';
  if (clean.startsWith('/markets')) return 'Markets';
  if (clean === '/pricing' || clean.startsWith('/pricing/')) return 'Pricing';
  if (clean.startsWith('/workspaces')) return 'Workspace';
  return null;
}

function signupStep(cta: string | null): string {
  if (cta === 'google') return 'Google signup';
  if (cta === 'email') return 'Email signup';
  return 'Sign up';
}

/** Null when nothing was stored before the account existed. */
export function journeyOf(events: JourneyEvent[], signedUp: string): AccountOrigin | null {
  const start = new Date(signedUp).getTime();
  if (!signedUp || !Number.isFinite(start)) return null;
  const cutoff = start + 2 * 60 * 1000;
  const prior = events
    .filter((event) => !event.backfilled && new Date(event.at).getTime() <= cutoff)
    .sort((a, b) => a.at.localeCompare(b.at));
  if (!prior.length) return null;
  const touch = prior.find((event) => event.firstSource && event.firstSource !== 'unknown') || prior[0];
  const labelled = sourceLabel(touch.firstSource, touch.firstMedium);
  const source = labelled === 'direct' ? 'Direct or unknown' : labelled;
  const session = prior.find((event) => event.name === 'session_started');
  const steps: string[] = [];
  const push = (label: string | null) => {
    if (!label || steps.includes(label)) return;
    steps.push(label);
  };
  push(pageKey(session?.path || session?.landing || touch.landing || touch.path));
  for (const event of prior) {
    if (event.name === 'tender_viewed') push('Tender opened');
    else if (event.name === 'signal_viewed') push('Opened a signal');
    else if (event.name === 'find_opened') push('Opened the finder');
    else if (event.name === 'find_brief_submitted') push('Submitted the company form');
    else if (event.name === 'oauth_started') push('Google signup');
    else if (event.name === 'signup_submitted') push(signupStep(event.cta));
  }
  if (!steps.some((step) => step === 'Email signup' || step === 'Google signup' || step === 'Sign up')) {
    const created = prior.find((event) => event.name === 'account_created');
    if (created) push(signupStep(created.cta));
  }
  return { source, knownSource: KNOWN_SOURCE.has(source), steps: steps.slice(0, 8) };
}

/** The company they typed, or the names of files they uploaded. Empty when they added nothing. */
export function companyLabel(profileCompany: string | null | undefined, docs: { name: string; text: string | null }[]): string {
  const named = (profileCompany || '').trim();
  if (named) return named.slice(0, 80);
  const note = docs.find((doc) => doc.name === 'Company note' && doc.text);
  const line = note?.text?.split('\n').map((part) => part.trim()).find(Boolean) || '';
  if (line && !/^website:/i.test(line)) return line.slice(0, 80);
  const files = docs.filter((doc) => doc.name !== 'Company note' && doc.name.trim()).map((doc) => doc.name.trim());
  return [...new Set(files)].slice(0, 3).join(', ');
}
