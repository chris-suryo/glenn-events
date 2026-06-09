-- ============================================================
-- Glenn Events — Migration 006
-- Fix RLS circular-dependency bootstrap problem.
-- ============================================================
-- The INSERT policies for organization_members and event_members
-- contain EXISTS subqueries on organizations/events. Those tables'
-- SELECT policies require membership — which the user doesn't have
-- yet during first-time creation. The subquery sees no rows →
-- the WITH CHECK returns false → INSERT is rejected (42501).
--
-- Fix: wrap each circular subquery in a SECURITY DEFINER function
-- that bypasses SELECT RLS. The logic is identical; only the
-- execution context changes (runs as the function owner, not
-- as the calling user).
-- ============================================================
-- Apply via Supabase Dashboard > SQL Editor.
-- ============================================================


-- ── Helper: can the current user see this org as its creator? ──────────────────
-- Used in org_members INSERT policy to avoid the SELECT RLS on organizations.
create or replace function is_org_creator(org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from organizations
    where id = org_id
      and created_by = auth.uid()
  );
$$;


-- ── Helper: is the current user an org-member of the event's org? ─────────────
-- Used in event_members INSERT policy to avoid SELECT RLS on both
-- events and organization_members tables.
create or replace function is_event_org_member(evt_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from events e
    join organization_members om
      on om.organization_id = e.organization_id
     and om.user_id = auth.uid()
    where e.id = evt_id
  );
$$;


-- ── Fix organization_members INSERT policy ─────────────────────────────────────
-- Old: EXISTS(SELECT FROM organizations WHERE created_by = auth.uid())
--      → blocked by organizations SELECT RLS (user not a member yet)
-- New: is_org_creator() bypasses SELECT RLS via SECURITY DEFINER

drop policy if exists "Users can self-join orgs they created" on organization_members;

create policy "Users can self-join orgs they created"
  on organization_members for insert
  with check (
    auth.uid() = user_id
    and is_org_creator(organization_id)
  );


-- ── Fix event_members INSERT policy ───────────────────────────────────────────
-- Old: EXISTS(SELECT FROM events JOIN organization_members ...)
--      → blocked by events SELECT RLS (user not an event member yet)
-- New: is_event_org_member() bypasses SELECT RLS via SECURITY DEFINER

drop policy if exists "Org members can self-join events in their org" on event_members;

create policy "Org members can self-join events in their org"
  on event_members for insert
  with check (
    auth.uid() = user_id
    and is_event_org_member(event_id)
  );


-- ── Event DELETE policy ────────────────────────────────────────────────────────
-- Allow event members (e.g. the owner) to delete the event.
-- ON DELETE CASCADE on all child tables handles cleanup automatically.

create policy "Event members can delete their event"
  on events for delete
  using (is_event_member(id));
