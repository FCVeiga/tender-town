import { siteOrigin } from '@/lib/auth';
import { skillHeaders, skillsIndex } from '@/lib/skills';

export const dynamic = 'force-dynamic';

/** Index of the procedures an external agent fetches. */
export function GET() {
  return new Response(skillsIndex(siteOrigin()), { headers: skillHeaders() });
}
