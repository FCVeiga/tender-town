'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const NAMES = new Set([
  'signup_cta_clicked', 'signup_form_started', 'scope_selected', 'search_submitted',
  'gate_viewed', 'gate_cta_clicked', 'document_opened', 'example_opened',
  'example_evaluation_started', 'example_evaluation_completed', 'example_brief_started', 'example_brief_completed',
  'agent_connection_opened', 'agent_instructions_copied', 'engagement_recorded',
]);

function flow() {
  try {
    let id = sessionStorage.getItem('tt_flow');
    if (!id) { id = crypto.randomUUID(); sessionStorage.setItem('tt_flow', id); }
    document.cookie = `tt_flow=${id}; path=/; max-age=86400; samesite=lax`;
    return id;
  } catch { return null; }
}

export function track(name: string, props: Record<string, string | number | boolean | null | undefined> = {}) {
  if (!NAMES.has(name) || document.cookie.includes('tt_consent=no')) return;
  const clean: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(props)) if (value != null && value !== '') clean[key] = value;
  const body = JSON.stringify({ id: crypto.randomUUID(), name, props: clean });
  if (navigator.sendBeacon) navigator.sendBeacon('/api/collect', new Blob([body], { type: 'application/json' }));
  else void fetch('/api/collect', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true });
}

/** Clicks on data-track, plus visible time on the page. Background tabs do not count. */
export default function Track() {
  const pathname = usePathname() || '/';
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const el = (event.target as HTMLElement | null)?.closest?.('[data-track]') as HTMLElement | null;
      if (!el) return;
      const name = el.getAttribute('data-track') || '';
      if (name === 'signup_form_started' || name === 'oauth_started') flow();
      track(name, {
        placement: el.getAttribute('data-placement'),
        cta: el.getAttribute('data-cta'),
        scopeId: el.getAttribute('data-scope'),
        contentId: el.getAttribute('data-content'),
        path: pathname,
        pageType: el.getAttribute('data-page'),
        entitlement: el.getAttribute('data-gate'),
      });
    };
    const onFocus = (event: FocusEvent) => {
      const form = (event.target as HTMLElement | null)?.closest?.('form[data-signup]') as HTMLFormElement | null;
      if (!form || form.dataset.started) return;
      form.dataset.started = '1';
      flow();
      track('signup_form_started', { path: pathname, pageType: 'signup' });
    };
    const onSubmit = (event: Event) => {
      const form = event.target as HTMLFormElement | null;
      if (!form || !form.hasAttribute('data-search')) return;
      track('search_submitted', { path: pathname, pageType: 'search' });
    };
    document.addEventListener('click', onClick);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('submit', onSubmit);
    let visibleSince = document.visibilityState === 'visible' ? Date.now() : 0;
    let accumulated = 0;
    let maxScroll = 0;
    const id = `engage:${pathname}`;
    const send = () => {
      if (visibleSince) { accumulated += Date.now() - visibleSince; visibleSince = 0; }
      const doc = document.documentElement;
      const scroll = doc.scrollHeight > doc.clientHeight ? Math.round((doc.scrollTop + doc.clientHeight) / doc.scrollHeight * 100) : 100;
      maxScroll = Math.max(maxScroll, scroll);
      if (accumulated < 1000) return;
      const body = JSON.stringify({
        id, name: 'engagement_recorded',
        props: { path: pathname, durationMs: accumulated, scrollPct: maxScroll },
      });
      if (navigator.sendBeacon) navigator.sendBeacon('/api/collect', new Blob([body], { type: 'application/json' }));
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') visibleSince = Date.now();
      else send();
    };
    const onScroll = () => {
      const doc = document.documentElement;
      const scroll = doc.scrollHeight > doc.clientHeight ? (doc.scrollTop + doc.clientHeight) / doc.scrollHeight * 100 : 100;
      maxScroll = Math.max(maxScroll, scroll);
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pagehide', send);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      send();
      document.removeEventListener('click', onClick);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('submit', onSubmit);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pagehide', send);
      window.removeEventListener('scroll', onScroll);
    };
  }, [pathname]);
  return null;
}
