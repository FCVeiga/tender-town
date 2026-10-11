-- Signed-in visits keep the account and the plan they were on. Any page can be counted.
-- MCP tool calls are recorded without the token, so the dashboard can show who is calling.

alter table page_views add column if not exists user_id uuid;
alter table page_views add column if not exists plan text;
alter table page_views drop constraint if exists page_views_kind_check;
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.page_views'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%kind%'
      and pg_get_constraintdef(oid) ilike '%home%'
  loop
    execute format('alter table public.page_views drop constraint %I', c);
  end loop;
end $$;
alter table page_views drop constraint if exists page_views_plan_chk;
alter table page_views add constraint page_views_plan_chk check (plan is null or plan in ('free', 'starter', 'pro', 'teams'));
create index if not exists page_views_user_idx on page_views (user_id, created_at desc);

create table if not exists mcp_calls (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  tool text not null,
  plan text,
  country text,
  scope_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint mcp_calls_plan_chk check (plan is null or plan in ('free', 'starter', 'pro', 'teams')),
  constraint mcp_calls_country_chk check (country is null or country ~ '^[A-Z]{2}$')
);
create index if not exists mcp_calls_created_idx on mcp_calls (created_at desc);
alter table mcp_calls enable row level security;

create or replace function public.analytics_totals(since timestamptz)
returns table (visitors bigint, active bigint)
language sql stable security invoker set search_path = public
as $$
  select
    count(distinct visitor)::bigint,
    count(distinct user_id) filter (
      where user_id is not null
        and not exists (select 1 from analytics_ignored_users iu where iu.user_id = page_views.user_id)
    )::bigint
  from page_views
  where since is null or created_at >= since;
$$;

create or replace function public.analytics_people(since timestamptz, unit text)
returns table (bucket timestamptz, visitors bigint, active bigint)
language sql stable security invoker set search_path = public
as $$
  select
    date_trunc(case when unit = 'hour' then 'hour' else 'day' end, created_at),
    count(distinct visitor)::bigint,
    count(distinct user_id) filter (
      where user_id is not null
        and not exists (select 1 from analytics_ignored_users iu where iu.user_id = page_views.user_id)
    )::bigint
  from page_views
  where since is null or created_at >= since
  group by 1
  order by 1;
$$;

create or replace function public.analytics_pages(since timestamptz)
returns table (kind text, path text, signed_in boolean, plan text, country text, views bigint)
language sql stable security invoker set search_path = public
as $$
  select kind, coalesce(path, ''), signed_in, plan, country, count(*)::bigint
  from page_views
  where (since is null or created_at >= since)
    and (user_id is null or not exists (select 1 from analytics_ignored_users iu where iu.user_id = page_views.user_id))
  group by 1, 2, 3, 4, 5;
$$;

create or replace function public.analytics_page_scopes(since timestamptz)
returns table (kind text, path text, signed_in boolean, plan text, country text, scope_id uuid, views bigint)
language sql stable security invoker set search_path = public
as $$
  select kind, coalesce(path, ''), signed_in, plan, country, scope_id, count(*)::bigint
  from page_views
  cross join lateral unnest(scope_ids) as scope_id
  where (since is null or created_at >= since)
    and (user_id is null or not exists (select 1 from analytics_ignored_users iu where iu.user_id = page_views.user_id))
  group by 1, 2, 3, 4, 5, 6;
$$;

create or replace function public.analytics_active_users(since timestamptz)
returns table (user_id uuid, views bigint)
language sql stable security invoker set search_path = public
as $$
  select user_id, count(*)::bigint
  from page_views
  where user_id is not null
    and not exists (select 1 from analytics_ignored_users iu where iu.user_id = page_views.user_id)
    and (since is null or created_at >= since)
  group by user_id;
$$;

create or replace function public.analytics_active_scopes(since timestamptz)
returns table (user_id uuid, scope_id uuid)
language sql stable security invoker set search_path = public
as $$
  select users.user_id, sid
  from (
    select distinct page_views.user_id
    from page_views
    where page_views.user_id is not null
      and not exists (select 1 from analytics_ignored_users iu where iu.user_id = page_views.user_id)
      and (since is null or page_views.created_at >= since)
  ) users
  cross join lateral unnest(viewer_scope_ids(users.user_id)) as sid;
$$;

create or replace function public.analytics_mcp(since timestamptz)
returns table (user_id uuid, tool text, plan text, country text, requests bigint)
language sql stable security invoker set search_path = public
as $$
  select user_id, tool, plan, country, count(*)::bigint
  from mcp_calls
  where not exists (select 1 from analytics_ignored_users iu where iu.user_id = mcp_calls.user_id)
    and (since is null or created_at >= since)
  group by 1, 2, 3, 4;
$$;

create or replace function public.analytics_mcp_scopes(since timestamptz)
returns table (user_id uuid, scope_id uuid, requests bigint)
language sql stable security invoker set search_path = public
as $$
  select user_id, scope_id, count(*)::bigint
  from mcp_calls
  cross join lateral unnest(scope_ids) as scope_id
  where not exists (select 1 from analytics_ignored_users iu where iu.user_id = mcp_calls.user_id)
    and (since is null or created_at >= since)
  group by 1, 2;
$$;

revoke all on function public.analytics_totals(timestamptz) from public, anon, authenticated;
revoke all on function public.analytics_people(timestamptz, text) from public, anon, authenticated;
revoke all on function public.analytics_pages(timestamptz) from public, anon, authenticated;
revoke all on function public.analytics_page_scopes(timestamptz) from public, anon, authenticated;
revoke all on function public.analytics_active_users(timestamptz) from public, anon, authenticated;
revoke all on function public.analytics_active_scopes(timestamptz) from public, anon, authenticated;
revoke all on function public.analytics_mcp(timestamptz) from public, anon, authenticated;
revoke all on function public.analytics_mcp_scopes(timestamptz) from public, anon, authenticated;
grant execute on function public.analytics_totals(timestamptz) to service_role;
grant execute on function public.analytics_people(timestamptz, text) to service_role;
grant execute on function public.analytics_pages(timestamptz) to service_role;
grant execute on function public.analytics_page_scopes(timestamptz) to service_role;
grant execute on function public.analytics_active_users(timestamptz) to service_role;
grant execute on function public.analytics_active_scopes(timestamptz) to service_role;
grant execute on function public.analytics_mcp(timestamptz) to service_role;
grant execute on function public.analytics_mcp_scopes(timestamptz) to service_role;

notify pgrst, 'reload schema';
