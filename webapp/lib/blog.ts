/** How-to notes. English is the key; translations live in messages/blog.json. */

export type PostBlock =
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'img'; src: string; alt: string }
  | { type: 'cta'; kind: 'account' | 'example' | 'agents' };

export type Post = {
  slug: string;
  title: string;
  description: string;
  date: string;
  /** Card and hero. Every post has one. */
  image: string;
  imageAlt: string;
  blocks: PostBlock[];
};

const STEPS_ALT = 'A notice with a magnifying glass, a marked checklist and an open notebook on a café table.';
const ELIGIBILITY_ALT = 'A long notice with one line marked, a certificate and a second folder on a café table.';
const HOW_ALT = 'A notice on a board outside a town hall, one person walking in, two sharing a folder, and one held back by a rope.';
const WORTH_ALT = 'A person in a workshop reaches for one folder and a few coins, leaving a basket of crumpled papers.';
const WORTH_FLOW_ALT = 'A notice, a check of one line, then two paths: a handshake, or a shut door.';
const FIND_ALT = 'A person with a folder faces five different doorways in a city square.';
const SMALL_ALT = 'A small studio, a prototype on the bench, two ticked slips and a long slip set aside, with a large public building outside.';
const CHAT_ALT = 'A person faces a bright chat on a laptop while a wall of notices stays dark behind them, one line marked on a page they are not reading.';

const DIR = 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02014L0024-20220101';
const THRESHOLDS = 'https://single-market-economy.ec.europa.eu/single-market/public-procurement/legal-rules-and-implementation/thresholds_en';
const TED = 'https://ted.europa.eu/en/simap/european-public-procurement';
const FIND = 'https://www.find-tender.service.gov.uk/';
const FINDER = 'https://www.contractsfinder.service.gov.uk/';
const BELOW = 'https://www.gov.uk/government/publications/procurement-act-2023-guidance-documents-define-phase/guidance-below-threshold-contracts-html';
const ACT = 'https://www.legislation.gov.uk/ukpga/2023/54/section/87';
const SAM = 'https://sam.gov/opportunities';
const GRANTS = 'https://www.grants.gov/';
const WB = 'https://thedocs.worldbank.org/en/doc/c84273d1b230aeb2b0b8134de5dc8cd7-0290012025/original/Procurement-Regulations-7th-Edition-Sep-2025.pdf';
const WB_PROJECTS = 'https://projects.worldbank.org/';
const AFDB = 'https://www.afdb.org/en/documents/project-related-procurement/procurement-notices';
const AFDB_CORP = 'https://www.afdb.org/en/about-us/corporate-procurement/procurement-notices';
const ADB = 'https://www.adb.org/business/operational-procurement';
const FT = 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/home';
const SBA = 'https://www.sba.gov/partners/contracting-officials/small-business-procurement/set-aside-procurement';
const REMEDIES = 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32007L0066';

const WORTH_IT: Post = {
  slug: 'are-government-tenders-worth-it',
  title: 'Are government tenders worth it?',
  description: 'Bid when you can evidence every mandatory line, the winning price still leaves a margin, and the complete offer can be filed before the deadline.',
  date: '2026-10-15',
  image: '/blog/worth-it.jpg',
  imageAlt: WORTH_ALT,
  blocks: [
    { type: 'p', text: 'A government tender is worth a bid when you can evidence every mandatory line, the price you would need to win still leaves a margin, and a complete offer can be filed before the deadline. If a mandatory line is open, and the notice does not let another entity close it, more writing does not make that contract worth the days.' },
    { type: 'h2', text: 'Ask four questions before anyone opens a draft' },
    { type: 'ul', items: [
      'Can you show each mandatory selection line today, from documents the company already has?',
      'Where a line is missing, does this notice allow another entity to cover it, and will that entity accept the conditions, including performing the work where the rules require that?',
      'At a price that could win, is there still a margin after delivery and the cost of preparing the bid?',
      'Can the complete file be submitted on the portal named in the notice before the deadline, rather than on the evening it closes?',
    ] },
    { type: 'p', text: 'A no on the first question, together with a no on the second, is a no bid. The other two questions are how you choose among the notices that survive. The lines that usually decide the first question are turnover, a reference contract and a certificate. The figures and the proof are in that notice, not in a typical tender.' },
    { type: 'img', src: '/blog/worth-it-flow.jpg', alt: WORTH_FLOW_ALT },
    { type: 'h2', text: 'Read the value the selection criteria actually use' },
    { type: 'p', text: 'A framework agreement appoints suppliers who may receive later call-offs. The appointment can be worth having. The turnover and reference lines are often sized to the estimated value of the whole agreement, not to one order. Read which value those lines use before you treat the framework as the safer bid. A call-off under an agreement you are not on is not an open tender.' },
    { type: 'p', text: 'Some of the cost is reused: the registered company, the accounts, the certificates, and a login on the portal that actually takes the offer. The buyer’s clock is not reused. Questions, the deadline, the eligibility check and then the scoring still run. Spending that clock on a familiar title, and learning the eligibility result at the end, is the expensive version of the same weeks.' },
    { type: 'h2', text: 'Two notices, one week' },
    { type: 'p', text: 'This example is fictional. Both notices describe the same maintenance work. Notice A asks for turnover and a certificate you hold, and one reference at a value you can show. The deadline is 18 days away, and the company is already registered on the submission portal. Notice B asks for three references, each above a value your largest contract does not reach, and it does not allow another entity to supply that experience. Notice A is the bid. Notice B is the one that feels familiar and will not be scored.' },
    { type: 'h2', text: 'How Tender Town checks whether the bid is worth the days' },
    { type: 'p', text: 'Tender Town lists the requirements from the notice and the documents it fetches, with the figures still attached. <fit>Fit analysis</fit> sets those lines against the company evidence on a scope, and a line the file does not cover stays unknown.' },
    { type: 'cta', kind: 'account' },
  ],
};

const WHERE_TO_FIND: Post = {
  slug: 'where-to-find-government-contracts',
  title: 'Where to find government contracts to bid on',
  description: 'Use the board the buyer’s rules require, then submit on the portal named in the notice. Those are often two different sites.',
  date: '2026-10-15',
  image: '/blog/where-to-find.jpg',
  imageAlt: FIND_ALT,
  blocks: [
    { type: 'p', text: 'There is no single website of government contracts. You find a notice on the board the buyer’s rules require, and you submit the offer on the portal that notice names. Searching only the board you already know misses contracts that were never going to be posted there.' },
    { type: 'h2', text: 'Match the buyer to the board' },
    { type: 'ul', items: [
      `EU contracts at or above the [2026 and 2027 thresholds](${THRESHOLDS}) are published on [Tenders Electronic Daily](${TED}). For most supplies and services those thresholds are €140,000 for central government and €216,000 for sub-central authorities, net of VAT, and €5,404,000 for works. Below the applicable threshold the notice often stays on a national portal.`,
      `New UK procurements under the Procurement Act 2023 are published on [Find a Tender](${FIND}) from 24 February 2025, including notifiable below-threshold contracts, except below-threshold notices in Scotland. [Contracts Finder](${FINDER}) still holds below-threshold notices for procurements that started under the older English rules. Scotland, Wales and Northern Ireland also use their own portals where the work sits there. The [below-threshold guidance](${BELOW}) and [section 87](${ACT}) set out when a below-threshold notice is required.`,
      `[SAM.gov](${SAM}) publishes contract opportunities from US federal contracting offices. A state, city or school district is not required to post there. Federal grants are a different list. The opportunities page points grant seekers to [Grants.gov](${GRANTS}).`,
      `A project financed by the World Bank is procured by the borrower under the [regulations that apply to that project](${WB}), and notices are published by the borrower and on the [Bank’s project pages](${WB_PROJECTS}). That is separate from the Bank buying for its own offices. The African Development Bank separates [project notices](${AFDB}) from [corporate solicitations](${AFDB_CORP}). The Asian Development Bank publishes operational procurement on [its own pages](${ADB}).`,
      `A call on the [Funding & Tenders Portal](${FT}) may be a grant or another funding procedure. Read the document before you treat it as a procurement contract.`,
    ] },
    { type: 'h2', text: 'The site where you found the notice may not take the offer' },
    { type: 'p', text: 'TED, Find a Tender or a development-bank page can be where you learn that the work exists. The upload is often on the buyer’s own portal, named in the notice. An account on the first site does not follow you to the second. Register on the submission portal while the deadline still leaves time to fix a failed login.' },
    { type: 'h2', text: 'A keyword alert is not a shortlist' },
    { type: 'p', text: 'An alert on one trade word returns notices that use the word. It does not tell you that the turnover is out of reach, or that the certificate is one you do not hold. The list you can act on is shorter. It is the notices in the field you sell, still open, whose mandatory lines you can evidence or can cover on the conditions that notice sets.' },
    { type: 'h2', text: 'Repeat this search, then stop' },
    { type: 'ul', items: [
      'Name the buyer and the regime: an EU directive, the UK Act, a US federal office, a state or city, or a bank-financed project.',
      'Open the official board for that regime, not a rewritten summary of it.',
      'From the notice, copy the submission portal, the deadline, the time and the timezone.',
      'Save the notice, any amendment, and the annex that holds the selection criteria.',
      'Check those criteria against the company before anyone starts a draft.',
    ] },
    { type: 'h2', text: 'How Tender Town finds the notice' },
    { type: 'p', text: 'Tender Town searches public procurement notices and funding programmes, including national portals, TED and development-bank notices, plus news and the sources a workspace follows. It does not file the offer. You still submit on the portal the notice names.' },
    { type: 'cta', kind: 'example' },
  ],
};

const SMALL_BUSINESS: Post = {
  slug: 'government-contracts-for-small-businesses',
  title: 'Government contracts for small businesses',
  description: 'A small company can apply to an open procedure. The notices it can win are the ones whose turnover, references and certificates it can already evidence.',
  date: '2026-10-15',
  image: '/blog/small-business.jpg',
  imageAlt: SMALL_ALT,
  blocks: [
    { type: 'p', text: 'A small company can bid when the procedure is open to economic operators and the company can evidence the selection criteria. Headcount is not the test [Directive 2014/24/EU](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02014L0024-20220101) uses. A turnover figure, a reference or a certificate is.' },
    { type: 'h2', text: 'The EU directive does not reserve contracts for small firms' },
    { type: 'p', text: `[Article 46](${DIR}) tells contracting authorities to consider dividing a contract into lots, and to state the main reasons when they do not. The notice says whether you may bid for one lot, several, or all of them, and it may cap how many lots one bidder can win. [Article 20](${DIR}) allows a reserved procedure only for sheltered workshops and operators whose main aim is the integration of disabled or disadvantaged persons, and only when at least 30 percent of the employees are disabled or disadvantaged workers. That is not a small-business set-aside. A ranking of the largest contracts is a poor map, because the selection criteria often scale with that size.` },
    { type: 'h2', text: 'A US federal set-aside changes who may bid, not the other lines' },
    { type: 'p', text: `US federal contracting officers can reserve a contract for small businesses, including socioeconomic categories, under [Small Business Administration rules](${SBA}). A set-aside narrows who may submit. It does not remove the other qualification lines in that solicitation. Size standards decide whether the company counts as small for that industry. A state or a city is not using those federal rules unless its own solicitation says so.` },
    { type: 'h2', text: 'Bid the lot whose criteria you can evidence' },
    { type: 'p', text: 'This example is fictional. A framework has an estimated value of €8 million and asks for three reference contracts of at least €1 million each. One lot, estimated at €180,000, asks for a single similar contract of at least €40,000. A company whose largest similar contract is €60,000 does not meet the framework reference line. It may meet the lot, if the notice applies that lower line to the lot rather than to the whole agreement. Read which value the criterion uses before you assemble a bid for the agreement.' },
    { type: 'p', text: `A startup with no public contract can still submit when the procedure allows any economic operator. It fails a line that demands previous contracts, or a certificate it does not hold, unless the notice allows reliance and the other entity will perform the related work. [Article 63](${DIR}) allows reliance on another entity’s professional experience only on that condition. A partner in the same trade, missing the same reference, does not change the result.` },
    { type: 'h2', text: 'What a small team should read first' },
    { type: 'ul', items: [
      'Is the procedure open, or do you have to be invited before you can send an offer?',
      'Do the selection criteria apply to the lot you want, or to the whole agreement?',
      'Which lines are mandatory, and which documents prove them?',
      'Does the notice allow another entity to cover a missing line, and must that entity do the work?',
      'Is the submission portal one the company can register on before the deadline?',
    ] },
    { type: 'h2', text: 'How Tender Town marks the line a small company can meet' },
    { type: 'p', text: 'Tender Town lists those lines from the documents on the notice, including which of them are mandatory. <fit>Fit analysis</fit> compares them with the company evidence on a scope. A reference under the stated value stays a gap.' },
    { type: 'cta', kind: 'account' },
  ],
};

const HOW_IT_WORKS: Post = {
  slug: 'how-government-tenders-work',
  title: 'How government tenders work, and who can apply',
  description: 'A public buyer publishes a notice and takes offers. You can apply when the procedure allows it and the company can evidence the selection criteria.',
  date: '2026-10-15',
  image: '/blog/how-tenders-work.jpg',
  imageAlt: HOW_ALT,
  blocks: [
    { type: 'p', text: 'A government tender is how a public buyer buys works, goods or services. You can apply when that procedure is open to economic operators and the company can evidence the selection criteria in the notice. A title that describes your work does not decide either point.' },
    { type: 'h2', text: 'The procedure decides who may submit' },
    { type: 'p', text: `Read the procedure before the description of the work. Under [Directive 2014/24/EU](${DIR}), an open procedure lets any interested economic operator submit a tender by the deadline. A restricted procedure starts with a request to participate, and only the invited operators send a full tender. Competitive dialogue, and the competitive procedure with negotiation, are for contracts the buyer cannot specify completely at the start. A framework agreement appoints suppliers, and the call-offs come later. The notice names which of these applies. Other regimes, including the UK Procurement Act 2023 for new UK procurements, use their own names for the same kind of choice.` },
    { type: 'h2', text: 'The value decides where the notice is published' },
    { type: 'p', text: `For 2026 and 2027, [Directive 2014/24/EU](${THRESHOLDS}) requires EU-wide publication when the estimated value, net of VAT, reaches €140,000 for most supplies and services bought by central government, €216,000 for sub-central authorities, and €5,404,000 for works. Social and other specific services in Annex XIV use €750,000. Those notices go to [Tenders Electronic Daily](${TED}). Utilities and defence have separate directives and different figures. Below the applicable threshold, national rules apply, and the notice often stays on a national portal.` },
    { type: 'p', text: `In the United Kingdom, new procurements under the Procurement Act 2023 are published on [Find a Tender](${FIND}) from 24 February 2025, including notifiable below-threshold contracts, except below-threshold notices in Scotland. [Contracts Finder](${FINDER}) still holds below-threshold notices for procurements that started under the older English rules. [SAM.gov](${SAM}) publishes contract opportunities from US federal contracting offices. A state, a city or a school district is not required to use it.` },
    { type: 'p', text: `A contract financed by the World Bank is procured by the borrower under the [regulations for that project](${WB}). Notices appear on the borrower’s channels and on the [Bank’s project pages](${WB_PROJECTS}). That is not the Bank buying for itself. A Horizon Europe call on the [Funding & Tenders Portal](${FT}) is a funding procedure unless the document itself is a procurement.` },
    { type: 'h2', text: 'Who the notice will accept' },
    { type: 'p', text: `The applicant is the economic operator named in the tender. Where the notice allows it, that can be a company, a partnership or a sole trader. A group may submit one tender when the procedure allows a consortium. [Article 57](${DIR}) requires exclusion for certain final convictions, including corruption and fraud, and for unpaid taxes or social security contributions established by a final decision. [Article 20](${DIR}) allows reserved contracts only for sheltered workshops and integration operators, and only when at least 30 percent of the employees are disabled or disadvantaged workers. A job advertisement is not a tender.` },
    { type: 'p', text: 'Before the deadline you need the registration the submission portal asks for, and the means of proof the notice lists. In an EU procedure the preliminary evidence is usually the European Single Procurement Document, with certificates called for from the bidders the buyer asks. The portal that takes the file is the one named in the notice. An account on TED or Find a Tender does not file the offer.' },
    { type: 'h2', text: 'Use this order on the first pass' },
    { type: 'ul', items: [
      'Procedure, submission deadline, time and timezone, and the portal that receives the file.',
      'Exclusion grounds, then selection criteria. Write down the figure, the period and the proof for each line.',
      'Whether another entity may cover a line you do not meet, and whether that entity must perform the work.',
      'Award criteria only after the mandatory lines are met, or can be met on the conditions in the notice.',
    ] },
    { type: 'p', text: `This example is fictional. A city publishes an open procedure for a three-year maintenance service with an estimated value of €400,000, net of VAT. That sits above the 2026 sub-central services threshold, so the notice is on TED. Selection asks for average annual turnover of €700,000 over three years, two similar contracts in the last five years, and ISO 9001 held by the bidder. The company has the turnover and the certificate, and one similar contract. The reference line is not met. [Article 63](${DIR}) allows reliance on another entity’s professional experience only where that entity will perform the services those references relate to, and the bidder can prove the commitment. A named partner, with no commitment and no qualifying contract, does not close the line.` },
    { type: 'h2', text: 'What the buyer does after the deadline' },
    { type: 'p', text: `A late tender is out. The buyer checks exclusion and selection, then scores the tenders that remain, on price or on price and quality as the notice states. For procedures covered by the [EU remedies rules](${REMEDIES}), the contract may not be signed until at least 10 calendar days have passed from the day after the award decision is sent electronically, with stated exceptions. A World Bank-financed contract that uses the Bank’s standard documents has a different clock: ten business days after the borrower sends the notification of intention to award, and that period does not apply to every method, including direct selection.` },
    { type: 'h2', text: 'How Tender Town keeps the notice and the lines together' },
    { type: 'p', text: 'Tender Town keeps a notice together with the documents and later changes it fetches, and lists the requirements from that file. <fit>Fit analysis</fit> compares those lines with the company evidence saved on a scope. A line the file does not cover stays unknown.' },
    { type: 'cta', kind: 'example' },
  ],
};

const CAN_BID: Post = {
  slug: 'how-to-check-if-your-company-can-bid',
  title: 'How to check if you meet the eligibility criteria on a public tender',
  description: 'Match the company to each mandatory line. A similar project, or a sentence about a certificate, does not meet a line that asks for a figure or a document.',
  date: '2026-10-15',
  image: '/blog/eligibility-line.jpg',
  imageAlt: ELIGIBILITY_ALT,
  blocks: [
    { type: 'p', text: 'You meet the eligibility criteria when the company can evidence every mandatory selection line in the notice. A matching title, sector or buyer does not do that. If one mandatory line is missing, and the notice does not let another entity cover it on the conditions it states, the buyer can reject the offer before scoring.' },
    { type: 'h2', text: 'Separate exclusion, selection and award' },
    { type: 'p', text: `Exclusion grounds ask whether the operator may take part at all. Under [Article 57 of Directive 2014/24/EU](${DIR}), that includes certain final criminal convictions and unpaid taxes or social contributions established by a final decision. Selection criteria ask whether the operator can perform this contract: turnover, insurance, references, staff and certifications. Award criteria score the tenders that get through. A quality score does not repair a failed selection line.` },
    { type: 'h2', text: 'Read turnover as a figure, with a legal cap in EU procedures' },
    { type: 'p', text: `[Article 58(3)](${DIR}) lets a buyer require a minimum yearly turnover, including turnover in the field of the contract. In procedures covered by that directive, the minimum yearly turnover shall not exceed twice the estimated contract value, except in duly justified cases, and the buyer must give the main reasons in the procurement documents or the procurement report. That is a limit on what the buyer may demand. It is not a figure you can assume. Some notices use an average of three years. Some use only the field of the contract. Below the EU thresholds, national rules can differ, so use the notice in front of you.` },
    { type: 'p', text: `Turnover from a parent counts only where the notice lets you rely on that entity. For economic and financial standing, [Article 63](${DIR}) says the buyer may require the bidder and that entity to be jointly liable for performing the contract. A group chart is not that commitment.` },
    { type: 'h2', text: 'A reference is the contract, not the story of it' },
    { type: 'p', text: 'The buyer sets how many contracts, how recent, what kind of client and the minimum value. A project below that value, or for a different kind of client, does not meet the line, however close the work was. The proof is the document the notice names, often a certificate of completion or a client confirmation with dates and value. A description of how the work went is not that document.' },
    { type: 'h2', text: 'A certificate is a document in force, in the right name' },
    { type: 'p', text: `If the notice names a quality, environmental or security scheme, the certificate has to be that scheme, in force, and held by the legal entity the criterion points to. [Article 62](${DIR}) points buyers who ask for a quality or environmental system towards certificates from accredited bodies, with room for equivalent measures where the article allows them. Writing that the company works to the standard does not meet a line that asks for the certificate. An expired certificate does not meet it either.` },
    { type: 'h2', text: 'Mark every line, then decide whether a partner can close it' },
    { type: 'ul', items: [
      'Meets: the file shows the figure, the contract or the certificate the line asks for.',
      'Partially meets: some of the evidence is there, and a stated part is not.',
      'Partner needed: the notice allows another entity to cover this line, and you can name who would, on the conditions the notice sets.',
      'Does not meet: the evidence contradicts the line, or the notice does not allow anyone else to cover it.',
      'Unknown: the company file is silent. Unknown is not a match.',
    ] },
    { type: 'p', text: 'For professional experience, Article 63 allows reliance only where the other entity will perform the works or services that experience relates to. You have to prove the commitment, for example with a written undertaking. A partner in the same trade, missing the same reference, does not change the result. A suggested name is not that undertaking.' },
    { type: 'p', text: 'This example is fictional. The notice requires three contracts, each worth at least €2 million, completed in the last three years for a public client. The company has two contracts. The larger is €1.4 million, and the client was private. That line does not meet. A second company with one public contract of €2.2 million could matter only if the notice allows reliance for that experience and that company will perform the related part of the work. Without both, the status stays "does not meet". If the accounts on file do not state turnover for the years the notice asks for, that line is unknown, not a pass.' },
    { type: 'h2', text: 'How Tender Town marks each mandatory line' },
    { type: 'p', text: '<fit>Fit analysis</fit> sets each requirement taken from the notice against the company evidence on the scope, and it leaves a silent line unknown. A proposal brief, on a plan that includes one, is written from that evaluation and keeps the lines that are not met.' },
    { type: 'cta', kind: 'example' },
  ],
};

const THREE_SKILLS: Post = {
  slug: 'three-skills-for-an-ai-agent-on-a-public-tender',
  title: 'Three skills an AI agent needs on a public tender',
  description: 'Give the agent the company evidence first, then a check of each requirement, and only then a draft. A keyword match supplies none of the three.',
  date: '2026-10-15',
  image: '/blog/three-skills-steps.jpg',
  imageAlt: STEPS_ALT,
  blocks: [
    { type: 'p', text: 'An agent can help on a public tender when it has the company evidence, a check of each requirement against that evidence, and a draft that starts only after the gaps are known. Finding notices that share your industry words does not answer whether the company can bid.' },
    { type: 'h2', text: 'Save what the company can show before you trust the search' },
    { type: 'p', text: '<configure>Configure a scope</configure> is the file later steps may use: what you sell, where you bid, the certificates, and the reference projects with their clients, dates and values. A line that is not in that file stays unknown. Unknown is not a match. The agent should not invent a certificate, a turnover or a person to fill the silence.' },
    { type: 'h2', text: 'Check each requirement before anyone writes' },
    { type: 'p', text: `Give the agent the official notice, the amendments and the annex that holds the selection criteria, not the title alone. <fit>Fit analysis</fit> sets each requirement against the saved file. A reference below the value in the notice stays a gap, however similar the work was. Where [the rules](${DIR}) allow another entity to cover professional experience, that entity has to perform the related work, and the report should name that condition rather than a general suggestion to team up.` },
    { type: 'p', text: 'The verdicts are bid, bid with a partner, consider, or no bid. Consider means open questions still decide it. It is not a pass. A mandatory line that the company cannot meet, and that a partner is not allowed to meet, is a reason not to draft.' },
    { type: 'h2', text: 'Draft only after that verdict, and keep the gap' },
    { type: 'p', text: '<proposal>Proposal draft</proposal> waits until an evaluation exists for the same scope and tender. Proposal briefs are on Teams. The brief should still show the unmet line and the evidence that was missing. It is a working note for the bid team. It is not sent to the buyer, and it does not turn a missing certificate into a paragraph about quality.' },
    { type: 'p', text: 'That order is the whole job. Put the evidence in the file, mark each line, and write only when the mandatory lines are met or can be met on the conditions in the notice.' },
    { type: 'h2', text: 'How Tender Town runs that order' },
    { type: 'p', text: 'Tender Town keeps the company file on a scope, marks each requirement against that file, and writes a proposal brief only after the evaluation. The brief keeps the unmet lines. It does not file the offer.' },
    { type: 'cta', kind: 'agents' },
  ],
};

const CHAT_GPT: Post = {
  slug: 'why-llms-fall-short-on-government-tenders',
  title: 'Why LLMs fall short on government tenders, and how to make them useful',
  description: 'An LLM can summarise a notice you paste in. It becomes useful on a bid with the company file, each line checked, and a draft that starts only after the gaps.',
  date: '2026-10-15',
  image: '/blog/chatgpt-radar.jpg',
  imageAlt: CHAT_ALT,
  blocks: [
    { type: 'p', text: 'A general LLM can summarise a notice you paste in, and it can suggest how to describe the company. It falls short of a bid until the boards for your market are checked, later amendments are read, and the selection lines in an annex are in the prompt. Give it those three before anyone drafts, and it can be useful.' },
    { type: 'h2', text: 'One reply is not a watch on the boards' },
    { type: 'p', text: `[TED](${TED}), a national portal, [Find a Tender](${FIND}), [SAM.gov](${SAM}) and a development-bank site are different boards, and a notice can be on only one of them. A chat answers from the text in the conversation and from pages it opened in that sitting. It does not, as part of that reply, check those boards again tomorrow. A title, a buyer and a deadline in the answer still have to be opened on the official notice. If that notice was not retrieved, the details are unsupported.` },
    { type: 'h2', text: 'The annex is where offers are rejected' },
    { type: 'p', text: 'The title and the short description are the pages a chatbot summarises well. Selection usually sits further in: a turnover figure, sometimes an average of stated years and sometimes only the field of the contract; a reference above a set value, for a set kind of client, finished inside a set period; a certificate in force, in the company’s name. Similar work under the figure does not clear the reference. A sentence about a quality system is not the certificate. Leave the annex out of the paste and it is out of the analysis, while the reply can still sound finished.' },
    { type: 'h2', text: 'Do not let the model fill a hole in the company file' },
    { type: 'p', text: `If the prompt describes the company in a paragraph, that paragraph is the file the model has. A certificate you did not mention should stay unknown. A project under the minimum should stay under the minimum. A larger firm in the same sector is not yet a partner. Under [Article 63 of Directive 2014/24/EU](${DIR}), reliance on another entity’s professional experience is allowed only where that entity will perform the related work, and you can prove you will have the resources. A suggested name proves neither.` },
    { type: 'h2', text: 'Give the agent three skills, in this order' },
    { type: 'p', text: 'A paragraph in the prompt is not a procedure. Give the agent these three skills, and do not let it draft before the first two are done.' },
    { type: 'ul', items: [
      '<configure>Configure a scope</configure> first: what you sell, where you bid, the certificates, and the reference projects with their clients, dates and values. A line that is not in that file stays unknown. Unknown is not a match.',
      'Then <fit>fit analysis</fit>, on the official notice, the amendments and the annex that holds the selection criteria. Each requirement is set against that file. A project under the minimum stays a gap. Where the notice allows another entity to cover professional experience, that entity has to perform the related work.',
      '<proposal>Proposal draft</proposal> starts only after that evaluation exists for the same scope and tender. The brief keeps the unmet lines. It is a note for the bid team. It is not sent to the buyer. Proposal briefs are on Teams.',
    ] },
    { type: 'h2', text: 'How Tender Town makes the model useful' },
    { type: 'p', text: 'Tender Town is the platform that runs that order. It scouts public tenders, grants and funding calls from procurement portals, TED and development banks, and it keeps signals that a named buyer has announced a procurement that is not open yet. A pipeline runs every four hours, and each scope refreshes as often as its plan allows, so the check continues after the chat is closed. On a notice it has collected, it fetches the documents, lists the requirements, scores the fit against the company evidence on the scope, and prepares a proposal brief from that evaluation. It does not file the offer.' },
    { type: 'cta', kind: 'agents' },
  ],
};

export const BLOG_LEAD = 'How to find a government notice, check whether you can bid, and draft only after the gaps are known.';

export const posts: Post[] = [CHAT_GPT, SMALL_BUSINESS, WHERE_TO_FIND, WORTH_IT, HOW_IT_WORKS, CAN_BID, THREE_SKILLS];

export function postBySlug(slug: string) {
  return posts.find((post) => post.slug === slug) ?? null;
}
