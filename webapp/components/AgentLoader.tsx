'use client';

import AgentAvatar from '@/components/AgentAvatar';
import { useT } from '@/lib/i18n/client';

const LINE = 'Hang tight. Our agents are working for you.';

/** A working agent, centered in the page or section that is still loading. */
export default function AgentLoader({ compact = false }: { compact?: boolean }) {
  const t = useT();
  return (
    <div className={`agent-loader${compact ? ' compact' : ''}`} role="status">
      <AgentAvatar agent="search" size={compact ? 48 : 72} working />
      <p>{t(LINE)}</p>
    </div>
  );
}
