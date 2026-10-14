import type { Metadata } from 'next';
import { siteOrigin } from '@/lib/auth';

/** Private areas: not for search engines or AI crawlers. */
export const NOINDEX = { robots: { index: false, follow: false } };

export function clip(text: string | null | undefined, max = 160) {
  const flat = (text || '').replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

/** Landscape card for link previews. Pages pass their own image when they have one. */
export const SHARE_IMAGE = { url: '/brand/share.png', width: 1200, height: 630, alt: 'Tender Town' };

/** Title, description, canonical and social cards for one public URL. */
export function pageMeta({ title, description, path, type = 'website', image }: {
  title: string; description: string; path: string; type?: 'website' | 'article'; image?: string | null;
}): Metadata {
  const origin = siteOrigin();
  const url = `${origin}${path}`;
  const images = image ? [{ url: image, alt: title }] : [SHARE_IMAGE];
  return {
    title,
    description,
    alternates: { canonical: url, types: { 'application/rss+xml': `${origin}/feed.xml` } },
    openGraph: { title, description, url, siteName: 'Tender Town', type, images },
    twitter: { card: 'summary_large_image', title, description, images },
  };
}
