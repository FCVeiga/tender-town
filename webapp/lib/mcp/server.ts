import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v3';
import { getContext } from '@/lib/accounts';
import { getActor, runAs } from '@/lib/actor';
import { logMcpCall } from '@/lib/mcpLog';
import { McpDenied } from '@/lib/mcp/ops';
import * as ops from '@/lib/mcp/ops';
import { discoverLimit, publicSearch } from '@/lib/discover';

const limit = z.number().int().min(1).max(30).optional();
const workspace = z.string().optional();

function text(data: unknown, isError = false) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }], isError };
}

const searchInput = {
  query: z.string().describe('What to look for, in plain words. Words such as tender, grant or news choose the kind.'),
  kind: z.enum(['tender', 'grant', 'news', 'all']).optional().describe('tender, grant, news, or all. Defaults to all.'),
  limit: z.number().int().min(1).max(20).optional(),
};

function registerSearch(server: McpServer, origin: string) {
  server.registerTool('search', {
    title: 'Search tenders, grants and news',
    description: 'Search Tender Town’s public index of open tenders, grants and news. No account and no plan limit. Returns the title, a short summary, the buyer, country, deadline and the Tender Town page for that result (/tenders/{id} or /news/{id}), not the notice on the source portal. Quote that page. Do not invent notices.',
    inputSchema: searchInput,
    annotations: {
      title: 'Search tenders, grants and news',
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  }, async ({ query, kind, limit: n }) => {
    const hits = await publicSearch(query, kind, discoverLimit(n));
    return text({
      query,
      hits: hits.map((hit) => ({ ...hit, url: `${origin}${hit.url}` })),
    });
  });
}

/** No token: the one tool an agent can call when a person asks it to find tenders, grants or news. */
export function createPublicMcpServer(origin: string) {
  const server = new McpServer({ name: 'tender-town', version: '1.0.0' }, {
    instructions: `Search the public Tender Town index. Call search with the user's words. Each hit links to its page on ${origin}/tenders or ${origin}/news, not the source portal. Quote that page. Do not invent notices. A bearer token is only for acting as an account. Follow ${origin}/mcp.md for that. Configuring a scope, a fit analysis, or a proposal draft needs an account. Those procedures are at ${origin}/skills.md.`,
  });
  registerSearch(server, origin);
  return server;
}

/** Run a tool as the token's user, in the workspace the call names (or the user's current one). */
async function call<T>(workspaceId: string | undefined, fn: () => Promise<T>, tool: string) {
  const actor = getActor();
  if (!actor) return text({ error: 'This token does not belong to an account.' }, true);
  try {
    const data = await runAs({ user: actor.user, workspaceId: workspaceId ?? null }, async () => {
      try {
        return await fn();
      } finally {
        await logMcpCall(tool);
      }
    });
    return text(data);
  } catch (e) {
    if (e instanceof McpDenied) return text({ error: e.message }, true);
    const message = e instanceof Error ? e.message : 'The request failed.';
    return text({ error: message }, true);
  }
}

export function createMcpServer(origin: string) {
  const server = new McpServer({ name: 'tender-town', version: '1.0.0' }, {
    instructions: `You are acting as a Tender Town account. Follow ${origin}/mcp.md before you call tools. Before you configure a scope, score a fit, or draft a proposal, fetch the matching skill from ${origin}/skills.md. Every call is limited by that account’s plan and by the workspace owner’s plan. Call search for the public index of tenders, grants and news. Call get_account before you change the account. Pass workspace_id to choose the workspace; otherwise the account’s current workspace is used.`,
  });
  registerSearch(server, origin);

  server.registerTool('get_account', {
    description: 'The signed-in account: plan, what is left this month, and its workspaces.',
  }, async () => call(undefined, () => ops.getAccount(), 'get_account'));

  server.registerTool('list_workspaces', {
    description: 'Workspaces this account belongs to, with its role and the owner’s plan.',
  }, async () => call(undefined, () => ops.listWorkspaces(), 'list_workspaces'));

  server.registerTool('create_workspace', {
    description: 'Create a workspace. Free, Starter and Pro include one. Teams is unlimited.',
    inputSchema: { name: z.string() },
  }, async ({ name }) => call(undefined, () => ops.createWorkspace(name), 'create_workspace'));

  server.registerTool('invite_member', {
    description: 'Invite someone to a workspace. Teams only, and only an admin of that workspace.',
    inputSchema: { workspace_id: z.string(), email: z.string().optional(), role: z.enum(['admin', 'member']).optional() },
  }, async ({ workspace_id, email, role }) => call(workspace_id, () => ops.inviteMember(workspace_id, email ?? null, role ?? 'member'), 'invite_member'));

  server.registerTool('list_scopes', {
    description: 'General, catalog scopes and this workspace’s own scopes, and how many default and custom scopes the plan has left.',
    inputSchema: { workspace_id: workspace },
  }, async ({ workspace_id }) => call(workspace_id, async () => {
    const id = workspace_id || (await getContext())?.workspace.id;
    if (!id) throw new McpDenied('This account has no workspace.');
    return ops.listScopes(id);
  }, 'list_scopes'));

  server.registerTool('create_scope', {
    description: 'Create a custom scope in a workspace. Counts toward the custom-scope limit. Not included on Free. Free can turn on 1 default scope instead.',
    inputSchema: { workspace_id: z.string(), name: z.string(), instructions: z.string().optional() },
  }, async ({ workspace_id, name, instructions }) => call(workspace_id, () => ops.createScope(workspace_id, name, instructions), 'create_scope'));

  server.registerTool('update_scope', {
    description: 'Rename a custom scope, change its instructions, or switch it on or off.',
    inputSchema: { workspace_id: workspace, scope_id: z.string(), name: z.string().optional(), instructions: z.string().optional(), active: z.boolean().optional() },
  }, async ({ workspace_id, scope_id, name, instructions, active }) => call(workspace_id, () => ops.updateScope(scope_id, { name, instructions, active }), 'update_scope'));

  server.registerTool('set_catalog_scope', {
    description: 'Turn a shared catalog scope on or off for a workspace. It uses a default-scope slot. General does not. Refuses when the plan’s default scopes are already in use.',
    inputSchema: { workspace_id: z.string(), scope_id: z.string(), enabled: z.boolean() },
  }, async ({ workspace_id, scope_id, enabled }) => call(workspace_id, () => ops.setCatalogScope(workspace_id, scope_id, enabled), 'set_catalog_scope'));

  server.registerTool('list_scope_agents', {
    description: 'The agents on a scope, whether the plan includes each one, and whether it is switched on.',
    inputSchema: { workspace_id: workspace, scope_id: z.string() },
  }, async ({ workspace_id, scope_id }) => call(workspace_id, () => ops.listScopeAgents(scope_id), 'list_scope_agents'));

  server.registerTool('configure_scope_agent', {
    description: 'Switch a scope agent on or off, or set its plain-language instructions. Search accepts instructions or a search_config object. Gated agents cannot be switched on unless the plan includes them.',
    inputSchema: {
      workspace_id: workspace, scope_id: z.string(),
      agent: z.enum(['search', 'triage', 'tender_evaluation', 'proposal_manager', 'news_report']),
      enabled: z.boolean().optional(), instructions: z.string().optional(), search_config: z.record(z.unknown()).optional(),
    },
  }, async ({ workspace_id, scope_id, agent, enabled, instructions, search_config }) => call(workspace_id, () => ops.configureScopeAgent({
    scopeId: scope_id, agent, enabled, instructions, searchConfig: search_config,
  }), 'configure_scope_agent'));

  server.registerTool('list_tenders', {
    description: 'Tenders found by the workspace’s active scopes, highest relevance first.',
    inputSchema: { workspace_id: workspace, limit },
  }, async ({ workspace_id, limit: n }) => call(workspace_id, () => ops.listTenders(n ?? 20), 'list_tenders'));

  server.registerTool('get_tender', {
    description: 'One tender: summary, comments, and — when the plan still has requirement views — its requirements. Evaluations and proposal briefs are included only when the plan has them.',
    inputSchema: { workspace_id: workspace, id: z.string() },
  }, async ({ workspace_id, id }) => call(workspace_id, () => ops.getTender(id), 'get_tender'));

  server.registerTool('list_news', {
    description: 'News found by the workspace’s active scopes, highest relevance first.',
    inputSchema: { workspace_id: workspace, limit },
  }, async ({ workspace_id, limit: n }) => call(workspace_id, () => ops.listNews(n ?? 20), 'list_news'));

  server.registerTool('get_news', {
    description: 'One news story, its comments, and — from Starter — the News Report Agent’s reports for the active scopes.',
    inputSchema: { workspace_id: workspace, id: z.string() },
  }, async ({ workspace_id, id }) => call(workspace_id, () => ops.getNews(id), 'get_news'));

  server.registerTool('list_posts', {
    description: 'Recent community posts.',
    inputSchema: { limit },
  }, async ({ limit: n }) => call(undefined, () => ops.listPosts(n ?? 20), 'list_posts'));

  server.registerTool('get_post', {
    description: 'One community post, with its comments.',
    inputSchema: { id: z.string() },
  }, async ({ id }) => call(undefined, () => ops.getPost(id), 'get_post'));

  server.registerTool('get_comments', {
    description: 'Comments on a community post, a news story, or a tender.',
    inputSchema: { item_type: z.enum(['post', 'news', 'tender']), item_id: z.string() },
  }, async ({ item_type, item_id }) => call(undefined, () => ops.getComments(item_type, item_id), 'get_comments'));

  server.registerTool('get_scope_report', {
    description: 'A stored scope-agent report. Tender Evaluation on every plan. Proposal briefs and news reports from Starter. Reading a report does not use a monthly run.',
    inputSchema: {
      workspace_id: workspace, scope_id: z.string(), item_id: z.string(),
      kind: z.enum(['tender_evaluation', 'proposal_brief', 'news_report']),
    },
  }, async ({ workspace_id, scope_id, item_id, kind }) => call(workspace_id, () => ops.getScopeReport(scope_id, kind, item_id), 'get_scope_report'));

  server.registerTool('run_scope_agent', {
    description: 'Run Tender Evaluation, the Proposal Manager, or the News Report Agent. Uses one of the workspace’s monthly runs. Refuses when the plan does not include the agent or the month’s runs are used up.',
    inputSchema: {
      workspace_id: workspace, scope_id: z.string(), item_id: z.string(),
      agent: z.enum(['tender_evaluation', 'proposal_manager', 'news_report']),
    },
  }, async ({ workspace_id, scope_id, item_id, agent }) => call(workspace_id, () => ops.runScopeAgent(scope_id, agent, item_id), 'run_scope_agent'));

  return server;
}
