import OpportunitiesView from '@/components/OpportunitiesView';
import { getT } from '@/lib/i18n/server';
import { pageMeta } from '@/lib/seo';

export async function generateMetadata() {
  const t = await getT();
  return pageMeta({ title: `${t('RFIs')} — Tender Town`, description: t('Requests for information open worldwide.'), path: '/tenders/rfis' });
}

export default function RfisPage() {
  return <OpportunitiesView view="rfi" />;
}
