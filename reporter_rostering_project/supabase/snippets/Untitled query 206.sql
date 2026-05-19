-- Add feedback column to stories
ALTER TABLE stories ADD COLUMN IF NOT EXISTS editor_feedback text;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS feedback_at timestamptz;

-- Update storage policy to accept PDF too
-- (already accepts all files, just update the UI)
SELECT 'SQL done' as status;