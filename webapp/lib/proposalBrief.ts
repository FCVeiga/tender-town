/** The proposal brief as the page shows it. Stored as JSON; older runs may still be Markdown. */

export type ProposalBrief = {
  pack: { name: string; description: string; url: string }[];
  documents: {
    name: string;
    needed: string[];
    missing: string[];
    sections: { title: string; body: string; gaps: string[] }[];
  }[];
  next_steps: string[];
};

const list = (value: unknown) => (Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : []);

export function parseProposalBrief(raw: string | null | undefined): ProposalBrief | null {
  const text = String(raw || '').trim();
  if (!text.startsWith('{') && !text.includes('\n{')) return null;
  const start = text.indexOf('{');
  for (let end = text.lastIndexOf('}'); end > start; end = text.lastIndexOf('}', end - 1)) {
    try {
      const data = JSON.parse(text.slice(start, end + 1));
      const brief = normaliseBrief(data);
      if (brief.pack.length || brief.documents.length) return brief;
    } catch { /* a shorter span */ }
  }
  return null;
}

export function normaliseBrief(data: any, allowedUrls?: Set<string>): ProposalBrief {
  const urlOf = (value: unknown) => {
    const url = String(value || '').trim();
    if (!url) return '';
    if (allowedUrls && !allowedUrls.has(url)) return '';
    return url;
  };
  const pack = (Array.isArray(data?.pack) ? data.pack : [])
    .filter((row: any) => row?.name)
    .map((row: any) => ({
      name: String(row.name).slice(0, 300),
      description: String(row.description || '').slice(0, 600),
      url: urlOf(row.url),
    }));
  const documents = (Array.isArray(data?.documents) ? data.documents : [])
    .filter((doc: any) => doc?.name)
    .map((doc: any) => ({
      name: String(doc.name).slice(0, 300),
      needed: list(doc.needed).slice(0, 24),
      missing: list(doc.missing).slice(0, 24),
      sections: (Array.isArray(doc.sections) ? doc.sections : [])
        .filter((section: any) => section?.title)
        .slice(0, 40)
        .map((section: any) => ({
          title: String(section.title).slice(0, 200),
          body: String(section.body || '').slice(0, 4000),
          gaps: list(section.gaps).slice(0, 12),
        })),
    }));
  return { pack, documents, next_steps: list(data?.next_steps).slice(0, 20) };
}

export function briefToMarkdown(brief: ProposalBrief) {
  const pack = brief.pack.map((row) => `| ${row.name} | ${row.description.replace(/\|/g, '/')} | ${row.url || ''} |`).join('\n');
  const documents = brief.documents.map((doc) => [
    `## ${doc.name}`,
    doc.needed.length ? `To include:\n${doc.needed.map((item) => `- ${item}`).join('\n')}` : '',
    doc.missing.length ? `Missing:\n${doc.missing.map((item) => `- ${item}`).join('\n')}` : '',
    ...doc.sections.map((section) => `### ${section.title}\n\n${section.body}${section.gaps.length ? `\n\nTo fill:\n${section.gaps.map((gap) => `- ${gap}`).join('\n')}` : ''}`),
  ].filter(Boolean).join('\n\n')).join('\n\n');
  const steps = brief.next_steps.map((step, index) => `${index + 1}. ${step}`).join('\n');
  return [`# Proposal brief`, `## Submission pack`, `| Name | Description | Document |`, `| --- | --- | --- |`, pack, documents, `## Next steps`, steps].filter(Boolean).join('\n\n') + '\n';
}

export function briefDocId(index: number) {
  return `brief-doc-${index + 1}`;
}
