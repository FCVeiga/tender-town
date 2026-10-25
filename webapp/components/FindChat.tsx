'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import AgentAvatar from '@/components/AgentAvatar';
import FindMatchCard from '@/components/FindMatch';
import { track } from '@/components/Track';
import { Modal } from '@/components/settings/SettingsUI';
import { matchCompanyTender } from '@/app/find/actions';
import type { FindMatch } from '@/lib/findTender';
import { useT } from '@/lib/i18n/client';

const ASK = 'Tell me the company name, its website, and any other context you can share. I will look for the best active tender.';
const PLACE = 'Any other information not publicly available (eg. certifications, main contracts or projects, team members expertise…)';
const WORKING = 'Our agents are finding the best tender for you.';
const NEED = 'Add the company name, and a website or a short note.';

/** Company details in, one open tender out. No account. */
export default function FindChat({ onClose }: { onClose: () => void }) {
  const t = useT();
  const pathname = usePathname() || '/';
  const openedOn = useRef(pathname);
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [notes, setNotes] = useState('');
  const [phase, setPhase] = useState<'ask' | 'working' | 'found'>('ask');
  const [match, setMatch] = useState<FindMatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (window.matchMedia('(pointer: fine)').matches) nameRef.current?.focus();
  }, []);

  useEffect(() => {
    if (pathname !== openedOn.current) onClose();
  }, [pathname, onClose]);

  useEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport;
    if (!vv) return;
    const apply = () => {
      const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      const keyboard = inset > 80 && inset < window.innerHeight * 0.6 ? inset : 0;
      root.style.setProperty('--keyboard-inset', `${keyboard}px`);
    };
    apply();
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    return () => {
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
      root.style.removeProperty('--keyboard-inset');
    };
  }, []);

  async function look() {
    if (name.trim().length < 2 || (notes.trim().length < 8 && website.trim().length < 4)) {
      setError(t(NEED));
      return;
    }
    setError(null);
    setMatch(null);
    setPhase('working');
    track('find_brief_submitted', { path: pathname, placement: 'banner', cta: 'find' });
    const result = await matchCompanyTender(name, website, notes);
    if ('error' in result) {
      setError(result.error);
      setPhase('ask');
      return;
    }
    setMatch(result.match);
    setPhase('found');
  }

  return (
    <Modal title={t('Find a tender')} onClose={onClose} className="find-modal" portal>
      <div className="find-panel" aria-live="polite" aria-busy={phase === 'working'}>
        {phase === 'ask' && (
          <>
            <div className="find-line agent">
              <AgentAvatar agent="search" size={28} />
              <p className="find-bubble">{t(ASK)}</p>
            </div>
            <form id="find-form" className="find-fields" onSubmit={(event) => { event.preventDefault(); void look(); }}>
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
            <p className="find-bubble">{t(WORKING)} <span className="dots" /></p>
          </div>
        )}
        {phase === 'found' && match && <FindMatchCard match={match} onOpen={onClose} />}
      </div>
      {phase === 'ask' && (
        <div className="find-foot">
          {error && <p className="form-msg err">{error}</p>}
          <button type="submit" form="find-form" className="btn primary find-go">{t('Look for a tender')}</button>
        </div>
      )}
    </Modal>
  );
}
