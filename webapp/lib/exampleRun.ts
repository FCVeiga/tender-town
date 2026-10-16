/** The example page runs this real notice against a sample company. Nothing is saved. */
import type { ProposalBrief } from '@/lib/proposalBrief';

export const EXAMPLE_TENDER_ID = '9da13edc78bd027ff91e';

export type ExampleMatch = { status: 'MATCH' | 'PARTIAL_MATCH' | 'PARTNER_NEEDED' | 'NO_MATCH'; note: string };

export function exampleMatch(row: { group: string; category: string; text: string }): ExampleMatch {
  const text = row.text.toLowerCase();
  const cat = row.category.toUpperCase();
  if (text.includes('27001') || cat === 'CERTIFICATION') {
    return { status: 'MATCH', note: 'ISO/IEC 27001 is current for the company and the delivery team.' };
  }
  if (cat === 'TURNOVER' || text.includes('yearly turnover')) {
    return { status: 'MATCH', note: 'Average turnover is €4.1 million a year over the last three years.' };
  }
  if (cat === 'INSURANCE' || text.includes('indemnity') || text.includes('4,000,000')) {
    return { status: 'PARTIAL_MATCH', note: 'Cover is €2 million. The notice requires €4 million for the whole contract.' };
  }
  if (cat === 'REFERENCE' || text.includes('5,000,000')) {
    return { status: 'PARTIAL_MATCH', note: 'Two completed wallet projects, €2.1 million and €1.6 million. Together they are under €5 million.' };
  }
  if (text.includes('physically present in malta') || text.includes('based in malta') || cat === 'LOCAL_PRESENCE') {
    return { status: 'PARTNER_NEEDED', note: 'Nobody on the team is based in Malta. The on-site engineer has to come from a partner.' };
  }
  if (text.includes('legal specialist')) {
    return { status: 'PARTNER_NEEDED', note: 'There is no in-house lawyer for EUDI certification. The role has to be named before submission.' };
  }
  if (text.includes('mita')) {
    return { status: 'PARTNER_NEEDED', note: 'Hosting today is in Frankfurt. Version 2 has to sit in the two MITA data centres.' };
  }
  if (text.includes('seven key experts')) {
    return { status: 'PARTIAL_MATCH', note: 'Project manager, architect, lead developer, cybersecurity and trust services are named. Legal and the Malta engineer are not.' };
  }
  if (cat === 'FINANCIAL') {
    return { status: 'MATCH', note: 'A bank guarantee for 10% of the contract value can be issued within 15 days.' };
  }
  if (cat === 'LANGUAGE') return { status: 'MATCH', note: 'The bid and the working language are English.' };
  if (cat === 'SUBCONTRACTING') return { status: 'MATCH', note: 'Subcontractors will be declared. None are relied on for the turnover.' };
  if (cat === 'PRIVACY') return { status: 'MATCH', note: 'The company can sign the data-processing terms and keep personal data in the EEA.' };
  if (cat === 'EVIDENCE' || text.includes('power of attorney')) return { status: 'MATCH', note: 'The eligibility forms can be signed and uploaded.' };
  if (cat === 'LEGAL' && row.group === 'ELIGIBILITY') return { status: 'MATCH', note: 'ESPD Part III can be completed. No exclusion ground applies.' };
  if (text.includes('replacement key expert')) return { status: 'MATCH', note: 'A replacement profile can be sent within 10 days.' };
  if (cat === 'PERSONAL_CERTIFICATION') {
    return { status: 'PARTIAL_MATCH', note: 'Developers have secure-coding training. A named industry certificate is not on file yet.' };
  }
  if (text.includes('project manager')) {
    return { status: 'MATCH', note: 'The project manager has eight years in identity programmes. The Malta-based add-on is missed.' };
  }
  if (cat === 'CV') return { status: 'MATCH', note: 'The named person meets the degree and the years asked. The scored add-ons are not all met.' };
  if (cat === 'SLA') return { status: 'MATCH', note: 'A seven-year operate-and-support term can be priced. The service levels still have to be mapped line by line.' };
  if (text.includes('arf')) {
    return { status: 'PARTIAL_MATCH', note: 'A wallet has been shipped. It has not been certified against ARF v2.4 and the listed implementing regulations.' };
  }
  if (cat === 'EIDAS' || cat === 'EUDI') {
    return { status: 'PARTIAL_MATCH', note: 'The building blocks exist from earlier wallet work. Malta eID binding and this certification path are not done.' };
  }
  if (cat === 'SECURITY') {
    return { status: 'PARTIAL_MATCH', note: 'Secure development and an HSM are in place. The remote wallet key store for this buyer is not.' };
  }
  if (cat === 'INTEROPERABILITY') {
    return { status: 'PARTIAL_MATCH', note: 'NFC with an identity card has been built on Android. iOS with the Malta eID card has not.' };
  }
  if (cat === 'IMPLEMENTATION') {
    return { status: 'PARTIAL_MATCH', note: 'A milestone plan can be written. The Version 2 date depends on the Malta engineer and MITA hosting.' };
  }
  return { status: 'PARTIAL_MATCH', note: 'This can be answered from existing wallet delivery. The evidence for this notice still has to be written.' };
}

export const EXAMPLE_EVAL = {
  fit_score: 61,
  verdict: 'bid_with_partner',
  take: 'Harborline can lead the wallet build. Submit only with a Malta-based systems engineer, a legal specialist, hosting in the MITA data centres, insurance raised to €4 million, and reference value brought to €5 million.',
  strengths: [
    'ISO/IEC 27001 is in place for the delivery team.',
    'Yearly turnover of €4.1 million clears the €2.5 million threshold.',
    'Two identity-wallet projects were completed in 2023 and 2024.',
    'The bid can be written and delivered in English.',
  ],
  gaps: [
    'The two projects total €3.7 million, under the €5 million reference threshold.',
    'Cyber and professional insurance is €2 million, under the €4 million minimum.',
    'No Key Expert is based in Malta for the 90-month on-site role.',
    'Version 2 hosting is specified in MITA data centres. Current hosting is in Frankfurt.',
  ],
  partners: [
    { role: 'Malta-based systems and network engineer', why: 'Key Expert 7 has to be physically present in Malta for the contract term.' },
    { role: 'Legal specialist in EUDI certification', why: 'The role is mandatory and is not on the company team.' },
    { role: 'A host already in the MITA data centres', why: 'Version 2, including the PKI, has to be colocated there.' },
  ],
  next_steps: [
    'Ask the auditor to sign the project list and say which extra contracts can be added to reach €5 million.',
    'Get a quote to raise cyber cover from €2 million to €4 million.',
    'Name the Malta engineer and the legal specialist, with CVs, before writing the technical offer.',
  ],
};

export type BriefSource = { name: string; name_en: string | null; url: string | null; document_type: string | null };

function sourceUrl(docs: BriefSource[], test: (doc: BriefSource) => boolean) {
  return docs.find((doc) => doc.url && test(doc))?.url || '';
}

/** The sample brief, with links taken from the tender’s own files. */
export function exampleBrief(deadline: string, docs: BriefSource[] = []): ProposalBrief {
  const label = (doc: BriefSource) => `${doc.name_en || ''} ${doc.name}`.toLowerCase();
  const espd = sourceUrl(docs, (doc) => doc.document_type === 'FORM' || label(doc).includes('espd'));
  const financial = sourceUrl(docs, (doc) => doc.document_type === 'FINANCIAL_PROPOSAL');
  const forms = sourceUrl(docs, (doc) => label(doc).includes('annex'));
  const specifications = sourceUrl(docs, (doc) => doc.document_type === 'TENDER_SPECIFICATIONS' && !label(doc).includes('annex'));
  return {
    pack: [
      { name: 'ESPD', description: 'Exclusion grounds, turnover and the project references the buyer scores.', url: espd },
      { name: 'Key experts form', description: 'The named experts, their CVs and the on-site role in Malta.', url: forms },
      { name: 'Technical offer', description: 'The questionnaire in the tender document, answered section by section.', url: specifications },
      { name: 'Financial bid form', description: 'The priced offer on the buyer’s spreadsheet.', url: financial },
    ],
    documents: [
      {
        name: 'ESPD',
        needed: ['Exclusion grounds', 'Average yearly turnover', 'Two wallet project references', 'ISO/IEC 27001 certificate', 'Insurance schedule'],
        missing: ['Signed project list that reaches the €5 million reference threshold', 'Insurance schedule raised from €2 million to €4 million'],
        sections: [
          { title: 'Exclusion grounds', body: 'None declared.', gaps: [] },
          { title: 'Economic and financial standing', body: 'Average yearly turnover is €4.1 million. ISO/IEC 27001 is current.', gaps: ['Insurance schedule at €4 million'] },
          { title: 'Technical and professional ability', body: 'Two wallet projects are named: €2.1 million and €1.6 million. Together they are under the €5 million reference threshold.', gaps: ['Signed project list with the extra contracts that reach €5 million'] },
        ],
      },
      {
        name: 'Key experts form',
        needed: ['Project manager', 'Solution architect', 'Lead developer', 'Cybersecurity specialist', 'Trust-services specialist', 'Malta-based systems engineer', 'Legal specialist in EUDI certification'],
        missing: ['A Malta-based systems engineer for the 90-month on-site role', 'A legal specialist in EUDI certification'],
        sections: [
          { title: 'Key experts', body: 'Project manager, solution architect, lead developer, cybersecurity specialist and trust-services specialist are named from the current team, with CVs.', gaps: ['Malta-based systems and network engineer', 'Legal specialist in EUDI certification'] },
        ],
      },
      {
        name: 'Technical offer',
        needed: ['Delivery approach', 'ARF v2.4 coverage', 'Malta eID binding', 'Version 2 hosting in the MITA data centres'],
        missing: ['Line-by-line ARF v2.4 answers', 'A host already in the MITA data centres'],
        sections: [
          { title: 'Delivery approach', body: 'The offer follows the current wallet service: identity, credentials and the existing team named above.', gaps: [] },
          { title: 'ARF v2.4', body: 'The questionnaire is not yet mapped line by line. Gaps stay a plan, not work already certified.', gaps: ['An answer for each ARF v2.4 requirement in the questionnaire'] },
          { title: 'Hosting', body: 'Current hosting is in Frankfurt. Version 2, including the PKI, has to be colocated in the MITA data centres.', gaps: ['A host already in the MITA data centres'] },
        ],
      },
      {
        name: 'Financial bid form',
        needed: ['Tenderer name', 'Price for the service', 'VAT treatment'],
        missing: ['The price'],
        sections: [
          { title: 'Tenderer', body: 'Harborline Identity.', gaps: [] },
          { title: 'Price', body: 'The company file has no bid price.', gaps: ['The price on the buyer’s financial bid form', `Submitted by ${deadline}`] },
        ],
      },
    ],
    next_steps: [
      'Ask the auditor to sign the project list and say which extra contracts reach the €5 million reference threshold.',
      'Get a quote to raise cyber cover from €2 million to €4 million, and attach the schedule to the ESPD.',
      'Name the Malta-based engineer and the legal specialist, with CVs, before the key-experts form is finished.',
      'Answer the technical-offer questionnaire line by line against ARF v2.4, and name a host in the MITA data centres.',
      `Put the price on the financial bid form and submit the pack by ${deadline}.`,
    ],
  };
}
