'use client';

import { useEffect, useId, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useT } from '@/lib/i18n/client';
import { chooseScope, rememberFocus, rememberIntent } from '@/app/scope/actions';
import { Modal } from '@/components/settings/SettingsUI';
import type { FocusModel } from '@/lib/scopeFocus';

type Gate = { action: 'switch' | 'create'; kind: 'plan' | 'permission' | 'signup' | 'limit'; scopeId?: string };

const COPY = 'Explore tenders, funding and news in your market. Create a custom scope to put specialised agents to work finding opportunities, analysing requirements and preparing proposal briefs.';

function limitText(t: (k: string, v?: Record<string, string | number>) => string, allowance: number | null, used: number, planName: string) {
  if (!allowance) return t('The Free plan includes only General.');
  if (allowance === 1) return t('The {plan} plan includes 1 scope besides General. This workspace is already using {used}.', { plan: planName, used });
  return t('The {plan} plan includes {n} scopes besides General. This workspace is already using {used}.', { plan: planName, n: allowance, used });
}

function BannerArt() {
  return (
    <div className="scope-banner-bg" aria-hidden="true">
      <img className="scope-banner-art light" src="/brand/sidebar-banner-light.jpg" alt="" />
      <img className="scope-banner-art dark" src="/brand/sidebar-banner.jpg" alt="" />
    </div>
  );
}

export function ScopeBannerFallback() {
  const t = useT();
  return (
    <section className="scope-banner" aria-busy="true">
      <BannerArt />
      <div className="scope-banner-inner">
        <div className="scope-banner-lead">
          <p className="scope-banner-kicker">{t('Choose your scope. Find your next opportunity.')}</p>
          <p className="scope-banner-copy">{t(COPY)}</p>
        </div>
        <div className="scope-banner-actions">
          <button type="button" className="scope-banner-select" disabled>{t('Loading scope')}</button>
          <button type="button" className="btn primary scope-banner-create" disabled>{t('+ Create a scope')}</button>
        </div>
      </div>
    </section>
  );
}

export default function ScopeBanner({ model, createAction }: { model: FocusModel; createAction: (() => Promise<void>) | null }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [gate, setGate] = useState<Gate | null>(model.deny ? { action: 'switch', kind: model.deny.kind, scopeId: model.deny.scopeId } : null);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const tried = useRef<string | null>(null);
  const synced = useRef<string | null>(null);
  const latest = useRef(0);
  const chain = useRef(Promise.resolve());
  const listId = useId();
  const current = model.hold || model.current;
  const yours = model.choices.filter((c) => c.group === 'yours');
  const published = model.choices.filter((c) => c.group === 'public');

  const apply = (id: string) => {
    const mine = ++latest.current;
    const shown = model.hold ? null : model.current?.id ?? null;
    chain.current = chain.current.catch(() => undefined).then(async () => {
      if (mine !== latest.current) return;
      const result = await chooseScope(id);
      if (mine !== latest.current) {
        if (shown) await rememberFocus(shown);
        return;
      }
      if ('kind' in result) {
        setGate({ action: 'switch', kind: result.kind, scopeId: id });
        if (model.hold) {
          const url = new URL(window.location.href);
          url.searchParams.delete('scope');
          url.searchParams.delete('n');
          const q = url.searchParams.toString();
          router.replace(q ? `${url.pathname}?${q}` : url.pathname);
        }
        return;
      }
      const url = new URL(window.location.href);
      url.searchParams.delete('n');
      if (result.slug) url.searchParams.set('scope', result.slug);
      else url.searchParams.delete('scope');
      const q = url.searchParams.toString();
      router.push(q ? `${url.pathname}?${q}` : url.pathname);
    });
  };

  useEffect(() => {
    if (!model.hold) return;
    if (tried.current === model.hold.id) return;
    tried.current = model.hold.id;
    apply(model.hold.id);
    // apply closes over the hold id captured above; a newer click supersedes it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.hold]);

  useEffect(() => {
    if (!model.signedIn || model.hold || model.deny || !model.current) return;
    const slug = new URLSearchParams(window.location.search).get('scope')?.trim().toLowerCase() || '';
    if (!slug) return;
    const id = model.current.id;
    if (slug !== id.toLowerCase() && slug !== (model.publicSlug || '').toLowerCase()) return;
    if (synced.current === id) return;
    synced.current = id;
    rememberFocus(id);
  }, [model.signedIn, model.hold, model.deny, model.current, model.publicSlug]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const node = list.current?.querySelector<HTMLElement>('[data-active="true"]');
    node?.focus();
  }, [open, active]);

  const go = (id: string, locked: null | 'plan' | 'permission') => {
    setOpen(false);
    if (locked) {
      latest.current += 1;
      setGate({ action: 'switch', kind: locked, scopeId: id });
      return;
    }
    if (id === model.current?.id && !model.hold) {
      latest.current += 1;
      return;
    }
    apply(id);
  };

  const onListKey = (event: React.KeyboardEvent) => {
    const max = model.choices.length - 1;
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      button.current?.focus();
      return;
    }
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive((n) => Math.min(max, n + 1)); }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActive((n) => Math.max(0, n - 1)); }
    if (event.key === 'Home') { event.preventDefault(); setActive(0); }
    if (event.key === 'End') { event.preventDefault(); setActive(max); }
  };

  const indexOf = (id: string) => model.choices.findIndex((c) => c.id === id);

  return (
    <section className="scope-banner" aria-busy={!!model.hold}>
      <BannerArt />
      <div className="scope-banner-inner">
      <div className="scope-banner-lead">
        <p className="scope-banner-kicker">{t('Choose your scope. Find your next opportunity.')}</p>
        <p className="scope-banner-copy">{t(COPY)}</p>
        {!model.choices.length && <p className="form-msg err">{t('Could not load scopes.')}</p>}
      </div>
      <div className="scope-banner-actions">
        <div className="scope-banner-picker" ref={box}>
          <button
            ref={button} type="button" className="scope-banner-select" aria-haspopup="listbox"
            aria-expanded={open} aria-controls={listId} disabled={!model.choices.length}
            onClick={() => { setActive(Math.max(0, indexOf(current?.id || ''))); setOpen((v) => !v); }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') { setOpen(false); return; }
              if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setActive(Math.max(0, indexOf(current?.id || '')));
                setOpen(true);
              }
            }}>
            <span>{current ? t(current.name) : t('Loading scope')}</span>
            <Chevron />
          </button>
          {open && (
            <div ref={list} id={listId} className="scope-menu" role="listbox" aria-label={t('Scopes')} tabIndex={-1} onKeyDown={onListKey}>
              {published.map((choice) => (
                <Option key={choice.id} choice={choice} active={model.choices[active]?.id === choice.id} selected={choice.id === current?.id} onPick={() => go(choice.id, choice.locked)} />
              ))}
              {yours.length > 0 && <p className="scope-menu-label">{t('Your scopes')}</p>}
              {yours.map((choice) => (
                <Option key={choice.id} choice={choice} active={model.choices[active]?.id === choice.id} selected={choice.id === current?.id} onPick={() => go(choice.id, choice.locked)} />
              ))}
            </div>
          )}
        </div>
        {createAction ? (
          <form action={createAction}>
            <button type="submit" className="btn primary scope-banner-create">{t('+ Create a scope')}</button>
          </form>
        ) : (
          <button type="button" className="btn primary scope-banner-create" onClick={() => setGate({ action: 'create', kind: model.create === 'ok' ? 'plan' : model.create })}>
            {t('+ Create a scope')}
          </button>
        )}
      </div>
      </div>
      {gate && (
        <GateModal gate={gate} model={model} onClose={() => setGate(null)} />
      )}
    </section>
  );
}

function Option({ choice, active, selected, onPick }: {
  choice: FocusModel['choices'][number]; active: boolean; selected: boolean; onPick: () => void;
}) {
  const t = useT();
  return (
    <button
      type="button" role="option" data-active={active ? 'true' : undefined} aria-selected={selected}
      tabIndex={-1} className={`scope-option ${selected ? 'on' : ''} ${choice.locked ? 'locked' : ''}`}
      onClick={onPick} onMouseEnter={(event) => event.currentTarget.focus()}>
      <span>
        <strong>{t(choice.name)}</strong>
        {choice.description && <em>{choice.description}</em>}
      </span>
      {choice.locked ? <Lock /> : selected ? <Check /> : <span className="scope-option-mark" />}
    </button>
  );
}

function GateModal({ gate, model, onClose }: { gate: Gate; model: FocusModel; onClose: () => void }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const permission = gate.kind === 'permission';
  const signup = gate.kind === 'signup' || (!model.signedIn && gate.action === 'create');
  const title = signup || gate.action === 'create' ? t('Create your own scope') : permission ? t('Scope unavailable') : t('Unlock more scopes');
  const body = signup
    ? t('Custom scopes require a paid account.')
    : permission
      ? (gate.action === 'create'
        ? t('Only a workspace administrator can create scopes. Ask them for access.')
        : t('This scope is not on in your workspace. Ask a workspace administrator to turn it on.'))
      : gate.action === 'create' && gate.kind === 'plan'
        ? t('The Free plan does not include custom scopes.')
        : limitText(t, model.allowance, model.used, model.planName);
  const next = '/settings/account?plan=1&intent=create';
  const upgrade = () => start(async () => {
    const intent = gate.action === 'switch' && gate.scopeId ? `switch:${gate.scopeId}` : 'create';
    await rememberIntent(intent);
    router.push(model.signedIn ? '/settings/account?plan=1' : `/signup?next=${encodeURIComponent('/settings/account?plan=1&intent=create')}`);
  });
  return (
    <Modal title={title} onClose={onClose}>
      <p className="scope-gate-copy">{body}</p>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose}>{t('Close')}</button>
        {signup && (
          <Link className="btn primary" href={`/signup?next=${encodeURIComponent(next)}`}>{t('Sign up and choose a plan')}</Link>
        )}
        {!signup && !permission && (
          <button type="button" className="btn primary" disabled={pending} onClick={upgrade}>{t('Upgrade plan')}</button>
        )}
      </div>
    </Modal>
  );
}

function Chevron() {
  return <svg className="scope-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" /></svg>;
}
function Check() {
  return <svg className="scope-check" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.2l3 3 6-6.5" /></svg>;
}
function Lock() {
  return <svg className="scope-lock" viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="7" width="9" height="6.5" rx="1.2" /><path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7" /></svg>;
}

