-- Where a page visit came from. The address is stored without a query string.
alter table page_views add column if not exists referrer text;

create or replace function public.analytics_referrers(since timestamptz)
returns table (referrer text, path text, signed_in boolean, plan text, country text, views bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select page_views.referrer,
         coalesce(page_views.path, ''),
         page_views.signed_in,
         page_views.plan,
         page_views.country,
         count(*)::bigint
  from page_views
  where page_views.referrer is not null
    and page_views.referrer <> ''
    and (since is null or page_views.created_at >= since)
  group by 1, 2, 3, 4, 5
  order by 6 desc
  limit 500;
$$;

revoke all on function public.analytics_referrers(timestamptz) from public, anon, authenticated;
grant execute on function public.analytics_referrers(timestamptz) to service_role;
