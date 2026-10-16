'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Modal } from '@/components/settings/SettingsUI';
import { useT } from '@/lib/i18n/client';

/** Opens the scope page when a run needs company information that is not there yet. */
export default function RunFitAnalysis({ href, label = 'Run Fit analysis', title = 'Fit analysis', message = 'Add your company information on this scope before a fit analysis.' }: {
  href: string; label?: string; title?: string; message?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="eval-run">
        <button type="button" className="btn primary" onClick={() => setOpen(true)}>{t(label)}</button>
      </div>
      {open && (
        <Modal title={t(title)} onClose={() => setOpen(false)}>
          <p>{t(message)}</p>
          <div className="modal-actions">
            <Link className="btn primary" href={href}>{t('Add your company information')}</Link>
          </div>
        </Modal>
      )}
    </>
  );
}
