'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { useT } from '@/lib/i18n/client';

/* ---------------- Tabs ---------------- */

const TABS = [
  { href: '/settings/account', label: 'Account' },
  { href: '/settings/profile', label: 'Profile' },
  { href: '/settings/privacy', label: 'Privacy' },
  { href: '/settings/preferences', label: 'Preferences' },
  { href: '/settings/notifications', label: 'Notifications' },
];

export function SettingsTabs() {
  const t = useT();
  const path = usePathname();
  return (
    <nav className="st-tabs" aria-label={t('Settings')}>
      {TABS.map((tab) => (
        <Link key={tab.href} href={tab.href} className={`st-tab ${path?.startsWith(tab.href) ? 'on' : ''}`} aria-current={path === tab.href ? 'page' : undefined}>
          {t(tab.label)}
        </Link>
      ))}
    </nav>
  );
}

/* ---------------- Layout ---------------- */

export function Section({ title, children }: { title: string; children: ReactNode }) {
  const t = useT();
  return (
    <section className="st-section">
      <h2>{t(title)}</h2>
      <div className="st-list">{children}</div>
    </section>
  );
}

const Chevron = () => <svg className="st-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3.5 4.5 4.5L6 12.5" /></svg>;

/** A setting that opens a modal with its options. */
export function Row({ label, hint, value, title, autoOpen = false, wide = false, children }: {
  label: string; hint?: string; value?: ReactNode; title?: string; autoOpen?: boolean; wide?: boolean; children: (close: () => void) => ReactNode;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  useEffect(() => { if (autoOpen) setOpen(true); }, [autoOpen]);
  return (
    <>
      <button type="button" className="st-row" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span className="st-text"><strong>{t(label)}</strong>{hint && <em>{t(hint)}</em>}</span>
        {value !== undefined && <span className="st-value">{value}</span>}
        <Chevron />
      </button>
      {open && <Modal title={t(title ?? label)} wide={wide} onClose={() => setOpen(false)}>{children(() => setOpen(false))}</Modal>}
    </>
  );
}

/** A setting that opens its own page. */
export function LinkRow({ label, hint, value, href }: { label: string; hint?: string; value?: ReactNode; href: string }) {
  const t = useT();
  return (
    <Link href={href} className="st-row">
      <span className="st-text"><strong>{t(label)}</strong>{hint && <em>{t(hint)}</em>}</span>
      {value !== undefined && <span className="st-value">{value}</span>}
      <Chevron />
    </Link>
  );
}

/** An on/off setting: saved as you switch (reverts if saving fails). */
export function ToggleRow({ label, hint, on, onToggle }: {
  label: string; hint?: string; on: boolean; onToggle: (next: boolean) => Promise<{ error?: string }>;
}) {
  const t = useT();
  const [value, setValue] = useState(on);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const router = useRouter();
  const flip = () => {
    const next = !value;
    setValue(next); setError(null);
    start(async () => { const r = await onToggle(next); if (r?.error) { setValue(!next); setError(r.error); } else router.refresh(); });
  };
  return (
    <div className="st-row static">
      <span className="st-text"><strong>{t(label)}</strong>{hint && <em>{t(hint)}</em>}{error && <em className="err">{error}</em>}</span>
      <button type="button" role="switch" aria-checked={value} aria-label={t(label)} className={`switch ${value ? 'on' : ''}`} onClick={flip}><span /></button>
    </div>
  );
}

/** A setting with its own button (e.g. connect / disconnect). */
export function ActionRow({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  const t = useT();
  return (
    <div className="st-row static">
      <span className="st-text"><strong>{t(label)}</strong>{hint && <em>{hint}</em>}</span>
      <span className="st-action">{children}</span>
    </div>
  );
}

/* ---------------- Modal ---------------- */

export function Modal({ title, onClose, children, wide = false, className = '', portal = false }: {
  title: string; onClose: () => void; children: ReactNode; wide?: boolean; className?: string; portal?: boolean;
}) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  const node = (
    <dialog ref={ref} className={`modal${wide ? ' modal-wide' : ''}${className ? ` ${className}` : ''}`} onClose={onClose} onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
      <div className="modal-body">
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="modal-close" aria-label={t('Close')} onClick={() => ref.current?.close()}>×</button>
        </div>
        {children}
      </div>
    </dialog>
  );
  // The banner creates a stacking context. A dialog left inside it paints under the phone tab bar.
  if (portal && typeof document !== 'undefined') return createPortal(node, document.body);
  return node;
}

/** A list of choices inside a modal: picking one saves it and closes. */
export function Choices({ options, value, onPick, close }: {
  options: { value: string; label: string; hint?: string }[]; value: string | null;
  onPick: (v: string) => Promise<{ error?: string }>; close: () => void;
}) {
  const t = useT();
  const [current, setCurrent] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="st-choices" role="radiogroup">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={current === o.value} disabled={pending}
          className={`st-choice ${current === o.value ? 'on' : ''}`}
          onClick={() => {
            const prev = current; setCurrent(o.value); setError(null);
            start(async () => { const r = await onPick(o.value); if (r?.error) { setCurrent(prev); setError(r.error); } else { router.refresh(); close(); } });
          }}>
          <span className="st-text"><strong>{t(o.label)}</strong>{o.hint && <em>{t(o.hint)}</em>}</span>
          <span className="st-radio" aria-hidden="true" />
        </button>
      ))}
      {error && <p className="form-msg err">{error}</p>}
    </div>
  );
}

/** Modal footer: Cancel and Save. */
export function ModalActions({ close, pending, label = 'Save', disabled = false, danger = false }: {
  close: () => void; pending: boolean; label?: string; disabled?: boolean; danger?: boolean;
}) {
  const t = useT();
  return (
    <div className="modal-actions">
      <button type="button" className="btn" onClick={close}>{t('Cancel')}</button>
      <button type="submit" className={`btn ${danger ? 'danger' : 'primary'}`} disabled={pending || disabled}>{pending ? t('Saving…') : t(label)}</button>
    </div>
  );
}

/** A small form inside a modal that calls a server action and closes on success. */
export function useSave(close: () => void) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const save = (fn: () => Promise<{ error?: string } | void>) => {
    setError(null);
    start(async () => {
      const r = await fn();
      if (r && 'error' in r && r.error) setError(r.error);
      else { router.refresh(); close(); }
    });
  };
  return { pending, error, save };
}
