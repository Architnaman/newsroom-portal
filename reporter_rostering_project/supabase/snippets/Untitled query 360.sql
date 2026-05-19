-- Drop all existing storage policies
DROP POLICY IF EXISTS "allow_upload" ON storage.objects;
DROP POLICY IF EXISTS "allow_read" ON storage.objects;
DROP POLICY IF EXISTS "allow_delete" ON storage.objects;
DROP POLICY IF EXISTS "auth_upload" ON storage.objects;
DROP POLICY IF EXISTS "public_read" ON storage.objects;
DROP POLICY IF EXISTS "auth_delete" ON storage.objects;

-- Recreate clean policies
CREATE POLICY "story_files_upload" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'story-files');

CREATE POLICY "story_files_read" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'story-files');

CREATE POLICY "story_files_update" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'story-files');

CREATE POLICY "story_files_delete" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'story-files');

-- Also allow public read for file URLs
CREATE POLICY "story_files_public_read" ON storage.objects
FOR SELECT TO anon
USING (bucket_id = 'story-files');
