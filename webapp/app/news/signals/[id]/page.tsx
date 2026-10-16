import type { Metadata } from 'next';
import Link from 'next/link';
import { permanentRedirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase';
import { buyerOf, titleOf } from '@/lib/data';
import { firstInLanguage } from '@/lib/english';
import { plainText } from '@/lib/plain';
import { publicText } from '@/lib/publication';
import HeartButton from '@/components/HeartButton';
import CommentsSection from '@/components/social/CommentsSection';
import { getLikes } from '@/lib/likes';
import { getPlatformLanguage } from '@/lib/language';
import { getLocale, getT } from '@/lib/i18n/server';
import { siteOrigin } from '@/lib/auth';
import { clip, pageMeta } from '@/lib/seo';
import JsonLd from '@/components/JsonLd';
import ItemSources from '@/components/ItemSources';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const { data } = await getSupabaseServerClient().from('opportunities')
    .select('title, title_en, language, summary, tender_summary, opportunity_type')
    .eq('opportunity_id', params.id).maybeSingle();
  if (!data || data.opportunity_type !== 'signal') return { title: 'Not found — Tender Town', robots: { index: false, follow: false } };
  const title = titleOf(data);
  return pageMeta({
    title: `${title} — Tender Town`,
    description: clip(publicText(firstInLanguage(data.tender_summary, data.summary) || '') || title),
    path: `/news/signals/${params.id}`,
    type: 'article',
  });
}

export default async function SignalPage({ params }: { params: { id: string } }) {
  await getPlatformLanguage();
  const t = await getT();
  const locale = getLocale();
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  const supabase = getSupabaseServerClient();
  const { data: o, error } = await supabase.from('opportunities').select('*').eq('opportunity_id', params.id).single();

  if (error || !o) {
    return (
      <div>
        <Link className="back-link" href="/news/signals">← {t('Signals')}</Link>
        <div className="detail-block"><h2>{t('Not found')}</h2><p>{error?.message || t('No news item with this ID.')}</p></div>
      </div>
    );
  }
  if (o.opportunity_type !== 'signal') permanentRedirect(`/tenders/${o.opportunity_id}`);

  const summary = publicText(plainText(firstInLanguage(o.tender_summary, o.summary) || ''));
  const paragraphs = summary.split(/\n{2,}/).map((p: string) => p.trim()).filter(Boolean);
  const [{ data: countryRow }, likes] = await Promise.all([
    o.country ? supabase.from('countries').select('name').eq('code', o.country).maybeSingle() : Promise.resolve({ data: null as { name: string } | null }),
    getLikes('tender', [o.opportunity_id]),
  ]);
  let domain = '';
  try { if (o.official_url) domain = new URL(o.official_url).hostname.replace(/^www\./, ''); } catch { /* keep the raw link */ }
  const when = o.publication_date || o.first_detected;
  const place = [buyerOf(o), countryRow?.name || o.country, when ? fmtDate(when) : null].filter(Boolean).join(' · ');
  const origin = siteOrigin();
  const headline = titleOf(o);

  return (
    <div className="news-detail">
      <JsonLd data={{
        '@context': 'https://schema.org',
        '@type': 'NewsArticle',
        headline,
        description: clip(summary || headline, 300),
        datePublished: when,
        author: { '@type': 'Organization', name: buyerOf(o) || 'Tender Town' },
        publisher: { '@type': 'Organization', name: 'Tender Town', url: origin },
        mainEntityOfPage: `${origin}/news/signals/${o.opportunity_id}`,
      }} />
      <Link className="back-link" href="/news/signals">← {t('Signals')}</Link>
      <div className="detail-head">
        <div className="detail-tags-row">
          <div className="opp-tags">
            <span className="tag signal">{t('Signal')}</span>
          </div>
          <HeartButton type="tender" id={o.opportunity_id} liked={likes.liked.has(o.opportunity_id)} signedIn={likes.signedIn} className="page-heart" />
        </div>
        <h1>{headline}</h1>
        {place && <p className="page-sub">{place}</p>}
      </div>

      <section className="detail-block summary-block">
        <div className="summary-head">
          <h2>{t('Summary')}</h2>
          {o.official_url && (
            <a className="source-link" href={o.official_url} target="_blank" rel="noopener noreferrer">
              {domain ? t('Source: {domain}', { domain }) : t('Source')} ↗
            </a>
          )}
        </div>
        {paragraphs.length ? paragraphs.map((p: string, i: number) => <p key={i}>{p}</p>)
          : <p className="muted">{t('No English summary yet.')}</p>}
        <ItemSources type="tender" id={o.opportunity_id} skip={o.official_url} />
      </section>

      <CommentsSection itemType="tender" itemId={o.opportunity_id} loginNext={`/news/signals/${o.opportunity_id}`} />
    </div>
  );
}
