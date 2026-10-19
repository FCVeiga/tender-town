import { firstInLanguage } from '@/lib/english';
import { tenderHistory } from '@/lib/tenderHistory';
import { getLocale, getTSync } from '@/lib/i18n/server';
import UpdateComment, { UpdateEvent } from '@/components/UpdateComment';
import { Doc } from '@/components/TenderDocuments';

const when = (iso: string) => iso ? new Date(iso).toLocaleDateString(getLocale(), { day: 'numeric', month: 'short', year: 'numeric' }) : '';

/** Notices and recorded changes, one line each. */
export default function TenderHistory({ notices, changes, archived, evidence, verifiedAt, note, linked = true }: {
  notices: Doc[];
  changes: UpdateEvent[];
  archived: boolean;
  evidence: string | null;
  verifiedAt: string | null;
  note?: string | null;
  linked?: boolean;
}) {
  const t = getTSync();
  const entries = tenderHistory(notices, changes);
  if (!entries.length && !archived && !evidence && !verifiedAt && !note) return null;
  return (
    <section className="detail-block" id="history">
      <h2>{t('Timeline')} {entries.length > 0 && <span className="uc-count">{entries.length}</span>}</h2>
      {archived && <p>{t('This tender is archived.')}</p>}
      {note && <p className="muted">{note}</p>}
      {evidence && <p className="evidence">{evidence}</p>}
      {verifiedAt && (
        <p className="news-meta">{t('Checked against the source on {date}', { date: when(verifiedAt) })}</p>
      )}
      {entries.length > 0 && (
        <ol className="timeline">
          {entries.map((entry) => {
            const key = entry.change ? `c${entry.change.id}` : entry.notice?.document_id || entry.at;
            const noticeName = entry.notice ? (firstInLanguage(entry.notice.name_en) ?? entry.notice.name) : '';
            return (
              <li key={key}>
                <time>{when(entry.at)}</time>
                <div className="history-body">
                  {entry.change ? <UpdateComment e={entry.change} compact /> : (
                    linked && entry.notice?.url
                      ? <a href={entry.notice.url} target="_blank" rel="noopener noreferrer">{noticeName}</a>
                      : <span>{noticeName}</span>
                  )}
                  {linked && entry.change && entry.notice?.url && (
                    <a className="history-doc" href={entry.notice.url} target="_blank" rel="noopener noreferrer">{noticeName} ↗</a>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
