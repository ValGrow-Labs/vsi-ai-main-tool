-- ============================================================
-- VSI Migration 045 — analytics_events event_type allowlist
-- ============================================================
-- Issue (staging validation, 2026-09-28): src/lib/track.ts only records known
-- event types, but a signed-in user writing straight to PostgREST could insert
-- any event_type into their own organization's analytics. No data access was
-- possible (044 already forces active user, own organization, no backdating,
-- no anonymous inserts, admin-only reads) — but it could pollute metrics.
--
-- Fix: a CHECK constraint with the exact list from EVENT_TYPES in
-- src/lib/track.ts (the source of truth; src/lib/security/db-policies-045.test.ts
-- fails if the two lists drift apart). An unknown type is rejected with a
-- check violation (SQLSTATE 23514, constraint analytics_events_event_type_allowed)
-- — never silently dropped.
--
-- NOT VALID: the constraint applies to every new INSERT and UPDATE, but rows that
-- already exist are left exactly as they are (nothing is deleted or rewritten).
-- Run `alter table public.analytics_events validate constraint
-- analytics_events_event_type_allowed;` later only if every existing row is valid.
--
-- Additive and idempotent: only this constraint is (re)created. 044's triggers,
-- policies and grants on analytics_events are unchanged.
-- To add an event type: add it to EVENT_TYPES in track.ts AND to a new migration
-- that re-creates this constraint.

alter table public.analytics_events
  drop constraint if exists analytics_events_event_type_allowed;

alter table public.analytics_events
  add constraint analytics_events_event_type_allowed
  check (event_type in (
    'chat_query',
    'chat_thumbs',
    'brief_generated',
    'brief_regenerated',
    'report_generated',
    'report_completed',
    'task_imported',
    'task_status_change',
    'task_outcome',
    'feedback_submitted',
    'keyword_run_outcome',
    'engine_used'
  )) not valid;

comment on constraint analytics_events_event_type_allowed on public.analytics_events is
  'Allowed analytics event types; must match EVENT_TYPES in src/lib/track.ts (migration 045).';
