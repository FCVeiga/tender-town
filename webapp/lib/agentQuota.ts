import 'server-only';
import { getSupabaseServerClient } from '@/lib/supabase';
import { getContext, getPersonalAccount } from '@/lib/accounts';

export type AgentRunKey = 'tender_evaluation' | 'proposal_manager';
export type AgentRunBlock = 'plan' | 'quota' | null;

/** Whether this workspace may run another Tender Evaluation or proposal brief this month. */
export async function agentRunAllowance(kind: AgentRunKey): Promise<{ block: AgentRunBlock; accountId: string | null; limit: number | null }> {
  const ctx = await getContext();
  const account = ctx ? await getPersonalAccount(ctx.workspace.ownerId) : null;
  const raw = kind === 'tender_evaluation' ? account?.plan.evaluationsPerMonth : account?.plan.proposalsPerMonth;
  const limit = raw === undefined ? 0 : raw;
  if (!account || limit === 0) return { block: 'plan', accountId: account?.id ?? null, limit: 0 };
  if (limit == null) return { block: null, accountId: account.id, limit: null };
  const month = new Date().toISOString().slice(0, 7);
  const { data } = await getSupabaseServerClient().from('agent_run_usage').select('runs')
    .eq('account_id', account.id).eq('month', month).eq('agent_key', kind).maybeSingle();
  return { block: (data?.runs ?? 0) >= limit ? 'quota' : null, accountId: account.id, limit };
}

/** Count one finished run. Unlimited plans are not counted. */
export async function recordAgentRun(accountId: string, kind: AgentRunKey) {
  const db = getSupabaseServerClient();
  const month = new Date().toISOString().slice(0, 7);
  const { data } = await db.from('agent_run_usage').select('runs').eq('account_id', accountId).eq('month', month).eq('agent_key', kind).maybeSingle();
  if (data) await db.from('agent_run_usage').update({ runs: (data.runs ?? 0) + 1 }).eq('account_id', accountId).eq('month', month).eq('agent_key', kind);
  else await db.from('agent_run_usage').insert({ account_id: accountId, month, agent_key: kind, runs: 1 });
}
