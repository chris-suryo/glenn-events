-- M20: Event Library — uploaded files become AI-extractable sources of truth.
-- Additive only. The `files` table already exists (001_init.sql); this adds the
-- metadata, processing status, AI-suggested fields, and provenance links that
-- turn an uploaded file into a managed library item that survives a failed
-- extraction. `messages.channel` distinguishes a document-sourced message from
-- a typed chat note so the UI can render it as a file chip and provenance can
-- lead with the source file.

alter table files
  add column if not exists display_name        text,
  add column if not exists status              text not null default 'uploaded',
  add column if not exists ai_suggested_name   text,
  add column if not exists ai_category         text,
  add column if not exists ai_labels           jsonb,
  add column if not exists extraction_summary  text,
  add column if not exists source_message_id   uuid references messages(id) on delete set null,
  add column if not exists ai_run_id           uuid references ai_runs(id) on delete set null,
  add column if not exists processing_error    text,
  add column if not exists updated_at          timestamptz not null default now();

alter table files drop constraint if exists files_status_check;
alter table files add constraint files_status_check
  check (status in ('uploaded', 'extracting', 'extracted', 'needs_review', 'source_only', 'failed'));

-- Nullable: existing rows and typed-chat messages stay null (treated as 'web').
alter table messages
  add column if not exists channel text;

-- Private storage bucket for event files. Access is event-scoped via RLS that
-- mirrors is_event_member(), keyed on the first path segment ({event_id}/...).
insert into storage.buckets (id, name, public)
values ('event-files', 'event-files', false)
on conflict (id) do nothing;

drop policy if exists "Event members read event files" on storage.objects;
create policy "Event members read event files"
  on storage.objects for select
  using (
    bucket_id = 'event-files'
    and is_event_member( (storage.foldername(name))[1]::uuid )
  );

drop policy if exists "Event members upload event files" on storage.objects;
create policy "Event members upload event files"
  on storage.objects for insert
  with check (
    bucket_id = 'event-files'
    and is_event_member( (storage.foldername(name))[1]::uuid )
  );

drop policy if exists "Event members delete event files" on storage.objects;
create policy "Event members delete event files"
  on storage.objects for delete
  using (
    bucket_id = 'event-files'
    and is_event_member( (storage.foldername(name))[1]::uuid )
  );
