import type { Metadata } from 'next';
import { permanentRedirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase';
import { titleOf } from '@/lib/data';
import { firstInLanguage } from '@/lib/english';
import { publicText } from '@/lib/publication';
import { getPlatformLanguage } from '@/lib/language';
import { clip, pageMeta } from '@/lib/seo';
import OpportunityDetail from '@/components/OpportunityDetail';

// The Tender Evaluation Agent runs inside this page's server action: give it time.
export const maxDuration = 300;

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const { data } = await getSupabaseServerClient().from('opportunities')
    .select('title, title_en, language, summary, tender_summary, authority, authority_en, country, publication_date, first_detected')
    .eq('opportunity_id', params.id).maybeSingle();
  if (!data) return { title: 'Not found — Tender Town', robots: { index: false, follow: false } };
  const title = titleOf(data);
  const description = clip(publicText(firstInLanguage(data.tender_summary, data.summary) || '') || [title, data.authority_en || data.authority, data.country].filter(Boolean).join(' · '));
  return pageMeta({
    title: `${title} — Tender Town`,
    socialTitle: title,
    description,
    path: `/tenders/${params.id}`,
    type: 'article',
    published: data.publication_date || data.first_detected,
  });
}

export default async function OpportunityDetailPage({ params }: { params: { id: string } }) {
  await getPlatformLanguage();
  const { data } = await getSupabaseServerClient().from('opportunities')
    .select('opportunity_type').eq('opportunity_id', params.id).maybeSingle();
  if (data?.opportunity_type === 'signal') permanentRedirect(`/news/signals/${params.id}`);
  return (
    <OpportunityDetail id={params.id} backHref="/tenders" backLabel="Tenders" path={`/tenders/${params.id}`} agentTasks />
  );
}
