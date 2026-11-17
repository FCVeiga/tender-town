-- Compact catalog used by the edge middleware to pick a guest scope.
-- One query, service role only. Replaces loading every scope item into the function.
create or replace function public.guest_catalog()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with catalog as (
    select id, name, instructions, search_config
    from scopes
    where catalog and active
  ),
  counted as (
    select i.scope_id, count(*)::int as results
    from scope_items i
    where i.scope_id in (select id from catalog)
    group by i.scope_id
  ),
  country_counts as (
    select i.scope_id, upper(o.country) as country, count(*)::int as n
    from scope_items i
    join opportunities o on o.opportunity_id = i.item_id
    where i.item_type = 'tender'
      and i.scope_id in (select id from catalog)
      and o.country ~ '^[A-Za-z]{2}$'
    group by i.scope_id, upper(o.country)
  ),
  country_maps as (
    select scope_id, jsonb_object_agg(country, n) as countries
    from country_counts
    group by scope_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'name', s.name,
    'instructions', s.instructions,
    'search_config', s.search_config,
    'results', coalesce(c.results, 0),
    'countries', coalesce(m.countries, '{}'::jsonb)
  )), '[]'::jsonb)
  from catalog s
  left join counted c on c.scope_id = s.id
  left join country_maps m on m.scope_id = s.id;
$$;

revoke all on function public.guest_catalog() from public, anon, authenticated;
grant execute on function public.guest_catalog() to service_role;
