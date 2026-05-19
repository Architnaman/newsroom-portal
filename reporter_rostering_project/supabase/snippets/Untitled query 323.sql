-- Add file upload support to stories
ALTER TABLE stories ADD COLUMN IF NOT EXISTS filed_file_url text;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS filed_file_name text;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS filed_at timestamptz;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS published_at timestamptz;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS reassign_reason text;

-- Enable Supabase Storage
INSERT INTO storage.buckets (id, name, public) 
VALUES ('story-files', 'story-files', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload
CREATE POLICY "auth_upload" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'story-files');

-- Allow everyone to read
CREATE POLICY "public_read" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'story-files');

-- Allow authenticated to delete own files
CREATE POLICY "auth_delete" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'story-files');