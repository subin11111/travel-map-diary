create table if not exists public.maps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  icon text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.maps
  add column if not exists icon text;

alter table if exists public.maps
  add column if not exists updated_at timestamptz not null default now();

create index if not exists maps_owner_id_idx
  on public.maps (owner_id);

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
