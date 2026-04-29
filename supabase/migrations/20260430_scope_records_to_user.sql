create table if not exists public.visited_places (
  user_id uuid references auth.users(id) on delete cascade,
  dong_code text not null,
  dong_name text not null,
  visit_count integer not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.dong_diaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  dong_code text not null,
  dong_name text not null,
  title text,
  content text not null,
  photo_url text,
  created_at timestamptz not null default now()
);

alter table if exists public.visited_places
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table if exists public.visited_places
  add column if not exists dong_name text;

alter table if exists public.visited_places
  add column if not exists visit_count integer not null default 1;

alter table if exists public.visited_places
  add column if not exists created_at timestamptz not null default now();

alter table if exists public.dong_diaries
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table if exists public.dong_diaries
  add column if not exists created_at timestamptz not null default now();

create unique index if not exists visited_places_user_dong_unique
  on public.visited_places (user_id, dong_code);

create index if not exists visited_places_user_id_idx
  on public.visited_places (user_id);

create index if not exists dong_diaries_user_dong_created_at_idx
  on public.dong_diaries (user_id, dong_code, created_at desc);

create index if not exists dong_diaries_user_id_idx
  on public.dong_diaries (user_id);

alter table public.visited_places enable row level security;
alter table public.dong_diaries enable row level security;

alter table if exists public.visited_places drop constraint if exists visited_places_dong_code_key;
drop index if exists public.visited_places_dong_code_key;

drop policy if exists "User read visited places" on public.visited_places;
create policy "User read visited places"
  on public.visited_places
  for select
  using (auth.uid() = user_id);

drop policy if exists "User insert visited places" on public.visited_places;
create policy "User insert visited places"
  on public.visited_places
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "User update visited places" on public.visited_places;
create policy "User update visited places"
  on public.visited_places
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "User delete visited places" on public.visited_places;
create policy "User delete visited places"
  on public.visited_places
  for delete
  using (auth.uid() = user_id);

drop policy if exists "User read dong diaries" on public.dong_diaries;
create policy "User read dong diaries"
  on public.dong_diaries
  for select
  using (auth.uid() = user_id);

drop policy if exists "User insert dong diaries" on public.dong_diaries;
create policy "User insert dong diaries"
  on public.dong_diaries
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "User update dong diaries" on public.dong_diaries;
create policy "User update dong diaries"
  on public.dong_diaries
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "User delete dong diaries" on public.dong_diaries;
create policy "User delete dong diaries"
  on public.dong_diaries
  for delete
  using (auth.uid() = user_id);
