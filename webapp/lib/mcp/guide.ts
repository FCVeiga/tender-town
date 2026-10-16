import type { Vars } from '@/lib/i18n/languages';

/** Shown under the External agents title on Workspaces. */
export const MCP_SECTION = 'An agent can create workspaces and scopes, configure the scope agents, invite teammates, and read tenders, news, community posts and the reports those agents write. It acts as you, inside your plan.';

export const MCP_LEAD = 'The guide for connecting an external agent, and for operating Tender Town through it.';

type Doc = { h: 2 | 3; text: string } | { p: string } | { ul: string[] } | { code: string };

export const MCP_DOC: Doc[] = [
  { h: 2, text: 'What you can do' },
  { p: 'Tender Town tracks public tenders, grants and market news worldwide. This server lets an external agent do the work a person does in the product: set the radar up, and read what it found.' },
  { p: 'The agent acts as the account that owns the token. Every call is checked against that account and against the workspace owner’s plan. A call the plan does not include is refused, with the reason.' },

  { h: 2, text: 'How the product is organised' },
  { h: 3, text: 'Workspace' },
  { p: 'A workspace holds scopes and members. The workspace open in the browser decides what Home, Tenders, News, History and Community show. Creating a workspace from here does not switch that.' },
  { p: 'Limits follow the workspace owner’s plan, not a member’s own plan. Pass workspace_id to choose one. If you omit it, the account’s current workspace is used.' },
  { h: 3, text: 'What a scope is' },
  { p: 'A scope is one configuration of the radar: what to look for, and how its agents behave. There are three kinds.' },
  { ul: [
    'General is the shared default. Every account can read it. A workspace can hide it only while another scope is switched on. It cannot be renamed or given new instructions.',
    'A catalog scope is a shared default scope Tender Town publishes. Turning it on uses one default-scope slot. It cannot be renamed. General does not use a slot.',
    'A custom scope belongs to one workspace. Free includes none. Starter includes 1, Pro includes 5, Teams is unlimited.',
  ] },
  { h: 3, text: 'Scope agents' },
  { p: 'Each scope has five agents you can configure. Search and triage run on the platform’s schedule. The other three run only when you ask, and each run is counted.' },
  { ul: [
    'Search Agent finds tenders and news on procurement portals, the web and the sources the workspace follows. Plain-language instructions are turned into its search configuration. Saving them does not fetch results immediately. Search runs with the pipeline, as often as the plan allows: once a day on Free, twice on Starter, three times on Pro, six times on Teams.',
    'Triage Agent scores each find and sorts tenders, grants and news. Instructions rewrite its prompt. It runs on the same schedule as search.',
    'Tender Evaluation Agent checks one tender against the scope, scores the fit and advises. Free includes 1 run a month, Starter 5, Pro 10, Teams unlimited.',
    'Proposal Manager Agent prepares the submission pack from the tender’s templates and the company file, fills each document, and lists the next steps. Teams only. It runs only after an evaluation, and only when that scope has company information.',
    'News Report Agent reads one story and writes what the team should do about it. Pro includes 50 a month, Teams unlimited. Not on Free or Starter.',
  ] },
  { p: 'Documents and the requirement list are written by the platform’s own agents. This server can read them. It cannot configure those agents, upload documents, post, comment, change the plan, or delete a workspace or a scope.' },
  { h: 3, text: 'What you read' },
  { p: 'Tenders and news are the items the workspace’s active scopes have found, highest relevance first. A tender has a summary and its requirements. Community posts and comments are the public discussion. A report is the stored writing of Tender Evaluation, the Proposal Manager or the News Report Agent. Reading a stored report does not spend a run. Asking for a new one does.' },

  { h: 2, text: 'Search without an account' },
  { p: 'With no Authorization header, the server exposes one tool, search. Pass query, and optionally kind (tender, grant, news or all) and limit (1 to 20). It returns public titles, buyers, countries, deadlines and the Tender Town page for each result, at /tenders/{id} or /news/{id}. The same result is at {discover}. Quote those pages. Do not invent notices.' },

  { h: 2, text: 'How to connect' },
  { p: 'The server speaks Streamable HTTP and answers with JSON. Send Accept: application/json, text/event-stream.' },
  { p: 'The server for this site is {server}.' },
  { p: 'Send the header Authorization: Bearer and a token that starts with tt_. The user creates it in Account, under External agents. It is shown once. An account can keep 8 live tokens. With no token, the only tool is search, which reads the public index of tenders, grants and news. A revoked or invalid token is rejected with HTTP 401. Do not ask for the token where other people can see it.' },
  { p: 'ChatGPT signs in on this site instead of pasting a token. After you allow it, that connection can use the account’s workspaces, scopes and agents within the plan. Search still works if you do not sign in.' },
  { h: 3, text: 'Cursor' },
  { p: 'Add a remote MCP server. In mcp.json, paste the token in place of tt_YOUR_TOKEN.' },
  { code: `{
  "mcpServers": {
    "tender-town": {
      "url": "{server}",
      "headers": { "Authorization": "Bearer tt_YOUR_TOKEN" }
    }
  }
}` },
  { h: 3, text: 'Claude' },
  { p: 'In Claude Code or Claude Desktop, add a remote HTTP server at {server} and send the header Authorization: Bearer tt_YOUR_TOKEN. In Claude Code’s settings that is:' },
  { code: `{
  "mcpServers": {
    "tender-town": {
      "type": "http",
      "url": "{server}",
      "headers": { "Authorization": "Bearer tt_YOUR_TOKEN" }
    }
  }
}` },
  { h: 3, text: 'Other clients' },
  { p: 'A client that only talks to a local program can bridge to this server with mcp-remote:' },
  { code: `{
  "mcpServers": {
    "tender-town": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "{server}", "--header", "Authorization: Bearer tt_YOUR_TOKEN"]
    }
  }
}` },

  { h: 2, text: 'Start here' },
  { p: 'Call get_account before you change anything. It returns the plan, what is left this month, and the workspaces you belong to, each with an id, a name, your role and the owner’s plan.' },
  { p: 'In the limits, null means unlimited and 0 means the plan does not include it. remaining is null when the limit is unlimited. Pass a workspace id from that list on later calls.' },

  { h: 2, text: 'Plans' },
  { p: 'Limits follow the workspace owner’s plan.' },
  { ul: [
    'Free: 1 workspace, 1 default scope, no custom scopes, 1 evaluation a month, no proposal briefs, no news reports.',
    'Starter: 1 workspace, up to 3 default scopes and 1 custom scope, 5 evaluations a month, no proposal briefs, no news reports.',
    'Pro: 1 workspace, up to 10 default scopes and 5 custom scopes, 10 evaluations a month, 50 news reports a month, no proposal briefs.',
    'Teams: unlimited workspaces, members, default scopes, custom scopes, evaluations, proposal briefs and news reports.',
  ] },
  { p: 'A default scope that is switched on uses one default-scope slot. General does not. A custom scope uses a custom-scope slot and does not use a default-scope slot. At the limit, turn one off before turning another on. Free cannot create a custom scope. Inviting a member needs Teams, and an admin of that workspace. Creating or editing a custom scope needs an admin on Starter or above. A member can read.' },

  { h: 2, text: 'Agent skills' },
  { p: 'Follow the skill that matches the job. Fetch it before the tools for that job.' },
  { ul: [
    'Configure a scope, and read what it finds: {skills}/configure-scope',
    'Fit analysis of one tender: {skills}/fit-analysis',
    'Proposal draft from that analysis: {skills}/proposal-draft',
  ] },

  { h: 2, text: 'A normal job' },
  { ul: [
    'Call get_account and pick a workspace_id.',
    'Call list_scopes. Decide whether to create a custom scope or turn a catalog scope on.',
    'Call list_scope_agents, then configure_scope_agent with plain-language instructions. Switch a gated agent on only when included is true.',
    'Call list_tenders or list_news, then get_tender or get_news for one id from that list.',
    'Call get_scope_report to read a report that already exists. Call run_scope_agent only when the user wants a new run and the plan has runs left.',
  ] },
  { h: 2, text: 'Examples' },
  { ul: [
    'List the tenders in my current workspace and tell me which ones close this month.',
    'Create a scope for hospital IT tenders in Portugal, and set the Search Agent to follow that.',
    'Read the stored news report for this story. If there is none, and the plan has runs left, write one.',
  ] },

  { h: 2, text: 'Tools' },
  { h: 3, text: 'get_account' },
  { p: 'Purpose: know who you are acting as, and what the plan still allows, before you create or run anything.' },
  { p: 'How: no arguments. You get the plan, the month’s usage and the workspaces.' },
  { h: 3, text: 'list_workspaces' },
  { p: 'Purpose: choose where to work when the account has more than one workspace.' },
  { p: 'How: no arguments. You get each workspace’s id, name, your role, the owner and the plan.' },
  { h: 3, text: 'create_workspace' },
  { p: 'Purpose: open another place for scopes and members, when the plan includes another workspace.' },
  { p: 'How: name, at least 2 characters. You get the new id and name. The workspace open in the browser does not change. Free, Starter and Pro include one workspace. Teams is unlimited.' },
  { h: 3, text: 'invite_member' },
  { p: 'Purpose: add a person to a workspace.' },
  { p: 'How: workspace_id, an optional email, and role admin or member. You must be an admin, and the workspace owner must be on Teams. You get a link that works for 14 days.' },
  { h: 3, text: 'list_scopes' },
  { p: 'Purpose: see General, the catalog and this workspace’s own scopes, and how many default and custom scopes are used.' },
  { p: 'How: optional workspace_id. You get defaultScopes and defaultUsed, customScopes and customUsed (a limit is null when unlimited, and customScopes is 0 when custom scopes are not included), canCustomize, and each scope’s id, name, kind (general, catalog or custom), whether it is active, and whether you can edit it.' },
  { h: 3, text: 'create_scope' },
  { p: 'Purpose: make a custom radar for this workspace.' },
  { p: 'How: workspace_id, name, and optional instructions describing what it should follow. It uses one custom-scope slot. Not included on Free. You must be an admin on a plan that allows customizing.' },
  { h: 3, text: 'update_scope' },
  { p: 'Purpose: rename a custom scope, change what it is about, or switch it on or off.' },
  { p: 'How: scope_id, and any of name, instructions and active. For General, the only change allowed is active, and only while another scope is on. Pass workspace_id so the right workspace shows or hides General. Catalog scopes cannot be edited here.' },
  { h: 3, text: 'set_catalog_scope' },
  { p: 'Purpose: follow or stop following a shared catalog scope.' },
  { p: 'How: workspace_id, scope_id and enabled. Turning one on uses a default-scope slot. You must be an admin. At the limit it is refused until one is turned off.' },
  { h: 3, text: 'list_scope_agents' },
  { p: 'Purpose: see the five scope agents, whether the plan includes each one, and whether it is switched on.' },
  { p: 'How: scope_id and optional workspace_id. You get each agent’s key, name, role, included, enabled, instructions and whether its prompt has been customised. included is false when the plan does not have that agent. Do not try to switch it on.' },
  { h: 3, text: 'configure_scope_agent' },
  { p: 'Purpose: tell a scope agent how to work, or switch it on or off.' },
  { p: 'How: scope_id, agent (search, triage, tender_evaluation, proposal_manager or news_report), and any of enabled, instructions and, for search only, search_config. Instructions are plain language. For search they are parsed into the search configuration. For the others they rewrite that agent’s prompt. Send instructions unless you are handing back a search_config you were given. Empty instructions clear the customisation. Switching a gated agent on fails when the plan does not include it. The call can take a while. You must be an admin of a custom scope, on a plan that allows customizing.' },
  { h: 3, text: 'list_tenders and get_tender' },
  { p: 'Purpose: read the tenders the workspace’s active scopes have found. This does not run an agent.' },
  { p: 'How: list_tenders takes optional workspace_id and limit (1 to 30, default 20), highest relevance first. get_tender takes the id from that list. You get the title, buyer, country, type, status, deadline, value, summary and requirements. An evaluation or a proposal brief is included only when the plan has that agent. Comments are included.' },
  { h: 3, text: 'list_news and get_news' },
  { p: 'Purpose: read the news the active scopes have found.' },
  { p: 'How: same shape as tenders. get_news includes the News Report Agent’s stored reports, and the long summary, only on Pro and Teams. Comments are included.' },
  { h: 3, text: 'list_posts, get_post and get_comments' },
  { p: 'Purpose: read the community. You cannot publish from here.' },
  { p: 'How: list_posts takes limit. get_post takes the post id and includes its comments. get_comments takes item_type (post, news or tender) and item_id, and returns that thread.' },
  { h: 3, text: 'get_scope_report' },
  { p: 'Purpose: read a report that was already written, without spending a monthly run.' },
  { p: 'How: scope_id, item_id (a tender id or a news id), kind (tender_evaluation, proposal_brief or news_report) and optional workspace_id. The plan must include that agent. If none has been written, report is null.' },
  { h: 3, text: 'run_scope_agent' },
  { p: 'Purpose: write a new Tender Evaluation, proposal brief or news report.' },
  { p: 'How: scope_id, item_id and agent (tender_evaluation, proposal_manager or news_report), plus workspace_id. It uses one of the workspace’s monthly runs. A re-run counts. A failed run does not. You must be an admin, and the scope must be one this workspace is viewing. It refuses when the plan does not include the agent or the month’s runs are used up. A proposal brief needs an evaluation for that scope first, and company information on the scope.' },

  { h: 2, text: 'When something fails' },
  { p: 'A refused tool comes back as JSON with an error string. Say that sentence to the user. Do not retry a plan or quota error. Do not invent workspace, scope, tender, news or post ids: list or get them first. Send one tool per request.' },
  { ul: [
    'HTTP 401 means a token was sent but is revoked or invalid. The user creates a new one in Account, under External agents. With no Authorization header, call search.',
    'A plan or quota error is final for that call. Do not retry it, and do not work around it.',
    'Saving search instructions does not fetch tenders immediately. Search and triage run on the platform’s schedule.',
  ] },
];

function fill(s: string, origin: string) {
  return s.replaceAll('{server}', `${origin}/api/mcp`).replaceAll('{guide}', `${origin}/mcp.md`).replaceAll('{discover}', `${origin}/discover.md`).replaceAll('{skills}', `${origin}/skills`);
}

/** The guide an external agent fetches. English is the copy the prompt points at. */
export function mcpGuideMarkdown(origin: string) {
  const lines = ['# Tender Town MCP', '', fill(MCP_LEAD, origin), ''];
  for (const block of MCP_DOC) {
    if ('h' in block) lines.push(`${block.h === 2 ? '##' : '###'} ${block.text}`, '');
    else if ('p' in block) lines.push(fill(block.p, origin), '');
    else if ('ul' in block) lines.push(...block.ul.map((item) => `- ${fill(item, origin)}`), '');
    else lines.push('```', fill(block.code, origin), '```', '');
  }
  return `${lines.join('\n').trim()}\n`;
}

/** The prompt a person copies to their agent. */
export function mcpConnectPrompt(t: (key: string, vars?: Vars) => string, origin: string, token?: string) {
  const server = `${origin}/api/mcp`;
  const guide = `${origin}/mcp.md`;
  return [
    t('Connect to my Tender Town account.'),
    '',
    t('MCP server: {server}', { server }),
    t('Transport: Streamable HTTP'),
    token ? t('Authorization: Bearer {token}', { token }) : t('Authorization: Bearer <paste your token>'),
    '',
    t('Fetch and follow {guide} before calling any tool. Then call get_account.', { guide }),
  ].join('\n');
}
