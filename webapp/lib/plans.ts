/**
 * Account plans. Keep RUNS_PER_DAY in sync with services/agent_settings.py.
 * `null` = unlimited.
 */
export type PlanKey = 'free' | 'starter' | 'pro' | 'teams';

export type Plan = {
  key: PlanKey; name: string; priceEur: number; kind: 'personal' | 'team';
  workspaces: number | null; members: number | null; runsPerDay: number;
  /** Catalog scopes a workspace may turn on. General does not count. `null` is unlimited. */
  defaultScopes: number | null;
  /** Custom scopes a workspace may create. `0` is not included, `null` is unlimited. */
  customScopes: number | null;
  customize: boolean;
  /** Tender Evaluation runs per month. `0` is not on the plan, `null` is unlimited. */
  evaluationsPerMonth: number | null;
  /** Proposal briefs per month. `0` is not on the plan, `null` is unlimited. */
  proposalsPerMonth: number | null;
  /** News Report Agent. `0` is not on the plan, `null` is unlimited. */
  newsReportsPerMonth: number | null;
  blurb: string; features: string[];
};

/** A year is eleven months: the twelfth month is free. */
export const yearPrice = (monthlyEur: number) => monthlyEur * 11;

/** `null` is unlimited and included. `0` and a missing plan are not included. */
export function planIncludes(limit: number | null | undefined): boolean {
  return limit !== 0 && limit !== undefined;
}

/** True while `used` is still under `limit`. `null` is unlimited. */
export function scopeRoom(used: number, limit: number | null): boolean {
  return limit == null || used < limit;
}

export const PLANS: Plan[] = [
  {
    key: 'free', name: 'Free', priceEur: 0, kind: 'personal', workspaces: 1, defaultScopes: 1, customScopes: 0, members: 1, runsPerDay: 1, customize: false,
    evaluationsPerMonth: 1, proposalsPerMonth: 0, newsReportsPerMonth: 0,
    blurb: '1 default scope.',
    features: ['One workspace', '1 default scope', 'Custom scopes are not included', '1 tender evaluation a month', 'Agents update tenders and news once a day', 'Community, chat and notifications'],
  },
  {
    key: 'starter', name: 'Starter', priceEur: 29, kind: 'personal', workspaces: 1, defaultScopes: 3, customScopes: 1, members: 1, runsPerDay: 2, customize: true,
    evaluationsPerMonth: 5, proposalsPerMonth: 1, newsReportsPerMonth: 20,
    blurb: '3 default scopes and 1 custom scope.',
    features: ['One workspace', 'Up to 3 default scopes', '1 custom scope', '5 tender evaluations a month', '1 proposal brief a month', 'News Report Agent, 20 reports a month', 'Agents update twice a day'],
  },
  {
    key: 'pro', name: 'Pro', priceEur: 59, kind: 'personal', workspaces: 1, defaultScopes: 10, customScopes: 5, members: 1, runsPerDay: 3, customize: true,
    evaluationsPerMonth: 10, proposalsPerMonth: 5, newsReportsPerMonth: 50,
    blurb: '10 default scopes and 5 custom scopes.',
    features: ['One workspace', 'Up to 10 default scopes', '5 custom scopes', '10 tender evaluations a month', '5 proposal briefs a month', 'News Report Agent, 50 reports a month', 'Agents update three times a day'],
  },
  {
    key: 'teams', name: 'Teams', priceEur: 99, kind: 'team', workspaces: null, defaultScopes: null, customScopes: null, members: null, runsPerDay: 6, customize: true,
    evaluationsPerMonth: null, proposalsPerMonth: null, newsReportsPerMonth: null,
    blurb: 'For firms with departments and projects.',
    features: ['Unlimited workspaces', 'Unlimited team members (admins configure, members see results)', 'Unlimited default scopes', 'Unlimited custom scopes', 'Unlimited tender evaluations', 'Proposal briefs', 'News Report Agent, unlimited reports', 'Agents update six times a day'],
  },
];

export const planOf = (key: string | null | undefined) => PLANS.find((p) => p.key === key) ?? PLANS[0];
