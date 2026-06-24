-- 016_proposed_update_group_label.sql
-- Review compartmentalization: Glenn tags each proposed update with the real-world
-- component it belongs to (e.g. "Petal & Stem", "Cake", "DJ", "Venue") so the Review
-- panel can render related updates as a single grouped tile instead of one flat list.
-- A vendor + its budget line + its timeline + its follow-up task share one group_label.
-- Nullable and additive: untagged updates fall back to the existing flat list, so the
-- approve flow never regresses if a label is missing.

alter table proposed_updates add column if not exists group_label text;
