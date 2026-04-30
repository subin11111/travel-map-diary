create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique,
  auth_email text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.map_members (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.maps(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  unique (map_id, user_id)
);

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

create index if not exists map_members_user_id_idx
  on public.map_members (user_id);

create index if not exists map_members_map_id_idx
  on public.map_members (map_id);

create index if not exists user_profiles_handle_idx
  on public.user_profiles (handle);
