ALTER TABLE stories ADD COLUMN IF NOT EXISTS editor_feedback text;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS feedback_at timestamptz;
SELECT 'done' as status;