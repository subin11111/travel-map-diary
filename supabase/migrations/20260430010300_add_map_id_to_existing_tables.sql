alter table if exists public.visited_places
  add column if not exists map_id uuid references public.maps(id) on delete cascade;

alter table if exists public.dong_diaries
  add column if not exists map_id uuid references public.maps(id) on delete cascade;

alter table if exists public.visit_records
  add column if not exists map_id uuid references public.maps(id) on delete cascade;

alter table if exists public.diary_entries
  add column if not exists map_id uuid references public.maps(id) on delete cascade;

alter table if exists public.images
  add column if not exists map_id uuid references public.maps(id) on delete cascade;

alter table if exists public.diary_images
  add column if not exists map_id uuid references public.maps(id) on delete cascade;

insert into public.maps (owner_id, title, description)
select distinct source.user_id, 'Default travel map', 'Default map created from existing visit records.'
from (
  select user_id from public.visited_places where user_id is not null
  union
  select user_id from public.dong_diaries where user_id is not null
) source
where not exists (
  select 1
  from public.maps existing
  where existing.owner_id = source.user_id
);

insert into public.map_members (map_id, user_id, role)
select maps.id, maps.owner_id, 'owner'
from public.maps
on conflict (map_id, user_id) do update
set role = 'owner';

update public.visited_places
set map_id = maps.id
from public.maps
where visited_places.map_id is null
  and visited_places.user_id = maps.owner_id;

update public.dong_diaries
set map_id = maps.id
from public.maps
where dong_diaries.map_id is null
  and dong_diaries.user_id = maps.owner_id;

drop index if exists public.visited_places_user_dong_unique;

create unique index if not exists visited_places_map_dong_unique
  on public.visited_places (map_id, dong_code)
  where map_id is not null;

create index if not exists visited_places_map_id_idx
  on public.visited_places (map_id);

create index if not exists dong_diaries_map_dong_created_at_idx
  on public.dong_diaries (map_id, dong_code, created_at desc);
