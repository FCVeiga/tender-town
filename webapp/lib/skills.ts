/** Procedures an external agent fetches. English, like /mcp.md. */

const markdown = {
  'content-type': 'text/markdown; charset=utf-8',
  'x-content-type-options': 'nosniff',
  'cache-control': 'public, max-age=300',
};

export function skillHeaders() {
  return markdown;
}

const SKILLS = {
  'configure-scope': `---
name: configure-scope
description: Configures a Tender Town scope so search and triage match what a company sells, where it bids, and what it ignores, then reads the results. Use when the user wants a radar, a scope, better tender or grant results, or to follow a market on Tender Town.
---

# Configure a Tender Town scope

Search with no account stays on the \`search\` tool. Configuring a scope needs a signed-in account. Follow /mcp.md on this site. Call \`get_account\` first.

## Learn the need

If the user has not said what they sell, which countries they bid in, and what to ignore, ask. Do not invent a market, a buyer, or a product.

## Choose the scope

Call \`list_scopes\`.

- Match the need to a catalog scope by the name \`list_scopes\` returns. Do not invent an id.
- Free cannot create a scope. Turn on one catalog scope with \`set_catalog_scope\`. General stays available and does not use the slot.
- On a plan with one scope besides General, turning another catalog scope on replaces the catalog pick. Say that, and do it only after the user agrees. Do not turn a custom scope off to free the slot.
- Create a custom scope only when \`canCustomize\` is true, a catalog scope does not fit, and \`used\` is below \`planScopes\` (\`null\` means unlimited). \`create_scope\` needs \`workspace_id\`, a short name, and instructions.
- Catalog scopes and General cannot take new instructions.

## What to write

Scope instructions, on \`create_scope\` or \`update_scope\`, say who the scope is for, what they sell, the countries, and what is out. Triage reads them and scores what is out below 50.

Then call \`configure_scope_agent\` for \`search\` with plain language. Do not send \`search_config\`. The platform turns that text into the phrases it runs. Write it so the parse can succeed:

- Name the subject in the words a buyer writes, two to five words. One generic word such as "software" floods the radar.
- Give those words in English and in the languages of the countries the user named. If they named none, cover the EU and EEA.
- Include tenders, grants, and news when they want all three.
- Name what looks similar and is out, so those notices are suppressed.
- Use only the facts the user gave. Do not add industries to get more results.

Then call \`configure_scope_agent\` for \`triage\` with the same in and out, in plain language. Do not ask it to change its output format.

Call \`list_scope_agents\` before switching an agent on. Switch on \`tender_evaluation\`, \`proposal_manager\`, or \`news_report\` only when \`included\` is true.

## After you save

Saving does not fetch notices. Search runs on the plan's schedule: Free once a day, Starter twice, Pro three times, Teams six times. Say that.

Until the next run, call \`search\` for what is already in the public index. Quote each Tender Town page, \`/tenders/{id}\` or \`/news/{id}\`. Do not invent notices.

When the scope has run, call \`list_tenders\` and \`list_news\`. Those are the scored finds for the workspace's active scopes, highest relevance first. \`search\` is the whole public index and is not filtered to the scope. If the scope list is empty and the scope was just saved, wait for the next run. Do not widen the instructions to fill the gap.
`,
  'fit-analysis': `---
name: fit-analysis
description: Scores how well one public tender fits a Tender Town scope and explains the verdict, gaps, and unknowns. Use when the user asks whether to bid, for a fit score, a tender evaluation, or a go or no-go on a notice.
---

# Fit analysis

Needs a signed-in account. Call \`get_account\` first.

Every plan includes Tender Evaluation. Free includes 1 a month, Starter 5, Pro 10, and Teams is unlimited (\`limits.evaluations.limit\` is null). If the limit is 0, the plan does not include it. Stop and do not call \`run_scope_agent\`.

## Before a run

1. \`limits.evaluations.remaining\` of 0 means this month is used. \`null\` means unlimited. Do not run when nothing is left.
2. Take the tender id from \`list_tenders\` or from a Tender Town page \`/tenders/{id}\`. Do not invent an id. Call \`get_tender\` with that id. If it fails, the workspace's active scopes have not collected it. Say so. A public \`search\` hit is not yet a result of this scope.
3. The score uses the company material already saved on the scope. You cannot upload documents. If that material is thin, the report marks requirements UNKNOWN. Tell the user to add context documents on the scope page before spending a run, when they have not already done that.
4. Call \`get_scope_report\` with \`kind\` \`tender_evaluation\`, the scope id, and the tender id. If \`report\` is present, show it. Run a new one only when the user asks for a new run and a run is left. A re-run counts. A failed run does not.

## Run

Call \`run_scope_agent\` with \`agent\` \`tender_evaluation\`, \`scope_id\`, and \`item_id\`. One call.

## How to present it

Give the fit score, the verdict, and the take. The verdict is \`bid\`, \`bid_with_partner\`, \`consider\`, or \`no_bid\`. Then strengths, gaps, partners, and next steps.

A mandatory requirement marked NO_MATCH caps the fit. UNKNOWN means the material did not say. Do not treat UNKNOWN as a match, and do not raise the score. Do not invent a certificate, a figure, a person, or a reference.
`,
  'proposal-draft': `---
name: proposal-draft
description: Drafts a Tender Town proposal brief from a tender's fit analysis, including requirement answers, evidence, and gaps. Use when the user wants a proposal draft, a bid brief, or a response outline for a tender.
---

# Proposal draft

Proposal briefs are on Teams. Call \`get_account\` first. If \`limits.proposals.limit\` is 0, say so and stop. Do not call \`run_scope_agent\`.

A brief needs a fit analysis for that same scope and tender. If \`get_scope_report\` with \`kind\` \`tender_evaluation\` has \`report\` null, stop. Offer a fit analysis when the plan includes one and a run is left. Do not draft from the tender summary alone.

## Before a run

Call \`get_scope_report\` with \`kind\` \`proposal_brief\`. If \`report\` is present, show it. Write a new one only when the user asks and \`limits.proposals.remaining\` is \`null\` or above 0. A re-run counts. A failed run does not.

The brief uses the company material on the scope. You cannot upload documents. Gaps stay gaps.

## Run

Call \`run_scope_agent\` with \`agent\` \`proposal_manager\`, \`scope_id\`, and the tender id as \`item_id\`. It refuses until an evaluation exists for that scope.

## How to present it

The brief is the document the bid team starts from. Keep its sections: tender summary, dates, evaluation criteria, eligibility, project references, human resources, technical requirements, project requirements, documents to submit, gaps, and next steps.

The status on a requirement is Covered, Partial, Partner needed, or Gap. Do not invent a certificate, a project, a person, a figure, or a date. Do not submit the proposal anywhere, and do not publish a notice.
`,
} as const;

export type SkillName = keyof typeof SKILLS;

export function skillMarkdown(name: string) {
  const key = name.replace(/\.md$/, '') as SkillName;
  const body = SKILLS[key];
  return body ? `${body.trim()}\n` : null;
}

export function skillsIndex(origin: string) {
  return `# Tender Town skills

Tender Town is for people and for the agents they use. This page is the map. The operating guide is ${origin}/mcp.md.

## With no account

Call the MCP tool \`search\`, or open ${origin}/discover.md?q=…&kind=all. Each hit is a page on this site, \`/tenders/{id}\` or \`/news/{id}\`. Quote that page. Do not invent notices.

## The account

You cannot create an account, upload documents, post, comment, change the plan, or delete a workspace or a scope. The person signs up at ${origin}/signup, then connects you. ChatGPT signs in on this site. Any other agent uses a token from Account, under External agents, as ${origin}/mcp.md describes. Until that connection exists, the only tool is \`search\`.

## After they sign in

Follow ${origin}/mcp.md and call \`get_account\` before you change anything. You can open workspaces, turn on a catalog scope or create a custom one, read the tenders, news and reports the workspace’s scopes have found, and run the agents the plan includes. Search and triage run on the plan’s schedule. Saving instructions does not fetch notices immediately.

## Procedures

Fetch the one that matches the job before calling tools for it. Saving a page as \`SKILL.md\` makes it a Cursor skill.

- [Configure a scope](${origin}/skills/configure-scope) — set the radar to what the user sells, then read what it finds.
- [Fit analysis](${origin}/skills/fit-analysis) — score one tender against that scope.
- [Proposal draft](${origin}/skills/proposal-draft) — draft the bid brief from that score.
`;
}
