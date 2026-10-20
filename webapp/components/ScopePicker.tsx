'use client';

import { useEffect, useId, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useT } from '@/lib/i18n/client';
import { chooseScope, rememberFocus, rememberIntent } from '@/app/scope/actions';
import { createScope } from '@/app/workspaces/actions';
import { Modal } from '@/components/settings/SettingsUI';
import type { FocusModel } from '@/lib/scopeFocus';
import { track } from '@/components/Track';

type Gate = { action: 'switch' | 'create'; kind: 'plan' | 'permission' | 'signup' | 'limit'; scopeId?: string };

function limitText(
  t: (k: string, v?: Record<string, string | number>) => string,
  pool: 'default' | 'custom', allowance: number | null, used: number, planName: string,
) {
  if (pool === 'custom') {
    if (allowance === 1) return t('The {plan} plan includes 1 custom scope. This workspace is already using {used}.', { plan: planName, used });
    return t('The {plan} plan includes {n} custom scopes. This workspace is already using {used}.', { plan: planName, n: allowance ?? 0, used });
  }
  if (allowance === 1) return t('The {plan} plan includes 1 default scope. This workspace is already using {used}.', { plan: planName, used });
  return t('The {plan} plan includes {n} default scopes. This workspace is already using {used}.', { plan: planName, n: allowance ?? 0, used });
}

/** Scope switcher for the page, in the same row the home sort pills used. */
export default function ScopePicker({ model }: { model: FocusModel }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [creating, startCreate] = useTransition();
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
  const q = query.trim().toLowerCase();
  const matches = (choice: FocusModel['choices'][number]) => !q
    || choice.name.toLowerCase().includes(q)
    || t(choice.name).toLowerCase().includes(q)
    || choice.description.toLowerCase().includes(q);
  const shownPublic = published.filter(matches);
  const shownYours = yours.filter(matches);
  const shown = [...shownPublic, ...shownYours];
  const createIndex = shown.length;

  const beginCreate = () => {
    setOpen(false);
    if (model.create === 'ok' && model.workspaceId) {
      const workspaceId = model.workspaceId;
      startCreate(() => { void createScope(workspaceId); });
      return;
    }
    const kind = model.create === 'ok' ? 'permission' : model.create;
    setGate({ action: 'create', kind });
    track('gate_viewed', { entitlement: kind, path: window.location.pathname });
  };

  const apply = (id: string) => {
    window.dispatchEvent(new CustomEvent('tt-scope-pending', { detail: id }));
    const mine = ++latest.current;
    const shownNow = model.hold ? null : model.current?.id ?? null;
    chain.current = chain.current.catch(() => undefined).then(async () => {
      if (mine !== latest.current) return;
      const result = await chooseScope(id);
      if (mine !== latest.current) {
        if (shownNow) await rememberFocus(shownNow);
        return;
      }
      if ('kind' in result) {
        window.dispatchEvent(new CustomEvent('tt-scope-cancel', { detail: id }));
        setGate({ action: 'switch', kind: result.kind, scopeId: id });
        track('gate_viewed', { scopeId: id, entitlement: result.kind, path: window.location.pathname });
        if (model.hold) {
          const url = new URL(window.location.href);
          url.searchParams.delete('scope');
          url.searchParams.delete('n');
          const queryString = url.searchParams.toString();
          router.replace(queryString ? `${url.pathname}?${queryString}` : url.pathname);
        }
        return;
      }
      const url = new URL(window.location.href);
      url.searchParams.delete('n');
      track('scope_selected', { scopeId: id, path: window.location.pathname });
      if (result.slug) url.searchParams.set('scope', result.slug);
      else url.searchParams.delete('scope');
      const queryString = url.searchParams.toString();
      router.push(queryString ? `${url.pathname}?${queryString}` : url.pathname);
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
    const openMenu = () => {
      setQuery('');
      setActive(0);
      setOpen(true);
    };
    window.addEventListener('tt-open-scopes', openMenu);
    return () => window.removeEventListener('tt-open-scopes', openMenu);
  }, []);

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
    list.current?.querySelector<HTMLInputElement>('input')?.focus();
    const node = button.current;
    if (!node) return;
    const bottom = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bottom-h')) || 0;
    if (bottom <= 0) return;
    const room = window.innerHeight - node.getBoundingClientRect().bottom - bottom - 12;
    if (room >= 332) return;
    window.scrollTo({ top: Math.max(0, window.scrollY + node.getBoundingClientRect().top - 12) });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const node = list.current?.querySelector<HTMLElement>('[data-active="true"]');
    const focus = document.activeElement;
    if (node && list.current?.contains(focus) && focus?.tagName !== 'INPUT') node.focus();
  }, [active, open]);

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
    const max = createIndex;
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
    if (event.key === 'Enter') {
      event.preventDefault();
      if (active === createIndex) beginCreate();
      else if (shown[active]) go(shown[active].id, shown[active].locked);
    }
  };

  const shownAt = Math.max(0, shown.findIndex((c) => c.id === (current?.id || '')));

  return (
    <div className="feed-scope" ref={box}>
      <button
        ref={button} type="button" className="feed-sort-link active feed-scope-btn" aria-haspopup="listbox"
        aria-expanded={open} aria-controls={listId} disabled={!model.choices.length}
        onClick={() => { setQuery(''); setActive(shownAt); setOpen((v) => !v); }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') { setOpen(false); return; }
          if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setQuery('');
            setActive(shownAt);
            setOpen(true);
          }
        }}>
        <span>{current ? t(current.name) : t('Loading scope')}</span>
        <Chevron />
      </button>
      {!model.choices.length && <p className="form-msg err">{t('Could not load scopes.')}</p>}
      {open && (
        <div ref={list} id={listId} className="scope-menu" role="listbox" aria-label={t('Scopes')} tabIndex={-1} onKeyDown={onListKey}>
          <input
            className="scope-search" value={query} placeholder={t('Search scopes')} aria-label={t('Search scopes')}
            onChange={(event) => { setQuery(event.target.value); setActive(0); }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                event.stopPropagation();
                setActive(0);
                list.current?.querySelector<HTMLElement>('[role="option"]')?.focus();
              }
              if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); button.current?.focus(); }
              if (event.key === 'Enter' && shown[0]) { event.preventDefault(); go(shown[0].id, shown[0].locked); }
            }} />
          {shownPublic.map((choice) => (
            <Option key={choice.id} choice={choice} active={shown[active]?.id === choice.id} selected={choice.id === current?.id} onPick={() => go(choice.id, choice.locked)} />
          ))}
          {shownYours.length > 0 && <p className="scope-menu-label">{t('Your scopes')}</p>}
          {shownYours.map((choice) => (
            <Option key={choice.id} choice={choice} active={shown[active]?.id === choice.id} selected={choice.id === current?.id} onPick={() => go(choice.id, choice.locked)} />
          ))}
          {shown.length === 0 && <p className="scope-menu-empty">{t('No scopes match that search.')}</p>}
          <button
            type="button" role="option" data-active={active === createIndex ? 'true' : undefined} aria-selected={false}
            tabIndex={-1} className="scope-option create" disabled={creating}
            onClick={beginCreate} onMouseEnter={(event) => { setActive(createIndex); event.currentTarget.focus(); }}>
            <span><strong>{t('Create scope')}</strong></span>
            <Plus />
          </button>
        </div>
      )}
      {gate && <GateModal gate={gate} model={model} onClose={() => setGate(null)} />}
    </div>
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
  const freeCreate = t('The Free plan includes 1 default scope. Custom scopes start on Starter.');
  const pool = model.choices.find((c) => c.id === gate.scopeId)?.group === 'yours' ? 'custom' : 'default';
  const body = signup
    ? freeCreate
    : permission
      ? (gate.action === 'create'
        ? t('Only a workspace administrator can create scopes. Ask them for access.')
        : t('This scope is not on in your workspace. Ask a workspace administrator to turn it on.'))
      : gate.action === 'create' && gate.kind === 'plan'
        ? freeCreate
        : gate.action === 'create'
          ? limitText(t, 'custom', model.customAllowance, model.customUsed, model.planName)
          : limitText(t, pool, pool === 'custom' ? model.customAllowance : model.defaultAllowance, pool === 'custom' ? model.customUsed : model.defaultUsed, model.planName);
  const next = '/settings/account?plan=1&intent=create';
  const upgrade = () => start(async () => {
    const intent = gate.action === 'switch' && gate.scopeId ? `switch:${gate.scopeId}` : 'create';
    await rememberIntent(intent);
    router.push(model.signedIn ? '/settings/account?plan=1' : `/signup?next=${encodeURIComponent('/settings/account?plan=1&intent=create')}`);
  });
  return (
    <Modal title={title} onClose={onClose}>
      <p className="scope-gate-copy">{body}</p>
      {signup && <p className="scope-gate-copy">{t('Create a scope with your own markets, company context and agent instructions to find and assess opportunities relevant to your business.')}</p>}
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose}>{t('Close')}</button>
        {signup && (
          <Link className="btn primary" href={`/signup?next=${encodeURIComponent(next)}`} data-track="signup_cta_clicked" data-placement="gate" data-cta="signup" data-gate="scope">{t('Sign up and choose a plan')}</Link>
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
function Plus() {
  return <svg className="scope-check" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.5v9M3.5 8h9" /></svg>;
}
