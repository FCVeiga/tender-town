/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // The News Report Agent reads its prompt and the company brief at runtime.
    // So do the Tender Evaluation Agent (tender pages).
    outputFileTracingIncludes: { '/news/[id]': ['./agents/**/*.md'], '/tenders/[id]': ['./agents/**/*.md'], '/workspaces': ['./agents/**/*.md'], '/workspaces/scopes/[id]': ['./agents/**/*.md'] },
  },
  async rewrites() {
    return [
      { source: '/.well-known/oauth-authorization-server', destination: '/api/oauth/authorization-server' },
      { source: '/.well-known/oauth-protected-resource', destination: '/api/oauth/protected-resource' },
      { source: '/.well-known/oauth-protected-resource/:path*', destination: '/api/oauth/protected-resource' },
    ];
  },
  // Old paths (shared links, bookmarks) keep working.
  async redirects() {
    return [
      { source: '/opportunities/signals', destination: '/news/signals', permanent: true },
      { source: '/opportunities', destination: '/tenders', permanent: true },
      { source: '/opportunities/:path*', destination: '/tenders/:path*', permanent: true },
      // The site's old address (EUDI Radar) → Tender Town.
      { source: '/:path*', has: [{ type: 'host', value: 'eudi-radar.vercel.app' }], destination: 'https://tendertown.io/:path*', permanent: true },
      { source: '/database', destination: '/history', permanent: true },
      { source: '/landscape', destination: '/workspaces', permanent: false },
      { source: '/workspace', destination: '/workspaces', permanent: true },
      { source: '/workspace/:path*', destination: '/workspaces/:path*', permanent: true },
      { source: '/settings/scopes/:id', destination: '/workspaces/scopes/:id', permanent: true },
    ];
  },
};
module.exports = nextConfig;
