-- Likes and comments on blog articles. Item ids are the article slug.
alter table likes drop constraint if exists likes_item_type_check;
alter table likes add constraint likes_item_type_check check (item_type in ('tender', 'news', 'post', 'comment', 'blog'));

alter table comments drop constraint if exists comments_item_type_check;
alter table comments add constraint comments_item_type_check check (item_type in ('post', 'news', 'tender', 'blog'));

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
    where likes.item_type in ('news', 'tender', 'post', 'blog')
      and (since is null or likes.created_at >= since)
    group by 1, 2
  ),
  cm as (
    select comments.item_type, comments.item_id, count(*)::bigint as comments
    from comments
    where comments.item_type in ('news', 'tender', 'post', 'blog')
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
