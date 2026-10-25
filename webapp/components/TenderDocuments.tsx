import Link from 'next/link';
import { firstInLanguage } from '@/lib/english';
import { getTSync } from '@/lib/i18n/server';

export type Doc = {
  document_id: string; name: string; name_en: string | null; document_type: string | null;
  url: string | null; publication_date: string | null; downloaded_at: string | null;
  version?: string | null;
};

const GROUPS: [string, string][] = [
  ['CONTRACT_NOTICE', 'Notices'], ['CORRIGENDUM', 'Notices'],
  ['CLARIFICATION', 'Clarifications & Q&A'], ['Q_AND_A', 'Clarifications & Q&A'],
  ['TENDER_SPECIFICATIONS', 'Tender documents'], ['TECHNICAL_SPECIFICATIONS', 'Specifications'],
  ['AWARD_CRITERIA', 'Evaluation'], ['FINANCIAL_PROPOSAL', 'Price & financial forms'], ['FORM', 'Forms to complete'],
  ['CONTRACT', 'Contract'], ['ANNEX', 'Other documents'],
];
const ORDER = Array.from(new Set(GROUPS.map(([, g]) => g)));
const groupOf = (t: string | null) => GROUPS.find(([k]) => k === t)?.[1] ?? 'Other documents';

const DIRECT = /downloadContractDocument|dtvp\.de\/Satellite\/public\/company\/project\/[^/]+\/\w+\/documents\//;
const HOSTED = /\/files\/[a-f0-9]{16,64}-[a-f0-9]{8,16}$/i;
const NAMED_FILE = /\.(pdf|docx?|xlsx?|zip|odt|ods|pptx?|xml|csv)(?:$|[?#&\s])/i;

function linkKind(url: string | null, name?: string | null) {
  if (!url) return null;
  if (/ted\.europa\.eu\/.*\/pdf$/.test(url)) return { label: 'PDF', title: 'Official TED notice (PDF)' };
  const path = url.split('#')[0];
  // The portal sometimes returns the file from a URL that has no extension.
  const fileAt = NAMED_FILE.test(name || '') && /(?:index\.php|open\.php|donwloadProcedurePiece|getdocument|download)/i.test(path);
  if (HOSTED.test(url) || DIRECT.test(url) || NAMED_FILE.test(path) || fileAt) {
    return { label: 'Download', title: 'Direct download from the buyer portal' };
  }
  return { label: 'Open on portal', title: 'Opens the buyer portal page where this document is downloaded' };
}

const FILE_TYPES = new Set(['PDF', 'ZIP', 'XLS', 'XLSX', 'DOC', 'DOCX', 'XML', 'CSV', 'PPT', 'PPTX', 'ODT', 'ODS', 'TXT']);

function fileType(name: string): string | null {
  const match = name.match(/\.([a-z0-9]{2,4})\b/i);
  if (!match) return null;
  const ext = match[1].toUpperCase();
  return FILE_TYPES.has(ext) ? ext : null;
}

function noteNumber(name: string): number | null {
  const match = name.match(/\b(?:note|nota|clarification)\s*(?:no\.?\s*)?(\d+)\b/i);
  return match ? Number(match[1]) : null;
}

function revised(doc: Doc): boolean {
  const version = (doc.version || '').trim();
  if (version && !/^(1|1\.0|original)$/i.test(version)) return true;
  return /\b(updated|revised|revision)\b/i.test(`${doc.name_en || ''} ${doc.name}`);
}

function ordered(group: string, items: Doc[]): Doc[] {
  if (group !== 'Clarifications & Q&A') return items;
  return [...items].sort((a, b) => {
    const left = noteNumber(`${a.name_en || ''} ${a.name}`);
    const right = noteNumber(`${b.name_en || ''} ${b.name}`);
    if (left != null && right != null && left !== right) return left - right;
    if (left != null && right == null) return -1;
    if (left == null && right != null) return 1;
    return (a.publication_date || '').localeCompare(b.publication_date || '') || a.name.localeCompare(b.name);
  });
}

/** Tender documents grouped by type. Large groups start closed. Logged-out visitors get the signup gate, not the files. */
export default function TenderDocuments({ docs, signedIn = true, signupHref = '/signup' }: { docs: Doc[]; signedIn?: boolean; signupHref?: string }) {
  const t = getTSync();
  if (!signedIn && docs.length > 0) {
    return (
      <section className="detail-block" id="documents">
        <h2>{t('Tender Documents')} <span className="uc-count">{docs.length}</span></h2>
        <p className="muted">{t('Sign up to see and download the tender documents.')}</p>
        <p className="eval-run"><Link className="btn primary" href={signupHref} data-track="signup_cta_clicked" data-placement="tender_documents" data-cta="signup">{t('Sign up')}</Link></p>
      </section>
    );
  }
  const groups = ORDER.map((g) => ({ g, items: ordered(g, docs.filter((d) => groupOf(d.document_type) === g)) })).filter((x) => x.items.length);
  return (
    <section className="detail-block" id="documents">
      <h2>{t('Tender Documents')} {docs.length > 0 && <span className="uc-count">{docs.length}</span>}</h2>
      {!docs.length ? <p className="muted">{t('No documents found yet')}</p> : (
        <>
          {groups.map(({ g, items }) => (
            <details key={g} className="doc-fold" {...(items.length <= 8 ? { open: true } : {})}>
              <summary>{t(g)} <span className="uc-count">{items.length}</span></summary>
              {items.map((d) => {
                const kind = linkKind(d.url, d.name);
                const type = fileType(`${d.name_en || ''} ${d.name}`);
                const showType = type && kind?.label !== 'PDF';
                return (
                  <a key={d.document_id} className="doc-item" href={d.url ?? '#'} target="_blank" rel="noopener noreferrer" title={kind ? t(kind.title) : undefined} data-track="document_opened" data-content={d.document_id} data-page="tender">
                    <span className="doc-name">
                      {firstInLanguage(d.name_en) ?? d.name}
                      {showType && <span className="doc-type"> {type}</span>}
                      {revised(d) && <span className="doc-revised"> {t('Revised')}</span>}
                    </span>
                    {kind && <span className={`doc-download ${kind.label === 'Open on portal' ? 'portal' : ''}`}>{kind.label === 'Download' ? t('Download ↓') : kind.label === 'PDF' ? 'PDF ↓' : t('Portal ↗')}</span>}
                  </a>
                );
              })}
            </details>
          ))}
          {docs.some((d) => linkKind(d.url, d.name)?.label === 'Open on portal') && (
            <p className="sidebar-note">{t('“Portal ↗” documents download from the buyer\'s portal, which may ask you to register.')}</p>
          )}
        </>
      )}
    </section>
  );
}
