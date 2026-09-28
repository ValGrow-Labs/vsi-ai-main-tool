-- ============================================================
-- MANUAL, DESTRUCTIVE — NOT A MIGRATION. DO NOT RUN BLINDLY.
-- ============================================================
-- Deliberately kept OUT of supabase/migrations/ so `supabase db push` or a
-- replayed chain can never run it. Prepared for Phase 2 (migration 043); it has
-- NOT been run against any database.
--
-- Purpose: migration 043 makes messages and notifications owner-only and sets
-- user_id NOT NULL, but it skips NOT NULL when ownerless rows exist (it never
-- deletes). Ownerless rows were readable and writable by everyone under the old
-- policies (031_messages.sql:33-47, 030_notifications.sql:32-46); after 043 they
-- are readable by no one except the service role, i.e. dead data.
--
-- VERIFY COUNTS FIRST. Run step 1 alone and look at the rows. Both tables were
-- believed empty of ownerless rows during validation (anon and the test user saw
-- 0 rows), so steps 2-3 are expected to delete nothing. If step 1 shows rows,
-- export them before deleting.
-- ============================================================

-- 1. Verify (read-only). Run this first, on its own.
select 'messages' as table_name, count(*) as ownerless_rows from public.messages where user_id is null
union all
select 'notifications', count(*) from public.notifications where user_id is null;

-- select * from public.messages      where user_id is null;   -- inspect / export
-- select * from public.notifications where user_id is null;   -- inspect / export

-- 2. Delete ownerless rows and enforce ownership. Uncomment only after step 1.
-- begin;
--   delete from public.messages      where user_id is null;
--   delete from public.notifications where user_id is null;
--   alter table public.messages      alter column user_id set not null;
--   alter table public.notifications alter column user_id set not null;
-- commit;

-- 3. OPTIONAL, product decision — shared report links created before 043 have
--    expires_at NULL and never expire (they are no longer listable, only
--    reachable with the exact token). To give them a 30-day grace period instead:
-- update public.reports
--    set expires_at = now() + interval '30 days'
--  where expires_at is null;
