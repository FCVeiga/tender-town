import Link from 'next/link';
import { getSupabaseServerClient } from '@/lib/supabase';
import { Opportunity, buyerOf, daysUntil, titleOf } from '@/lib/data';
import { firstInLanguage } from '@/lib/english';
import { plainText } from '@/lib/plain';
import { alignSubmissionDeadline } from '@/lib/deadlineCopy';
import { publicText, stageOf, statedValue, vatTreatment } from '@/lib/publication';
import { EXAMPLE_TENDER_ID } from '@/lib/exampleRun';
import { StatusTags } from '@/components/OpportunityCard';
import TenderDocuments, { Doc } from '@/components/TenderDocuments';
import TenderHistory from '@/components/TenderHistory';
import ExampleWalkthrough from '@/components/ExampleWalkthrough';
import { shownCriteria } from '@/lib/award';
import PostMarkdown from '@/components/social/PostMarkdown';
import { UpdateEvent } from '@/components/UpdateComment';
import { getLocale, getT } from '@/lib/i18n/server';
import { pageMeta } from '@/lib/seo';

export async function generateMetadata() {
  return pageMeta({
    title: 'Example — Tender Town',
    description: 'A real tender, checked against a sample company: requirements, fit, partner gaps and a proposal brief.',
    path: '/example',
  });
}

export default async function ExamplePage() {
  const t = await getT();
  const supabase = getSupabaseServerClient();
  const { data: o } = await supabase.from('opportunities').select('*').eq('opportunity_id', EXAMPLE_TENDER_ID).maybeSingle();
  if (!o) {
    return (
      <div>
        <Link className="back-link" href="/">← {t('Home')}</Link>
        <div className="detail-block"><h2>{t('Not found')}</h2></div>
      </div>
    );
  }

  const [{ data: requirements }, { data: documents }, { data: changes }, { data: award }, { data: countryRow }] = await Promise.all([
    supabase.from('requirements').select('*').eq('opportunity_id', o.opportunity_id),
    supabase.from('documents').select('*').eq('opportunity_id', o.opportunity_id).order('publication_date', { ascending: true, nullsFirst: false }),
    supabase.from('change_events').select('*').eq('opportunity_id', o.opportunity_id).order('detected_at', { ascending: false }),
    supabase.from('award_criteria').select('*').eq('opportunity_id', o.opportunity_id).order('weight', { ascending: false }),
    o.country ? supabase.from('countries').select('name').eq('code', o.country).maybeSingle() : Promise.resolve({ data: null as { name: string } | null }),
  ]);

  const summaryRaw = alignSubmissionDeadline(publicText(plainText(firstInLanguage(o.tender_summary) ?? firstInLanguage(o.summary) ?? '')), o.deadline);
  const stage = stageOf(o);
  const stated = o.estimated_value ? null : statedValue(summaryRaw);
  const amount = o.estimated_value ?? stated?.amount ?? null;
  const valueCurrency = o.estimated_value ? o.currency : stated?.currency ?? null;
  const estimated = (!o.estimated_value && !!stated) || o.value_source === 'summary';
  const vat = vatTreatment(summaryRaw);
  const shownStatus = stage === 'closed' ? 'CLOSED' : stage === 'uncertain' ? 'UNVERIFIED' : o.status === 'AWARDED' ? 'AWARDED' : o.status || 'OPEN';
  const days = daysUntil(o.deadline);
  const deadlineDate = o.deadline ? new Date(o.deadline).toLocaleDateString(getLocale(), { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const deadline = !o.deadline ? t('No deadline stated')
    : stage === 'closed' || days == null || days < 0 ? deadlineDate
    : `${deadlineDate} · ${days === 0 ? t('today') : t('{n}d left', { n: days })}`;
  const valueText = amount != null && amount > 0 ? `${valueCurrency ? `${valueCurrency} ` : ''}${amount.toLocaleString(getLocale())}` : t('Not disclosed');
  const valueNote = [vat === 'excl' ? t('Excl. VAT') : vat === 'incl' ? t('Incl. VAT') : null, estimated && amount != null && amount > 0 ? t('From the summary') : null].filter(Boolean).join(' · ') || null;
  const notices = ((documents || []) as Doc[])
    .filter((d) => d.document_type === 'CONTRACT_NOTICE' || d.document_type === 'CORRIGENDUM')
    .sort((a, b) => (a.publication_date || '').localeCompare(b.publication_date || '') || (a.name || '').localeCompare(b.name || ''));
  const reqs = (requirements || []).filter((r) => firstInLanguage(r.requirement_text)).map((r) => ({
    id: r.requirement_id as string,
    group: (r.requirement_group as string) || 'TECHNICAL',
    groupLabel: '',
    category: (r.category as string) || '',
    text: firstInLanguage(r.requirement_text) || '',
    threshold: firstInLanguage(r.threshold) || '',
    evidence: firstInLanguage(r.evidence_required) || '',
    document: (r.document as string) || '',
    mandatory: r.mandatory !== false,
  }));

  return (
    <div className="tender-page">
      <Link className="back-link" href="/">← {t('Home')}</Link>
      <div className="detail-head">
        <div className="opp-tags">
          <span className="tag">{t('Example')}</span>
          <StatusTags o={o as Opportunity} archived={stage === 'closed' && o.status !== 'AWARDED'} />
          {stage === 'open' && <span className="tag">{t(shownStatus)}</span>}
        </div>
        <h1>{titleOf(o)}</h1>
        <p className="page-sub">{[buyerOf(o), countryRow?.name || o.country].filter(Boolean).join(' · ') || t('International')}</p>
        {titleOf(o) !== o.title && !!o.title && (
          <details className="original-notice">
            <summary>{t('Original notice title')}</summary>
            <p>{o.title}</p>
          </details>
        )}
        <p className="page-sub">{t('This run uses Harborline Identity, a sample company. It is not your account.')} <Link href={`/tenders/${o.opportunity_id}`}>{t('Open the live tender')}</Link></p>
      </div>

      <ExampleWalkthrough
        requirements={reqs}
        deadline={deadline}
        archived={stage === 'closed'}
        relevance={o.opportunity_relevance_score}
        valueText={valueText}
        valueNote={valueNote}
        documentCount={(documents || []).length}
        summary={summaryRaw ? (
          <section className="detail-block" id="summary">
            <h2>{t('Summary')}</h2>
            <PostMarkdown>{summaryRaw}</PostMarkdown>
            <p className="summary-note">{o.tender_summary ? `${t('Tender Analysis Agent')} · ${t('from the notice and the tender documents')}` : t('Preliminary summary.')}</p>
          </section>
        ) : null}
        documents={<TenderDocuments docs={(documents || []) as Doc[]} />}
        history={(
          <TenderHistory
            notices={notices}
            changes={(changes || []) as UpdateEvent[]}
            archived={stage === 'closed'}
            evidence={o.status_evidence}
            verifiedAt={o.verified_at}
          />
        )}
        sourceDocs={(documents || []).map((d) => ({ name: d.name as string, name_en: (d.name_en as string | null) ?? null, url: (d.url as string | null) ?? null, document_type: (d.document_type as string | null) ?? null }))}
        criteria={shownCriteria(award)}
        sources={(
          <section className="detail-block" id="sources">
            <h2>{t('Source')}</h2>
            {o.official_url
              ? <p><a className="ext-link" href={o.official_url} target="_blank" rel="noopener noreferrer">{o.official_url} ↗</a></p>
              : <p className="mono">{t('Not recorded')}</p>}
          </section>
        )}
      />
    </div>
  );
}
