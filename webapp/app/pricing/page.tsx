import { getCurrentUser, siteOrigin } from '@/lib/auth';
import { getPersonalAccount } from '@/lib/accounts';
import { getT, getTSync } from '@/lib/i18n/server';
import { PLANS, yearPrice } from '@/lib/plans';
import { pageMeta } from '@/lib/seo';
import PricingTable from '@/components/PricingTable';

const INTRO = 'Plans for public tenders, funding and market news.';

export async function generateMetadata() {
  const t = await getT();
  return pageMeta({ title: `${t('Pricing')} — Tender Town`, description: t(INTRO), path: '/pricing' });
}

export default async function PricingPage() {
  const t = getTSync();
  const origin = siteOrigin();
  const user = await getCurrentUser();
  const account = user ? await getPersonalAccount(user.id) : null;
  const offers = PLANS.flatMap((p) => {
    const monthly = {
      '@type': 'Offer', name: `${p.name} — Tender Town`, price: String(p.priceEur), priceCurrency: 'EUR',
      description: t(p.blurb), url: `${origin}/pricing`,
    };
    if (p.priceEur === 0) return [monthly];
    return [monthly, { ...monthly, name: `${p.name} yearly — Tender Town`, price: String(yearPrice(p.priceEur)) }];
  });
  const graph = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: t('Pricing'),
    url: `${origin}/pricing`,
    description: t(INTRO),
    mainEntity: { '@type': 'ItemList', itemListElement: offers.map((item, i) => ({ '@type': 'ListItem', position: i + 1, item })) },
  };
  return (
    <article className="pricing">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(graph).replace(/</g, '\\u003c') }} />
      <h1 className="opps-h1">{t('Pricing')}</h1>
      <p className="page-sub">{t(INTRO)}</p>
      <PricingTable currentPlan={account?.planKey ?? null} />
    </article>
  );
}
