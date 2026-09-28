-- ============================================================
-- VSI Migration 040 — Analysis Jobs tracking for 5-stage setup
-- ============================================================

create table if not exists public.analysis_jobs (
  id              uuid primary key default gen_random_uuid(),
  agency_id       uuid not null references public.agencies(id) on delete cascade,
  client_id       uuid not null references public.clients(id) on delete cascade,
  status          text not null default 'in_progress'
                  check (status in ('in_progress', 'completed', 'failed')),
  stage           text not null default 'website_analysis'
                  check (stage in ('website_analysis', 'seo_analysis', 'competitor_analysis', 'geo_analysis', 'results_prep', 'completed')),
  stage_statuses  jsonb not null default '{"website_analysis": "pending", "seo_analysis": "pending", "competitor_analysis": "pending", "geo_analysis": "pending", "results_prep": "pending"}'::jsonb,
  error_message   text,
  stages_data     jsonb not null default '{}'::jsonb,
  requested_by    uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  completed_at    timestamptz
);

create index if not exists idx_analysis_jobs_client_created
  on public.analysis_jobs (client_id, created_at desc);

-- Amended before first apply: at most one running analysis per project, across
-- all server instances. A second concurrent start fails with 23505, which the
-- /api/jobs/analysis route answers with 409 already_running (each analysis
-- makes paid search/AI calls, so duplicates cost money).
create unique index if not exists analysis_jobs_one_running_per_client
  on public.analysis_jobs (client_id)
  where status = 'in_progress';

alter table public.analysis_jobs enable row level security;

-- Amended 2026-09-27 BEFORE first apply (this file had never been applied anywhere):
-- the original policy checked only agency_id, so a member could insert a job for
-- their own agency that points at another organization's client_id, and a
-- disabled account kept access. The policy below is self-contained (it does not
-- depend on helpers from 043), so it is safe whichever of 040/043 runs first.
-- Migration 043 later replaces it with the shared public.current_agency_id()
-- helper and adds the tenant-consistency trigger when this table exists.
drop policy if exists "analysis_jobs_agency_all" on public.analysis_jobs;
create policy "analysis_jobs_agency_all"
  on public.analysis_jobs for all
  to authenticated
  using (agency_id = (select p.agency_id from public.profiles p
                       where p.id = auth.uid() and not coalesce(p.is_disabled, false)))
  with check (
    agency_id = (select p.agency_id from public.profiles p
                  where p.id = auth.uid() and not coalesce(p.is_disabled, false))
    and exists (select 1 from public.clients c
                 where c.id = client_id and c.agency_id = analysis_jobs.agency_id)
  );

drop policy if exists "analysis_jobs_super_admin_all" on public.analysis_jobs;
create policy "analysis_jobs_super_admin_all"
  on public.analysis_jobs for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

grant select, insert, update on public.analysis_jobs to authenticated;
grant all on public.analysis_jobs to service_role;
