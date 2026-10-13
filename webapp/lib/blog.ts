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
  description: 'How an agent should find a notice, score the company fit, and draft the brief. The Tender Town skill for each step.',
  date: '2026-10-13',
  image: '/blog/three-skills-steps.jpg',
  imageAlt: STEPS_ALT,
  blocks: [
    { type: 'p', text: 'An agent told to find tenders and write the proposal will search the open web, guess the requirements, and draft from a blank page. A public tender does not work like that. The notice has a page. The fit is a comparison with what the company can show. The draft comes after that comparison, and the gaps stay in it.' },
    { type: 'p', text: 'Three skills cover the work. Tender Town publishes each one, so you can hand it to the agent you already use.' },
    { type: 'h2', text: 'Find the notice, and quote its page' },
    { type: 'p', text: 'Search is the first skill. The agent queries a procurement index and returns the page for that notice. On Tender Town that page is /tenders/{id} for a tender or a grant, and /news/{id} for a news item. The agent quotes that page. If it cannot point at one, it does not have a notice.' },
    { type: 'p', text: 'A search with no account already reads the public index. It is not filtered to one company. After you sign the agent in, <configure>Configure a scope</configure> sets the radar to what the company sells, the countries it bids in, and what to leave out. Saving those instructions does not fetch notices immediately. Search runs on the plan’s schedule: once a day on Free, twice on Starter, three times on Pro, six times on Teams. Until the next run, the agent uses public search and says so.' },
    { type: 'p', text: 'Refuse anything the page does not contain: a buyer, a deadline, a budget, a reference number.' },
    { type: 'h2', text: 'Score the fit before anyone writes' },
    { type: 'p', text: 'The second skill is a fit score, not a hunch. The agent reads each requirement and compares it with the company material already saved on the scope. The status is one of five: the company meets it, meets part of it, needs a partner, does not meet it, or the material does not say. The last one is unknown. Unknown is not a match. Do not assume a certificate, a turnover figure, or a reference the material does not state.' },
    { type: 'p', text: 'If a requirement is better covered by a partner, say so. The verdict can be bid, bid with a partner, consider, or no bid. A mandatory requirement the company cannot meet, and that a partner cannot cover, is a reason not to bid. If the material is thin, stop before spending a run.' },
    { type: 'p', text: '<fit>Fit analysis</fit> is that procedure. It starts on Starter, one run a month. Pro includes five. Teams includes unlimited runs. Free does not include it. When the month is used, the agent says so and does not run another.' },
    { type: 'h2', text: 'Draft from the score' },
    { type: 'p', text: 'The third skill writes the brief the bid team starts from. It runs only after an evaluation exists for that tender on that scope. It keeps the sections a bid needs: summary, dates, criteria, eligibility, references, requirements, documents to submit, gaps, and next steps. It proposes an answer only from the company material. Where the material is silent, it marks a gap or names the partner role. It does not invent a certificate, a project, a person, a figure, or a date. It does not submit the proposal anywhere.' },
    { type: 'p', text: '<proposal>Proposal draft</proposal> is that procedure. It is on Teams.' },
    { type: 'h2', text: 'What you still do' },
    { type: 'p', text: 'The agent cannot create the account, upload documents, post, comment, change the plan, or delete a workspace or a scope. You create the account. ChatGPT signs in on this site. Any other agent uses a token from Account, under External agents. Follow the <guide>operating guide</guide>. The three procedures are on the <skills>skills page</skills>. The agent fetches the one that matches the job before it calls tools for it.' },
    { type: 'p', text: 'Create an account. On the home page, open Connect your own agents, paste the prompt, and sign the agent in.' },
  ],
};

export const BLOG_LEAD = 'Notes on finding tenders, scoring a fit and drafting a bid.';

export const posts: Post[] = [THREE_SKILLS];

export function postBySlug(slug: string) {
  return posts.find((post) => post.slug === slug) ?? null;
}
