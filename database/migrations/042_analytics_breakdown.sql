-- Visits per path, and likes and comments per item, for the dashboard breakdown.
create or replace function public.analytics_paths(since timestamptz)
returns table (kind text, path text, views bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select page_views.kind, coalesce(page_views.path, ''), count(*)::bigint
  from page_views
  where since is null or page_views.created_at >= since
  group by 1, 2
  order by 3 desc;
$$;

create or replace function public.analytics_engagement(since timestamptz)
returns table (item_type text, item_id text, likes bigint, comments bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with lk as (
    select likes.item_type, likes.item_id, count(*)::bigint as likes
    from likes
    where likes.item_type in ('news', 'tender', 'post')
      and (since is null or likes.created_at >= since)
    group by 1, 2
  ),
  cm as (
    select comments.item_type, comments.item_id, count(*)::bigint as comments
    from comments
    where comments.item_type in ('news', 'tender', 'post')
      and comments.item_id is not null
      and (since is null or comments.created_at >= since)
    group by 1, 2
  )
  select coalesce(lk.item_type, cm.item_type),
         coalesce(lk.item_id, cm.item_id),
         coalesce(lk.likes, 0),
         coalesce(cm.comments, 0)
  from lk
  full outer join cm on lk.item_type = cm.item_type and lk.item_id = cm.item_id;
$$;

revoke all on function public.analytics_paths(timestamptz) from public, anon, authenticated;
revoke all on function public.analytics_engagement(timestamptz) from public, anon, authenticated;
grant execute on function public.analytics_paths(timestamptz) to service_role;
grant execute on function public.analytics_engagement(timestamptz) to service_role;
