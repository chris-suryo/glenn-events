-- M11B: soft-archive columns + archive operation on proposed updates.
-- Archived records stay in the database for provenance; the app hides them
-- from active Plan lists and budget totals.

alter table vendors
  add column if not exists archived_at timestamptz,
  add column if not exists archived_reason text;

alter table budget_items
  add column if not exists archived_at timestamptz,
  add column if not exists archived_reason text;

-- timeline_items gets the same columns so the correction model stays
-- consistent across record types; timeline correction behavior ships later.
alter table timeline_items
  add column if not exists archived_at timestamptz,
  add column if not exists archived_reason text;

alter table proposed_updates drop constraint if exists proposed_updates_operation_check;
alter table proposed_updates add constraint proposed_updates_operation_check
  check (operation in ('insert', 'update', 'archive'));
