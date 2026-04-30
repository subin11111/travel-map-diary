alter table public.dong_diaries
  add column if not exists entry_date date;

update public.dong_diaries
set entry_date = created_at::date
where entry_date is null;

alter table public.dong_diaries
  alter column entry_date set default current_date;

alter table public.dong_diaries
  alter column entry_date set not null;

create index if not exists dong_diaries_map_entry_date_idx
  on public.dong_diaries (map_id, entry_date desc, created_at desc);

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'diary_entries'
  ) then
    alter table public.diary_entries
      add column if not exists entry_date date;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'diary_entries'
        and column_name = 'created_at'
    ) then
      update public.diary_entries
      set entry_date = created_at::date
      where entry_date is null;
    else
      update public.diary_entries
      set entry_date = current_date
      where entry_date is null;
    end if;

    alter table public.diary_entries
      alter column entry_date set default current_date;

    alter table public.diary_entries
      alter column entry_date set not null;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'diary_entries'
        and column_name = 'map_id'
    ) then
      if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'diary_entries'
          and column_name = 'created_at'
      ) then
        create index if not exists diary_entries_map_entry_date_idx
          on public.diary_entries (map_id, entry_date desc, created_at desc);
      else
        create index if not exists diary_entries_map_entry_date_idx
          on public.diary_entries (map_id, entry_date desc);
      end if;
    else
      if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'diary_entries'
          and column_name = 'created_at'
      ) then
        create index if not exists diary_entries_entry_date_idx
          on public.diary_entries (entry_date desc, created_at desc);
      else
        create index if not exists diary_entries_entry_date_idx
          on public.diary_entries (entry_date desc);
      end if;
    end if;
  end if;
end;
$$;
