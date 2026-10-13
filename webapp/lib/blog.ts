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

export const posts: Post[] = [THREE_SKILLS];

export function postBySlug(slug: string) {
  return posts.find((post) => post.slug === slug) ?? null;
}
