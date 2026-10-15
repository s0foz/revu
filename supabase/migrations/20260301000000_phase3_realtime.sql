-- ============================================================================
-- Revu — 0003 Phase 3: Realtime
--
-- Supabase Realtime only streams changes for tables that are members of the
-- `supabase_realtime` publication. The client portal subscribes to the client's
-- own deliverables and comment threads, so both tables are published here.
--
-- Authorization for the stream is the same RLS as everything else: Supabase
-- Realtime evaluates the publishable table's policies against the Clerk session
-- token presented by the client, so a client session only receives rows it could
-- already read. The `deliverables` column grant from 0001 still applies (a client
-- can only write `status`), and nothing about these policies changes.
--
-- Both blocks are idempotent: re-running `supabase db push` must not fail on a
-- table that is already published.
-- ============================================================================

-- Supabase projects ship this publication; create it only if it is missing so
-- the migration is also reproducible on a plain Postgres instance.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'deliverables'
  ) then
    alter publication supabase_realtime add table public.deliverables;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'comments'
  ) then
    alter publication supabase_realtime add table public.comments;
  end if;
end $$;
