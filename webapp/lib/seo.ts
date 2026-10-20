import type { Metadata } from 'next';
import { siteOrigin } from '@/lib/auth';

/** Private areas: not for search engines or AI crawlers. */
export const NOINDEX = { robots: { index: false, follow: false } };

export function clip(text: string | null | undefined, max = 160) {
  const flat = (text || '').replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

/** Landscape card for link previews of the site itself. */
export const SHARE_IMAGE = { url: '/brand/share.png', width: 1200, height: 630, alt: 'Tender Town' };

/** Square mark. Item pages use this so a shared link shows the Tender Town icon beside the item title. */
export const MARK_IMAGE = { url: '/brand/favicon.png', width: 425, height: 431, alt: 'Tender Town' };

function absolute(origin: string, url: string) {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${origin}${url.startsWith('/') ? url : `/${url}`}`;
}

/** Title, description, canonical and social cards for one public URL. */
export function pageMeta({ title, description, path, type = 'website', image, socialTitle, published }: {
  title: string;
  description: string;
  path: string;
  type?: 'website' | 'article' | 'profile';
  image?: string | null;
  socialTitle?: string;
  published?: string | null;
}): Metadata {
  const origin = siteOrigin();
  const url = `${origin}${path.startsWith('/') ? path : `/${path}`}`;
  const shareTitle = socialTitle || title;
  const branded = !image && type === 'article';
  const images = image
    ? [{ url: absolute(origin, image), alt: shareTitle }]
    : [branded
      ? { ...MARK_IMAGE, url: absolute(origin, MARK_IMAGE.url) }
      : { ...SHARE_IMAGE, url: absolute(origin, SHARE_IMAGE.url) }];
  return {
    title,
    description,
    alternates: { canonical: url, types: { 'application/rss+xml': `${origin}/feed.xml` } },
    openGraph: {
      title: shareTitle,
      description,
      url,
      siteName: 'Tender Town',
      type,
      images,
      ...(type === 'article' && published ? { publishedTime: published } : {}),
    },
    twitter: {
      card: branded ? 'summary' : 'summary_large_image',
      title: shareTitle,
      description,
      images,
    },
  };
}
