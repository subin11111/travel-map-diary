create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique,
  auth_email text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.maps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.map_members (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.maps(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  unique (map_id, user_id)
);

alter table if exists public.maps
  add column if not exists updated_at timestamptz not null default now();

alter table public.maps
  alter column title type text,
  alter column description type text;

alter table if exists public.dong_diaries
  alter column title type text,
  alter column content type text,
  alter column photo_url type text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'diary_entries'
      and column_name = 'title'
  ) then
    alter table public.diary_entries alter column title type text;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'diary_entries'
      and column_name = 'content'
  ) then
    alter table public.diary_entries alter column content type text;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'images'
      and column_name in ('caption', 'description')
  ) then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'images' and column_name = 'caption'
    ) then
      alter table public.images alter column caption type text;
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'images' and column_name = 'description'
    ) then
      alter table public.images alter column description type text;
    end if;
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'map_members'
      and column_name = 'role'
      and udt_name = 'map_member_role'
  ) then
    alter table public.map_members
      alter column role type text using role::text;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'map_members_role_check'
  ) then
    alter table public.map_members
      add constraint map_members_role_check check (role in ('owner', 'editor', 'viewer')) not valid;
  end if;
end;
$$;

alter table public.map_members validate constraint map_members_role_check;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'map_members_user_profile_fk'
  ) then
    alter table public.map_members
      add constraint map_members_user_profile_fk
      foreign key (user_id) references public.user_profiles(user_id) on delete cascade;
  end if;
end;
$$;

alter table if exists public.visited_places
  add column if not exists map_id uuid references public.maps(id) on delete cascade;

alter table if exists public.dong_diaries
  add column if not exists map_id uuid references public.maps(id) on delete cascade;

-- Compatibility for earlier or future table names. The current app uses
-- visited_places and dong_diaries; there is no separate image table today.
alter table if exists public.visit_records
  add column if not exists map_id uuid references public.maps(id) on delete cascade;

alter table if exists public.diary_entries
  add column if not exists map_id uuid references public.maps(id) on delete cascade;

alter table if exists public.images
  add column if not exists map_id uuid references public.maps(id) on delete cascade;

alter table if exists public.diary_images
  add column if not exists map_id uuid references public.maps(id) on delete cascade;

create index if not exists maps_owner_id_idx
  on public.maps (owner_id);

create index if not exists map_members_user_id_idx
  on public.map_members (user_id);

create index if not exists map_members_map_id_idx
  on public.map_members (map_id);

create index if not exists user_profiles_handle_idx
  on public.user_profiles (handle);

create index if not exists visited_places_map_id_idx
  on public.visited_places (map_id);

create index if not exists dong_diaries_map_dong_created_at_idx
  on public.dong_diaries (map_id, dong_code, created_at desc);

create or replace function public.handle_from_auth_email(email text)
returns text
language sql
immutable
as $$
  select split_part(lower(email), '@', 1)
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_maps_updated_at on public.maps;
create trigger set_maps_updated_at
  before update on public.maps
  for each row execute function public.set_updated_at();

create or replace function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_handle text;
  next_handle text;
begin
  base_handle := public.handle_from_auth_email(new.email);
  next_handle := base_handle;

  if exists (
    select 1
    from public.user_profiles
    where handle = next_handle
      and user_id <> new.id
  ) then
    next_handle := base_handle || '-' || left(new.id::text, 8);
  end if;

  insert into public.user_profiles (user_id, handle, auth_email)
  values (new.id, next_handle, lower(new.email))
  on conflict (user_id) do update
  set handle = case
        when not exists (
          select 1
          from public.user_profiles existing
          where existing.handle = excluded.handle
            and existing.user_id <> excluded.user_id
        )
        then excluded.handle
        else public.handle_from_auth_email(excluded.auth_email) || '-' || left(excluded.user_id::text, 8)
      end,
      auth_email = excluded.auth_email;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_create_profile on auth.users;
create trigger on_auth_user_created_create_profile
  after insert or update of email on auth.users
  for each row execute function public.create_profile_for_auth_user();

with auth_profile_rows as (
  select
    id as user_id,
    lower(email) as auth_email,
    public.handle_from_auth_email(email) as base_handle,
    row_number() over (
      partition by public.handle_from_auth_email(email)
      order by created_at nulls last, id
    ) as duplicate_index
  from auth.users
  where email is not null
)
insert into public.user_profiles (user_id, handle, auth_email)
select
  user_id,
  case
    when duplicate_index = 1 then base_handle
    else base_handle || '-' || left(user_id::text, 8)
  end as handle,
  auth_email
from auth_profile_rows
on conflict (user_id) do update
set handle = case
      when not exists (
        select 1
        from public.user_profiles existing
        where existing.handle = excluded.handle
          and existing.user_id <> excluded.user_id
      )
      then excluded.handle
      else public.handle_from_auth_email(excluded.auth_email) || '-' || left(excluded.user_id::text, 8)
    end,
    auth_email = excluded.auth_email;

create or replace function public.is_map_member(target_map_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.map_members
    where map_id = target_map_id
      and user_id = target_user_id
  )
$$;

create or replace function public.is_map_owner(target_map_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.map_members
    where map_id = target_map_id
      and user_id = target_user_id
      and role = 'owner'
  )
$$;

create or replace function public.can_edit_map(target_map_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.map_members
    where map_id = target_map_id
      and user_id = target_user_id
      and role in ('owner', 'editor')
  )
$$;

create or replace function public.get_user_id_by_handle(target_handle text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select user_id
  from public.user_profiles
  where handle = public.handle_from_auth_email(target_handle)
  limit 1
$$;

create or replace function public.add_owner_member_for_map()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.map_members (map_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (map_id, user_id) do update
  set role = 'owner';

  return new;
end;
$$;

drop trigger if exists on_map_created_add_owner_member on public.maps;
create trigger on_map_created_add_owner_member
  after insert on public.maps
  for each row execute function public.add_owner_member_for_map();

create or replace function public.create_travel_map(
  p_title text,
  p_description text default null
)
returns table (
  id uuid,
  owner_id uuid,
  title text,
  description text,
  created_at timestamptz,
  role text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  created_map public.maps%rowtype;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if p_title is null or btrim(p_title) = '' then
    raise exception '지도 이름을 입력하세요.';
  end if;

  insert into public.user_profiles (user_id, handle, auth_email)
  select
    auth_users.id,
    case
      when exists (
        select 1
        from public.user_profiles existing
        where existing.handle = public.handle_from_auth_email(auth_users.email)
          and existing.user_id <> auth_users.id
      )
      then public.handle_from_auth_email(auth_users.email) || '-' || left(auth_users.id::text, 8)
      else public.handle_from_auth_email(auth_users.email)
    end,
    lower(auth_users.email)
  from auth.users auth_users
  where auth_users.id = current_user_id
    and auth_users.email is not null
  on conflict (user_id) do update
  set auth_email = excluded.auth_email;

  insert into public.maps (owner_id, title, description)
  values (current_user_id, p_title, nullif(p_description, ''))
  returning * into created_map;

  insert into public.map_members (map_id, user_id, role)
  values (created_map.id, current_user_id, 'owner')
  on conflict (map_id, user_id) do update
  set role = 'owner';

  return query
  select
    created_map.id,
    created_map.owner_id,
    created_map.title,
    created_map.description,
    created_map.created_at,
    'owner'::text;
end;
$$;

insert into public.maps (owner_id, title, description)
select distinct source.user_id, '내 여행 지도', '기존 방문 기록에서 자동 생성된 기본 지도'
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
  on public.visited_places (map_id, dong_code);

alter table public.user_profiles enable row level security;
alter table public.maps enable row level security;
alter table public.map_members enable row level security;
alter table public.visited_places enable row level security;
alter table public.dong_diaries enable row level security;

alter table if exists public.visit_records enable row level security;
alter table if exists public.diary_entries enable row level security;
alter table if exists public.images enable row level security;
alter table if exists public.diary_images enable row level security;

drop policy if exists "Authenticated users can read profiles" on public.user_profiles;
create policy "Authenticated users can read profiles"
  on public.user_profiles
  for select
  using (auth.uid() is not null);

drop policy if exists "Users can update own profile" on public.user_profiles;
create policy "Users can update own profile"
  on public.user_profiles
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Map members can read maps" on public.maps;
create policy "Map members can read maps"
  on public.maps
  for select
  using (public.is_map_member(id, auth.uid()));

drop policy if exists "Users can create maps" on public.maps;
create policy "Users can create maps"
  on public.maps
  for insert
  with check (auth.uid() = owner_id);

drop policy if exists "Owners can update maps" on public.maps;
create policy "Owners can update maps"
  on public.maps
  for update
  using (public.is_map_owner(id, auth.uid()))
  with check (public.is_map_owner(id, auth.uid()));

drop policy if exists "Owners can delete maps" on public.maps;
create policy "Owners can delete maps"
  on public.maps
  for delete
  using (public.is_map_owner(id, auth.uid()));

drop policy if exists "Members can read own map memberships" on public.map_members;
create policy "Members can read own map memberships"
  on public.map_members
  for select
  using (user_id = auth.uid() or public.is_map_owner(map_id, auth.uid()));

drop policy if exists "Owners can add map members" on public.map_members;
create policy "Owners can add map members"
  on public.map_members
  for insert
  with check (public.is_map_owner(map_id, auth.uid()));

drop policy if exists "Owners can update map members" on public.map_members;
create policy "Owners can update map members"
  on public.map_members
  for update
  using (public.is_map_owner(map_id, auth.uid()) and role <> 'owner')
  with check (public.is_map_owner(map_id, auth.uid()) and role <> 'owner');

drop policy if exists "Owners can remove map members" on public.map_members;
create policy "Owners can remove map members"
  on public.map_members
  for delete
  using (public.is_map_owner(map_id, auth.uid()) and role <> 'owner');

drop policy if exists "User read visited places" on public.visited_places;
drop policy if exists "User insert visited places" on public.visited_places;
drop policy if exists "User update visited places" on public.visited_places;
drop policy if exists "User delete visited places" on public.visited_places;
drop policy if exists "Map members read visited places" on public.visited_places;
drop policy if exists "Map editors insert visited places" on public.visited_places;
drop policy if exists "Map editors update visited places" on public.visited_places;
drop policy if exists "Map editors delete visited places" on public.visited_places;

create policy "Map members read visited places"
  on public.visited_places
  for select
  using (public.is_map_member(map_id, auth.uid()));

create policy "Map editors insert visited places"
  on public.visited_places
  for insert
  with check (public.can_edit_map(map_id, auth.uid()));

create policy "Map editors update visited places"
  on public.visited_places
  for update
  using (public.can_edit_map(map_id, auth.uid()))
  with check (public.can_edit_map(map_id, auth.uid()));

create policy "Map editors delete visited places"
  on public.visited_places
  for delete
  using (public.can_edit_map(map_id, auth.uid()));

drop policy if exists "User read dong diaries" on public.dong_diaries;
drop policy if exists "User insert dong diaries" on public.dong_diaries;
drop policy if exists "User update dong diaries" on public.dong_diaries;
drop policy if exists "User delete dong diaries" on public.dong_diaries;
drop policy if exists "Map members read dong diaries" on public.dong_diaries;
drop policy if exists "Map editors insert dong diaries" on public.dong_diaries;
drop policy if exists "Map editors update dong diaries" on public.dong_diaries;
drop policy if exists "Map editors delete dong diaries" on public.dong_diaries;

create policy "Map members read dong diaries"
  on public.dong_diaries
  for select
  using (public.is_map_member(map_id, auth.uid()));

create policy "Map editors insert dong diaries"
  on public.dong_diaries
  for insert
  with check (public.can_edit_map(map_id, auth.uid()));

create policy "Map editors update dong diaries"
  on public.dong_diaries
  for update
  using (public.can_edit_map(map_id, auth.uid()))
  with check (public.can_edit_map(map_id, auth.uid()));

create policy "Map editors delete dong diaries"
  on public.dong_diaries
  for delete
  using (public.can_edit_map(map_id, auth.uid()));

do $$
declare
  target_table text;
begin
  foreach target_table in array array['visit_records', 'diary_entries', 'images', 'diary_images']
  loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = target_table
        and column_name = 'map_id'
    ) then
      execute format('drop policy if exists "Map members read %I" on public.%I', target_table, target_table);
      execute format('drop policy if exists "Map editors insert %I" on public.%I', target_table, target_table);
      execute format('drop policy if exists "Map editors update %I" on public.%I', target_table, target_table);
      execute format('drop policy if exists "Map editors delete %I" on public.%I', target_table, target_table);

      execute format(
        'create policy "Map members read %I" on public.%I for select using (public.is_map_member(map_id, auth.uid()))',
        target_table,
        target_table
      );
      execute format(
        'create policy "Map editors insert %I" on public.%I for insert with check (public.can_edit_map(map_id, auth.uid()))',
        target_table,
        target_table
      );
      execute format(
        'create policy "Map editors update %I" on public.%I for update using (public.can_edit_map(map_id, auth.uid())) with check (public.can_edit_map(map_id, auth.uid()))',
        target_table,
        target_table
      );
      execute format(
        'create policy "Map editors delete %I" on public.%I for delete using (public.can_edit_map(map_id, auth.uid()))',
        target_table,
        target_table
      );
    end if;
  end loop;
end;
$$;
