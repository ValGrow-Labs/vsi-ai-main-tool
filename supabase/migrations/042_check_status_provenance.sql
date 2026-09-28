-- 042: Explicit check status and provenance on search_results.
--
-- Why: a failed provider call used to be indistinguishable from a real
-- result. A rank lookup that timed out was stored as rank_position NULL,
-- which the app reads as "not in Google's results" (a drop, a Next Action,
-- a task). And the stored AI fields didn't record which engine / provider /
-- model produced them.
--
-- What this adds (additive only — no data is changed or deleted):
--   rank_status       found | not_found | check_failed | not_checked
--                     NULL on rows written before this migration ("legacy":
--                     a NULL rank there may be a real "not found" OR a
--                     failed lookup — it can't be told apart).
--   check_provenance  per-engine provenance written by the app, e.g.
--     {
--       "rank":        {"status":"found","provider":"serpapi","engine":"google_organic","checked_at":"…"},
--       "google_ai":   {"status":"answered","provider":"serpapi","engine":"google_ai_overview","checked_at":"…"},
--       "chatgpt":     {"status":"check_failed","provider":"openai","model":"gpt-4o-mini","reason":"PROVIDER_TIMEOUT","checked_at":"…"},
--       "ai_overviews":{"status":"not_checked","reason":"…"}
--     }
--
-- The app keeps working without this migration: it retries inserts without
-- these columns and reads them as NULL. A failed or skipped rank lookup is
-- then still recognisable, because the app stores serp_results_json = NULL
-- for it (a real lookup always stores the results it searched), and the
-- loaders read "NULL rank + no stored results" as "not checked".
--
-- Not applied automatically. Apply with the Supabase SQL editor or CLI after review.

alter table public.search_results
  add column if not exists rank_status text,
  add column if not exists check_provenance jsonb;

alter table public.search_results
  drop constraint if exists search_results_rank_status_check;
alter table public.search_results
  add constraint search_results_rank_status_check
  check (rank_status is null or rank_status in ('found', 'not_found', 'check_failed', 'not_checked'));

comment on column public.search_results.rank_status is
  'Outcome of the Google rank lookup for this row. NULL = written before migration 042 (ambiguous).';
comment on column public.search_results.check_provenance is
  'Per-engine provenance: status, provider, engine/model, checked_at, failure reason.';
