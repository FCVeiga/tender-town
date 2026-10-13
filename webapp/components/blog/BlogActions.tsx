'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { toggleLike } from '@/app/auth/actions';
import { useT } from '@/lib/i18n/client';

/** Like, comment and share under a blog row or at the top of an article. */
export default function BlogActions({ slug, href, title, likes, liked: initial, comments, signedIn }: {
  slug: string; href: string; title: string; likes: number; liked: boolean; comments: number; signedIn: boolean;
}) {
  const t = useT();
  const [liked, setLiked] = useState(initial);
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const path = usePathname();
  const box = useRef<HTMLDivElement>(null);
  const shown = likes + (liked ? 1 : 0) - (initial ? 1 : 0);
  const likeLabel = liked ? t('Unlike this article') : t('Like this article');

  useEffect(() => {
    if (!shareOpen) return;
    const down = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setShareOpen(false); };
    document.addEventListener('mousedown', down);
    return () => document.removeEventListener('mousedown', down);
  }, [shareOpen]);

  const url = () => `${window.location.origin}${href}`;
  const open = (u: string) => { window.open(u, '_blank', 'noopener,noreferrer'); setShareOpen(false); };
  const login = () => router.push(`/login?next=${encodeURIComponent(path || href)}`);

  return (
    <div className="blog-actions">
      <button type="button" className={`heart ${liked ? 'on' : ''}`} aria-pressed={liked} aria-label={likeLabel} title={likeLabel} disabled={pending}
        onClick={() => {
          if (!signedIn) { login(); return; }
          setLiked(!liked);
          start(async () => {
            const r = await toggleLike('blog', slug);
            if ('error' in r) { setLiked(liked); if (r.error === 'login') login(); }
            else setLiked(r.liked);
          });
        }}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.5 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.5 0 5.6 3.5 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z" />
        </svg>
        <span>{shown}</span>
      </button>
      <Link href={`${href}#comments`} aria-label={comments === 1 ? t('{n} comment', { n: comments }) : t('{n} comments', { n: comments })}>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 4.5h13v8.6h-7.2L5.6 16v-2.9H3.5z" /></svg>
        <span>{comments}</span>
      </Link>
      <div className="blog-share" ref={box}>
        <button type="button" aria-haspopup="menu" aria-expanded={shareOpen} aria-label={t('Share')} title={t('Share')} onClick={() => setShareOpen(!shareOpen)}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M11 4.5 16 9l-5 4.5V11c-4 0-6.5 1.2-8 4 .5-4.3 3-7 8-7.5z" /></svg>
        </button>
        {shareOpen && (
          <div className="card-menu-list" role="menu">
            <button type="button" role="menuitem" onClick={async () => { await navigator.clipboard.writeText(url()); setCopied(true); setTimeout(() => { setCopied(false); setShareOpen(false); }, 1200); }}>
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.6 9.4a2.6 2.6 0 0 0 3.7 0l2-2a2.6 2.6 0 0 0-3.7-3.7l-.6.6M9.4 6.6a2.6 2.6 0 0 0-3.7 0l-2 2a2.6 2.6 0 0 0 3.7 3.7l.6-.6" /></svg>{copied ? t('Link copied') : t('Copy link')}
            </button>
            {typeof navigator !== 'undefined' && 'share' in navigator && (
              <button type="button" role="menuitem" onClick={() => { navigator.share({ title, url: url() }).catch(() => {}); setShareOpen(false); }}>
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v8M5 5l3-3 3 3M3.5 8v5.5h9V8" /></svg>{t('Share via…')}
              </button>
            )}
            <button type="button" role="menuitem" onClick={() => open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url())}`)}>
              <span className="ca-brand">in</span>LinkedIn
            </button>
            <button type="button" role="menuitem" onClick={() => open(`https://x.com/intent/post?url=${encodeURIComponent(url())}&text=${encodeURIComponent(title)}`)}>
              <span className="ca-brand">X</span>X
            </button>
            <button type="button" role="menuitem" onClick={() => { window.location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(url())}`; setShareOpen(false); }}>
              <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3.5" width="12" height="9" rx="1.5" /><path d="m2.5 4.5 5.5 4 5.5-4" /></svg>{t('Email')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
