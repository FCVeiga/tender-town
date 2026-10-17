'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import AgentAvatar from '@/components/AgentAvatar';
import { Modal } from '@/components/settings/SettingsUI';
import { saveFindBrief } from '@/app/find/actions';
import { useT } from '@/lib/i18n/client';

const ASK = 'Tell me the company name, its website, and any other context you can share. I will look for the best active tender.';
const PLACE = 'Any other information not publicly available (eg. certifications, main contracts or projects, team members expertise…)';
const WORKING = 'Finding active tenders for {name}.';
const FOUND_KICKER = 'Possible match';
const FOUND_TITLE = 'An active tender for {name}';
const FOUND_BODY = 'Create an account to open the evaluation and the proposal brief.';
const FOUND_OPEN = 'Open it to see the evaluation and the proposal brief.';
const NEED = 'Add the company name, and a website or a short note.';

/** One scripted window. Nothing is searched until an account exists. */
export default function FindChat({ signedIn, onClose }: { signedIn: boolean; onClose: () => void }) {
  const t = useT();
  const router = useRouter();
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [notes, setNotes] = useState('');
  const [phase, setPhase] = useState<'ask' | 'working' | 'found'>('ask');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (window.matchMedia('(pointer: fine)').matches) nameRef.current?.focus();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport;
    if (!vv) return;
    const apply = () => {
      const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      root.style.setProperty('--keyboard-inset', `${inset}px`);
      root.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
    };
    apply();
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    return () => {
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
      root.style.removeProperty('--keyboard-inset');
      root.style.removeProperty('--vvh');
    };
  }, []);

  useEffect(() => {
    if (phase !== 'working') return;
    const timer = window.setTimeout(() => setPhase('found'), 2400);
    return () => window.clearTimeout(timer);
  }, [phase]);

  function look() {
    if (name.trim().length < 2 || (notes.trim().length < 8 && website.trim().length < 4)) {
      setError(t(NEED));
      return;
    }
    setError(null);
    setPhase('working');
  }

  function finish() {
    start(async () => {
      const result = await saveFindBrief(name, website, notes);
      if (result.error) { setError(result.error); setPhase('ask'); return; }
      router.push(signedIn ? '/find' : '/signup?next=/find');
    });
  }

  const company = name.trim();

  return (
    <Modal title={t('Find a tender')} onClose={onClose} className="find-modal" portal>
      <div className="find-panel" aria-live="polite">
        {phase === 'ask' && (
          <>
            <div className="find-line agent">
              <AgentAvatar agent="search" size={28} />
              <p className="find-bubble">{t(ASK)}</p>
            </div>
            <form id="find-form" className="find-fields" onSubmit={(event) => { event.preventDefault(); look(); }}>
              <label className="field">
                <span>{t('Company name')}</span>
                <input ref={nameRef} value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <label className="field">
                <span>{t('Website')}</span>
                <input value={website} onChange={(event) => setWebsite(event.target.value)} inputMode="url" autoCapitalize="none" autoCorrect="off" placeholder="https://" />
              </label>
              <label className="field">
                <span>{t('Context')}</span>
                <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} placeholder={t(PLACE)} />
              </label>
            </form>
          </>
        )}
        {phase === 'working' && (
          <div className="find-line agent">
            <AgentAvatar agent="search" size={36} working />
            <p className="find-bubble">{t(WORKING, { name: company })} <span className="dots" /></p>
          </div>
        )}
        {phase === 'found' && (
          <div className="find-result">
            <AgentAvatar agent="search" size={44} />
            <p className="find-result-kicker">{t(FOUND_KICKER)}</p>
            <h3>{t(FOUND_TITLE, { name: company })}</h3>
            <p>{signedIn ? t(FOUND_OPEN) : t(FOUND_BODY)}</p>
          </div>
        )}
      </div>
      <div className="find-foot">
        {error && <p className="form-msg err">{error}</p>}
        {phase === 'ask' && (
          <button type="submit" form="find-form" className="btn primary find-go">{t('Look for a tender')}</button>
        )}
        {phase === 'found' && (
          <button type="button" className="btn primary find-go" disabled={pending} onClick={finish}>
            {signedIn ? t('Show the tender') : t('Create an account')}
          </button>
        )}
      </div>
    </Modal>
  );
}
