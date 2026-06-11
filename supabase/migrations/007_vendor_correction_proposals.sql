-- Add minimal correction metadata for reviewable update proposals.
-- M11A only uses operation='update' for vendor corrections.

ALTER TABLE proposed_updates
  ADD COLUMN IF NOT EXISTS operation text NOT NULL DEFAULT 'insert',
  ADD COLUMN IF NOT EXISTS target_record_type text,
  ADD COLUMN IF NOT EXISTS target_record_id uuid,
  ADD COLUMN IF NOT EXISTS target_snapshot_json jsonb,
  ADD COLUMN IF NOT EXISTS supersedes_proposed_update_id uuid REFERENCES proposed_updates(id) ON DELETE SET NULL;

ALTER TABLE proposed_updates
  DROP CONSTRAINT IF EXISTS proposed_updates_operation_check;

ALTER TABLE proposed_updates
  ADD CONSTRAINT proposed_updates_operation_check
  CHECK (operation IN ('insert', 'update'));
