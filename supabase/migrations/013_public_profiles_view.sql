-- 013_public_profiles_view.sql
-- Teammate name/avatar resolution for shared events/orgs.
--
-- Option A: the profiles base table stays self-only (policies from 001/003 are
-- untouched), so email and typical_event_types can never leak cross-user. We
-- expose only the three public fields through a narrow, row-scoped view.

-- shares_event_or_org() is SECURITY DEFINER so it can read event_members /
-- organization_members without tripping their own RLS — the same recursion-safe
-- pattern as is_event_member() in 001.
create or replace function shares_event_or_org(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from event_members a
    join event_members b on a.event_id = b.event_id
    where a.user_id = auth.uid()
      and b.user_id = target
  )
  or exists (
    select 1
    from organization_members a
    join organization_members b on a.organization_id = b.organization_id
    where a.user_id = auth.uid()
      and b.user_id = target
  );
$$;

-- Definer-rights view (NOT security_invoker): it bypasses the self-only RLS on
-- profiles to read all rows, then the WHERE clause scopes them to self +
-- co-members. Only id/full_name/avatar_url are projected — email and
-- typical_event_types are physically absent, so they cannot be selected.
create or replace view public_profiles as
  select id, full_name, avatar_url
  from profiles
  where id = auth.uid()
     or shares_event_or_org(id);

grant select on public_profiles to authenticated;
