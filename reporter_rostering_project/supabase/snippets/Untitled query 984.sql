-- Allow editors to read all leave requests
DROP POLICY IF EXISTS "editor_leave_read" ON leave_requests;

CREATE POLICY "editor_leave_read" ON leave_requests
FOR SELECT TO authenticated
USING (true);