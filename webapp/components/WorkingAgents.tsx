import Link from 'next/link';
import { AGENTS } from '@/lib/agents';
import { SCOPE_AGENT_KEYS } from '@/lib/scopes';
import { workingAgentKeys } from '@/lib/settings';
import { getContext } from '@/lib/accounts';
import { planIncludes } from '@/lib/plans';
import AgentAvatar from './AgentAvatar';
import { getT } from '@/lib/i18n/server';

/** Sidebar: the scope agents at work, each with its face and a green light. */
export default async function WorkingAgents() {
  const t = await getT();
  const listed = AGENTS.filter((a) => SCOPE_AGENT_KEYS.includes(a.key));
  let on: Set<string> | null = null;
  try { on = await workingAgentKeys(); } catch { /* settings tables missing: all on */ }
  const plan = (await getContext())?.plan;
  const blocked = (key: string) => (key === 'tender_evaluation' && !planIncludes(plan?.evaluationsPerMonth))
    || (key === 'proposal_manager' && !planIncludes(plan?.proposalsPerMonth))
    || (key === 'news_report' && !planIncludes(plan?.newsReportsPerMonth));
  const shown = listed.filter((a) => blocked(a.key) || !on || on.has(a.key));
  const working = shown.filter((a) => !blocked(a.key) && (!on || on.has(a.key)));
  return (
    <div className="side-panel working-agents">
      <div className="side-head">
        <h3>{t('Working Agents')}</h3>
        <span className="side-count" title={t('{n} switched on of {total}', { n: working.length, total: listed.length })}>{working.length}/{listed.length}</span>
      </div>
      <ul>
        {shown.map((a) => {
          const off = blocked(a.key);
          return (
            <li key={a.key}>
              <Link href="/workspaces" title={t(a.role)}>
                <AgentAvatar agent={a.key} size={22} off={off} />
                <span className="wa-name">{t(a.name)}</span>
                <span className={`live-dot ${off ? 'blocked' : ''}`} aria-label={t(off ? 'off' : 'active')} />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
