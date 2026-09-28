-- ============================================================
-- VSI Migration 043: security hardening and tenant isolation (Phase 2)
-- ============================================================
-- Closes the database-side findings in docs/validation/VSI_FULL_SYSTEM_VALIDATION.md
-- section 13 (MT-2, MT-3, MT-4, MT-7, MT-8, MT-9, MT-10) plus disabled-account
-- enforcement. Every section names the migration/line it corrects.
--
-- Safe to re-run: policies are dropped by name and re-created, functions are
-- replaced in place, and nothing here deletes data. The one data-dependent step
-- (user_id NOT NULL on messages/notifications) only runs when no ownerless rows
-- exist; otherwise it prints a NOTICE and the manual cleanup script
-- supabase/manual/ownerless_rows_cleanup.sql must be reviewed and run first.
--
-- Order: apply after 040 (analysis_jobs) and 042. If 040 has not been applied yet
-- the analysis_jobs parts are skipped (040 was amended before first apply to be
-- secure on its own); re-run this file after applying 040.
--
-- Tested only against a local in-memory PGlite database
-- (src/lib/security/db-policies.test.ts). Not applied to any Supabase project.
-- ============================================================


-- ─────────────────────────────────────────
-- 1. Membership helpers (disabled accounts lose data access at the DB boundary)
-- ─────────────────────────────────────────
-- Before: every tenant policy used
--   agency_id = (select agency_id from public.profiles where id = auth.uid())
-- (001_baseline.sql:94-98, 125-129, 202-206; 014_reports.sql:34-38; 018_tasks.sql:63-67;
--  035_site_audits.sql:40-57; 036/039 project_competitors). profiles.is_disabled
-- (026) was never consulted, so a disabled user's still-valid JWT kept full
-- read/write access through PostgREST. The app signs such users out, but the
-- database did not.
--
-- current_agency_id(): the caller's organization, or NULL when the account is
-- disabled or its organization is disabled (mirrors src/lib/auth-rules.ts
-- isAccountBlocked). SECURITY DEFINER so it reads profiles/agencies without RLS
-- recursion; STABLE and wrapped in (select ...) in policies so it runs once per
-- statement, not once per row.
create or replace function public.current_agency_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.agency_id
    from public.profiles p
    join public.agencies a on a.id = p.agency_id
   where p.id = auth.uid()
     and not coalesce(p.is_disabled, false)
     and not coalesce(a.is_disabled, false)
$$;

-- own_agency_id(): the caller's organization while the ACCOUNT is enabled, even if
-- the organization is disabled. Used only for reading the caller's own agencies
-- row: src/lib/auth.ts reads agencies.is_disabled through the profile embed to
-- decide to sign the user out, so hiding a disabled org's row would hide the flag.
create or replace function public.own_agency_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.agency_id
    from public.profiles p
   where p.id = auth.uid()
     and not coalesce(p.is_disabled, false)
$$;

-- is_active_user(): signed in and not disabled. For per-user tables
-- (messages, notifications) that are not organization-scoped.
create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = auth.uid()
       and not coalesce(p.is_disabled, false)
  )
$$;

-- is_super_admin() (007, 039:21-34) ignored is_disabled: a disabled platform admin
-- kept every cross-tenant policy. Same signature, so every existing policy that
-- calls it picks this up.
create or replace function public.is_super_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid()
       and role = 'super_admin'
       and not coalesce(is_disabled, false)
  );
$$;

revoke all on function public.current_agency_id() from public;
revoke all on function public.own_agency_id()     from public;
revoke all on function public.is_active_user()    from public;
grant execute on function public.current_agency_id() to anon, authenticated, service_role;
grant execute on function public.own_agency_id()     to anon, authenticated, service_role;
grant execute on function public.is_active_user()    to anon, authenticated, service_role;
grant execute on function public.is_super_admin()    to anon, authenticated, service_role;


-- ─────────────────────────────────────────
-- 2. Agencies: no direct inserts (MT-8)
-- ─────────────────────────────────────────
-- 005_auth_production.sql:56-59 and 006_auth_invites.sql:110-113 added INSERT
-- policies WITH CHECK (true) that were never dropped, so any signed-in user could
-- create organizations directly. The only legitimate paths are the SECURITY
-- DEFINER functions complete_onboarding() and create_own_organization() (039),
-- which run as the table owner and are unaffected. Platform admins keep
-- super_admin_all_agencies.
drop policy if exists "auth_users_can_create_agency" on public.agencies;
drop policy if exists "auth_users_create_own_agency" on public.agencies;

-- Members read their own organization (001_baseline.sql:66-69 used an unscoped
-- role and ignored is_disabled). See own_agency_id() for why a disabled
-- ORGANIZATION's row stays readable to its members.
drop policy if exists "agency_members_select" on public.agencies;
create policy "agency_members_select"
  on public.agencies for select
  to authenticated
  using (id = (select public.own_agency_id()));

revoke insert, update, delete, truncate on public.agencies from anon;


-- ─────────────────────────────────────────
-- 3. Tenant tables: membership through current_agency_id()
-- ─────────────────────────────────────────
-- Same rule as before, restricted to enabled accounts in enabled organizations.
-- Super-admin policies (007, 014, 018, 035, 036/039) are unchanged.

-- clients (001_baseline.sql:94-98)
drop policy if exists "clients_agency_all" on public.clients;
create policy "clients_agency_all"
  on public.clients for all
  to authenticated
  using      (agency_id = (select public.current_agency_id()))
  with check (agency_id = (select public.current_agency_id()));

-- tracked_keywords (001_baseline.sql:125-129)
drop policy if exists "tracked_keywords_agency_all" on public.tracked_keywords;
create policy "tracked_keywords_agency_all"
  on public.tracked_keywords for all
  to authenticated
  using      (agency_id = (select public.current_agency_id()))
  with check (agency_id = (select public.current_agency_id()));

-- search_results (001_baseline.sql:202-206)
drop policy if exists "search_results_agency_all" on public.search_results;
create policy "search_results_agency_all"
  on public.search_results for all
  to authenticated
  using      (agency_id = (select public.current_agency_id()))
  with check (agency_id = (select public.current_agency_id()));

-- reports (014_reports.sql:34-38)
drop policy if exists "reports_agency_all" on public.reports;
create policy "reports_agency_all"
  on public.reports for all
  to authenticated
  using      (agency_id = (select public.current_agency_id()))
  with check (agency_id = (select public.current_agency_id()));

-- tasks (018_tasks.sql:63-67)
drop policy if exists "tasks_agency_all" on public.tasks;
create policy "tasks_agency_all"
  on public.tasks for all
  to authenticated
  using      (agency_id = (select public.current_agency_id()))
  with check (agency_id = (select public.current_agency_id()));

-- site_audits (035_site_audits.sql:38-57)
drop policy if exists "site_audits_agency_select" on public.site_audits;
create policy "site_audits_agency_select"
  on public.site_audits for select
  to authenticated
  using (agency_id = (select public.current_agency_id()));

drop policy if exists "site_audits_agency_insert" on public.site_audits;
create policy "site_audits_agency_insert"
  on public.site_audits for insert
  to authenticated
  with check (agency_id = (select public.current_agency_id()));

drop policy if exists "site_audits_agency_update" on public.site_audits;
create policy "site_audits_agency_update"
  on public.site_audits for update
  to authenticated
  using      (agency_id = (select public.current_agency_id()))
  with check (agency_id = (select public.current_agency_id()));

-- project_competitors (039_self_service_workspace.sql:130-151). Its insert policy
-- already checked the client; kept, now also for enabled accounts only.
drop policy if exists "project_competitors_agency_select" on public.project_competitors;
create policy "project_competitors_agency_select"
  on public.project_competitors for select
  to authenticated
  using (agency_id = (select public.current_agency_id()));

drop policy if exists "project_competitors_agency_insert" on public.project_competitors;
create policy "project_competitors_agency_insert"
  on public.project_competitors for insert
  to authenticated
  with check (
    agency_id = (select public.current_agency_id())
    and exists (
      select 1 from public.clients c
       where c.id = client_id and c.agency_id = project_competitors.agency_id
    )
  );

drop policy if exists "project_competitors_agency_delete" on public.project_competitors;
create policy "project_competitors_agency_delete"
  on public.project_competitors for delete
  to authenticated
  using (agency_id = (select public.current_agency_id()));

-- client_keyword_analyses (032_ai_keyword_generator.sql:22-36, MT-7): four
-- USING (true) / WITH CHECK (true) policies with no role restriction — every
-- signed-in user (and anon, given Supabase's default grants) could read and
-- write every organization's rows. The table has no agency_id, so ownership is
-- derived from its client. Rows with a NULL client_id become admin-only.
drop policy if exists "analyses_select_own" on public.client_keyword_analyses;
drop policy if exists "analyses_insert_own" on public.client_keyword_analyses;
drop policy if exists "analyses_update_own" on public.client_keyword_analyses;
drop policy if exists "analyses_delete_own" on public.client_keyword_analyses;

drop policy if exists "client_keyword_analyses_agency_all" on public.client_keyword_analyses;
create policy "client_keyword_analyses_agency_all"
  on public.client_keyword_analyses for all
  to authenticated
  using (exists (
    select 1 from public.clients c
     where c.id = client_keyword_analyses.client_id
       and c.agency_id = (select public.current_agency_id())
  ))
  with check (exists (
    select 1 from public.clients c
     where c.id = client_keyword_analyses.client_id
       and c.agency_id = (select public.current_agency_id())
  ));

drop policy if exists "client_keyword_analyses_super_admin_all" on public.client_keyword_analyses;
create policy "client_keyword_analyses_super_admin_all"
  on public.client_keyword_analyses for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- Agency logo uploads (012_agency_branding.sql:23-56): same membership rule.
drop policy if exists "agency_logo_upload" on storage.objects;
create policy "agency_logo_upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'agency-logos'
    and (storage.foldername(name))[1] = (select public.current_agency_id())::text
  );

drop policy if exists "agency_logo_update" on storage.objects;
create policy "agency_logo_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'agency-logos'
    and (storage.foldername(name))[1] = (select public.current_agency_id())::text
  );

drop policy if exists "agency_logo_delete" on storage.objects;
create policy "agency_logo_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'agency-logos'
    and (storage.foldername(name))[1] = (select public.current_agency_id())::text
  );

-- analysis_jobs (040). Skipped when 040 has not been applied yet.
do $$
begin
  if to_regclass('public.analysis_jobs') is not null then
    execute 'drop policy if exists "analysis_jobs_agency_all" on public.analysis_jobs';
    execute $p$
      create policy "analysis_jobs_agency_all"
        on public.analysis_jobs for all
        to authenticated
        using      (agency_id = (select public.current_agency_id()))
        with check (agency_id = (select public.current_agency_id()))
    $p$;
    execute 'revoke all on public.analysis_jobs from anon';
  else
    raise notice '043: public.analysis_jobs does not exist (040 not applied); re-run 043 after 040';
  end if;
end $$;

-- Anon never needs these tables: RLS already returns nothing, but remove the
-- default grants too so a future permissive policy can't expose them.
revoke all on public.clients                 from anon;
revoke all on public.tracked_keywords        from anon;
revoke all on public.search_results          from anon;
revoke all on public.tasks                   from anon;
revoke all on public.site_audits             from anon;
revoke all on public.project_competitors     from anon;
revoke all on public.client_keyword_analyses from anon;


-- ─────────────────────────────────────────
-- 4. Child rows must reference a client of the SAME organization (MT-10)
-- ─────────────────────────────────────────
-- Tenant policies checked only the row's agency_id (e.g. 018_tasks.sql:63-67), so
-- a member could insert a row with their own agency_id but another tenant's
-- client_id / tracked_keyword_id / source_report_id. A trigger (not a policy) so
-- it also protects service-role writes. On UPDATE it only re-checks when one of
-- the reference columns changes, so legacy rows are never blocked from ordinary
-- updates. SECURITY DEFINER: the check is about the real owner, not what the
-- caller can see.
create or replace function public.enforce_tenant_consistency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new    jsonb := to_jsonb(new);
  v_old    jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  v_agency uuid  := nullif(v_new->>'agency_id', '')::uuid;
  v_client uuid  := nullif(v_new->>'client_id', '')::uuid;
  v_kw     uuid  := nullif(v_new->>'tracked_keyword_id', '')::uuid;
  v_report uuid  := nullif(v_new->>'source_report_id', '')::uuid;
begin
  if tg_op = 'UPDATE'
     and (v_new->'agency_id')          is not distinct from (v_old->'agency_id')
     and (v_new->'client_id')          is not distinct from (v_old->'client_id')
     and (v_new->'tracked_keyword_id') is not distinct from (v_old->'tracked_keyword_id')
     and (v_new->'source_report_id')   is not distinct from (v_old->'source_report_id') then
    return new;
  end if;

  if v_client is not null and not exists (
    select 1 from public.clients c where c.id = v_client and c.agency_id = v_agency
  ) then
    raise exception 'client_id does not belong to this organization'
      using errcode = '42501';
  end if;

  if v_kw is not null and not exists (
    select 1 from public.tracked_keywords k
     where k.id = v_kw and k.agency_id = v_agency and k.client_id = v_client
  ) then
    raise exception 'tracked_keyword_id does not belong to this project'
      using errcode = '42501';
  end if;

  if v_report is not null and not exists (
    select 1 from public.reports r where r.id = v_report and r.agency_id = v_agency
  ) then
    raise exception 'source_report_id does not belong to this organization'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_tenant_consistency() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['tracked_keywords', 'search_results', 'tasks', 'reports',
                           'site_audits', 'project_competitors', 'analysis_jobs']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists trg_tenant_consistency on public.%I', t);
      execute format(
        'create trigger trg_tenant_consistency before insert or update on public.%I '
        'for each row execute function public.enforce_tenant_consistency()', t);
    end if;
  end loop;
end $$;


-- ─────────────────────────────────────────
-- 5. Shared reports: token access only through a function (MT-2, P0)
-- ─────────────────────────────────────────
-- 014_reports.sql:40-45 "reports_public_read_by_token" was
--   for select to anon using (share_token is not null and (expires_at is null or expires_at > now()))
-- It never compares a token, so the anon key could list EVERY unexpired report of
-- every organization (confirmed at runtime: 2 reports from 2 agencies). Share
-- links also never set expires_at, so that meant every report.
drop policy if exists "reports_public_read_by_token" on public.reports;
revoke all on public.reports from anon;

-- One report, only by its exact token, only its shareable columns.
--  * anon / other organizations: must be unexpired and the owning organization
--    must not be disabled.
--  * members of the owning organization and platform admins: expiry does not
--    apply, so agencies can still open their own older reports from the dashboard.
--  * content is returned only for status = 'ready' (the page shows a placeholder
--    for pending/failed).
-- Not returned: agency_id, client_id, share_token, created_by, error_message.
create or replace function public.get_shared_report(p_token text)
returns table (
  id           uuid,
  type         text,
  status       text,
  generated_at timestamptz,
  expires_at   timestamptz,
  content      jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.type, r.status, r.generated_at, r.expires_at,
         case when r.status = 'ready' then r.content else null end
    from public.reports r
    join public.agencies a on a.id = r.agency_id
   where p_token is not null
     and char_length(p_token) between 16 and 128
     and r.share_token = p_token
     and (
       (
         (r.expires_at is null or r.expires_at > now())
         and not coalesce(a.is_disabled, false)
       )
       or r.agency_id = public.current_agency_id()
       or public.is_super_admin()
     )
   limit 1
$$;

revoke all on function public.get_shared_report(text) from public;
grant execute on function public.get_shared_report(text) to anon, authenticated, service_role;

-- Share links expire. Default: 30 days after creation (the product has no
-- setting for this yet; src/lib/report-share.ts REPORT_SHARE_TTL_DAYS sets the
-- same value explicitly at generation time). Existing rows are NOT changed:
-- reports created before this migration have expires_at NULL and their links
-- keep working for whoever holds the exact token — but they can no longer be
-- listed. An optional backfill is in supabase/manual/ownerless_rows_cleanup.sql.
alter table public.reports alter column expires_at set default (now() + interval '30 days');


-- ─────────────────────────────────────────
-- 6. Messages: owner-only (MT-3)
-- ─────────────────────────────────────────
-- 031_messages.sql:33-47: four policies with "user_id IS NULL OR user_id = auth.uid()"
-- and no role restriction, so anon and every user could read, edit and delete
-- ownerless rows and insert new ownerless rows. The API (src/app/api/messages)
-- always sets user_id since Phase 1.
drop policy if exists "messages_select_own" on public.messages;
drop policy if exists "messages_insert_own" on public.messages;
drop policy if exists "messages_update_own" on public.messages;
drop policy if exists "messages_delete_own" on public.messages;

create policy "messages_select_own"
  on public.messages for select
  to authenticated
  using (user_id = auth.uid() and public.is_active_user());

create policy "messages_insert_own"
  on public.messages for insert
  to authenticated
  with check (user_id = auth.uid() and public.is_active_user());

create policy "messages_update_own"
  on public.messages for update
  to authenticated
  using      (user_id = auth.uid() and public.is_active_user())
  with check (user_id = auth.uid() and public.is_active_user());

create policy "messages_delete_own"
  on public.messages for delete
  to authenticated
  using (user_id = auth.uid() and public.is_active_user());

revoke all on public.messages from anon;

-- 031_messages.sql:7-8: fake defaults ("admin@searchintel.com",
-- "recipient@example.com") made a message look like it came from a real
-- address. The API always supplies sender and recipient.
alter table public.messages alter column sender    drop default;
alter table public.messages alter column recipient drop default;

-- 031_messages.sql:6: ON DELETE SET NULL turned a deleted user's messages into
-- ownerless (world-readable) rows. Cascade instead.
do $$
declare
  c record;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
     where con.conrelid = 'public.messages'::regclass
       and con.contype = 'f'
       and att.attname = 'user_id'
  loop
    execute format('alter table public.messages drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.messages
  add constraint messages_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;


-- ─────────────────────────────────────────
-- 7. Notifications: owner-only (MT-4)
-- ─────────────────────────────────────────
-- 030_notifications.sql:32-46: same "OR user_id IS NULL" pattern, no role
-- restriction. The API routes scope by user since Phase 1.
drop policy if exists "Users can view their own notifications"   on public.notifications;
drop policy if exists "Users can insert notifications"           on public.notifications;
drop policy if exists "Users can update their own notifications" on public.notifications;
drop policy if exists "Users can delete their own notifications" on public.notifications;
drop policy if exists "notifications_select_own" on public.notifications;
drop policy if exists "notifications_insert_own" on public.notifications;
drop policy if exists "notifications_update_own" on public.notifications;
drop policy if exists "notifications_delete_own" on public.notifications;

create policy "notifications_select_own"
  on public.notifications for select
  to authenticated
  using (user_id = auth.uid() and public.is_active_user());

create policy "notifications_insert_own"
  on public.notifications for insert
  to authenticated
  with check (user_id = auth.uid() and public.is_active_user());

create policy "notifications_update_own"
  on public.notifications for update
  to authenticated
  using      (user_id = auth.uid() and public.is_active_user())
  with check (user_id = auth.uid() and public.is_active_user());

create policy "notifications_delete_own"
  on public.notifications for delete
  to authenticated
  using (user_id = auth.uid() and public.is_active_user());

revoke all on public.notifications from anon;

-- user_id NOT NULL on both tables, only when no ownerless rows exist. With rows
-- present this is skipped (NOTICE) — nothing is deleted here. Review and run
-- supabase/manual/ownerless_rows_cleanup.sql, then re-run this migration.
do $$
declare
  n bigint;
begin
  select count(*) into n from public.messages where user_id is null;
  if n = 0 then
    alter table public.messages alter column user_id set not null;
  else
    raise notice '043: % ownerless messages rows; user_id NOT NULL skipped (see supabase/manual/ownerless_rows_cleanup.sql)', n;
  end if;

  select count(*) into n from public.notifications where user_id is null;
  if n = 0 then
    alter table public.notifications alter column user_id set not null;
  else
    raise notice '043: % ownerless notifications rows; user_id NOT NULL skipped (see supabase/manual/ownerless_rows_cleanup.sql)', n;
  end if;
end $$;


-- ─────────────────────────────────────────
-- 8. Invites: claim only for yourself (MT-9)
-- ─────────────────────────────────────────
-- 021_invite_claim_and_engines.sql:15-49 / 039_self_service_workspace.sql:200-233:
-- claim_invite(p_code, p_user) is SECURITY DEFINER and granted to authenticated,
-- and trusts p_user. Any signed-in user could burn someone else's invite code or
-- mark it used by an arbitrary account. The app never calls it directly (only
-- complete_onboarding does, grep src/), so:
--   * it now refuses a p_user that differs from the signed-in caller, and
--   * direct EXECUTE is revoked from anon/authenticated. complete_onboarding
--     (SECURITY DEFINER, owner) still calls it.
-- Same signature, so nothing that references it breaks.
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
  -- Signed-in callers can only claim for themselves. (A NULL auth.uid() means a
  -- trusted server context such as service_role.)
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

  if v_row.is_active is false or v_row.used_by is not null then
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

revoke all on function public.claim_invite(text, uuid) from public, anon, authenticated;
grant execute on function public.claim_invite(text, uuid) to service_role;

-- complete_onboarding (037:106-146 / 039:238-279) did not check is_disabled
-- (create_own_organization does) and did not lock the caller's profile, so two
-- concurrent calls could both pass the "already set up" check. Same signature
-- and behaviour otherwise.
create or replace function public.complete_onboarding(p_code text, p_agency_name text, p_slug text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile record;
  v_claim record;
  v_agency uuid;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select agency_id, is_disabled into v_profile
    from public.profiles
   where id = v_uid
   for update;
  if not found then
    raise exception 'Profile not found for this account' using errcode = 'P0002';
  end if;
  if coalesce(v_profile.is_disabled, false) then
    raise exception 'This account is disabled' using errcode = '42501';
  end if;
  if v_profile.agency_id is not null then
    raise exception 'Account is already set up' using errcode = '42501';
  end if;
  if coalesce(trim(p_agency_name), '') = '' then
    raise exception 'Organization name is required' using errcode = '22023';
  end if;

  select * into v_claim from public.claim_invite(p_code, v_uid);
  if v_claim.invite_id is null then
    raise exception 'This invite code is invalid or has already been used' using errcode = '22023';
  end if;

  insert into public.agencies (name, slug, max_keywords, is_pilot)
  values (trim(p_agency_name), p_slug, v_claim.max_keywords, v_claim.role = 'pilot')
  returning id into v_agency;

  update public.profiles
     set agency_id = v_agency,
         role = v_claim.role
   where id = v_uid;

  return v_agency;
end;
$$;

revoke all on function public.complete_onboarding(text, text, text) from public, anon;
grant execute on function public.complete_onboarding(text, text, text) to authenticated;

-- create_own_organization (039:284-360) is unchanged: it already derives the user
-- from auth.uid(), rejects disabled accounts and is authenticated-only.

notify pgrst, 'reload schema';
