/**
 * Account plans. Keep RUNS_PER_DAY in sync with services/agent_settings.py.
 * `null` = unlimited.
 */
export type PlanKey = 'free' | 'starter' | 'pro' | 'teams';

export type Plan = {
  key: PlanKey; name: string; priceEur: number; kind: 'personal' | 'team';
  workspaces: number | null; scopes: number; members: number | null; runsPerDay: number;
  customize: boolean; requirementViewsPerMonth: number | null;
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

export const PLANS: Plan[] = [
  {
    key: 'free', name: 'Free', priceEur: 0, kind: 'personal', workspaces: 1, scopes: 1, members: 1, runsPerDay: 1, customize: false,
    evaluationsPerMonth: 0, proposalsPerMonth: 0, requirementViewsPerMonth: 2, newsReportsPerMonth: 0,
    blurb: 'One template scope besides General.',
    features: ['One workspace', 'One template scope besides General', 'Creating your own scope is not included', 'Requirements on 2 tender pages a month', 'Agents update tenders and news once a day', 'Community, chat and notifications'],
  },
  {
    key: 'starter', name: 'Starter', priceEur: 29, kind: 'personal', workspaces: 1, scopes: 1, members: 1, runsPerDay: 2, customize: true,
    evaluationsPerMonth: 1, proposalsPerMonth: 0, requirementViewsPerMonth: 10, newsReportsPerMonth: 0,
    blurb: 'One scope you can create.',
    features: ['One workspace', 'One scope besides General, which you can create', 'Requirements on 10 tender pages a month', '1 tender evaluation a month', 'Agents update twice a day'],
  },
  {
    key: 'pro', name: 'Pro', priceEur: 59, kind: 'personal', workspaces: 1, scopes: 5, members: 1, runsPerDay: 3, customize: true,
    evaluationsPerMonth: 5, proposalsPerMonth: 0, requirementViewsPerMonth: null, newsReportsPerMonth: 50,
    blurb: 'Several markets or projects at once.',
    features: ['One workspace', 'Up to 5 scopes besides General', '5 tender evaluations a month', 'Requirements on every tender', 'News Report Agent, 50 reports a month', 'Agents update three times a day'],
  },
  {
    key: 'teams', name: 'Teams', priceEur: 99, kind: 'team', workspaces: null, scopes: 1000, members: null, runsPerDay: 6, customize: true,
    evaluationsPerMonth: null, proposalsPerMonth: null, requirementViewsPerMonth: null, newsReportsPerMonth: null,
    blurb: 'For firms with departments and projects.',
    features: ['Unlimited workspaces', 'Unlimited team members (admins configure, members see results)', 'Unlimited scopes', 'Unlimited tender evaluations', 'Proposal briefs', 'Requirements on every tender', 'News Report Agent, unlimited reports', 'Agents update six times a day'],
  },
];

export const planOf = (key: string | null | undefined) => PLANS.find((p) => p.key === key) ?? PLANS[0];
