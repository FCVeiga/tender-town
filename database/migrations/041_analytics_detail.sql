-- The page a visit landed on, and daily or hourly totals for the dashboard chart.
alter table page_views add column if not exists path text;

create or replace function public.analytics_series(since timestamptz, unit text)
returns table (bucket timestamptz, kind text, views bigint, visitors bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select date_trunc(case when unit = 'hour' then 'hour' else 'day' end, created_at),
         page_views.kind,
         count(*)::bigint,
         count(distinct page_views.visitor)::bigint
  from page_views
  where since is null or page_views.created_at >= since
  group by 1, 2
  order by 1;
$$;

revoke all on function public.analytics_series(timestamptz, text) from public;
revoke all on function public.analytics_series(timestamptz, text) from anon, authenticated;
grant execute on function public.analytics_series(timestamptz, text) to service_role;
