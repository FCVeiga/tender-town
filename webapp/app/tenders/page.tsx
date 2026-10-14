import OpportunitiesView from '@/components/OpportunitiesView';
import { getT } from '@/lib/i18n/server';
import { pageMeta } from '@/lib/seo';

export async function generateMetadata() {
  const t = await getT();
  return pageMeta({ title: `${t('Tenders')} — Tender Town`, description: t('Open public tenders and funding calls worldwide.'), path: '/tenders' });
}

export default function OpportunitiesPage() {
  return <OpportunitiesView view="all" />;
}
