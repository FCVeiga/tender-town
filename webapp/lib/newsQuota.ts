import 'server-only';
import { getSupabaseServerClient } from '@/lib/supabase';
import { getContext, getPersonalAccount } from '@/lib/accounts';

export type NewsReportBlock = 'plan' | 'quota' | null;

/** Whether the workspace the viewer is in may run another News Report this month. */
export async function newsReportAllowance(): Promise<{ block: NewsReportBlock; accountId: string | null; limit: number | null }> {
  const ctx = await getContext();
  const account = ctx ? await getPersonalAccount(ctx.workspace.ownerId) : null;
  const raw = account?.plan.newsReportsPerMonth;
  const limit = raw === undefined ? 0 : raw;
  if (!account || limit === 0) return { block: 'plan', accountId: account?.id ?? null, limit: 0 };
  if (limit == null) return { block: null, accountId: account.id, limit: null };
  const month = new Date().toISOString().slice(0, 7);
  const { data } = await getSupabaseServerClient().from('news_report_usage').select('reports').eq('account_id', account.id).eq('month', month).maybeSingle();
  return { block: (data?.reports ?? 0) >= limit ? 'quota' : null, accountId: account.id, limit };
}

/** Count one finished report against the paying account. Unlimited plans are not counted. */
export async function recordNewsReport(accountId: string) {
  const db = getSupabaseServerClient();
  const month = new Date().toISOString().slice(0, 7);
  const { data } = await db.from('news_report_usage').select('reports').eq('account_id', accountId).eq('month', month).maybeSingle();
  if (data) await db.from('news_report_usage').update({ reports: (data.reports ?? 0) + 1 }).eq('account_id', accountId).eq('month', month);
  else await db.from('news_report_usage').insert({ account_id: accountId, month, reports: 1 });
}
