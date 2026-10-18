'use client';

import { useSearchParams, usePathname } from 'next/navigation';
import { useT } from '@/lib/i18n/client';

/** Navbar search: a plain GET form to /search, prefilled while on the results page. */
export default function SearchBox() {
  const t = useT();
  const params = useSearchParams();
  const onSearch = usePathname() === '/search';
  return (
    <form action="/search" role="search" className="search-box" data-search="1">
      <span className="search-mark" aria-hidden="true">
        <img src="/brand/favicon.png" alt="" className="brand-img light" />
        <img src="/brand/favicon-white.png" alt="" className="brand-img dark" />
      </span>
      <input
        type="search" name="q" placeholder={t('Search Tender Town')}
        defaultValue={onSearch ? params.get('q') ?? '' : ''} key={onSearch ? params.get('q') : 'idle'}
        aria-label={t('Search Tender Town')} autoComplete="off"
      />
    </form>
  );
}
