'use client';

import { briefDocId, type ProposalBrief } from '@/lib/proposalBrief';
import { useT } from '@/lib/i18n/client';

/** The submission pack, each filled document, and the organisation's next steps. */
export default function ProposalBriefView({ brief }: { brief: ProposalBrief }) {
  const t = useT();
  return (
    <div className="brief-view">
      {brief.pack.length > 0 && (
        <div className="brief-pack">
          <h3>{t('Submission pack')}</h3>
          <div className="brief-table-wrap">
            <table className="brief-table">
              <thead>
                <tr>
                  <th>{t('Name')}</th>
                  <th>{t('Description')}</th>
                  <th>{t('Document')}</th>
                </tr>
              </thead>
              <tbody>
                {brief.pack.map((row, index) => {
                  const draft = brief.documents.findIndex((doc) => doc.name === row.name);
                  return (
                    <tr key={`${row.name}-${index}`}>
                      <td>
                        {draft >= 0
                          ? <a href={`#${briefDocId(draft)}`}>{row.name}</a>
                          : row.name}
                      </td>
                      <td>{row.description}</td>
                      <td>
                        {row.url
                          ? <a className="ext-link" href={row.url} target="_blank" rel="noopener noreferrer">{t('View document')} ↗</a>
                          : <span className="muted">{t('None')}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {brief.documents.map((doc, index) => (
        <article key={`${doc.name}-${index}`} className="brief-doc" id={briefDocId(index)}>
          <h3>{doc.name}</h3>
          <div className="brief-split">
            <div>
              <h4>{t('To include')}</h4>
              {doc.needed.length
                ? <ul>{doc.needed.map((item) => <li key={item}>{item}</li>)}</ul>
                : <p className="muted">{t('None')}</p>}
            </div>
            <div>
              <h4>{t('Missing')}</h4>
              {doc.missing.length
                ? <ul className="brief-missing">{doc.missing.map((item) => <li key={item}>{item}</li>)}</ul>
                : <p className="muted">{t('None')}</p>}
            </div>
          </div>
          {doc.sections.map((section, sectionIndex) => (
            <div key={`${section.title}-${sectionIndex}`} className="brief-section">
              <h4>{section.title}</h4>
              {section.body.split(/\n+/).filter(Boolean).map((paragraph, paragraphIndex) => (
                <p key={paragraphIndex}>{paragraph}</p>
              ))}
              {section.gaps.length > 0 && (
                <ul className="brief-gaps">
                  {section.gaps.map((gap) => <li key={gap}><span>{t('To fill')}</span>{gap}</li>)}
                </ul>
              )}
            </div>
          ))}
        </article>
      ))}
      {brief.next_steps.length > 0 && (
        <div className="brief-steps">
          <h3>{t('Next steps')}</h3>
          <ol>{brief.next_steps.map((step) => <li key={step}>{step}</li>)}</ol>
        </div>
      )}
    </div>
  );
}
