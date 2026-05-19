-- Create storage bucket for story files
INSERT INTO storage.buckets (id, name, public)
VALUES ('story-files', 'story-files', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload
CREATE POLICY "allow_upload" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'story-files');

-- Allow public read
CREATE POLICY "allow_read" ON storage.objects
FOR SELECT USING (bucket_id = 'story-files');

-- Allow authenticated to delete
CREATE POLICY "allow_delete" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'story-files');