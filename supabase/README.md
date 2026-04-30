# Supabase CLI Migration Guide

This project manages database schema changes with Supabase CLI migrations.

## Project Link

- Project ref: `kpibshapazejhkgblrmb`
- Project URL env value: `NEXT_PUBLIC_SUPABASE_URL=https://kpibshapazejhkgblrmb.supabase.co`

The repository is already initialized with `supabase/config.toml`. The linked
project metadata lives under `supabase/.temp/`, which is ignored by git.

## First-Time Setup

```bash
npx supabase login
npm run db:link
npm run db:status
```

If you need to link manually:

```bash
npx supabase link --project-ref kpibshapazejhkgblrmb
```

## Applying Migrations

Editing SQL files in VS Code does not apply them to Supabase automatically.
After reviewing migration files, apply pending migrations to the linked project:

```bash
npm run db:push
```

For local development with a local Supabase stack:

```bash
npx supabase start
npx supabase db reset
```

## Current Split Migrations

- `20260430010000_scope_records_to_user.sql`: creates user-scoped visit/diary records before map ownership is introduced.
- `20260430010100_create_maps_table.sql`: creates `public.maps`, indexes, and the `updated_at` trigger.
- `20260430010200_create_map_members_table.sql`: creates `public.user_profiles` and `public.map_members`.
- `20260430010300_add_map_id_to_existing_tables.sql`: adds `map_id` columns and migrates existing per-user records into default maps.
- `20260430010400_enable_rls_and_policies.sql`: enables RLS, helper functions, map creation RPC, and map/member/record policies.

Older overlapping drafts are kept under `supabase/archive/` so they are not
picked up by `supabase db push`.

If `npm run db:status` shows a remote-only `20260430` row, that is existing
remote migration history from before the split. Do not run `db:push` blindly in
that state; either keep the matching historical migration file or repair the
remote migration history after confirming which SQL was already applied.

## Safety Notes

- Never expose a Supabase service role key to client code.
- Vercel should only use `NEXT_PUBLIC_SUPABASE_ANON_KEY` for browser access.
- User permissions should be enforced with RLS and Storage policies.
- Run `npm run db:status` before `npm run db:push` when working with a shared or production database.
