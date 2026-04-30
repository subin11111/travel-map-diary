alter table if exists public.visited_places
  drop constraint if exists unique_dong_code;

alter table if exists public.visited_places
  drop constraint if exists visited_places_dong_code_key;

drop index if exists public.unique_dong_code;
drop index if exists public.visited_places_dong_code_key;

create unique index if not exists visited_places_map_dong_unique
  on public.visited_places (map_id, dong_code)
  where map_id is not null;

with diary_counts as (
  select
    diaries.map_id,
    diaries.dong_code,
    max(diaries.dong_name) as dong_name,
    coalesce(min(diaries.user_id::text)::uuid, maps.owner_id) as user_id,
    count(*)::integer as diary_count
  from public.dong_diaries diaries
  join public.maps maps on maps.id = diaries.map_id
  where diaries.map_id is not null
    and diaries.dong_code is not null
  group by diaries.map_id, diaries.dong_code, maps.owner_id
)
insert into public.visited_places (
  user_id,
  map_id,
  dong_code,
  dong_name,
  visit_count
)
select
  user_id,
  map_id,
  dong_code,
  dong_name,
  greatest(diary_count, 1)
from diary_counts
on conflict (map_id, dong_code) where map_id is not null
do update set
  dong_name = excluded.dong_name,
  visit_count = greatest(public.visited_places.visit_count, excluded.visit_count);
