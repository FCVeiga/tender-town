-- Which scope a visit was looking at, whether they were signed in, and the country
-- the request came from. profiles.country is the country at account creation.
alter table page_views add column if not exists country text;
alter table page_views add column if not exists signed_in boolean;
alter table page_views add column if not exists scope_ids uuid[];
alter table page_views drop constraint if exists page_views_country_chk;
alter table page_views add constraint page_views_country_chk check (country is null or country ~ '^[A-Z]{2}$');

alter table profiles add column if not exists country text;
alter table profiles drop constraint if exists profiles_country_chk;
alter table profiles add constraint profiles_country_chk check (country is null or country ~ '^[A-Z]{2}$');

-- The scopes a signed-in user is currently shown. Mirrors getViewScopes:
-- General, then the catalog picks and custom scopes that fit the workspace owner's plan.
create or replace function public.viewer_scope_ids(uid uuid)
returns uuid[]
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  ws uuid;
  owner uuid;
  plan text;
  lim int;
  show_def boolean;
  def_id uuid;
  def_ws uuid;
  inactive_custom int;
  budget int;
  own uuid[];
  picks uuid[];
  extra uuid[];
begin
  select s.id, s.workspace_id into def_id, def_ws
  from scopes s
  where s.is_default and s.active
  limit 1;

  select wm.workspace_id into ws
  from workspace_members wm
  join workspaces w on w.id = wm.workspace_id
  where wm.user_id = uid
  order by (wm.workspace_id is not distinct from (select p.current_workspace_id from profiles p where p.id = uid)) desc,
           (w.owner_id = uid) desc,
           w.created_at
  limit 1;

  if ws is null then
    if def_id is null then return '{}'::uuid[]; end if;
    return array[def_id];
  end if;

  select w.owner_id, w.show_default into owner, show_def from workspaces w where w.id = ws;
  select a.plan into plan from accounts a where a.owner_id = owner and a.kind = 'personal' limit 1;

  if ws is not distinct from def_ws then
    lim := 1000;
  elsif plan = 'starter' then
    lim := 1;
  elsif plan = 'pro' then
    lim := 5;
  elsif plan = 'teams' then
    lim := 1000;
  else
    lim := 0;
  end if;

  select count(*)::int into inactive_custom
  from scopes s
  where s.workspace_id = ws and not s.active and not s.is_default and not s.catalog;

  budget := greatest(0, lim - coalesce(inactive_custom, 0));

  select coalesce(array_agg(s.id order by s.created_at), '{}') into own
  from (
    select id, created_at from scopes
    where workspace_id = ws and active and not is_default and not catalog
    order by created_at
    limit budget
  ) s;

  select coalesce(array_agg(p.scope_id order by p.created_at), '{}') into picks
  from (
    select wp.scope_id, wp.created_at
    from workspace_scope_picks wp
    join scopes s on s.id = wp.scope_id and s.catalog and s.active
    where wp.workspace_id = ws
    order by wp.created_at
    limit greatest(0, budget - coalesce(cardinality(own), 0))
  ) p;

  extra := picks || own;

  if coalesce(show_def, true) or coalesce(cardinality(extra), 0) = 0 then
    if def_id is not null and not (def_id = any(extra)) then
      return array[def_id] || extra;
    end if;
  end if;
  return extra;
end;
$$;

create or replace function public.analytics_audiences(since timestamptz)
returns table (signed_in boolean, views bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select page_views.signed_in, count(*)::bigint
  from page_views
  where page_views.signed_in is not null
    and (since is null or page_views.created_at >= since)
  group by 1;
$$;

create or replace function public.analytics_scopes(since timestamptz)
returns table (signed_in boolean, scope_id uuid, views bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select page_views.signed_in, sid, count(*)::bigint
  from page_views
  cross join lateral unnest(page_views.scope_ids) as sid
  where page_views.signed_in is not null
    and (since is null or page_views.created_at >= since)
  group by 1, 2;
$$;

create or replace function public.analytics_countries(since timestamptz)
returns table (country text, views bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select page_views.country, count(*)::bigint
  from page_views
  where page_views.country is not null
    and (since is null or page_views.created_at >= since)
  group by 1;
$$;

create or replace function public.analytics_country_scopes(since timestamptz)
returns table (country text, scope_id uuid, views bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select page_views.country, sid, count(*)::bigint
  from page_views
  cross join lateral unnest(page_views.scope_ids) as sid
  where page_views.country is not null
    and (since is null or page_views.created_at >= since)
  group by 1, 2;
$$;

revoke all on function public.viewer_scope_ids(uuid) from public, anon, authenticated;
revoke all on function public.analytics_audiences(timestamptz) from public, anon, authenticated;
revoke all on function public.analytics_scopes(timestamptz) from public, anon, authenticated;
revoke all on function public.analytics_countries(timestamptz) from public, anon, authenticated;
revoke all on function public.analytics_country_scopes(timestamptz) from public, anon, authenticated;
grant execute on function public.viewer_scope_ids(uuid) to service_role;
grant execute on function public.analytics_audiences(timestamptz) to service_role;
grant execute on function public.analytics_scopes(timestamptz) to service_role;
grant execute on function public.analytics_countries(timestamptz) to service_role;
grant execute on function public.analytics_country_scopes(timestamptz) to service_role;
