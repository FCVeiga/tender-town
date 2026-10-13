'use client';

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { toggleLike } from '@/app/auth/actions';
import { useT } from '@/lib/i18n/client';

/**
 * Empty heart → red heart: the user likes a tender or story, which then shows
 * under Following on their profile. Signed out, there is no heart.
 */
export default function HeartButton({ type, id, liked: initial, signedIn, className = '', count }: {
  type: 'tender' | 'news' | 'post' | 'comment' | 'blog'; id: string; liked: boolean; signedIn: boolean; className?: string;
  count?: number;
}) {
  const tr = useT();
  const [liked, setLiked] = useState(initial);
  const [pending, start] = useTransition();
  const router = useRouter();
  const path = usePathname();
  if (!signedIn) return null;
  const shown = count === undefined ? undefined : count + (liked ? 1 : 0) - (initial ? 1 : 0);
  const label = type === 'tender' ? (liked ? tr('Unlike this tender') : tr('Like this tender'))
    : type === 'post' ? (liked ? tr('Unlike this post') : tr('Like this post'))
      : type === 'comment' ? (liked ? tr('Unlike this comment') : tr('Like this comment'))
        : type === 'blog' ? (liked ? tr('Unlike this article') : tr('Like this article'))
          : (liked ? tr('Unlike this story') : tr('Like this story'));

  return (
    <button type="button" className={`heart ${liked ? 'on' : ''} ${shown !== undefined ? 'with-count' : ''} ${className}`} aria-pressed={liked} aria-label={label} title={label}
      disabled={pending}
      onClick={(e) => {
        e.preventDefault(); e.stopPropagation();
        setLiked(!liked);
        start(async () => {
          const r = await toggleLike(type, id);
          if ('error' in r) { setLiked(liked); if (r.error === 'login') router.push(`/login?next=${encodeURIComponent(path || '/')}`); }
          else setLiked(r.liked);
        });
      }}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.5 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.5 0 5.6 3.5 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z" />
      </svg>
      {shown !== undefined && <span className="heart-count">{shown}</span>}
    </button>
  );
}
