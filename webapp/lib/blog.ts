/** How-to notes. English is the key; translations live in messages/blog.json. */

export type PostBlock =
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'img'; src: string; alt: string };

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
const CHAT_FLOW_ALT = 'One path turns a notice into a single checked reply. The other splits it into a tick, a cross, two people, and a blank slip.';

const WORTH_IT: Post = {
  slug: 'are-government-tenders-worth-it',
  title: 'Are government tenders worth it?',
  description: 'The contract pays. The loss is a bid written for a notice the company cannot meet.',
  date: '2026-10-14',
  image: '/blog/worth-it.jpg',
  imageAlt: WORTH_ALT,
  blocks: [
    { type: 'p', text: 'A government contract is paid work. The buyer has already decided to spend the money, the page is signed, and the job often runs for more than a year. A framework is better still: you are appointed, and the orders come afterwards, sometimes for several years. That is the part worth having.' },
    { type: 'p', text: 'The bid itself pays nothing. The days go into reading, pricing and writing, and the offer can still be unread, because one line in the notice was missed. Whether a tender is worth it is decided there, before anyone scores the price.' },
    { type: 'h2', text: 'The loss is a bid you were never going to win' },
    { type: 'p', text: 'The title can describe your work exactly, and the buyer can be one you would like on the books. None of that gets the file read. The buyer checks eligibility first. A company under the turnover figure, or with a reference below the minimum value, or without the certificate, is out before scoring starts. Bidding more notices of the same kind does not repair the line. It multiplies the cost.' },
    { type: 'img', src: '/blog/worth-it-flow.jpg', alt: WORTH_FLOW_ALT },
    { type: 'p', text: 'The clock makes this sharper. Some of the delay is paperwork you do once: the registered company, the accounts, the certificates, and a login on the portal that actually takes the offer. The rest is the buyer’s clock. Questions, the deadline, the eligibility check, then the scoring. A company that bids the first familiar title waits that out and learns the answer at the end. A company that reads the lines first spends the same weeks on a notice it can finish.' },
    { type: 'p', text: 'A notice is worth a bid when every mandatory line is one you can show today, the price you would need to win still leaves a margin, and a complete offer can be filed before the deadline rather than on the evening it closes. If one line is missing, the notice has to let a partner cover it, and that partner has to have it already. The lines that usually decide it are <check>a turnover, a reference project and a certificate</check>.' },
    { type: 'h2', text: 'Tender Town says whether the notice is worth a bid, before anyone writes' },
    { type: 'p', text: 'The expensive mistake is opening a draft because the title sounded like the company. Tender Town fetches the notice and the documents behind it, and lists the requirements with the figures still attached: the turnover, the reference value, the certificate, and whether each line is mandatory. <fit>Fit analysis</fit> then sets those lines against the company you describe. A line the file does not cover stays unknown. A similar project is not promoted into a reference that clears the minimum. Where another company could close a line, the report names what they have to bring.' },
    { type: 'p', text: 'The verdict comes back before the writing: bid, bid with a partner, worth a closer look, or no bid. <account>Create an account</account>, choose the field you sell in, and the deadline goes on the notices that can pay.' },
  ],
};

const WHERE_TO_FIND: Post = {
  slug: 'where-to-find-government-contracts',
  title: 'Where to find government contracts to bid on',
  description: 'No single website has them. Each board has a slice, and the place you submit is often a different site.',
  date: '2026-10-14',
  image: '/blog/where-to-find.jpg',
  imageAlt: FIND_ALT,
  blocks: [
    { type: 'p', text: 'People look for one website of government contracts. There isn’t one. A ministry in one country, a hospital in another, and a development bank funding a third each publish on the board their own rules point to. You can search the board you know, carefully, and miss the contract, because it was never going to be posted there.' },
    { type: 'h2', text: 'Each board holds a different slice' },
    { type: 'p', text: 'In the EU, higher-value notices go on Tenders Electronic Daily, and smaller jobs stay on a national portal. The UK splits the same way under different names. Find a Tender carries the higher-value notices, and Contracts Finder carries the lower-value ones in England. They are not the same service. Scotland, Wales and Northern Ireland publish on their own boards. In the United States, SAM.gov is the federal board. A state, a city or a school district is not on it. The World Bank, the African Development Bank and the Asian Development Bank publish on theirs, so a search that only watches TED never sees them.' },
    { type: 'p', text: 'Grants sit somewhere else again. A Horizon Europe call is not a procurement notice, and it will not turn up because a tender portal was bookmarked. Finding the notice and filing the offer are often two sites as well. You can read the work on TED, or on Find a Tender, and still have to upload the offer on the buyer’s own portal, the one named in the notice. A login on the site where you found the contract does not follow you there.' },
    { type: 'h2', text: 'A keyword alert is a pile, not a shortlist' },
    { type: 'p', text: 'An alert on one trade word returns every notice that uses it. The right work is in there, and so is the adjacent work, and the work that only shares a noun. The alert will not tell you that the turnover is out of reach, or that the certificate is one you do not hold. The list you can act on is shorter. It is the notices in your field, still open, that the company can meet.' },
    { type: 'h2', text: 'Tender Town searches the boards, then triages what is actually your work' },
    { type: 'p', text: 'The search is wide on purpose. Tender Town looks across TED, the web, the news, the sources you choose to follow, the grants and the development-bank boards, and it looks again on a schedule. A notice published after you closed the laptop is not lost. Width is the point of that first pass. A keyword would stop there, and hand you the pile.' },
    { type: 'p', text: 'A triage agent does the next pass, tuned to the company: what you sell, where you bid, and what looks similar and is out. It scores each find against that, not against a word in the title, and what remains is a page you can open. On that page the documents have been fetched, the notice together with the conditions, the specifications, the forms and the questions and answers. A clarification that appears later shows up as an update. You still submit on the portal the notice names. You stop hunting one board at a time to learn that the work exists. <account>Create an account</account> and choose the field you sell in.' },
  ],
};

const SMALL_BUSINESS: Post = {
  slug: 'government-contracts-for-small-businesses',
  title: 'Government contracts for small businesses',
  description: 'A small company can apply. The contracts that pay are the ones its turnover, references and certificates already clear.',
  date: '2026-10-14',
  image: '/blog/small-business.jpg',
  imageAlt: SMALL_ALT,
  blocks: [
    { type: 'p', text: 'A small company can bid for a government contract. So can a sole trader, and a startup that has never held a public contract. An open procedure does not ask how many people you employ. It asks whether you can prove the lines in the notice. Size is not what throws the offer out. A line is.' },
    { type: 'h2', text: 'The contract that pays is the one you already fit' },
    { type: 'p', text: 'The useful notice is a lot sized to your turnover, not the whole framework. It asks for work you have already finished for a similar client, at a value the notice accepts, and for a certificate you hold today, in force, in the company’s name. The deadline is one you can meet with the people you already have. Anything larger is a week of assembly for an offer that will not be read.' },
    { type: 'p', text: 'A large framework is the usual trap. It asks for several reference contracts, each above a floor a small project does not clear, however good the work was. Turnover from a parent counts only when the notice lets you rely on that company, and that company is in the bid. Two companies can bid as one when a consortium is allowed, and each can cover a different line. A partner in the same field, missing the same line, changes nothing.' },
    { type: 'p', text: 'A startup with no public contract may still submit. It will fail a line that demands previous public contracts, or a certificate it has not got. The routes that work are a notice that does not ask for those, a partner who already has them, or a subcontract the notice allows.' },
    { type: 'p', text: 'Lists of the biggest contracts are the wrong map. The largest is the one a small company most often cannot evidence. Set-asides, where a country reserves some work for small firms, narrow who may bid, and they do not remove the eligibility lines. A keyword that matches the industry can land you on a perfect title and an offer that is never read. The lines to read first are <check>a turnover, a reference project and a certificate</check>.' },
    { type: 'h2', text: 'Tender Town keeps a small team on the notices it can evidence' },
    { type: 'p', text: 'A small team cannot read every framework that shares its industry. Triage on Tender Town is tuned to what you sell and what you cannot show, so a lookalike, and a contract built for a much larger firm, fall down the list before anyone opens them. On the notices that stay, the documents are fetched and the requirements are listed the way a bidder would mark them: the turnover figure, how many references and of what value, the certificate, and which of those lines are mandatory.' },
    { type: 'p', text: '<fit>Fit analysis</fit> sets that list against the company. A reference under the floor stays a gap. A certificate you do not hold stays a gap. Where a partner could close one line, the report says which line, and what they have to bring. The verdict is bid, bid with a partner, worth a closer look, or no bid, and it arrives before a deadline is spent writing. <account>Create an account</account>, choose the field you sell in, and the next week of work goes on a notice a small company can actually evidence.' },
  ],
};

const HOW_IT_WORKS: Post = {
  slug: 'how-government-tenders-work',
  title: 'How government tenders work, and who can apply',
  description: 'A public buyer publishes a notice and takes offers. A registered company can apply. The lines in that notice decide whether the offer is read.',
  date: '2026-10-14',
  image: '/blog/how-tenders-work.jpg',
  imageAlt: HOW_ALT,
  blocks: [
    { type: 'p', text: 'A government tender is the way a public buyer buys. A ministry, a hospital, a city or a development bank writes down what it needs, publishes a notice, and takes offers. The contract goes to the offer that meets the rules and scores best.' },
    { type: 'h2', text: 'The notice is the whole process' },
    { type: 'p', text: 'The title is the least useful line in it. What decides whether you can apply is the value, the procedure and the deadline, and then the requirements sitting under them. Under a set value the buyer can buy with little advertising, or with none. Above that value the notice has to be public, so a company that was never invited can still see the work and ask to bid.' },
    { type: 'p', text: 'Where it is published depends on who is buying, and for how much. In the EU, higher-value notices go on Tenders Electronic Daily, and below those values the notice stays on a national portal. The UK uses Find a Tender and Contracts Finder. The United States uses SAM.gov for federal work. The World Bank and the other development banks publish on their own boards. There is no list called government tenders. Looking for that phrase means looking across all of these.' },
    { type: 'h2', text: 'The procedure decides who may send an offer' },
    { type: 'p', text: 'The notice names the procedure, and that line is worth reading before the scope of the work. In an open procedure, any company that meets the criteria may submit by the deadline. In a restricted procedure you ask to take part first, and only the invited companies send a full offer. Negotiation and competitive dialogue are for work the buyer cannot specify completely at the start. A framework appoints suppliers, and the orders come later. The job is not awarded once.' },
    { type: 'p', text: 'After that, the order is much the same wherever you bid. The notice is published, and questions are answered to every bidder, not only to the one who asked. Offers are in by the deadline, and a late file is out. The buyer checks who is eligible, and only then scores what is left, on price or on price and quality together. An award notice follows. A standstill often sits between the decision and the signed contract, so a bidder who lost can object.' },
    { type: 'h2', text: 'Who can apply, and who is already out' },
    { type: 'p', text: 'Who applies is the company, not the person who found the notice. A limited company, a partnership, a sole trader, or a startup with no public contract yet can apply when the notice is open to economic operators. A company established in the EU can bid in another member state once the contract is large enough for the EU rules. Two companies can bid as one when the notice allows a consortium, and they share the accounts, the references and the certificates on the lines the notice permits.' },
    { type: 'p', text: 'Some applicants are out before any scoring. Staff of the buyer running the tender should not bid. A company that helped draft the specification is normally excluded, because it helped write the test. Fraud, corruption or unpaid tax is a bar. A job in a public body is not an application either. If you own a separate company, and that buyer is not your employer, you apply as the company, and you still have to meet every line.' },
    { type: 'p', text: 'Before the deadline you need a registered business, a login on the portal where the offer is actually uploaded, and the papers the notice lists. That login is often on a different site from the one where you saw the notice. The papers are a declaration that the company is not excluded, a turnover, the reference contracts, the certificates and the insurance. The lines that throw a company out are usually <check>a turnover, a reference project and a certificate</check>. Miss one and the offer is not read.' },
    { type: 'h2', text: 'Tender Town reads the notice in the order a bid is decided' },
    { type: 'p', text: 'The hard part of a first tender is not the idea of applying. It is finding the procedure, the deadline and the lines that decide eligibility, which are spread across the notice and the annexes. Tender Town fetches those documents and reads them the way an experienced bidder marks a file on a first pass. The requirements come out as separate lines: who may bid, the references, the people, and the work itself, each with the threshold and the proof the buyer asked for. A line that gets you excluded stays apart from a line that is only scored.' },
    { type: 'p', text: '<fit>Fit analysis</fit> then sets those lines against the company you describe, before anyone writes. The verdict is bid, bid with a partner, worth a closer look, or no bid. <account>Create an account</account>, choose the field you sell in, and you see how a real notice runs, instead of a title.' },
  ],
};

const CAN_BID: Post = {
  slug: 'how-to-check-if-your-company-can-bid',
  title: 'How to check if you meet the eligibility criteria on a public tender',
  description: 'The notice can match your work and you can still be out. Turnover, a reference project and a certificate are the lines that decide it.',
  date: '2026-10-14',
  image: '/blog/eligibility-line.jpg',
  imageAlt: ELIGIBILITY_ALT,
  blocks: [
    { type: 'p', text: 'A tender can describe your work perfectly and still be closed to the company, because the company does not meet the eligibility criteria. The title, the sector and the buyer do not answer that. Eligibility is a set of lines, and the company has to meet all of them before anyone scores the offer. Miss one and the proposal does not get read.' },
    { type: 'p', text: 'The lines that knock a company out are a turnover, a reference project and a certificate. Turnover is a figure, not a sense that the company is solid. The notice names the minimum. A buyer may require a minimum yearly turnover, and that minimum is not supposed to exceed twice the estimated value of the contract unless the buyer justifies a higher bar. Some notices want the average of the last three years. Some want only the turnover in the field of the contract. A healthy company under the figure does not meet the line. Turnover from a parent, or from another company in the group, counts only when the notice lets you rely on that company and that company is in the bid.' },
    { type: 'p', text: 'A reference project is the same kind of test. The buyer asks for similar contracts, finished inside a set period, each worth at least a set amount. A floor of €1 million is a normal one to meet. The project you are proud of at €400,000 does not clear it, however close the work was. A private contract does not clear a line that asks for a public client. What belongs in the file is the client, the dates and the value. A description of how well it went is not the reference.' },
    { type: 'p', text: 'A certificate is a document, not a sentence. ISO 9001, ISO 27001, or a scheme the buyer names. It has to be in force, and it has to be held by the company the notice points at. Writing that you work to the standard does not meet it. A certificate that has run out does not meet it either.' },
    { type: 'p', text: 'When the company fails one of these, the next question is whether another company meets that line, and whether the notice lets you rely on them. The accounts, the contract or the certificate of that company have to sit in the bid against the criterion you missed. A partner in the same sector, with none of those three, changes nothing. Some lines the buyer reserves for the bidder itself, and turnover is a common one. A partner cannot cover those.' },
    { type: 'p', text: 'This is the check an agent skips when it is asked to find tenders and write the proposal. The industry words match, so it treats the company as eligible and drafts from there. <fit>Fit analysis</fit> runs the check first. It sets each eligibility line against the company material already saved: the turnover you can show, the reference projects and their value, the certificates you hold. Where that material is silent, the line stays unknown. It will not fill in a turnover or a certificate the file does not contain. A reference under the minimum stays a gap. Where another company could close a line, it names who has to: the one who holds the certificate, the one with the project above the threshold, the one with the turnover. The verdict comes back before any writing — bid, bid with a partner, worth a closer look, or no bid. <proposal>Proposal draft</proposal> starts only after that verdict, and the brief keeps the line you do not meet.' },
  ],
};

const THREE_SKILLS: Post = {
  slug: 'three-skills-for-an-ai-agent-on-a-public-tender',
  title: 'Three skills an AI agent needs on a public tender',
  description: 'Finding tenders in your industry is the easy part. The bid turns on one line of eligibility, and on the partner who can cover it.',
  date: '2026-10-13',
  image: '/blog/three-skills-steps.jpg',
  imageAlt: STEPS_ALT,
  blocks: [
    { type: 'p', text: 'Finding a public tender in your industry is not the hard part. The right keywords, a portal and an alert already surface notices that look like your work. The title matches. Someone on the team says it looks like you.' },
    { type: 'p', text: 'The bid is decided further down, in eligibility, on lines that look small. An ISO certification. A reference project with a minimum budget of €1 million. In a long notice they read like formalities. They are the lines that throw you out. Miss one and the rest of the proposal does not matter.' },
    { type: 'p', text: 'If you cannot show that line, you need a partner who can. Not another company in the same sector. A company that holds the certificate, or that can put a project of that size on the table. Most teams find the gap after the draft has started. An agent asked to find tenders and write the proposal does the same thing faster. It matches the industry words and writes as if the line were already covered.' },
    { type: 'p', text: 'Three skills, handed to the agent you already use, keep the work on those lines. Tender Town is a public index of tenders, grants and market news. The skills are how an agent reads one notice against your company, not against a keyword list.' },
    { type: 'p', text: '<configure>Configure a scope</configure> comes first, and it is not another search. You tell the agent what the company sells, where it bids, and what it can actually show: the certificates, the reference projects, the countries. Later steps may only use that file. What is not in it stays unknown.' },
    { type: 'p', text: '<fit>Fit analysis</fit> is the reading that matters. It takes one notice and checks each eligibility line against that file. An ISO you do not hold stays a gap. A reference below the minimum budget is not relevant experience. When the line is real and you cannot cover it, the skill names the partner who would: who brings the certificate, who brings the million-euro project. The verdict is bid, bid with a partner, worth a closer look, or no bid. A mandatory line that nobody can cover is a reason to walk away.' },
    { type: 'p', text: '<proposal>Proposal draft</proposal> waits until that verdict exists. The brief the team opens still shows the gap and the partner. It does not turn a missing certificate into a paragraph about quality, and it is not sent to the buyer.' },
    { type: 'p', text: 'That is the job. Find the line that can throw the bid out, name the partner who closes it, and only then write.' },
  ],
};

const CHAT_GPT: Post = {
  slug: 'why-chatgpt-is-a-bad-way-to-find-government-tenders',
  title: 'Why ChatGPT is a bad way to find government tenders',
  description: 'The reply looks like a radar. The notices you never opened, and the line that would throw the offer out, are still missing.',
  date: '2026-10-14',
  image: '/blog/chatgpt-radar.jpg',
  imageAlt: CHAT_ALT,
  blocks: [
    { type: 'p', text: 'Paste what the company sells into ChatGPT and ask for tenders in that line of work. Then paste a notice and ask whether to bid. The reply comes back tidy, specific, and sure of itself: a few opportunities, a summary, a suggestion for how to position the experience. It feels like being on top of the market. Any general chatbot does this. The sureness is the problem, because most of the work that decides a bid never happened.' },
    { type: 'h2', text: 'A chat answers once, and calls that a radar' },
    { type: 'p', text: 'A radar checks the boards again tomorrow. A chat answers from the text you pasted, or from the handful of pages it opened in that sitting, and then it stops. Those pages are a slice. TED, a national portal, Find a Tender, SAM.gov and a development bank are different boards, and opening one leaves the others dark. A notice in the reply can be one the model never opened. A plausible title, a buyer and a deadline, written because a helpful answer is supposed to contain tenders. You close the laptop feeling covered. Everything published after that reply, and everything on a board the chat did not visit, is still under it.' },
    { type: 'h2', text: 'Tender Town triages the sources for what you sell, not for a keyword' },
    { type: 'p', text: 'The first job is to see the notices, including the ones you would not have thought to open. Tender Town searches widely, and on a schedule: TED, the web, the news, the sources you follow, grants and funding calls, and the development-bank boards. That pass is built to miss as little as possible. A keyword alert does the opposite. It returns every notice that shares a noun, and stops.' },
    { type: 'p', text: 'What makes the list usable is the triage after the search. The agent is tuned to the company: what you sell, the countries you bid in, and what looks similar and is out. It reads each find against that and keeps the ones that are actually the work, rather than the ones that mention the industry. A lookalike falls away. What you open is a real notice, a page on the site, not a title composed to finish the answer. And because the search runs again, a notice published tonight is in the next pass, instead of in nobody’s chat.' },
    { type: 'h2', text: 'The title is what a chatbot is good at' },
    { type: 'p', text: 'The title and the description of the work are the easy pages, and a chatbot summarises them well. The offer is thrown out further down. On a turnover figure, sometimes the average of three years, sometimes only the turnover in the field of the contract. On a reference above a set value, for a set kind of client, finished inside a set period. On a certificate in force, in the company’s name. Similar work under the figure does not clear the reference. A sentence about a quality system is not the certificate.' },
    { type: 'p', text: 'Those lines usually sit in an annex, a specification or a form, often in the buyer’s language. Leave that document out of the paste and it is out of the analysis. The reply still arrives, just as sure, and now it is a plan built on the pages the chat happened to see.' },
    { type: 'h2', text: 'Tender Town fetches the documents and pulls every requirement out of them' },
    { type: 'p', text: 'A bidder does not analyse a tender from the notice summary. They collect the file: the conditions, the specifications, the forms that list the proofs, the questions and answers, and any clarification that arrives later. Tender Town does that collection. The documents are fetched with the notice, and a new file, a corrigendum, a Q&A or a revised specification, shows up as an update rather than as something you hear about from someone else who bid.' },
    { type: 'p', text: 'A separate analysis then reads that text, in the buyer’s language, and does the job an experienced bidder does on a first pass. It does not write a theme. It lists every requirement, and it keeps the groups apart.' },
    { type: 'ul', items: [
      'Eligibility: who may bid, the turnover, the insurance, the certificates, and the rules on a consortium or a subcontract.',
      'References: how many, how recent, what size, and what has to be shown.',
      'People: the roles, the years, the CVs, the clearances.',
      'The work: what has to be delivered, and to which standard.',
    ] },
    { type: 'p', text: 'Each line keeps its threshold, whether it is mandatory, and the evidence the buyer wants filed. A line that is only scored is not dressed up as a line that gets the offer thrown out. This is the part a chatbot skips, because the summary already sounded complete.' },
    { type: 'h2', text: 'A helpful model fills the hole' },
    { type: 'p', text: 'In the prompt, the company is a paragraph, and the model treats the paragraph as the file. A certificate you never mentioned comes back as a quality system you could describe. A project under the minimum is called relevant experience, because the work was similar. Asked for a partner, it suggests a larger firm in the same sector. Asked to draft, it drafts. The writing and the decision arrive in the same reply, so the team is already spending days on a notice that fails one line.' },
    { type: 'img', src: '/blog/chatgpt-radar-flow.jpg', alt: CHAT_FLOW_ALT },
    { type: 'p', text: 'The useful answer is stricter. It names the line, and the thing that closes that line. Who holds this certificate. Who can put a project of the value the notice asks for on the table. Who has the turnover, and only when the notice lets another company cover that line. Some lines the buyer keeps for the bidder. Turnover is a common one, and a partner cannot close those. Where the file says nothing, the honest status is unknown. Filling the silence is how a gap becomes a plan.' },
    { type: 'h2', text: 'Tender Town scores each requirement against the company, then stops' },
    { type: 'p', text: '<fit>Fit analysis</fit> takes the requirements pulled from the documents and sets each one against the company material you saved. The turnover you can show, the references and their value, the certificates in force, the people. It will not fill in a figure the file does not contain. A mandatory line you cannot meet, and that a partner is not allowed to meet, caps the fit. Where someone else could close a line, the report names what they have to bring, for that line, not as a general suggestion to team up.' },
    { type: 'p', text: 'The verdict comes back before any draft: bid, bid with a partner, worth a closer look, or no bid. The <proposal>proposal draft</proposal> starts only after that, and the gap stays written in the brief. <account>Create an account</account>, describe the company once, and the next notice is triaged, documented and set against what you can actually prove.' },
  ],
};

export const BLOG_LEAD = 'Notes on finding tenders, scoring a fit and drafting a bid.';

export const posts: Post[] = [CHAT_GPT, SMALL_BUSINESS, WHERE_TO_FIND, WORTH_IT, HOW_IT_WORKS, CAN_BID, THREE_SKILLS];

export function postBySlug(slug: string) {
  return posts.find((post) => post.slug === slug) ?? null;
}
