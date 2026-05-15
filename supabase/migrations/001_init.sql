-- ============================================================
-- Glenn Events — Initial Schema
-- ============================================================
-- Apply via: Supabase Dashboard > SQL Editor, or `supabase db push`
-- ============================================================
-- Note: is_org_member / is_event_member are created after membership tables
-- exist (SQL functions validate referenced relations at creation time).


-- ============================================================
-- profiles
-- ============================================================

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "Users can view their own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on profiles for update
  using (auth.uid() = id);


-- ============================================================
-- Auto-create profile on signup
-- ============================================================

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();


-- ============================================================
-- organizations
-- ============================================================

create table organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table organizations enable row level security;

-- RLS policies for organizations / memberships / events: see block after event_members.


-- ============================================================
-- organization_members
-- ============================================================

create table organization_members (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  user_id          uuid not null references profiles(id) on delete cascade,
  role             text not null default 'owner',
  created_at       timestamptz not null default now(),
  unique (organization_id, user_id)
);

alter table organization_members enable row level security;


-- ============================================================
-- events
-- ============================================================

create table events (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  name             text not null,
  description      text,
  event_type       text,
  event_date       timestamptz,
  location         text,
  attendee_target  int,
  budget_target    numeric,
  status           text not null default 'planning',
  created_by       uuid references profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table events enable row level security;


-- ============================================================
-- event_members
-- ============================================================

create table event_members (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  role        text not null default 'owner',
  created_at  timestamptz not null default now(),
  unique (event_id, user_id)
);

alter table event_members enable row level security;


-- ============================================================
-- Helper functions (membership tables must exist first)
-- ============================================================

create or replace function is_org_member(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from organization_members
    where organization_id = org_id
      and user_id = auth.uid()
  );
$$;

create or replace function is_event_member(evt_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from event_members
    where event_id = evt_id
      and user_id = auth.uid()
  );
$$;


-- ============================================================
-- RLS: organizations, memberships, events (use helpers above)
-- ============================================================

create policy "Org members can view their org"
  on organizations for select
  using (is_org_member(id));

create policy "Authenticated users can create orgs"
  on organizations for insert
  with check (auth.uid() is not null);

create policy "Org members can view memberships"
  on organization_members for select
  using (is_org_member(organization_id));

create policy "Users can add themselves to an org they created"
  on organization_members for insert
  with check (auth.uid() = user_id);

create policy "Event members can view their event"
  on events for select
  using (is_event_member(id));

create policy "Org members can create events"
  on events for insert
  with check (is_org_member(organization_id));

create policy "Event members can update their event"
  on events for update
  using (is_event_member(id));

create policy "Event members can view memberships"
  on event_members for select
  using (is_event_member(event_id));

create policy "Users can add themselves as event member"
  on event_members for insert
  with check (auth.uid() = user_id);


-- ============================================================
-- messages
-- ============================================================

create table messages (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events(id) on delete cascade,
  user_id     uuid references profiles(id) on delete set null,
  role        text not null,
  content     text not null,
  created_at  timestamptz not null default now()
);

alter table messages enable row level security;

create policy "Event members can view messages"
  on messages for select
  using (is_event_member(event_id));

create policy "Event members can create messages"
  on messages for insert
  with check (is_event_member(event_id));


-- ============================================================
-- ai_runs
-- ============================================================

create table ai_runs (
  id                 uuid primary key default gen_random_uuid(),
  event_id           uuid not null references events(id) on delete cascade,
  source_message_id  uuid references messages(id) on delete set null,
  status             text not null default 'pending_review',
  input_text         text,
  output_json        jsonb,
  created_by         uuid references profiles(id) on delete set null,
  created_at         timestamptz not null default now()
);

alter table ai_runs enable row level security;

create policy "Event members can view ai_runs"
  on ai_runs for select
  using (is_event_member(event_id));

create policy "Event members can create ai_runs"
  on ai_runs for insert
  with check (is_event_member(event_id));

create policy "Event members can update ai_runs"
  on ai_runs for update
  using (is_event_member(event_id));


-- ============================================================
-- proposed_updates
-- ============================================================

create table proposed_updates (
  id                 uuid primary key default gen_random_uuid(),
  event_id           uuid not null references events(id) on delete cascade,
  ai_run_id          uuid not null references ai_runs(id) on delete cascade,
  source_message_id  uuid references messages(id) on delete set null,
  update_type        text not null,
  payload_json       jsonb not null,
  confidence         numeric,
  status             text not null default 'pending',
  rationale          text,
  created_at         timestamptz not null default now(),
  reviewed_by        uuid references profiles(id) on delete set null,
  reviewed_at        timestamptz
);

-- status values: pending | approved | rejected | applied | failed

alter table proposed_updates enable row level security;

create policy "Event members can view proposed_updates"
  on proposed_updates for select
  using (is_event_member(event_id));

create policy "Event members can create proposed_updates"
  on proposed_updates for insert
  with check (is_event_member(event_id));

create policy "Event members can update proposed_updates"
  on proposed_updates for update
  using (is_event_member(event_id));


-- ============================================================
-- tasks
-- ============================================================

create table tasks (
  id                  uuid primary key default gen_random_uuid(),
  event_id            uuid not null references events(id) on delete cascade,
  title               text not null,
  description         text,
  owner_user_id       uuid references profiles(id) on delete set null,
  due_date            timestamptz,
  status              text not null default 'todo',
  priority            text not null default 'medium',
  proposed_update_id  uuid references proposed_updates(id) on delete set null,
  source_message_id   uuid references messages(id) on delete set null,
  ai_run_id           uuid references ai_runs(id) on delete set null,
  ai_generated        boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table tasks enable row level security;

create policy "Event members can view tasks"
  on tasks for select
  using (is_event_member(event_id));

create policy "Event members can create tasks"
  on tasks for insert
  with check (is_event_member(event_id));

create policy "Event members can update tasks"
  on tasks for update
  using (is_event_member(event_id));

create policy "Event members can delete tasks"
  on tasks for delete
  using (is_event_member(event_id));


-- ============================================================
-- vendors
-- ============================================================

create table vendors (
  id                  uuid primary key default gen_random_uuid(),
  event_id            uuid not null references events(id) on delete cascade,
  name                text not null,
  category            text,
  contact_name        text,
  email               text,
  phone               text,
  status              text not null default 'prospect',
  estimated_cost      numeric,
  notes               text,
  proposed_update_id  uuid references proposed_updates(id) on delete set null,
  source_message_id   uuid references messages(id) on delete set null,
  ai_run_id           uuid references ai_runs(id) on delete set null,
  ai_generated        boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table vendors enable row level security;

create policy "Event members can view vendors"
  on vendors for select
  using (is_event_member(event_id));

create policy "Event members can create vendors"
  on vendors for insert
  with check (is_event_member(event_id));

create policy "Event members can update vendors"
  on vendors for update
  using (is_event_member(event_id));

create policy "Event members can delete vendors"
  on vendors for delete
  using (is_event_member(event_id));


-- ============================================================
-- budget_items
-- ============================================================

create table budget_items (
  id                  uuid primary key default gen_random_uuid(),
  event_id            uuid not null references events(id) on delete cascade,
  category            text not null,
  description         text,
  estimated_cost      numeric,
  actual_cost         numeric,
  status              text not null default 'estimated',
  vendor_id           uuid references vendors(id) on delete set null,
  proposed_update_id  uuid references proposed_updates(id) on delete set null,
  source_message_id   uuid references messages(id) on delete set null,
  ai_run_id           uuid references ai_runs(id) on delete set null,
  ai_generated        boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table budget_items enable row level security;

create policy "Event members can view budget_items"
  on budget_items for select
  using (is_event_member(event_id));

create policy "Event members can create budget_items"
  on budget_items for insert
  with check (is_event_member(event_id));

create policy "Event members can update budget_items"
  on budget_items for update
  using (is_event_member(event_id));

create policy "Event members can delete budget_items"
  on budget_items for delete
  using (is_event_member(event_id));


-- ============================================================
-- timeline_items
-- ============================================================

create table timeline_items (
  id                  uuid primary key default gen_random_uuid(),
  event_id            uuid not null references events(id) on delete cascade,
  title               text not null,
  description         text,
  starts_at           timestamptz,
  ends_at             timestamptz,
  owner_user_id       uuid references profiles(id) on delete set null,
  type                text not null default 'planning',
  proposed_update_id  uuid references proposed_updates(id) on delete set null,
  source_message_id   uuid references messages(id) on delete set null,
  ai_run_id           uuid references ai_runs(id) on delete set null,
  ai_generated        boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table timeline_items enable row level security;

create policy "Event members can view timeline_items"
  on timeline_items for select
  using (is_event_member(event_id));

create policy "Event members can create timeline_items"
  on timeline_items for insert
  with check (is_event_member(event_id));

create policy "Event members can update timeline_items"
  on timeline_items for update
  using (is_event_member(event_id));

create policy "Event members can delete timeline_items"
  on timeline_items for delete
  using (is_event_member(event_id));


-- ============================================================
-- decisions
-- ============================================================

create table decisions (
  id                  uuid primary key default gen_random_uuid(),
  event_id            uuid not null references events(id) on delete cascade,
  title               text not null,
  description         text,
  status              text not null default 'pending',
  decision            text,
  owner_user_id       uuid references profiles(id) on delete set null,
  decided_at          timestamptz,
  proposed_update_id  uuid references proposed_updates(id) on delete set null,
  source_message_id   uuid references messages(id) on delete set null,
  ai_run_id           uuid references ai_runs(id) on delete set null,
  ai_generated        boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table decisions enable row level security;

create policy "Event members can view decisions"
  on decisions for select
  using (is_event_member(event_id));

create policy "Event members can create decisions"
  on decisions for insert
  with check (is_event_member(event_id));

create policy "Event members can update decisions"
  on decisions for update
  using (is_event_member(event_id));

create policy "Event members can delete decisions"
  on decisions for delete
  using (is_event_member(event_id));


-- ============================================================
-- risks
-- ============================================================

create table risks (
  id                  uuid primary key default gen_random_uuid(),
  event_id            uuid not null references events(id) on delete cascade,
  title               text not null,
  description         text,
  severity            text not null default 'medium',
  status              text not null default 'open',
  mitigation          text,
  proposed_update_id  uuid references proposed_updates(id) on delete set null,
  source_message_id   uuid references messages(id) on delete set null,
  ai_run_id           uuid references ai_runs(id) on delete set null,
  ai_generated        boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table risks enable row level security;

create policy "Event members can view risks"
  on risks for select
  using (is_event_member(event_id));

create policy "Event members can create risks"
  on risks for insert
  with check (is_event_member(event_id));

create policy "Event members can update risks"
  on risks for update
  using (is_event_member(event_id));

create policy "Event members can delete risks"
  on risks for delete
  using (is_event_member(event_id));


-- ============================================================
-- open_questions
-- ============================================================

create table open_questions (
  id                  uuid primary key default gen_random_uuid(),
  event_id            uuid not null references events(id) on delete cascade,
  question            text not null,
  owner_user_id       uuid references profiles(id) on delete set null,
  status              text not null default 'open',
  proposed_update_id  uuid references proposed_updates(id) on delete set null,
  source_message_id   uuid references messages(id) on delete set null,
  ai_run_id           uuid references ai_runs(id) on delete set null,
  ai_generated        boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table open_questions enable row level security;

create policy "Event members can view open_questions"
  on open_questions for select
  using (is_event_member(event_id));

create policy "Event members can create open_questions"
  on open_questions for insert
  with check (is_event_member(event_id));

create policy "Event members can update open_questions"
  on open_questions for update
  using (is_event_member(event_id));

create policy "Event members can delete open_questions"
  on open_questions for delete
  using (is_event_member(event_id));


-- ============================================================
-- files
-- ============================================================

create table files (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references events(id) on delete cascade,
  uploaded_by   uuid references profiles(id) on delete set null,
  filename      text not null,
  storage_path  text,
  mime_type     text,
  size_bytes    bigint,
  created_at    timestamptz not null default now()
);

alter table files enable row level security;

create policy "Event members can view files"
  on files for select
  using (is_event_member(event_id));

create policy "Event members can upload files"
  on files for insert
  with check (is_event_member(event_id));

create policy "Event members can delete files"
  on files for delete
  using (is_event_member(event_id));


-- ============================================================
-- activity_log
-- ============================================================

create table activity_log (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references events(id) on delete cascade,
  actor_user_id   uuid references profiles(id) on delete set null,
  action          text not null,
  entity_type     text,
  entity_id       uuid,
  metadata_json   jsonb,
  created_at      timestamptz not null default now()
);

alter table activity_log enable row level security;

create policy "Event members can view activity_log"
  on activity_log for select
  using (is_event_member(event_id));

create policy "Event members can create activity_log entries"
  on activity_log for insert
  with check (is_event_member(event_id));
