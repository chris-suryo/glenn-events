-- M22: lightweight AI run telemetry. Capture token usage + estimated cost per
-- extraction run so dev mode can show approximate cost (NEXT_PUBLIC_SHOW_AI_DEBUG)
-- and we can audit cost per run / per accepted proposal before scaling
-- screenshot (vision) extraction.
--
-- All columns are nullable: mock-mode runs (no ANTHROPIC_API_KEY) leave them null,
-- and the columns inherit the existing ai_runs RLS policies — no policy changes.
-- Proposal/accepted counts are derived from proposed_updates, not stored here.

alter table ai_runs
  add column if not exists model text,
  add column if not exists provider text,
  add column if not exists source_type text,
  add column if not exists input_tokens integer,
  add column if not exists output_tokens integer,
  add column if not exists total_tokens integer,
  add column if not exists estimated_cost_usd numeric,
  add column if not exists duration_ms integer;
