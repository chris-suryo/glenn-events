-- ============================================================
-- Glenn Events — Migration 005
-- Grant table-level permissions to the authenticated role.
-- ============================================================
-- Supabase requires explicit GRANT for tables created via SQL
-- migrations (the dashboard grants these automatically, but
-- migrations do not). Without these grants, PostgREST returns
-- HTTP 403 even when an RLS INSERT/UPDATE/DELETE policy exists.
-- RLS policies still control row-level access — these grants
-- only open the table-level gate.
-- ============================================================
-- Apply via Supabase Dashboard > SQL Editor, or `supabase db push`.
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON profiles             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON organizations        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON organization_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON events               TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON event_members        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON messages             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_runs              TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON proposed_updates     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON tasks                TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON vendors              TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON budget_items         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON timeline_items       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON decisions            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON risks                TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON open_questions       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON files                TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON activity_log         TO authenticated;

-- Sequences (needed for any table using serial/bigserial PKs,
-- though most here use gen_random_uuid() — harmless to include).
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
