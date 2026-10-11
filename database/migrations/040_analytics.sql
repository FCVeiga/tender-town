-- Page visits for the super-admin dashboard, and when a paid plan started.
-- page_views is written by the server only. No policies: the service role bypasses RLS.
create table if not exists page_views (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('home', 'post', 'news', 'tender')),
  visitor text not null,
  created_at timestamptz not null default now()
);
create index if not exists page_views_kind_created_idx on page_views (kind, created_at desc);

alter table page_views enable row level security;

alter table accounts add column if not exists subscribed_at timestamptz;

update accounts
set subscribed_at = created_at
where kind = 'personal'
  and plan <> 'free'
  and plan_status in ('active', 'trialing', 'past_due', 'comped')
  and subscribed_at is null;

create or replace function public.analytics_counts(since timestamptz)
returns table (kind text, views bigint, visitors bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select page_views.kind, count(*)::bigint, count(distinct page_views.visitor)::bigint
  from page_views
  where since is null or page_views.created_at >= since
  group by page_views.kind;
$$;

revoke all on function public.analytics_counts(timestamptz) from public;
revoke all on function public.analytics_counts(timestamptz) from anon, authenticated;
grant execute on function public.analytics_counts(timestamptz) to service_role;
