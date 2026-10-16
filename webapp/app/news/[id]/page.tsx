import type { Metadata } from 'next';
import Link from 'next/link';
import { getSupabaseServerClient } from '@/lib/supabase';
import { newsCategoryLabel, titleOf } from '@/lib/data';
import { firstInLanguage } from '@/lib/english';
import { plainText } from '@/lib/plain';
import { publicText } from '@/lib/publication';
import NewsImage from '@/components/NewsImage';
import NewsReportRunner from '@/components/NewsReport';
import AgentAvatar from '@/components/AgentAvatar';
import HeartButton from '@/components/HeartButton';
import CommentsSection from '@/components/social/CommentsSection';
import { getLikes } from '@/lib/likes';
import { isAgentEnabled } from '@/lib/settings';
import { newsReportAllowance } from '@/lib/newsQuota';
import { getPlatformLanguage } from '@/lib/language';
import { getViewScopes } from '@/lib/scopes';
import { getLocale, getT } from '@/lib/i18n/server';
import { siteOrigin } from '@/lib/auth';
import { UpgradeReport } from '@/components/UpgradeReport';
import { clip, pageMeta } from '@/lib/seo';
import JsonLd from '@/components/JsonLd';
import ItemSources from '@/components/ItemSources';

// The News Report Agent runs inside this page's server action: give it time.
export const maxDuration = 300;

type Action = { type: string; title: string; why?: string; next_step?: string; deadline?: string | null; priority?: string };
type Analysis = { verdict: 'act' | 'consider' | 'monitor'; take?: string; actions: Action[]; agent?: string };

const ACTION_LABELS: Record<string, string> = {
  content: 'Publish', participate: 'Participate', announce: 'Announce', outreach: 'Reach out',
  bid: 'Bid', product: 'Product', monitor: 'Monitor',
};
const VERDICTS: Record<string, { label: string; note: string }> = {
  act: { label: 'Act on this', note: 'A clear opening for you' },
  consider: { label: 'Worth considering', note: 'Discuss with the team' },
  monitor: { label: 'Monitor', note: 'Nothing to do yet' },
};


export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const { data } = await getSupabaseServerClient().from('news_items')
    .select('title, title_en, language, summary, excerpt, image_url').eq('news_id', params.id).maybeSingle();
  if (!data) return { title: 'Not found — Tender Town', robots: { index: false, follow: false } };
  const title = titleOf(data);
  return pageMeta({
    title: `${title} — Tender Town`,
    description: clip(publicText(firstInLanguage(data.summary, data.excerpt) || '') || title),
    path: `/news/${params.id}`,
    type: 'article',
    image: data.image_url,
  });
}

export default async function NewsDetailPage({ params }: { params: { id: string } }) {
  await getPlatformLanguage();  // the display filter's language
  const t = await getT();
  const locale = getLocale();
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  const supabase = getSupabaseServerClient();
  const { data: n, error } = await supabase.from('news_items').select('*').eq('news_id', params.id).single();

  if (error || !n) {
    return (
      <div>
        <Link className="back-link" href="/news">← {t('News')}</Link>
        <div className="detail-block"><h2>{t('Not found')}</h2><p>{error?.message || t('No news item with this ID.')}</p></div>
      </div>
    );
  }

  const paragraphs = publicText(plainText(firstInLanguage(n.summary_long, n.summary, n.excerpt) || ''))
    .split(/\n{2,}/).map((p: string) => p.trim()).filter(Boolean);
  const facts: string[] = Array.isArray(n.key_facts) ? n.key_facts.map((f: string) => publicText(plainText(f))).filter((f: string) => firstInLanguage(f)) : [];
  // One report per scope the viewer looks through (their active scopes, or the default scope).
  const { scopes: viewScopes } = await getViewScopes();
  const [likes, { data: reports }, agentFlags, allowance] = await Promise.all([
    getLikes('news', [n.news_id]),
    supabase.from('scope_news_reports').select('*').eq('news_id', n.news_id).in('scope_id', viewScopes.map((sc) => sc.id)),
    Promise.all(viewScopes.map(async (sc) => [sc.id, await isAgentEnabled('news_report', sc.id)] as const)),
    newsReportAllowance(),
  ]);
  const agentOnFor = new Map(agentFlags);
  let domain = n.source_name;
  try { if (n.source_url) domain = new URL(n.source_url).hostname.replace(/^www\./, ''); } catch { /* keep the source name */ }

  const origin = siteOrigin();
  const headline = titleOf(n);
  return (
    <div className="news-detail">
      <JsonLd data={{
        '@context': 'https://schema.org',
        '@type': 'NewsArticle',
        headline,
        description: clip(paragraphs.join(' ') || headline, 300),
        datePublished: n.published_date || n.created_at,
        image: n.image_url || undefined,
        author: { '@type': 'Organization', name: n.source_name || 'Tender Town' },
        publisher: { '@type': 'Organization', name: 'Tender Town', url: origin },
        mainEntityOfPage: `${origin}/news/${n.news_id}`,
      }} />
      <Link className="back-link" href="/news">← {t('News')}</Link>
      <div className="detail-head">
        <div className="detail-tags-row">
          <div className="opp-tags">
          <span className={`tag ${n.category}`}>{t(newsCategoryLabel(n.category))}</span>
          {n.unverified && <span className="tag unverified">{t('Unverified')}</span>}
        </div>
          <HeartButton type="news" id={n.news_id} liked={likes.liked.has(n.news_id)} signedIn={likes.signedIn} className="page-heart" />
        </div>
        <h1>{headline}</h1>
        <p className="page-sub">
          {[n.region, n.published_date ? fmtDate(n.published_date) : null].filter(Boolean).join(' · ')}
        </p>
      </div>

      <section className="detail-block summary-block">
        <div className="summary-head">
          <h2>{t('Summary')}</h2>
          {n.source_url && (
            <a className="source-link" href={n.source_url} target="_blank" rel="noopener noreferrer">
              {t('Source: {domain}', { domain })} ↗
            </a>
          )}
        </div>
        {n.image_url && <NewsImage src={n.image_url} />}
        {!n.summary_long && <p className="summary-pending">{t('Preview — the News Report Agent replaces this with the full summary.')}</p>}
        {paragraphs.length ? paragraphs.map((p: string, i: number) => <p key={i}>{p}</p>)
          : <p className="muted">{t('No English summary yet.')}</p>}
        {facts.length > 0 && (
          <ul className="key-facts">{facts.map((f, i) => <li key={i}>{f}</li>)}</ul>
        )}
        {n.unverified && <p className="muted">{t('Social post — unconfirmed.')}</p>}
        <ItemSources type="news" id={n.news_id} skip={n.source_url} />
      </section>

      {viewScopes.map((scope) => {
        const r = (reports || []).find((x: any) => x.scope_id === scope.id);
        const analysis = (r?.analysis ?? null) as Analysis | null;
        const agentOn = agentOnFor.get(scope.id) ?? true;
        return (
          <section key={scope.id} className="detail-block analysis-block">
            <div className="agent-head">
              <AgentAvatar agent="news_report" working={!analysis && agentOn && !allowance.block} off={allowance.block === 'plan' || (!agentOn && !analysis)} />
              <div className="agent-id">
                <h2>{t('News report')}{viewScopes.length > 1 && <span className="scope-name-chip">{scope.name}</span>}</h2>
                {r?.analysed_at && <span className="agent-name">{t('Report from {date}', { date: fmtDate(r.analysed_at) })}</span>}
              </div>
              {analysis && allowance.block !== 'plan' && <span className={`verdict ${analysis.verdict}`} title={VERDICTS[analysis.verdict] ? t(VERDICTS[analysis.verdict].note) : undefined}>{VERDICTS[analysis.verdict] ? t(VERDICTS[analysis.verdict].label) : null}</span>}
            </div>
            {allowance.block === 'plan' && (
              <UpgradeReport signedIn={likes.signedIn} note={t('This agent reads the full article and writes what your team should do about it.')} />
            )}
            {allowance.block !== 'plan' && !analysis && allowance.block === 'quota' && (
              <p className="muted">{t('This workspace has used its 50 news reports for this month.')}</p>
            )}
            {allowance.block !== 'plan' && !analysis && allowance.block !== 'quota' && (agentOn
              ? <NewsReportRunner newsId={n.news_id} scopeId={scope.id} signedIn={likes.signedIn} lastError={r?.error === 'plan' || r?.error === 'quota' ? null : r?.error ?? null} />
              : <p className="muted">{t('Agent off for this scope.')}</p>)}
            {allowance.block !== 'plan' && analysis && (
              <>
                {firstInLanguage(analysis.take) && <p className="analysis-take">{analysis.take}</p>}
                <div className="actions">
                  {analysis.actions.map((a, i) => (
                    <div key={i} className="action">
                      <div className="action-top">
                        <span className={`action-type at-${a.type}`}>{ACTION_LABELS[a.type] ? t(ACTION_LABELS[a.type]) : a.type}</span>
                        {a.priority && <span className={`action-priority ${a.priority}`}>{t(`${a.priority} priority`)}</span>}
                        {a.deadline && <span className="action-deadline">{t('by {date}', { date: fmtDate(a.deadline) })}</span>}
                      </div>
                      <h3>{a.title}</h3>
                      {a.why && <p className="action-why">{a.why}</p>}
                      {a.next_step && <p className="action-next"><span>{t('Next step')}</span>{a.next_step}</p>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        );
      })}
      <CommentsSection itemType="news" itemId={n.news_id} loginNext={`/news/${n.news_id}`} />
    </div>
  );
}
