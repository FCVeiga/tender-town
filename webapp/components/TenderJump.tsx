import { getTSync } from '@/lib/i18n/server';

/** Links into the tender page. They scroll. They do not run an agent. */
export default function TenderJump({ documents }: { documents: number }) {
  const t = getTSync();
  return (
    <nav className="tender-jump" aria-label={t('On this page')}>
      <a href="#requirements">{t('Requirements')}</a>
      <a className="is-primary" href="#evaluation">{t('Assess my fit')}</a>
      <a href="#proposal-brief">{t('Prepare a brief')}</a>
      <a href="#documents">{documents > 0 ? t('Documents ({n})', { n: documents }) : t('Documents')}</a>
    </nav>
  );
}
