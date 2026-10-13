import { siteOrigin } from '@/lib/auth';
import { discoverMarkdown, marketIndex, publicSearch } from '@/lib/discover';

export const dynamic = 'force-dynamic';

/** Plain markdown for an agent that was asked to find tenders, grants or news. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim().slice(0, 200);
  const kind = url.searchParams.get('kind');
  const limit = Number(url.searchParams.get('limit'));
  const origin = siteOrigin();
  const [hits, markets] = await Promise.all([
    q ? publicSearch(q, kind, Number.isFinite(limit) ? limit : undefined) : Promise.resolve([]),
    q ? Promise.resolve([]) : marketIndex(),
  ]);
  return new Response(discoverMarkdown(origin, q, hits, markets), {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'x-content-type-options': 'nosniff',
      'cache-control': 'public, max-age=300',
    },
  });
}
