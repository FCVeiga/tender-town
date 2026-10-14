'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import AgentAvatar from '@/components/AgentAvatar';
import {
  FormState, resetAgentConfig, saveAgentConfig, saveAgentTuning, saveSearchScope, setAgentEnabled,
} from '@/app/workspaces/actions';
import type { AgentDef } from '@/lib/agents';
import { useT } from '@/lib/i18n/client';
import { PlanUpgradeButton, type PlanState } from './PlanPanel';

function Submit({ label, busy, primary }: { label: string; busy: string; primary?: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" className={`btn ${primary ? 'primary' : ''}`} disabled={pending}>{pending ? busy : label}</button>;
}

/**
 * One agent on Workspace: face, name, on/off, plain-language instructions
 * (for the Search Agent: the search scope), and its configuration — shown
 * and editable under "Open config"; what is saved there is what it runs on.
 */
export default function AgentCard({ agent, enabled, instructions, config, custom, status, error, scopeId = null, readOnly = false, locked = false, upgrade = null }: {
  agent: AgentDef; enabled: boolean; instructions: string | null; config: string | null;
  custom: boolean; status: string | null; error: string | null;
  scopeId?: string | null;   // scope agents: the scope they belong to; workspace agents: null
  readOnly?: boolean;        // members, Free plan, and workspace agents for non–platform admins
  locked?: boolean;          // plan does not include this agent
  upgrade?: { userId: string; admin: boolean; plan: PlanState } | null;
}) {
  const router = useRouter();
  const t = useT();
  const search = agent.key === 'search';
  const editable = (agent.fineTune || search) && !readOnly && !locked;
  const [on, setOn] = useState(enabled);
  const [, start] = useTransition();
  const dialog = useRef<HTMLDialogElement>(null);
  const [tuneState, tune] = useFormState<FormState, FormData>(search ? saveSearchScope : saveAgentTuning, null);
  const [editState, save] = useFormState<FormState, FormData>(saveAgentConfig, null);
  const [draft, setDraft] = useState(config ?? '');
  useEffect(() => setDraft(config ?? ''), [config]);  // a fresh config after a save or a rewrite

  return (
    <div className={`agent-card ${on ? '' : 'off'}`}>
      <div className="agent-card-head">
        <AgentAvatar agent={agent.key} size={42} off={!on} />
        <div className="agent-card-id">
          <h3>{t(agent.name)}</h3>
          <span className="agent-runs">{agent.runs === 'pipeline' ? t('Daily pipeline') : agent.runs === 'on click' ? t('On click') : t('When a story is opened')}{custom ? ` · ${t('customised')}` : ''}</span>
        </div>
        <button type="button" role="switch" aria-checked={locked ? false : on} aria-label={`${t(agent.name)} ${locked ? t('off') : on ? t('on') : t('off')}`}
          className={`switch ${!locked && on ? 'on' : ''}`} disabled={readOnly || locked}
          onClick={() => { const next = !on; setOn(next); start(() => setAgentEnabled(agent.key, next, scopeId)); }}>
          <span />
        </button>
      </div>
      <p className="agent-role">{t(agent.role)}</p>

      {locked && upgrade ? (
        <div className="agent-card-actions">
          <PlanUpgradeButton label={t('Upgrade plan')} className="btn" userId={upgrade.userId} admin={upgrade.admin} plan={upgrade.plan} />
        </div>
      ) : config && (
        <div className="agent-card-actions">
          <button type="button" className="btn" onClick={() => dialog.current?.showModal()}>{t('Open config')}</button>
        </div>
      )}

      {editable && (
        <form action={tune} className="agent-tune">
          <input type="hidden" name="agent" value={agent.key} />
          {scopeId && <input type="hidden" name="scopeId" value={scopeId} />}
          <label className="field">
            <span>{t('Fine-tuning')} <em>{t('— in plain language')}</em></span>
            <textarea name={search ? 'scope' : 'instructions'} rows={3} defaultValue={instructions ?? ''} maxLength={search ? 8000 : 6000}
              placeholder={t('e.g. {example}', { example: t(EXAMPLES[agent.key] ?? 'Be more concise.') })} />
          </label>
          {tuneState ? <p className={`form-msg ${tuneState.ok ? 'ok' : 'err'}`}>{tuneState.message}</p>
            : status === 'error' && error ? <p className="form-msg err">{t('Last attempt not applied: {error}.', { error })}</p> : null}
          <div className="settings-actions"><Submit label={t('Apply')} busy={t('The Config Agent is working…')} /></div>
        </form>
      )}

      <dialog ref={dialog} className="modal modal-wide" onClick={(e) => { if (e.target === dialog.current) dialog.current?.close(); }}>
        <form action={save} className="modal-body">
          <input type="hidden" name="agent" value={agent.key} />
          {scopeId && <input type="hidden" name="scopeId" value={scopeId} />}
          <div className="modal-head">
            <h2>{t(agent.name)} — {custom ? t('customised configuration') : t('default configuration')}</h2>
            <button type="button" className="modal-close" aria-label={t('Close')} onClick={() => dialog.current?.close()}>×</button>
          </div>
          {readOnly && <p className="form-msg readonly-note">{t('Read-only.')}</p>}
          <p className="field-hint">
            {search
              ? t('Search queries and relevance rules (JSON).')
              : agent.key === 'tender_documents'
                ? t('File sorting and alert rules (JSON).')
                : editable
                ? <>{t('Keep the {output} section and the {placeholders}.', { output: '\u0000', placeholders: '{placeholders}' }).split('\u0000').map((part, i) => i === 0 ? part : <span key={i}><span className="mono">## Output</span>{part}</span>)}</>
                : readOnly ? null : t('Nothing to configure.')}
          </p>
          {editable
            ? <textarea name="config" className="config-edit" value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} />
            : <pre className="config-view">{config}</pre>}
          {editState && <p className={`form-msg ${editState.ok ? 'ok' : 'err'}`}>{editState.message}</p>}
          {editable && (
            <div className="modal-actions">
              {custom && (
                <button type="button" className="btn" onClick={() => {
                  if (confirm(search ? t('Reset {agent} to its default configuration?', { agent: t(agent.name) }) : t('Reset {agent} to its default configuration and clear its fine-tuning?', { agent: t(agent.name) }))) {
                    start(async () => { await resetAgentConfig(agent.key, scopeId); router.refresh(); });
                  }
                }}>{t('Reset to default')}</button>
              )}
              <button type="button" className="btn" onClick={() => setDraft(config ?? '')}>{t('Discard changes')}</button>
              <Submit label={t('Save')} busy={t('Saving…')} primary />
            </div>
          )}
        </form>
      </dialog>
    </div>
  );
}

const EXAMPLES: Record<string, string> = {
  search: 'Tenders and grants for digital identity wallets in the EU and UK: wallet development, PID/(Q)EAA issuers, mDL. Not crypto or payment wallets.',
  tender_documents: 'Treat files named “Leistungsverzeichnis” as technical specifications. Post an update when a new contract draft appears.',
  triage: 'Score anything about mobile driving licences at least 80. Treat banking KYC tenders as relevant.',
  verification: 'Treat a call as open only if the page shows a deadline.',
  tender_analysis: 'Also list the languages the bid must be written in, and every insurance requirement with its amount.',
  tender_evaluation: 'Be strict: no MATCH without a named reference in our material. Always suggest a partner for hardware.',
  news_report: 'Keep summaries under 300 words. Always suggest a LinkedIn post angle.',
  feed_writer: 'Lead every tender post with the value and the deadline.',
  translator: 'Keep German agency names untranslated, without the English in parentheses.',
};
