-- Allow everyone to read reporters table
DROP POLICY IF EXISTS "editor_reporters_all" ON reporters;
DROP POLICY IF EXISTS "reporter_own_record" ON reporters;

CREATE POLICY "all_read_reporters" ON reporters
FOR SELECT TO authenticated
USING (true);

CREATE POLICY "editor_write_reporters" ON reporters
FOR ALL TO authenticated
USING (get_my_role() = 'editor');