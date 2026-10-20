import type { Metadata } from 'next';
import { permanentRedirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase';
import { titleOf } from '@/lib/data';
import { firstInLanguage } from '@/lib/english';
import { publicText } from '@/lib/publication';
import { getPlatformLanguage } from '@/lib/language';
import { clip, pageMeta } from '@/lib/seo';
import OpportunityDetail from '@/components/OpportunityDetail';
import { isProcurementNotice } from '@/lib/portalNotice';

// Portal signals can run the same on-click agents as a tender.
export const maxDuration = 300;

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const { data } = await getSupabaseServerClient().from('opportunities')
    .select('title, title_en, language, summary, tender_summary, opportunity_type, publication_date, first_detected')
    .eq('opportunity_id', params.id).maybeSingle();
  if (!data || data.opportunity_type !== 'signal') return { title: 'Not found — Tender Town', robots: { index: false, follow: false } };
  const title = titleOf(data);
  return pageMeta({
    title: `${title} — Tender Town`,
    socialTitle: title,
    description: clip(publicText(firstInLanguage(data.tender_summary, data.summary) || '') || title),
    path: `/news/signals/${params.id}`,
    type: 'article',
    published: data.publication_date || data.first_detected,
  });
}

export default async function SignalPage({ params }: { params: { id: string } }) {
  await getPlatformLanguage();
  const supabase = getSupabaseServerClient();
  const { data } = await supabase.from('opportunities')
    .select('opportunity_type, official_url, reference').eq('opportunity_id', params.id).maybeSingle();
  if (data && data.opportunity_type !== 'signal') permanentRedirect(`/tenders/${params.id}`);
  const { count } = data?.opportunity_type === 'signal'
    ? await supabase.from('documents').select('document_id', { count: 'exact', head: true }).eq('opportunity_id', params.id)
    : { count: 0 };
  const agentTasks = !!data && (isProcurementNotice(data.official_url, data.reference) || (count ?? 0) > 0);
  return (
    <OpportunityDetail
      id={params.id}
      backHref="/news/signals"
      backLabel="Signals"
      path={`/news/signals/${params.id}`}
      agentTasks={agentTasks}
    />
  );
}
