-- Thuverse database: run once in Supabase → SQL Editor → New query → Run.
-- One row per app record (vocabulary item, review card, note, score, journal
-- entry, article, lesson progress, settings, activity…). The record itself is
-- kept as JSON exactly as the app stores it, so nothing is lost or reshaped.

create table if not exists public.records (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id         text        not null check (char_length(id) between 1 and 200),
  kind       text        not null,
  body       jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists records_user_kind on public.records (user_id, kind);

-- Row-level security: every account can see and change only its own rows.
alter table public.records enable row level security;

drop policy if exists "read own records"   on public.records;
drop policy if exists "insert own records" on public.records;
drop policy if exists "update own records" on public.records;
drop policy if exists "delete own records" on public.records;

create policy "read own records"   on public.records for select to authenticated using ((select auth.uid()) = user_id);
create policy "insert own records" on public.records for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "update own records" on public.records for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "delete own records" on public.records for delete to authenticated using ((select auth.uid()) = user_id);

-- Live updates between your devices.
do $$ begin
  alter publication supabase_realtime add table public.records;
exception when duplicate_object then null; end $$;
