ALTER TABLE reporters ENABLE ROW LEVEL SECURITY;
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

-- Helper function
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS text AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- Stories: editors full access, reporters read-only
CREATE POLICY "editor_stories_all" ON stories FOR ALL TO authenticated
  USING (get_my_role() = 'editor');
CREATE POLICY "reporter_stories_read" ON stories FOR SELECT TO authenticated
  USING (get_my_role() = 'reporter');

-- Assignments: editors full, reporters own only
CREATE POLICY "editor_assignments_all" ON assignments FOR ALL TO authenticated
  USING (get_my_role() = 'editor');
CREATE POLICY "reporter_own_assignments" ON assignments FOR SELECT TO authenticated
  USING (get_my_role() = 'reporter' AND reporter_id = (
    SELECT reporter_id FROM profiles WHERE id = auth.uid()
  ));

-- Availability: editors read all, reporters own
CREATE POLICY "editor_availability_read" ON availability FOR SELECT TO authenticated
  USING (get_my_role() = 'editor');
CREATE POLICY "reporter_own_availability" ON availability FOR ALL TO authenticated
  USING (reporter_id = (SELECT reporter_id FROM profiles WHERE id = auth.uid()));

-- Leave requests: editors read + update ack, reporters own
CREATE POLICY "editor_leave_read" ON leave_requests FOR SELECT TO authenticated
  USING (get_my_role() = 'editor');
CREATE POLICY "editor_leave_update" ON leave_requests FOR UPDATE TO authenticated
  USING (get_my_role() = 'editor');
CREATE POLICY "reporter_own_leave" ON leave_requests FOR ALL TO authenticated
  USING (reporter_id = (SELECT reporter_id FROM profiles WHERE id = auth.uid()));

-- Reporters: editors full, reporters own record
CREATE POLICY "editor_reporters_all" ON reporters FOR ALL TO authenticated
  USING (get_my_role() = 'editor');
CREATE POLICY "reporter_own_record" ON reporters FOR SELECT TO authenticated
  USING (id = (SELECT reporter_id FROM profiles WHERE id = auth.uid()));

-- Notification log: editors read all, reporters own
CREATE POLICY "editor_notif_read" ON notification_log FOR SELECT TO authenticated
  USING (get_my_role() = 'editor');
CREATE POLICY "reporter_own_notif" ON notification_log FOR SELECT TO authenticated
  USING (recipient_id = (SELECT reporter_id FROM profiles WHERE id = auth.uid()));