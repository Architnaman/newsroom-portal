-- Add availability for all reporters for this week
INSERT INTO availability (reporter_id, week_start_date, available_days)
SELECT 
  id,
  '2026-05-11',
  ARRAY['Mon','Tue','Wed','Thu','Fri']
FROM reporters
WHERE status = 'active'
ON CONFLICT (reporter_id, week_start_date) DO UPDATE 
SET available_days = ARRAY['Mon','Tue','Wed','Thu','Fri'];