ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read app_settings
-- Why: Date format and week start day is needed
-- by all users on every page
CREATE POLICY "app_settings_select_authenticated"
  ON app_settings FOR SELECT
  TO authenticated
  USING (true);

-- Only editors and admins can change app settings
-- Why: Date format and week start affects whole app
-- reporters should not be able to change it
CREATE POLICY "app_settings_insert_editor_only"
  ON app_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'editor'
    OR
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "app_settings_update_editor_only"
  ON app_settings FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'editor'
    OR
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'editor'
    OR
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "app_settings_delete_editor_only"
  ON app_settings FOR DELETE
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'editor'
    OR
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );