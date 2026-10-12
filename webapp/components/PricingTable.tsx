'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useFormState } from 'react-dom';
import { openBillingPortal, subscribeFromPricing } from '@/app/settings/actions';
import { useT } from '@/lib/i18n/client';
import { PLANS, yearPrice, type Plan } from '@/lib/plans';
import type { Result } from '@/app/settings/actions';

const CADENCE: Record<number, string> = {
  1: 'Once a day',
  2: 'Twice a day',
  3: 'Three times a day',
  6: 'Six times a day',
};

function monthCount(n: number | null, t: (key: string, vars?: { n: number }) => string) {
  if (n == null) return t('Unlimited');
  if (n === 0) return t('Not included');
  return t('{n} a month', { n });
}

const ROWS: { label: string; cell: (plan: Plan, t: (key: string, vars?: { n: number }) => string) => string }[] = [
  { label: 'Workspaces', cell: (p, t) => (p.workspaces == null ? t('Unlimited') : String(p.workspaces)) },
  { label: 'Scopes besides General', cell: (p, t) => (p.scopes >= 1000 ? t('Unlimited') : !p.customize ? t('1 template') : p.scopes === 1 ? t('1 you can create') : String(p.scopes)) },
  { label: 'Members', cell: (p, t) => (p.members == null ? t('Unlimited') : String(p.members)) },
  { label: 'Agent updates', cell: (p, t) => t(CADENCE[p.runsPerDay] ?? `${p.runsPerDay}`) },
  { label: 'Tender requirements', cell: (p, t) => (p.requirementViewsPerMonth == null ? t('Every tender') : t('{n} tenders a month', { n: p.requirementViewsPerMonth })) },
  { label: 'Tender Evaluation', cell: (p, t) => monthCount(p.evaluationsPerMonth, t) },
  { label: 'Proposal briefs', cell: (p, t) => monthCount(p.proposalsPerMonth, t) },
  { label: 'News Report Agent', cell: (p, t) => monthCount(p.newsReportsPerMonth, t) },
  { label: 'Your own instructions and context', cell: (p, t) => (p.customize ? t('Included') : t('Not included')) },
];

function Subscribe({ plan, interval }: { plan: string; interval: 'month' | 'year' }) {
  const t = useT();
  const [state, action] = useFormState<Result | null, FormData>(subscribeFromPricing, null);
  return (
    <form action={action}>
      <input type="hidden" name="plan" value={plan} />
      <input type="hidden" name="interval" value={interval} />
      <button type="submit" className="btn primary price-cta">{t('Subscribe')}</button>
      {state?.error && <p className="form-msg err">{state.error}</p>}
    </form>
  );
}

/** Plan comparison. Yearly billing is eleven months for twelve. */
export default function PricingTable({ currentPlan }: { currentPlan: string | null }) {
  const t = useT();
  const [yearly, setYearly] = useState(false);
  return (
    <>
      <div className="price-interval" role="group" aria-label={t('Billing period')}>
        <button type="button" aria-pressed={!yearly} onClick={() => setYearly(false)}>{t('Monthly')}</button>
        <button type="button" aria-pressed={yearly} onClick={() => setYearly(true)}>{t('Yearly')}</button>
        <span className="price-save">{t('One month free')}</span>
        <span className="price-vat">{t('Prices exclude VAT.')}</span>
      </div>
      <div className="price-scroll">
        <table className="price-table">
          <thead>
            <tr>
              <th scope="col"><span className="sr-only">{t('Feature')}</span></th>
              {PLANS.map((pl) => {
                const yearlyEur = yearPrice(pl.priceEur);
                const current = currentPlan === pl.key;
                return (
                  <th scope="col" key={pl.key}>
                    <div className="price-name">{pl.name}{current && <span className="scope-badge">{t('Current')}</span>}</div>
                    <div className="price-amount">
                      €{pl.priceEur === 0 ? 0 : yearly ? yearlyEur : pl.priceEur}
                      <span>/{yearly && pl.priceEur > 0 ? t('year') : t('month')}</span>
                    </div>
                    <p className="price-blurb">{t(pl.blurb)}</p>
                    {pl.priceEur === 0 && !current && <Link href="/signup" className="btn price-cta">{t('Sign up')}</Link>}
                    {pl.priceEur > 0 && current && (
                      <form action={async () => { await openBillingPortal(); }}><button type="submit" className="btn price-cta">{t('Manage billing')}</button></form>
                    )}
                    {pl.priceEur > 0 && !current && <Subscribe plan={pl.key} interval={yearly ? 'year' : 'month'} />}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.label}>
                <th scope="row">{t(row.label)}</th>
                {PLANS.map((pl) => {
                  const value = row.cell(pl, t);
                  const tone = value === t('Included') ? 'price-in' : value === t('Not included') ? 'price-out' : undefined;
                  return <td key={pl.key} className={tone}>{value}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
