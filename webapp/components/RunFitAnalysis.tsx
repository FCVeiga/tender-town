'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Modal } from '@/components/settings/SettingsUI';
import { useT } from '@/lib/i18n/client';

/** Fit scoring needs company information. Without it, the button explains that and opens the scope. */
export default function RunFitAnalysis({ href }: { href: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="eval-run">
        <button type="button" className="btn primary" onClick={() => setOpen(true)}>{t('Run Fit analysis')}</button>
      </div>
      {open && (
        <Modal title={t('Fit analysis')} onClose={() => setOpen(false)}>
          <p>{t('Add your company information on this scope before a fit analysis.')}</p>
          <div className="modal-actions">
            <Link className="btn primary" href={href}>{t('Add your company information')}</Link>
          </div>
        </Modal>
      )}
    </>
  );
}
