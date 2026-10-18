-- Product analytics for the admin diagnosis dashboard.
-- Timestamps are UTC. The dashboard buckets them in Europe/Lisbon.
-- The service role writes these rows. No policies: anon and authenticated cannot read them.

create table if not exists analytics_events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version smallint not null default 1,
  created_at timestamptz not null default now(),
  visitor text not null,
  session_id text not null,
  user_id uuid,
  flow_id text,
  page_type text,
  path text,
  landing text,
  referrer_host text,
  source text,
  medium text,
  campaign text,
  first_source text,
  first_medium text,
  first_campaign text,
  device text,
  country text,
  scope_id uuid,
  content_id text,
  cta text,
  placement text,
  plan text,
  entitlement text,
  ok boolean,
  error_code text,
  demo boolean not null default false,
  traffic text not null default 'unknown',
  backfilled boolean not null default false,
  new_visitor boolean not null default false,
  signed_in boolean not null default false,
  duration_ms integer,
  scroll_pct smallint,
  dedupe text,
  constraint analytics_events_traffic_chk check (traffic in ('human', 'bot', 'unknown', 'internal')),
  constraint analytics_events_name_chk check (char_length(name) between 1 and 64)
);

create unique index if not exists analytics_events_dedupe_idx on analytics_events (dedupe);
create index if not exists analytics_events_created_idx on analytics_events (created_at desc);
create index if not exists analytics_events_name_idx on analytics_events (name, created_at desc);
create index if not exists analytics_events_visitor_idx on analytics_events (visitor, created_at desc);
create index if not exists analytics_events_user_idx on analytics_events (user_id, created_at desc);

create table if not exists analytics_ingest_errors (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  reason text not null,
  event text
);

alter table analytics_events enable row level security;
alter table analytics_ingest_errors enable row level security;

revoke all on analytics_events from public, anon, authenticated;
revoke all on analytics_ingest_errors from public, anon, authenticated;
grant select, insert, update, delete on analytics_events to service_role;
grant select, insert, update, delete on analytics_ingest_errors to service_role;

-- Accounts and company-specific evaluations can be recovered. Page views cannot
-- be turned into journeys, so they are not copied here.
insert into analytics_events (
  name, version, created_at, visitor, session_id, user_id, country, device,
  source, medium, demo, traffic, backfilled, new_visitor, signed_in, dedupe
)
select
  'account_created', 1, profiles.created_at,
  'backfill:' || profiles.id::text, 'backfill:' || profiles.id::text, profiles.id, profiles.country, 'unknown',
  'unknown', 'unknown', false,
  case when ignored.user_id is not null then 'internal' else 'human' end,
  true, true, true, 'account:' || profiles.id::text
from profiles
left join analytics_ignored_users ignored on ignored.user_id = profiles.id
where not exists (
  select 1 from analytics_events existing where existing.dedupe = 'account:' || profiles.id::text
);

insert into analytics_events (
  name, version, created_at, visitor, session_id, user_id, scope_id, content_id,
  plan, demo, traffic, backfilled, new_visitor, signed_in, dedupe
)
select
  'evaluation_completed', 1, scope_evaluations.evaluated_at,
  'backfill:' || workspaces.created_by::text, 'backfill:' || workspaces.created_by::text, workspaces.created_by,
  scope_evaluations.scope_id, scope_evaluations.opportunity_id,
  null, false,
  case when ignored.user_id is not null then 'internal' else 'human' end,
  true, false, true,
  'eval:' || scope_evaluations.scope_id::text || ':' || scope_evaluations.opportunity_id || ':' || scope_evaluations.workspace_id::text
from scope_evaluations
join workspaces on workspaces.id = scope_evaluations.workspace_id
left join analytics_ignored_users ignored on ignored.user_id = workspaces.created_by
where scope_evaluations.workspace_id is not null
  and scope_evaluations.evaluation is not null
  and scope_evaluations.evaluated_at is not null
  and workspaces.created_by is not null
  and not exists (
    select 1 from analytics_events existing
    where existing.dedupe = 'eval:' || scope_evaluations.scope_id::text || ':' || scope_evaluations.opportunity_id || ':' || scope_evaluations.workspace_id::text
  );

insert into analytics_events (
  name, version, created_at, visitor, session_id, user_id, scope_id, content_id,
  demo, traffic, backfilled, new_visitor, signed_in, dedupe
)
select
  'proposal_brief_completed', 1, scope_evaluations.proposal_at,
  'backfill:' || workspaces.created_by::text, 'backfill:' || workspaces.created_by::text, workspaces.created_by,
  scope_evaluations.scope_id, scope_evaluations.opportunity_id,
  false,
  case when ignored.user_id is not null then 'internal' else 'human' end,
  true, false, true,
  'brief:' || scope_evaluations.scope_id::text || ':' || scope_evaluations.opportunity_id || ':' || scope_evaluations.workspace_id::text
from scope_evaluations
join workspaces on workspaces.id = scope_evaluations.workspace_id
left join analytics_ignored_users ignored on ignored.user_id = workspaces.created_by
where scope_evaluations.workspace_id is not null
  and scope_evaluations.proposal_at is not null
  and workspaces.created_by is not null
  and not exists (
    select 1 from analytics_events existing
    where existing.dedupe = 'brief:' || scope_evaluations.scope_id::text || ':' || scope_evaluations.opportunity_id || ':' || scope_evaluations.workspace_id::text
  );
