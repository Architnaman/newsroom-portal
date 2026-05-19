-- Drop restrictive policies and add simple one
DROP POLICY IF EXISTS "users_read_own_profile" ON profiles;

CREATE POLICY "authenticated_read_profiles" ON profiles
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);