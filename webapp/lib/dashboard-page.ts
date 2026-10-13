import 'server-only';
import { notFound } from 'next/navigation';
import { isSuperAdmin } from '@/lib/admin';
import {
  REGIONS, RANGES, dashboardReport, rangeOf,
  type PageBundle, type PlanKey, type RangeKey, type RegionKey, type VisitSection,
} from '@/lib/analytics';
import { getLocale, getT } from '@/lib/i18n/server';

export const PLAN_LABEL: Record<PlanKey, string> = { free: 'Free', starter: 'Starter', pro: 'Pro', teams: 'Teams' };
export const PLAN_COLOR: Record<PlanKey, string> = { free: 'var(--subtle)', starter: 'var(--accent)', pro: 'var(--ok)', teams: 'var(--rfi)' };
export const SECTION_LABEL: Record<VisitSection, string> = { home: 'Home', community: 'Community', news: 'News', tenders: 'Tenders', other: 'Other pages' };
export const SECTION_COLOR: Record<VisitSection, string> = { home: 'var(--accent)', community: 'var(--rfi)', news: 'var(--grant)', tenders: 'var(--warn)', other: 'var(--subtle)' };
export const PLANS: PlanKey[] = ['free', 'starter', 'pro', 'teams'];
export const MAIN: VisitSection[] = ['home', 'community', 'news', 'tenders'];
const SCOPE_COLORS = ['var(--accent)', 'var(--rfi)', 'var(--grant)', 'var(--warn)', 'var(--ok)', 'var(--subtle)'];

export function viewsOf(bundle: PageBundle, section: VisitSection) {
  return bundle[section].reduce((sum, page) => sum + page.views, 0);
}

export function isPlan(value: string): value is PlanKey {
  return value === 'free' || value === 'starter' || value === 'pro' || value === 'teams';
}

export function isRegion(value: string): value is RegionKey {
  return (REGIONS as readonly string[]).includes(value);
}

export type Audience = { kind: 'guest' } | { kind: 'plan'; plan: PlanKey } | { kind: 'region'; region: RegionKey } | { kind: 'scope'; id: string };

export function audienceOf(value: string | undefined, scopeIds: Set<string>): Audience {
  if (value?.startsWith('scope:')) {
    const id = value.slice(6);
    if (scopeIds.has(id)) return { kind: 'scope', id };
  }
  if (value?.startsWith('plan:')) {
    const plan = value.slice(5);
    if (isPlan(plan)) return { kind: 'plan', plan };
  }
  if (value?.startsWith('region:')) {
    const region = value.slice(7);
    if (isRegion(region)) return { kind: 'region', region };
  }
  return { kind: 'guest' };
}

export function audienceToken(pick: Audience) {
  if (pick.kind === 'plan') return `plan:${pick.plan}`;
  if (pick.kind === 'region') return `region:${pick.region}`;
  if (pick.kind === 'scope') return `scope:${pick.id}`;
  return 'guest';
}

export function rangeQuery(range: RangeKey, extra?: Record<string, string>) {
  const query = new URLSearchParams();
  if (range !== '7d') query.set('range', range);
  for (const [key, value] of Object.entries(extra || {})) if (value) query.set(key, value);
  const text = query.toString();
  return text ? `?${text}` : '';
}

export function scopeColors(names: [string, string][]) {
  const color = new Map<string, string>();
  Array.from(new Map(names).entries()).sort((a, b) => a[1].localeCompare(b[1]))
    .forEach(([id], index) => color.set(id, SCOPE_COLORS[index % SCOPE_COLORS.length]));
  return (id: string) => color.get(id) || SCOPE_COLORS[0];
}

export async function requireDashboard(rangeRaw: string | undefined) {
  if (!(await isSuperAdmin())) notFound();
  const range = rangeOf(rangeRaw);
  const report = await dashboardReport(range);
  const t = await getT();
  const locale = getLocale();
  const format = new Intl.NumberFormat(locale);
  const money = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const countryName = new Intl.DisplayNames([locale], { type: 'region' });
  const place = (code: string | null) => code ? (countryName.of(code) || code) : '—';
  const rangeNames = Object.fromEntries(RANGES.map((item) => [item.key, t(item.label)])) as Record<RangeKey, string>;
  return { range, report, t, locale, format, money, place, rangeNames };
}
