import { useId } from 'react';
import { agentByKey, AgentFaceStyle } from '@/lib/agents';

const INK = '#1A233B';

function Top({ top, glow }: { top: AgentFaceStyle['top']; glow: string }) {
  switch (top) {
    case 'antenna': return <><line x1="24" y1="8" x2="24" y2="13" stroke={INK} strokeWidth="2" strokeLinecap="round" /><circle className="agent-antenna" cx="24" cy="7" r="2.2" fill={INK} /></>;
    case 'twin': return <><line x1="18" y1="9" x2="19" y2="13" stroke={INK} strokeWidth="2" strokeLinecap="round" /><line x1="30" y1="9" x2="29" y2="13" stroke={INK} strokeWidth="2" strokeLinecap="round" /><circle className="agent-antenna" cx="18" cy="8" r="1.8" fill={INK} /><circle className="agent-antenna" cx="30" cy="8" r="1.8" fill={INK} /></>;
    case 'dish': return <><line x1="24" y1="9.5" x2="24" y2="13" stroke={INK} strokeWidth="2" /><path d="M17.5 6.5a6.5 4 0 0 0 13 0z" fill={INK} /><circle className="agent-antenna" cx="24" cy="6.3" r="1.3" fill={glow} /></>;
    case 'bolt': return <path className="agent-antenna" d="M25.5 4 20 10.5h4l-1.5 3.5L28 8h-4z" fill={INK} />;
    case 'leaf': return <><line x1="24" y1="9" x2="24" y2="13" stroke={INK} strokeWidth="2" strokeLinecap="round" /><path className="agent-antenna" d="M24 9c0-3.5 3-5.5 6.5-5.5 0 3.5-3 5.5-6.5 5.5z" fill={INK} /></>;
    case 'cap': return <path d="M13 14.5c1.5-5 5.5-7 11-7s9.5 2 11 7z" fill={INK} />;
    case 'spark': return <><path className="agent-antenna" d="M24 3.5l1.3 3.4 3.4 1.3-3.4 1.3L24 12.9l-1.3-3.4-3.4-1.3 3.4-1.3z" fill={INK} /></>;
    case 'halo': return <ellipse className="agent-antenna" cx="24" cy="8" rx="7" ry="2.2" fill="none" stroke={INK} strokeWidth="2" />;
    default: return null;
  }
}

function Eyes({ eyes, glow }: { eyes: AgentFaceStyle['eyes']; glow: string }) {
  switch (eyes) {
    case 'visor': return <rect className="agent-eye" x="16" y="21" width="16" height="4" rx="2" fill={glow} />;
    case 'wide': return <><circle className="agent-eye" cx="19.5" cy="23" r="2.6" fill={glow} /><circle className="agent-eye" cx="28.5" cy="23" r="2.6" fill={glow} /></>;
    case 'happy': return <><path className="agent-eye" d="M17.8 24.2a2.3 2.3 0 0 1 4.4 0M25.8 24.2a2.3 2.3 0 0 1 4.4 0" stroke={glow} strokeWidth="1.8" fill="none" strokeLinecap="round" /></>;
    case 'scan': return <><rect x="16" y="21.5" width="16" height="3" rx="1.5" fill="#33405e" /><rect className="agent-eye agent-scan" x="17" y="21.5" width="6" height="3" rx="1.5" fill={glow} /></>;
    default: return <><circle className="agent-eye" cx="20" cy="23" r="2" fill={glow} /><circle className="agent-eye" cx="28" cy="23" r="2" fill={glow} /></>;
  }
}

function Mouth({ mouth }: { mouth: AgentFaceStyle['mouth'] }) {
  switch (mouth) {
    case 'flat': return <line x1="21" y1="31" x2="27" y2="31" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />;
    case 'o': return <circle cx="24" cy="31" r="1.6" fill="none" stroke={INK} strokeWidth="1.6" />;
    case 'grin': return <path d="M19.5 29.8c2.8 2.4 6.2 2.4 9 0z" fill={INK} />;
    default: return <path d="M20 30.5c2.4 1.4 5.6 1.4 8 0" stroke={INK} strokeWidth="1.8" fill="none" strokeLinecap="round" />;
  }
}

/** An agent's face: a small robot in the agent's own colours and features. */
export default function AgentAvatar({ agent, size = 44, working = false, off = false }: {
  agent: string; size?: number; working?: boolean; off?: boolean;
}) {
  const { face } = agentByKey(agent);
  const id = `agent-bg-${agent}-${useId().replace(/:/g, '')}`;
  const glow = face.colors[0];
  return (
    <svg className={`agent-face ${working ? 'working' : ''} ${off ? 'off' : ''}`} width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={face.colors[0]} /><stop offset="1" stopColor={face.colors[1]} /></linearGradient>
      </defs>
      <circle cx="24" cy="24" r="24" fill={`url(#${id})`} />
      <Top top={face.top} glow={glow} />
      <rect x="11" y="13" width="26" height="21" rx="7" fill="#fff" stroke={INK} strokeWidth="2" />
      <rect x="15" y="19" width="18" height="8" rx="4" fill={INK} />
      <Eyes eyes={face.eyes} glow={glow} />
      <Mouth mouth={face.mouth} />
      <rect className="agent-arm left" x="8" y="20" width="3" height="7" rx="1.5" fill={INK} />
      <rect className="agent-arm right" x="37" y="20" width="3" height="7" rx="1.5" fill={INK} />
    </svg>
  );
}
