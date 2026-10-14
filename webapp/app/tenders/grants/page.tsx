import OpportunitiesView from '@/components/OpportunitiesView';
import { getT } from '@/lib/i18n/server';
import { pageMeta } from '@/lib/seo';

export async function generateMetadata() {
  const t = await getT();
  return pageMeta({ title: `${t('Grants')} — Tender Town`, description: t('Grants and funding calls open worldwide.'), path: '/tenders/grants' });
}

export default function GrantsPage() {
  return <OpportunitiesView view="grant" />;
}
