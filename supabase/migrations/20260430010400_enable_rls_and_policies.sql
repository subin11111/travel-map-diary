create or replace function public.handle_from_auth_email(email text)
returns text
language sql
immutable
as $$
  select split_part(lower(email), '@', 1)
$$;

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
  end,
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

create or replace function public.create_travel_map(
  p_title text,
  p_description text default null
)
returns table (
  id uuid,
  owner_id uuid,
  title text,
  description text,
  icon text,
  created_at timestamptz,
  updated_at timestamptz,
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
    raise exception 'Login is required.';
  end if;

  if p_title is null or btrim(p_title) = '' then
    raise exception 'Map title is required.';
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
    created_map.icon,
    created_map.created_at,
    created_map.updated_at,
    'owner'::text;
end;
$$;

alter table public.user_profiles enable row level security;
alter table public.maps enable row level security;
alter table public.map_members enable row level security;
alter table public.visited_places enable row level security;
alter table public.dong_diaries enable row level security;

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

drop policy if exists "Map members read visited places" on public.visited_places;
create policy "Map members read visited places"
  on public.visited_places
  for select
  using (public.is_map_member(map_id, auth.uid()));

drop policy if exists "Map editors insert visited places" on public.visited_places;
create policy "Map editors insert visited places"
  on public.visited_places
  for insert
  with check (public.can_edit_map(map_id, auth.uid()));

drop policy if exists "Map editors update visited places" on public.visited_places;
create policy "Map editors update visited places"
  on public.visited_places
  for update
  using (public.can_edit_map(map_id, auth.uid()))
  with check (public.can_edit_map(map_id, auth.uid()));

drop policy if exists "Map editors delete visited places" on public.visited_places;
create policy "Map editors delete visited places"
  on public.visited_places
  for delete
  using (public.can_edit_map(map_id, auth.uid()));

drop policy if exists "Map members read dong diaries" on public.dong_diaries;
create policy "Map members read dong diaries"
  on public.dong_diaries
  for select
  using (public.is_map_member(map_id, auth.uid()));

drop policy if exists "Map editors insert dong diaries" on public.dong_diaries;
create policy "Map editors insert dong diaries"
  on public.dong_diaries
  for insert
  with check (public.can_edit_map(map_id, auth.uid()));

drop policy if exists "Map editors update dong diaries" on public.dong_diaries;
create policy "Map editors update dong diaries"
  on public.dong_diaries
  for update
  using (public.can_edit_map(map_id, auth.uid()))
  with check (public.can_edit_map(map_id, auth.uid()));

drop policy if exists "Map editors delete dong diaries" on public.dong_diaries;
create policy "Map editors delete dong diaries"
  on public.dong_diaries
  for delete
  using (public.can_edit_map(map_id, auth.uid()));
