/** The example page runs this real notice against a sample company. Nothing is saved. */

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

export function exampleBrief(deadline: string) {
  return [
    { heading: 'Tender', paragraphs: [
      `Malta Digital Innovation Authority, through the Department of Contracts, is buying a European Digital Identity Wallet. Submission is ${deadline}. The estimated value is €15,659,714.03 excluding VAT, over 90 months, with seven years of operation from Version 1.`,
    ] },
    { heading: 'What Harborline can answer', paragraphs: [
      'Lead with the ISO/IEC 27001 certificate and the auditor’s turnover declaration of €4.1 million. Name the two wallet projects and state their values plainly, including the shortfall against €5 million.',
      'The project manager, solution architect, lead developer, cybersecurity specialist and trust-services specialist can be named from the current team, with CVs and degree certificates.',
    ] },
    { heading: 'What a partner has to cover', paragraphs: [
      'A systems and network engineer based in Malta for the contract term. A legal specialist for the certification work. Colocation in the two MITA data centres for Version 2. An insurer willing to raise the cyber policy to €4 million.',
      'Do not describe these as already employed. The brief is an instruction to the bid team, not a claim that the gaps are closed.',
    ] },
    { heading: 'Documents to prepare', paragraphs: [
      'ESPD, the key-experts form, the signed project list, the ISO certificate, the insurance schedule, the technical-offer questionnaire, and the financial bid form. The Malta eID and ARF v2.4 gaps belong in the technical offer as a plan, not as work already certified.',
    ] },
  ];
}
