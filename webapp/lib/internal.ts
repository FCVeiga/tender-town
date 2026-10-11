import { isBot } from '@/lib/guestScope';

/** The Google account whose own traffic is left out of the dashboard. */
export const SUPER_ADMIN_EMAIL = 's3mztube@gmail.com';

/** Scripts and preview fetchers. A normal browser is not internal. */
export function isInternalClient(ua: string | null) {
  if (!ua?.trim()) return true;
  if (isBot(ua)) return true;
  return /curl\/|wget\/|httpie|python-requests|python-urllib|aiohttp|node-fetch|undici|go-http-client|axios\/|postman|insomnia|headlesschrome|playwright|puppeteer|phantomjs|scrapy/i.test(ua);
}

/** The visitor address from the edge, without a port. */
export function clientIp(header: (name: string) => string | null): string | null {
  const raw = header('x-vercel-forwarded-for') || header('x-real-ip') || header('x-forwarded-for') || '';
  let first = raw.split(',')[0].trim().replace(/^::ffff:/i, '');
  if (!first || first.length > 64) return null;
  const v4 = /^(\d{1,3}\.){3}\d{1,3}/.exec(first);
  if (v4) return v4[0];
  if (first.startsWith('[') && first.includes(']')) first = first.slice(1, first.indexOf(']'));
  return /^[0-9a-f:]+$/i.test(first) ? first : null;
}
