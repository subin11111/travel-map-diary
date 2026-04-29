create table if not exists public.dong_diaries (
  id uuid primary key default gen_random_uuid(),
  dong_code text not null,
  dong_name text not null,
  title text,
  content text not null,
  photo_url text,
  created_at timestamptz not null default now()
);

create index if not exists dong_diaries_dong_code_created_at_idx
  on public.dong_diaries (dong_code, created_at desc);

alter table public.dong_diaries enable row level security;

drop policy if exists "Public read dong diaries" on public.dong_diaries;
create policy "Public read dong diaries"
  on public.dong_diaries
  for select
  using (true);

drop policy if exists "Public insert dong diaries" on public.dong_diaries;
create policy "Public insert dong diaries"
  on public.dong_diaries
  for insert
  with check (true);

drop policy if exists "Public update dong diaries" on public.dong_diaries;
create policy "Public update dong diaries"
  on public.dong_diaries
  for update
  using (true)
  with check (true);

insert into storage.buckets (id, name, public)
values ('dong-diary-photos', 'dong-diary-photos', true)
on conflict (id) do update
set public = excluded.public;

drop policy if exists "Public read dong diary photos" on storage.objects;
create policy "Public read dong diary photos"
  on storage.objects
  for select
  using (bucket_id = 'dong-diary-photos');

drop policy if exists "Public insert dong diary photos" on storage.objects;
create policy "Public insert dong diary photos"
  on storage.objects
  for insert
  with check (bucket_id = 'dong-diary-photos');

drop policy if exists "Public update dong diary photos" on storage.objects;
create policy "Public update dong diary photos"
  on storage.objects
  for update
  using (bucket_id = 'dong-diary-photos')
  with check (bucket_id = 'dong-diary-photos');