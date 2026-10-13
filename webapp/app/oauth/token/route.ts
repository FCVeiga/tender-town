import { exchangeToken } from '@/lib/oauth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const headers = {
  'content-type': 'application/json',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
};

async function bodyOf(req: Request) {
  const type = req.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    const json = await req.json().catch(() => ({}));
    const params = new URLSearchParams();
    if (json && typeof json === 'object') {
      for (const [key, value] of Object.entries(json)) {
        if (typeof value === 'string') params.set(key, value);
      }
    }
    return params;
  }
  return new URLSearchParams(await req.text());
}

export async function POST(req: Request) {
  const result = await exchangeToken(await bodyOf(req));
  if ('error' in result) return Response.json({ error: result.error }, { status: 400, headers });
  return Response.json(result, { headers });
}

export function OPTIONS() {
  return new Response(null, {
    headers: { ...headers, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' },
  });
}
