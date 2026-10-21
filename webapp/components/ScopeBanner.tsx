'use client';

import { useState } from 'react';
import { useT } from '@/lib/i18n/client';
import { setBannerCompact } from '@/app/scope/actions';
import FindChat from '@/components/FindChat';
import { Modal } from '@/components/settings/SettingsUI';
import type { FocusModel } from '@/lib/scopeFocus';
import { track } from '@/components/Track';

const HEADING = 'Specialised AI bidding workforce for your team';
const FIND = 'Find best tender for your company now';
const NOTE = 'Your specialised tender agents';
const CONNECT = 'Connect your own agents';
const CONNECT_BODY = 'Your agent can do these jobs: find opportunities, analyse requirements and prepare proposal briefs. You create the account.';
const CONNECT_LEAD = 'Paste this prompt, then sign the agent in.';
const AGENT_PROMPT = `Use Tender Town (https://tendertown.io) for public tenders, grants and news.

Read https://tendertown.io/skills.md and follow https://tendertown.io/mcp.md. Connect to https://tendertown.io/api/mcp.

Search needs no account. Quote each Tender Town page (/tenders/{id} or /news/{id}). Do not invent notices.

I will create the account and sign you in. After that, call get_account, set up a scope, and do the jobs the plan includes: find opportunities, analyse requirements, and write a first draft. You cannot create the account, upload documents, post, comment, change the plan, or delete a workspace or a scope.`;
const JOBS = [
  { label: 'Find opportunities', icon: 'search' },
  { label: 'Analyse requirements', icon: 'document' },
  { label: 'Prepare proposal briefs', icon: 'write' },
] as const;

export function BannerJobs() {
  const t = useT();
  return (
    <ul className="scope-banner-jobs">
      {JOBS.map((job) => (
        <li key={job.label}>
          <JobIcon name={job.icon} />
          <span>{t(job.label)}</span>
        </li>
      ))}
    </ul>
  );
}

function BannerArt() {
  return (
    <div className="scope-banner-bg" aria-hidden="true">
      <img className="scope-banner-art light" src="/brand/sidebar-banner-light.jpg" alt="" />
      <img className="scope-banner-art dark" src="/brand/sidebar-banner.jpg" alt="" />
    </div>
  );
}

export default function ScopeBanner({ model, compact: compactSaved }: {
  model: FocusModel; compact: boolean;
}) {
  const t = useT();
  const [compact, setCompact] = useState(compactSaved);
  const [agents, setAgents] = useState(false);
  const [find, setFind] = useState(false);
  const toggleCompact = () => {
    const next = !compact;
    setCompact(next);
    void setBannerCompact(next);
  };

  return (
    <section className={`scope-banner${compact ? ' compact' : ''}`} aria-busy={!!model.hold}>
      <BannerArt />
      <div className="scope-banner-inner">
        {compact ? (
          <p className="scope-banner-note">{t(NOTE)}</p>
        ) : (
          <div className="scope-banner-lead">
            <p className="scope-banner-kicker">{t(HEADING)}</p>
            <BannerJobs />
          </div>
        )}
      <div className="scope-banner-actions">
        <button type="button" className="btn primary scope-banner-find" data-track="find_opened" data-placement="banner" data-cta="find" onClick={() => setFind(true)}>{t(FIND)}</button>
        <button type="button" className="scope-banner-create" data-track="agent_connection_opened" data-placement="banner" onClick={() => setAgents(true)}>{t(CONNECT)}</button>
        <button type="button" className="scope-banner-fold" aria-expanded={!compact} aria-label={compact ? t('Expand') : t('Collapse')} onClick={toggleCompact}>
          <Chevron up={!compact} />
        </button>
      </div>
      </div>
      {agents && <AgentModal onClose={() => setAgents(false)} />}
      {find && <FindChat signedIn={model.signedIn} onClose={() => setFind(false)} />}
    </section>
  );
}

function AgentModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <Modal title={t(CONNECT)} onClose={onClose}>
      <p className="scope-gate-copy">{t(CONNECT_BODY)}</p>
      <div className="agent-prompt-block">
        <p className="agent-prompt-lead">{t(CONNECT_LEAD)}</p>
        <pre className="agent-prompt">{AGENT_PROMPT}</pre>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn primary" onClick={async () => {
          try {
            await navigator.clipboard.writeText(AGENT_PROMPT);
            track('agent_instructions_copied', { placement: 'banner', path: '/' });
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          } catch { /* the prompt stays on screen for a manual copy */ }
        }}>{copied ? t('Copied') : t('Copy')}</button>
      </div>
    </Modal>
  );
}

function Chevron({ up = false }: { up?: boolean }) {
  return <svg className={`scope-chevron${up ? ' up' : ''}`} viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" /></svg>;
}
function JobIcon({ name }: { name: 'search' | 'document' | 'write' }) {
  if (name === 'search') {
    return <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.25" /><path d="M10.2 10.2L13 13" /></svg>;
  }
  if (name === 'document') {
    return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5h5.2L12.5 5.8V13.5H4z" /><path d="M9.1 2.7V6h3.2" /></svg>;
  }
  return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9.1 2.9l4 4L5.6 14.4 1.8 14.8l.5-3.8z" /><path d="M8 4l4 4" /></svg>;
}

