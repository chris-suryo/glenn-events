-- Onboarding: store the kinds of events a user typically runs, captured once in
-- guided setup ("What does your team usually run?"). Used to personalize the
-- event-type bubbles (ordering + pre-select) at event creation.
--
-- Additive + nullable: existing profiles stay null until the user answers
-- (null = "not asked yet", which is what triggers the one-time question). The
-- column inherits the existing profiles RLS policies (self-select/-update from
-- 001, self-insert from 003) and the table grant from 005 — no policy changes.

alter table profiles
  add column if not exists typical_event_types text[];
