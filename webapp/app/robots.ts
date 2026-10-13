import type { MetadataRoute } from 'next';
import { siteOrigin } from '@/lib/auth';

const PRIVATE = [
  '/settings', '/api/', '/auth/', '/workspaces', '/chat', '/notifications',
  '/checkout', '/invite', '/posts/new', '/profile', '/history',
  '/forgot-password', '/reset-password', '/login', '/signup', '/dashboard',
];

/** Search engines and AI crawlers may read the public site. Accounts stay private. */
export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();
  const agents = ['*', 'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'anthropic-ai', 'PerplexityBot', 'Google-Extended', 'Applebot-Extended'];
  return {
    rules: agents.map((userAgent) => ({ userAgent, allow: ['/', '/llms.txt', '/discover.md', '/feed.xml', '/mcp.md'], disallow: PRIVATE })),
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
