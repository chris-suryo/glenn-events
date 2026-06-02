-- Allow authenticated users to insert their own profile row when the
-- auth.users trigger did not run (e.g. legacy user, failed trigger).
-- organizations.created_by and organization_members.user_id FK to profiles(id).

create policy "Users can insert their own profile"
  on profiles for insert
  with check (auth.uid() = id);
