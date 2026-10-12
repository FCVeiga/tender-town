'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { saveSource, SaveSourceState } from '@/app/actions';
import {
  FREQUENCIES, METHODS, Method, NOT_CONNECTABLE, SOURCE_GROUPS, SOURCE_TYPES, Source, typeMeta,
} from '@/lib/sourceMeta';
import SourceIcon from './SourceIcon';
import { useLocale, useT } from '@/lib/i18n/client';

type T = ReturnType<typeof useT>;

export type Country = { code: string; name: string };

/** Health of a source as shown by its dot: ok, failing, paused or not monitored. */
export function health(s: Source, t: T, locale: string) {
  if (!s.enabled) return { cls: 'paused', note: t('Paused') };
  if (s.method === 'off') return { cls: 'off', note: NOT_CONNECTABLE.includes(s.source_type) ? t('Not connected — needs API access') : t('Listed, not monitored') };
  if (s.last_error) return { cls: 'err', note: t('Last check failed: {error}', { error: s.last_error }) };
  if (!s.last_checked) return { cls: 'pending', note: `${t(METHODS[s.method].label)} · ${t('first check on the next run')}` };
  return { cls: 'ok', note: `${t(METHODS[s.method].label)} · ${t('checked {date}', { date: new Date(s.last_checked).toLocaleDateString(locale, { day: 'numeric', month: 'short' }) })}` };
}

const fmt = (iso: string | null, t: T, locale: string) =>
  iso ? new Date(iso).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : t('never');

function Submit({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  const t = useT();
  return <button type="submit" className="btn primary" disabled={pending}>{pending ? t('Saving…') : editing ? t('Save changes') : t('Follow source')}</button>;
}

export function SourceForm({ source, countries, onDone, scopeId }: { source: Source | null; countries: Country[]; onDone: () => void; scopeId?: string }) {
  const router = useRouter();
  const [state, action] = useFormState<SaveSourceState, FormData>(saveSource, null);
  const [type, setType] = useState<string>(source?.source_type ?? 'PROCUREMENT_PORTAL');
  const [method, setMethod] = useState<string>(source ? source.method : 'auto');
  const fixedMethod = source?.method === 'ted' || source?.method === 'api' ? source.method : null;
  const social = type.startsWith('SOCIAL_');
  const blocked = NOT_CONNECTABLE.includes(type);
  const t = useT();
  const locale = useLocale();

  useEffect(() => {
    if (!state?.ok) return;
    router.refresh();
    const timer = setTimeout(onDone, 1200);
    return () => clearTimeout(timer);
  }, [state, router, onDone]);

  return (
    <form action={action} className="modal-body">
      <div className="modal-head">
        <h2>{source ? t('Source settings') : t('Follow a source')}</h2>
        <button type="button" className="modal-close" aria-label={t('Close')} onClick={onDone}>×</button>
      </div>
      {source && <input type="hidden" name="source_id" value={source.source_id} />}
      {scopeId && <input type="hidden" name="scope_id" value={scopeId} />}

      <div className="field-row">
        <label className="field">
          <span>{t('Type')}</span>
          <select name="source_type" value={type} onChange={(e) => setType(e.target.value)}>
            {SOURCE_GROUPS.map((g) => (
              <optgroup key={g.key} label={t(g.label)}>
                {SOURCE_TYPES.filter((st) => (g.types as readonly string[]).includes(st.value)).map((st) => <option key={st.value} value={st.value}>{t(st.label)}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t('Country')} <em>{t('(optional)')}</em></span>
          <select name="country" defaultValue={source?.country ?? ''}>
            <option value="">{t('International / EU')}</option>
            {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </label>
      </div>

      <label className="field">
        <span>{social ? (type === 'SOCIAL_REDDIT' ? t('Subreddit or user') : t('Handle or profile URL')) : t('Website or feed URL')}</span>
        <input name="url" required defaultValue={source?.handle || source?.url || ''} autoComplete="off"
               placeholder={type === 'SOCIAL_REDDIT' ? 'r/digitalidentity' : type === 'SOCIAL_TWITTER' ? '@handle' : 'https://…'} />
      </label>
      <label className="field">
        <span>{t('Name')} <em>{t('(optional)')}</em></span>
        <input name="name" defaultValue={source?.name ?? ''} placeholder={t('e.g. {example}', { example: 'Portugal — Base.gov' })} autoComplete="off" />
      </label>

      <div className="field-row">
        <label className="field">
          <span>{t('Monitoring')}</span>
          <select name="method" value={fixedMethod ?? (blocked ? 'off' : method)} onChange={(e) => setMethod(e.target.value)} disabled={!!fixedMethod || blocked}>
            {!source && <option value="auto">{t('Automatic — feed if found, else site search')}</option>}
            {fixedMethod === 'ted' && <option value="ted">{t(METHODS.ted.label)}</option>}
            {fixedMethod === 'api' && <option value="api">{t(METHODS.api.label)}</option>}
            {!fixedMethod && (['rss', 'site_search', 'off'] as Method[]).map((m) => <option key={m} value={m}>{t(METHODS[m].label)}</option>)}
          </select>
          {(fixedMethod || blocked) && <input type="hidden" name="method" value={fixedMethod ?? 'off'} />}
        </label>
        <label className="field">
          <span>{t('Check every')}</span>
          <select name="check_every_days" defaultValue={String(source?.check_every_days ?? 7)} disabled={method === 'rss' || !!fixedMethod || method === 'off'}>
            {FREQUENCIES.map((d) => <option key={d} value={d}>{d === 1 ? t('day') : t('{n} days', { n: d })}</option>)}
          </select>
          {(method === 'rss' || !!fixedMethod || method === 'off') && <input type="hidden" name="check_every_days" value={String(source?.check_every_days ?? 7)} />}
        </label>
      </div>
      <p className="field-hint">
        {blocked ? t('Monitored once API access is set up.')
          : method === 'auto' ? t('Uses the site’s feed if it has one.')
            : t(METHODS[(fixedMethod ?? method) as Method].hint)}
        
      </p>

      <label className="toggle">
        <input type="checkbox" name="enabled" defaultChecked={source?.enabled ?? true} />
        <span>{t('Monitoring on')}</span>
      </label>

      {source && (
        <dl className="source-stats">
          <div><dt>{t('Last check')}</dt><dd>{fmt(source.last_checked, t, locale)}</dd></div>
          <div><dt>{t('Last result')}</dt><dd>{source.last_error ? <span className="err">{source.last_error}</span> : source.number_results_last_run != null ? (source.number_results_last_run === 1 ? t('{n} item', { n: 1 }) : t('{n} items', { n: source.number_results_last_run })) : '—'}</dd></div>
          {source.feed_url && <div className="wide"><dt>{t('Feed')}</dt><dd className="mono">{source.feed_url}</dd></div>}
        </dl>
      )}

      {state && <p className={`form-msg ${state.ok ? 'ok' : 'err'}`}>{state.message}</p>}
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onDone}>{t('Cancel')}</button>
        <Submit editing={!!source} />
      </div>
    </form>
  );
}

export default function SourcesPanel({ sources, countries }: { sources: Source[]; countries: Country[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState<Source | null | undefined>(undefined); // undefined = closed, null = new
  const monitored = sources.filter((s) => s.enabled && s.method !== 'off').length;
  const t = useT();
  const locale = useLocale();

  useEffect(() => {
    if (editing !== undefined) dialog.current?.showModal();
  }, [editing]);
  const close = () => { dialog.current?.close(); setEditing(undefined); };

  return (
    <div className="side-panel">
      <div className="side-head">
        <h3>{t('Following')}</h3>
        <span className="side-count" title={t('{monitored} monitored of {total}', { monitored, total: sources.length })}>{monitored}/{sources.length}</span>
      </div>
      <div className="source-groups">
        {SOURCE_GROUPS.map((g) => {
          const list = sources.filter((s) => (g.types as readonly string[]).includes(s.source_type));
          if (!list.length) return null;
          const failing = list.filter((s) => s.enabled && s.last_error).length;
          return (
            <details key={g.key} className="source-group">
              <summary>
                <span className="group-label">{t(g.label)}</span>
                {failing > 0 && <span className="group-alert" title={t('{n} failing', { n: failing })}>{failing}</span>}
                <span className="group-count">{list.length}</span>
              </summary>
              <ul className="account-list">
                {list.map((s) => {
                  const h = health(s, t, locale);
                  return (
                    <li key={s.source_id}>
                      <button type="button" className={`account ${h.cls}`} title={`${t(typeMeta(s.source_type).label)} · ${h.note}`}
                              onClick={() => setEditing(s)}>
                        <SourceIcon type={s.source_type} size={22} />
                        <span className="account-name">{s.name.replace(/ — national procurement portal$/, '')}</span>
                        <span className={`account-state ${h.cls}`} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </details>
          );
        })}
      </div>
      <button type="button" className="btn add-account" onClick={() => setEditing(null)}>
        <span aria-hidden="true">+</span> {t('Add source')}
      </button>

      <dialog ref={dialog} className="modal" onClose={() => setEditing(undefined)}
              onClick={(e) => { if (e.target === dialog.current) close(); }}>
        {editing !== undefined && (
          <SourceForm key={editing?.source_id ?? 'new'} source={editing} countries={countries} onDone={close} />
        )}
      </dialog>
    </div>
  );
}
