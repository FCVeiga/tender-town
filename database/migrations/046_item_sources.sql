-- Other outlets that covered an item we already store. The item keeps one
-- record; these are the sources and later updates, not extra feed cards.

create table if not exists public.item_sources (
  id bigint generated always as identity primary key,
  item_type text not null check (item_type in ('tender', 'news')),
  item_id text not null,
  url text not null,
  title text,
  source_name text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (item_type, item_id, url)
);

create index if not exists item_sources_item_idx on public.item_sources (item_type, item_id);

alter table public.item_sources enable row level security;
