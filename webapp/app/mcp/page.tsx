import type { Metadata } from 'next';
import { getT } from '@/lib/i18n/server';
import { siteOrigin } from '@/lib/auth';
import { MCP_DOC, MCP_LEAD } from '@/lib/mcp/guide';
import { pageMeta } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return pageMeta({ title: `${t('External agents')} — Tender Town`, description: t(MCP_LEAD), path: '/mcp' });
}

/** Human page for the same guide the agent fetches at /mcp.md. */
export default async function McpGuidePage() {
  const t = await getT();
  const origin = siteOrigin();
  const vars = { server: `${origin}/api/mcp`, guide: `${origin}/mcp.md`, discover: `${origin}/discover.md`, skills: `${origin}/skills` };
  return (
    <article className="content legal">
      <h1>{t('External agents')}</h1>
      <div className="legal-body">
        <p>{t(MCP_LEAD, vars)}</p>
        {MCP_DOC.map((block, i) => {
          if ('h' in block) {
            const Tag = block.h === 2 ? 'h2' : 'h3';
            return <Tag key={i}>{t(block.text)}</Tag>;
          }
          if ('p' in block) return <p key={i}>{t(block.p, vars)}</p>;
          if ('ul' in block) {
            return (
              <ul key={i}>
                {block.ul.map((item) => <li key={item}>{t(item, vars)}</li>)}
              </ul>
            );
          }
          return <pre key={i} className="mcp-code"><code>{t(block.code, vars)}</code></pre>;
        })}
      </div>
    </article>
  );
}
