import { skillHeaders, skillMarkdown } from '@/lib/skills';

export const dynamic = 'force-dynamic';

/** One procedure, also a Cursor skill if saved as SKILL.md. */
export function GET(_request: Request, { params }: { params: { name: string } }) {
  const body = skillMarkdown(params.name);
  if (!body) return new Response('Not found\n', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  return new Response(body, { headers: skillHeaders() });
}
