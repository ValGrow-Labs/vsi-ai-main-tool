-- ============================================================
-- VSI Migration 044: security follow-ups (Phase 2, database part)
-- ============================================================
-- Follows 043_security_hardening.sql and reuses its helpers:
--   current_agency_id()  caller's org, NULL if the account or org is disabled
--   is_active_user()     signed in with an enabled profile
--   is_super_admin()     enabled platform admin
--
-- Sections:
--   1. feedback           (issue 4)
--   2. analytics_events   (issue 5)
--   3. system_settings / prompts read access (issue 6)
--   4. invite email binding and super_admin invites (issue 7)
--
-- Safe to re-run: policies are dropped by name and re-created, functions and
-- triggers are replaced in place. No data is changed or deleted, no column is
-- added or dropped.
--
-- Tested only against a local in-memory PGlite database
-- (src/lib/security/db-policies-044.test.ts). Not applied to any Supabase project.
-- ============================================================


-- ─────────────────────────────────────────
-- 1. Feedback (issue 4)
-- ─────────────────────────────────────────
-- Before (020_pilot_cap_and_feedback.sql:82-105, columns completed by 034):
--   * feedback_agency_insert: WITH CHECK (user_id = auth.uid()) only. A user
--     could insert with any agency_id (another tenant's), and could set the
--     admin-only columns status and admin_notes on their own row.
--   * no is_disabled check: a disabled account's JWT could still submit and
--     read feedback.
--   * grant all ... to authenticated and Supabase's default grants to anon.
-- Anonymous feedback is NOT a product feature: /api/feedback requires a
-- session (requireSessionApi), FeedbackModal and /dashboard/feedback insert
-- with the signed-in client and fall back to that route, and
-- src/lib/feedback.ts tells signed-out users to sign in.
-- The table has no email column (020, 034), so identity is user_id only.

-- Non-admin inserts: identity and admin-only columns are set by the database,
-- whatever the client sends. user_id is overwritten with auth.uid() (a client
-- can't file feedback as someone else); status/admin_notes reset to their
-- defaults; timestamps are the server's. Platform admins and trusted server
-- contexts (service_role, SECURITY DEFINER owners) are untouched.
create or replace function public.feedback_enforce_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_super_admin() then
    new.user_id     := auth.uid();
    new.status      := 'new';
    new.admin_notes := null;
    new.created_at  := now();
    new.updated_at  := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_feedback_enforce_insert on public.feedback;
create trigger trg_feedback_enforce_insert
  before insert on public.feedback
  for each row execute function public.feedback_enforce_insert();

-- Non-admin updates: there is no UPDATE policy for non-admins (RLS already
-- matches 0 rows); this is defence in depth in case one is added later.
create or replace function public.feedback_guard_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_super_admin() then
    if new.status      is distinct from old.status
       or new.admin_notes is distinct from old.admin_notes
       or new.user_id     is distinct from old.user_id
       or new.agency_id   is distinct from old.agency_id then
      raise exception 'Not allowed to change feedback status, notes or owner'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_feedback_guard_update on public.feedback;
create trigger trg_feedback_guard_update
  before update on public.feedback
  for each row execute function public.feedback_guard_update();

revoke all on function public.feedback_enforce_insert() from public, anon, authenticated;
revoke all on function public.feedback_guard_update()   from public, anon, authenticated;

drop policy if exists "feedback_agency_insert" on public.feedback;
create policy "feedback_agency_insert"
  on public.feedback for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.is_active_user()
    and (agency_id is null or agency_id = (select public.current_agency_id()))
  );

drop policy if exists "feedback_agency_read_own" on public.feedback;
create policy "feedback_agency_read_own"
  on public.feedback for select
  to authenticated
  using (user_id = auth.uid() and public.is_active_user());

-- feedback_super_admin_all (020:97-102) is kept; is_super_admin() ignores
-- disabled admins since 043. Re-created here so this file is self-contained.
drop policy if exists "feedback_super_admin_all" on public.feedback;
create policy "feedback_super_admin_all"
  on public.feedback for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- 033 documented (not created) broader policies; drop them if a hand-applied
-- copy exists.
drop policy if exists "feedback_user_insert"   on public.feedback;
drop policy if exists "feedback_agency_select" on public.feedback;

revoke all on public.feedback from anon;


-- ─────────────────────────────────────────
-- 2. analytics_events (issue 5)
-- ─────────────────────────────────────────
-- Before (022_analytics_and_ai_overview.sql:38-45):
--   analytics_insert_any_auth WITH CHECK (agency_id is null or agency_id =
--   (select agency_id from profiles where id = auth.uid())) — no is_disabled
--   check, so disabled accounts (and members of disabled orgs) kept writing
--   events tagged with their organization.
-- Writers: only src/lib/track.ts, server-side, with the caller's cookie session
-- (src/lib/supabase/server.ts). With no session (cron → run-pipeline) the insert
-- runs as anon and has always been rejected (no anon policy); there is no
-- intentional anonymous telemetry, so anon stays denied.
-- The table has no user_id column: track() stores user_hash =
-- sha256(ANALYTICS_SALT::agency::user). The salt lives only in the app, so the
-- database cannot verify a user_hash; see the report for the residual risk.
-- Nothing in the schema (policies, views, functions) reads payload for access
-- decisions: payload such as {"role":"super_admin"} is inert data.
-- Reads stay super_admin only (analytics_super_admin_all, unchanged).
drop policy if exists "analytics_insert_any_auth" on public.analytics_events;
create policy "analytics_insert_any_auth"
  on public.analytics_events for insert
  to authenticated
  with check (
    public.is_active_user()
    and (agency_id is null or agency_id = (select public.current_agency_id()))
  );

-- Non-admin inserts cannot backdate events.
create or replace function public.analytics_events_enforce_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_super_admin() then
    new.created_at := now();
  end if;
  return new;
end;
$$;
revoke all on function public.analytics_events_enforce_insert() from public, anon, authenticated;

drop trigger if exists trg_analytics_events_enforce_insert on public.analytics_events;
create trigger trg_analytics_events_enforce_insert
  before insert on public.analytics_events
  for each row execute function public.analytics_events_enforce_insert();

revoke all on public.analytics_events from anon;
-- Authenticated keeps INSERT (track) and SELECT (admin pages, via the
-- super_admin policy). No UPDATE/DELETE policy exists for anyone but super_admin.
revoke update, delete, truncate on public.analytics_events from authenticated;
grant insert, select on public.analytics_events to authenticated;

-- prune_old_analytics() (022:27-32) is a maintenance job. It is SECURITY INVOKER
-- so RLS already limits it, but API roles have no reason to call it.
revoke all on function public.prune_old_analytics() from public, anon, authenticated;
grant execute on function public.prune_old_analytics() to service_role;


-- ─────────────────────────────────────────
-- 3. system_settings and prompts: active users only (issue 6)
-- ─────────────────────────────────────────
-- Before: 010_settings_brief_snapshot.sql:25-31 "auth_users_read_settings" and
-- 016_prompts.sql:26-32 "prompts_read_authenticated" were USING (true) for
-- authenticated, so a disabled account's JWT could read every setting and
-- every LLM prompt override. (010 also granted SELECT to anon; there was no
-- anon policy, so anon already saw nothing.)
-- The app reads both server-side with the user's session (src/lib/settings.ts
-- getSetting/getAllSettings, src/lib/prompts.ts getPromptTemplate) and falls
-- back to built-in defaults when a read returns nothing, e.g. in cron (no
-- session, anon). Public pages (/r/[token]) do not read them.
-- Writes remain super_admin only (super_admin_settings_all, prompts_super_admin_write).
drop policy if exists "auth_users_read_settings" on public.system_settings;
create policy "auth_users_read_settings"
  on public.system_settings for select
  to authenticated
  using (public.is_active_user());

drop policy if exists "prompts_read_authenticated" on public.prompts;
create policy "prompts_read_authenticated"
  on public.prompts for select
  to authenticated
  using (public.is_active_user());

revoke all on public.system_settings from anon;
revoke all on public.prompts         from anon;


-- ─────────────────────────────────────────
-- 4. Invites: bound to the invited email (issue 7)
-- ─────────────────────────────────────────
-- invites (006_auth_invites.sql:48-60) has an optional email column, set by
-- POST /api/admin/invites, but claim_invite (021 → 039 → 043:594-637) never
-- read it: anyone holding the code could claim an invite issued to someone
-- else, including a super_admin invite.
-- Rules added here (claim_invite and validate_invite):
--   * invite email set (non-blank): the claiming account's email, read from
--     auth.users (never from the client), must match; compared as
--     lower(trim(...)) on both sides.
--   * invite email NULL/blank: unchanged, anyone with the code may claim it
--     (the admin form makes email optional and existing invites have none).
--   * role 'super_admin': only honoured while the invite's created_by is an
--     enabled super_admin (only super_admins can insert invites through RLS,
--     007:36-40; this also covers an admin who was later demoted/disabled).
--   * there is no expires_at column; no expiry is invented here.
--   * invites carry no agency: complete_onboarding always creates a NEW
--     organization for the invitee, so an invite cannot be used to join, or be
--     pointed at, an existing organization.
-- 043's protections are kept: callers can only claim for themselves, and
-- direct EXECUTE on claim_invite stays revoked from anon/authenticated.

-- created_by is always the inserting admin, so it can be trusted above.
create or replace function public.invites_set_created_by()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null and current_user in ('authenticated', 'anon') then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;
revoke all on function public.invites_set_created_by() from public, anon, authenticated;

drop trigger if exists trg_invites_set_created_by on public.invites;
create trigger trg_invites_set_created_by
  before insert on public.invites
  for each row execute function public.invites_set_created_by();

-- Shared eligibility check for one invite and one account.
create or replace function public.invite_is_claimable_by(p_invite public.invites, p_user uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_invite_email text := nullif(lower(trim(p_invite.email)), '');
  v_user_email   text;
begin
  if p_user is null then
    return false;
  end if;
  if p_invite.is_active is not true or p_invite.used_by is not null then
    return false;
  end if;

  if v_invite_email is not null then
    select nullif(lower(trim(u.email)), '') into v_user_email
      from auth.users u
     where u.id = p_user;
    if v_user_email is null or v_user_email <> v_invite_email then
      return false;
    end if;
  end if;

  if p_invite.role = 'super_admin' and not exists (
    select 1 from public.profiles p
     where p.id = p_invite.created_by
       and p.role = 'super_admin'
       and not coalesce(p.is_disabled, false)
  ) then
    return false;
  end if;

  return true;
end;
$$;
revoke all on function public.invite_is_claimable_by(public.invites, uuid) from public, anon, authenticated;
grant execute on function public.invite_is_claimable_by(public.invites, uuid) to service_role;

-- Same signature and return shape as 043. Returns no row when the invite is
-- unknown, used, inactive, bound to another email, or an unbacked super_admin
-- invite; complete_onboarding turns that into its usual "invalid" error.
create or replace function public.claim_invite(
  p_code text,
  p_user uuid
) returns table (
  invite_id      uuid,
  role           text,
  max_keywords   integer
) language plpgsql security definer set search_path = public as $$
declare
  v_row public.invites%rowtype;
  v_uid uuid := auth.uid();
begin
  -- Signed-in callers can only claim for themselves (043). A NULL auth.uid()
  -- means a trusted server context such as service_role.
  if v_uid is not null and p_user is distinct from v_uid then
    raise exception 'An invite can only be claimed for your own account'
      using errcode = '42501';
  end if;
  if p_user is null then
    return;
  end if;

  select * into v_row
    from public.invites
   where code = upper(trim(p_code))
   for update;

  if not found then
    return;
  end if;

  if not public.invite_is_claimable_by(v_row, p_user) then
    return;
  end if;

  update public.invites
     set used_by = p_user,
         used_at = now(),
         is_active = false
   where id = v_row.id;

  -- The role always comes from the invite row, never from the caller.
  return query select v_row.id, v_row.role, v_row.max_keywords;
end $$;

-- Keep 043's revocations.
revoke all on function public.claim_invite(text, uuid) from public, anon, authenticated;
grant execute on function public.claim_invite(text, uuid) to service_role;

-- validate_invite (037:79-94 / 039:180-195): same signature. For a signed-in
-- caller it now applies the same rules as the claim, so the onboarding page
-- doesn't show a role for an invite this account can't use. Signed-out callers
-- (registration pre-check) see the unchanged answer; the claim is what enforces.
create or replace function public.validate_invite(p_code text)
returns table (role text, max_keywords integer)
language sql
security definer
stable
set search_path = public
as $$
  select i.role, i.max_keywords
    from public.invites i
   where i.code = upper(trim(p_code))
     and i.is_active is true
     and i.used_by is null
     and (auth.uid() is null or public.invite_is_claimable_by(i, auth.uid()))
   limit 1;
$$;

revoke all on function public.validate_invite(text) from public;
grant execute on function public.validate_invite(text) to anon, authenticated, service_role;

-- complete_onboarding (043:646-698) is unchanged: it derives the user from
-- auth.uid(), rejects disabled/already-set-up accounts and calls claim_invite,
-- which now carries the email and super_admin rules.

revoke all on public.invites from anon;

-- ─────────────────────────────────────────────────────────────────
-- 5. QA tester RPCs (023_qa_testers.sql:147-150)
-- ─────────────────────────────────────────────────────────────────
-- Issue: qa_login / qa_get_session / qa_save_check / qa_list_checks were
-- granted to anon and authenticated. With the public anon key anyone could
-- brute-force the 4-digit tester codes (seeded in git) through PostgREST and
-- write qa_checks for ANY tester id, bypassing the app's signed QA cookie and
-- login throttling entirely.
-- Fix: QA is an internal testing aid and is off by default in the app
-- (VSI_QA_ENABLED / QA_COOKIE_SECRET). It is now off at the database too:
-- no API role may call these functions. To run a QA round on staging, apply
-- supabase/manual/qa_enable_staging.sql (rotates the codes first).
-- qa_all_checks_admin() keeps its grant: it checks is_super_admin() itself.
revoke all on function public.qa_login(text)                        from public, anon, authenticated;
revoke all on function public.qa_get_session(uuid)                  from public, anon, authenticated;
revoke all on function public.qa_save_check(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.qa_list_checks(uuid)                  from public, anon, authenticated;
grant execute on function public.qa_login(text)                        to service_role;
grant execute on function public.qa_get_session(uuid)                  to service_role;
grant execute on function public.qa_save_check(uuid, text, text, text) to service_role;
grant execute on function public.qa_list_checks(uuid)                  to service_role;
revoke all on public.qa_testers from anon, authenticated;
revoke all on public.qa_checks  from anon, authenticated;

notify pgrst, 'reload schema';
