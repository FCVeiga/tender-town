/** How-to notes. English is the key; translations live in messages/blog.json. */

export type PostBlock =
  | { type: 'h2'; text: string }
  | { type: 'p'; text: string }
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

export const BLOG_LEAD = 'Notes on finding tenders, scoring a fit and drafting a bid.';

export const posts: Post[] = [CAN_BID, THREE_SKILLS];

export function postBySlug(slug: string) {
  return posts.find((post) => post.slug === slug) ?? null;
}
