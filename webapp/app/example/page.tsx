import type { Metadata } from 'next';
import Link from 'next/link';
import { getT } from '@/lib/i18n/server';
import { pageMeta } from '@/lib/seo';

export const metadata: Metadata = pageMeta({
  title: 'Example — Tender Town',
  description: 'An example of requirements, company evidence, a partner gap and a proposal brief.',
  path: '/example',
});

export default async function ExamplePage() {
  const t = await getT();
  return (
    <div>
      <Link className="back-link" href="/">← {t('Home')}</Link>
      <div className="detail-head">
        <div className="opp-tags"><span className="tag">{t('Example')}</span></div>
        <h1>{t('Waste collection for Northwind City')}</h1>
        <p className="page-sub">{t('This page is an example. It is not a real notice.')}</p>
      </div>

      <div className="detail-block">
        <h2>{t('Requirements')}</h2>
        <p>{t('Three waste-collection contracts in the last five years, each at least €2 million. Evidence: signed references.')}</p>
        <p>{t('A licensed treatment site within 80 km, or a named partner who has one.')}</p>
      </div>

      <div className="detail-block">
        <h2>{t('Company evidence')}</h2>
        <p>{t('Two collection contracts. The largest is €1.4 million. Partial match on the reference value.')}</p>
        <p>{t('No licensed treatment site on the company record.')}</p>
      </div>

      <div className="detail-block">
        <h2>{t('Partner gap')}</h2>
        <p>{t('A treatment operator within 80 km of the city. The fit names the role. It does not pick a company.')}</p>
      </div>

      <div className="detail-block">
        <h2>{t('Proposal brief')}</h2>
        <p>{t('Lead with the two collection references. Name the treatment partner before the method statement. The brief is written after the evaluation.')}</p>
      </div>
    </div>
  );
}
