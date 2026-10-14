import OpportunitiesView from '@/components/OpportunitiesView';
import { getT } from '@/lib/i18n/server';
import { pageMeta } from '@/lib/seo';

export async function generateMetadata() {
  const t = await getT();
  return pageMeta({ title: `${t('RFPs')} — Tender Town`, description: t('Requests for proposals open worldwide.'), path: '/tenders/rfps' });
}

export default function RfpsPage() {
  return <OpportunitiesView view="rfp" />;
}
