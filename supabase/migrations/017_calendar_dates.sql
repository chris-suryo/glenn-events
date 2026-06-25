-- 017_calendar_dates.sql
-- events.event_date and tasks.due_date are conceptually CALENDAR DATES (a day, no
-- time-of-day), but were created as `timestamptz`. Writing a naive day like
-- "2026-09-18" into a timestamptz coerces it to midnight UTC, which then renders a
-- day early in the event's local zone (smoke-test D5 — the Overview header showed
-- "Thu Sep 17, 8:00 PM" for a Sept 18 event). Convert both to `date` so they are
-- true calendar values that never tz-shift.
--
-- The USING cast recovers the intended day from the naive-UTC values the old write
-- path stored: `event_date AT TIME ZONE 'UTC'` yields the UTC wall-clock, and ::date
-- takes its calendar day — which is exactly the day that was originally intended.
-- Idempotent: the cast is a no-op if a column is already `date`.

alter table events
  alter column event_date type date using (event_date at time zone 'UTC')::date;

alter table tasks
  alter column due_date type date using (due_date at time zone 'UTC')::date;
