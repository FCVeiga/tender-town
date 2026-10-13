'use client';

import { useRouter } from 'next/navigation';

/** A filter link. The next numbers replace the section without jumping to the top. */
export default function DashLink({ href, className, current, children }: {
  href: string; className?: string; current?: boolean; children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <a href={href} className={className} aria-current={current ? 'page' : undefined}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        router.push(href, { scroll: false });
      }}>
      {children}
    </a>
  );
}
