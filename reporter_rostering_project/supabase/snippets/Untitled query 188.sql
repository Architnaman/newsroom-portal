-- Allow reporters to update story status
CREATE POLICY "reporter_update_story_status" ON stories
FOR UPDATE TO authenticated
USING (true)
WITH CHECK (true);