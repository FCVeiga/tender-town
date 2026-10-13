import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { siteOrigin } from '@/lib/auth';
import { runAs } from '@/lib/actor';
import { createMcpServer, createPublicMcpServer } from '@/lib/mcp/server';
import { userForToken } from '@/lib/mcpTokens';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

async function handle(req: Request) {
  const header = req.headers.get('authorization');
  const origin = siteOrigin();
  const sent = /^Bearer\s+\S+/i.test(header || '');
  const user = sent ? await userForToken(header) : null;
  if (sent && !user) {
    return new Response(JSON.stringify({ error: 'This token is revoked or not a Tender Town token.' }), {
      status: 401,
      headers: { 'content-type': 'application/json', 'www-authenticate': 'Bearer' },
    });
  }
  const server = user ? createMcpServer(origin) : createPublicMcpServer(origin);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  const run = () => transport.handleRequest(req);
  return user ? runAs({ user, workspaceId: null }, run) : run();
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
