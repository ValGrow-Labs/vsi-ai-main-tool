-- ============================================================
-- VSI Manual Schema — Domain Website Analysis Cache (7-day TTL)
-- ============================================================

create table if not exists public.website_analysis_cache (
  domain      text primary key,
  profile     jsonb not null,
  created_at  timestamptz not null default now()
);

alter table public.website_analysis_cache enable row level security;

drop policy if exists "website_analysis_cache_select" on public.website_analysis_cache;
create policy "website_analysis_cache_select" on public.website_analysis_cache
  for select to authenticated using (true);

drop policy if exists "website_analysis_cache_insert" on public.website_analysis_cache;
create policy "website_analysis_cache_insert" on public.website_analysis_cache
  for insert to authenticated with check (true);

drop policy if exists "website_analysis_cache_update" on public.website_analysis_cache;
create policy "website_analysis_cache_update" on public.website_analysis_cache
  for update to authenticated using (true) with check (true);

drop policy if exists "website_analysis_cache_anon" on public.website_analysis_cache;
create policy "website_analysis_cache_anon" on public.website_analysis_cache
  for all to anon using (true) with check (true);

grant select, insert, update on public.website_analysis_cache to authenticated;
grant all on public.website_analysis_cache to anon;
grant all on public.website_analysis_cache to service_role;

