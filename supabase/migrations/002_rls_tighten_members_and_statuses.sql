-- ============================================================
-- Glenn Events — Migration 002
-- Tighten RLS membership policies, fix helper function
-- search_path, and add DB check constraints for status columns.
-- ============================================================
-- Apply after 001_init.sql via Supabase Dashboard > SQL Editor
-- or `supabase db push`.
-- ============================================================


-- ============================================================
-- 1. Rebuild helper functions with set search_path = public
--    (matches the safer pattern used by handle_new_user)
-- ============================================================

create or replace function is_org_member(org_id uuid)
returns boolean
language sql
security definer
stable
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
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from event_members
    where event_id = evt_id
      and user_id = auth.uid()
  );
$$;


-- ============================================================
-- 2. Tighten organization_members INSERT policy
--    Old: any authenticated user who knows an org_id could
--    add themselves to it.
--    New: only allowed when the org was created by auth.uid().
--    This supports the create-org → add-self flow.
-- ============================================================

drop policy if exists "Users can add themselves to an org they created"
  on organization_members;

create policy "Users can self-join orgs they created"
  on organization_members for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from organizations
      where id = organization_id
        and created_by = auth.uid()
    )
  );


-- ============================================================
-- 3. Tighten event_members INSERT policy
--    Old: any authenticated user who knows an event_id could
--    add themselves to it.
--    New: only allowed when the user is already an org member
--    of the event's parent organization.
--    This supports the create-event → add-self flow.
-- ============================================================

drop policy if exists "Users can add themselves as event member"
  on event_members;

create policy "Org members can self-join events in their org"
  on event_members for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from events e
      join organization_members om
        on om.organization_id = e.organization_id
        and om.user_id = auth.uid()
      where e.id = event_id
    )
  );


-- ============================================================
-- 4. Status check constraints
--    Lightweight enforcement of the canonical status strings
--    used across the app and TypeScript types.
-- ============================================================

-- events.status
alter table events
  drop constraint if exists events_status_check;
alter table events
  add constraint events_status_check
  check (status in ('planning', 'active', 'completed', 'archived'));

-- tasks.status
alter table tasks
  drop constraint if exists tasks_status_check;
alter table tasks
  add constraint tasks_status_check
  check (status in ('todo', 'in_progress', 'done', 'blocked'));

-- tasks.priority
alter table tasks
  drop constraint if exists tasks_priority_check;
alter table tasks
  add constraint tasks_priority_check
  check (priority in ('low', 'medium', 'high'));

-- vendors.status
alter table vendors
  drop constraint if exists vendors_status_check;
alter table vendors
  add constraint vendors_status_check
  check (status in ('prospect', 'contacted', 'confirmed', 'declined'));

-- budget_items.status
alter table budget_items
  drop constraint if exists budget_items_status_check;
alter table budget_items
  add constraint budget_items_status_check
  check (status in ('estimated', 'committed', 'paid'));

-- decisions.status
alter table decisions
  drop constraint if exists decisions_status_check;
alter table decisions
  add constraint decisions_status_check
  check (status in ('pending', 'decided'));

-- risks.status
alter table risks
  drop constraint if exists risks_status_check;
alter table risks
  add constraint risks_status_check
  check (status in ('open', 'monitoring', 'resolved'));

-- risks.severity
alter table risks
  drop constraint if exists risks_severity_check;
alter table risks
  add constraint risks_severity_check
  check (severity in ('low', 'medium', 'high'));

-- proposed_updates.status
alter table proposed_updates
  drop constraint if exists proposed_updates_status_check;
alter table proposed_updates
  add constraint proposed_updates_status_check
  check (status in ('pending', 'approved', 'rejected', 'applied', 'failed'));
