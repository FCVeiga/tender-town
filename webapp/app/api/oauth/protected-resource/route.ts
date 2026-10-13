import { siteOrigin } from '@/lib/auth';
import { protectedResourceMetadata } from '@/lib/oauth';

export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(protectedResourceMetadata(siteOrigin()), {
    headers: { 'cache-control': 'public, max-age=300', 'access-control-allow-origin': '*' },
  });
}
