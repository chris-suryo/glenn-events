-- 014_event_ai_summary.sql
-- Cached, Glenn-authored situation brief shown at the top of the event Overview.
-- Generated on demand via POST /api/events/[eventId]/summary; null until first
-- generated. No new RLS needed — the existing "Event members can update their
-- event" UPDATE policy covers writing these columns.

alter table events
  add column if not exists ai_summary text,
  add column if not exists ai_summary_updated_at timestamptz;
