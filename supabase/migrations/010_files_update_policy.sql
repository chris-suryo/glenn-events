-- M20b: the files table shipped (001_init.sql) with SELECT / INSERT / DELETE
-- RLS but no UPDATE policy. The Event Library upload route runs under the
-- authenticated user context, so its post-extraction .update() calls (status,
-- ai_run_id, source_message_id, AI metadata, processing_error) matched no
-- policy, updated 0 rows, and returned no error — leaving file cards stuck on
-- "Reading…" with no metadata. Add the missing UPDATE policy.

create policy "Event members can update files"
  on files for update
  using (is_event_member(event_id))
  with check (is_event_member(event_id));
