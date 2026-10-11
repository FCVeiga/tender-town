-- Dashboard figures skip the super-admin account, addresses that account has
-- signed in from, and (in the app) scripted clients. The visit log started
-- without an account or an address, so it cannot be split and is cleared.
create table if not exists analytics_ignored_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists analytics_ignored_ips (
  ip text primary key,
  created_at timestamptz not null default now()
);
alter table analytics_ignored_users enable row level security;
alter table analytics_ignored_ips enable row level security;

insert into analytics_ignored_users (user_id)
select id from auth.users where lower(email) = 's3mztube@gmail.com'
on conflict do nothing;

insert into analytics_ignored_ips (ip)
select distinct host(s.ip)
from auth.sessions s
join auth.users u on u.id = s.user_id
where lower(u.email) = 's3mztube@gmail.com'
  and s.ip is not null
on conflict do nothing;

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
      and not exists (select 1 from analytics_ignored_users iu where iu.user_id = likes.user_id)
      and (since is null or likes.created_at >= since)
    group by 1, 2
  ),
  cm as (
    select comments.item_type, comments.item_id, count(*)::bigint as comments
    from comments
    where comments.item_type in ('news', 'tender', 'post')
      and comments.item_id is not null
      and not exists (select 1 from analytics_ignored_users iu where iu.user_id = comments.user_id)
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

revoke all on function public.analytics_engagement(timestamptz) from public, anon, authenticated;
grant execute on function public.analytics_engagement(timestamptz) to service_role;

do $$
declare n int;
begin
  select count(*) into n from page_views;
  if n > 1000 then
    raise exception 'unexpected page_views count %', n;
  end if;
  delete from page_views;
end $$;
