-- Delete old availability and insert for correct week
DELETE FROM availability;

INSERT INTO availability (reporter_id, week_start_date, available_days)
SELECT 
  id,
  '2026-05-18',
  ARRAY['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
FROM reporters
WHERE status = 'active'
ON CONFLICT (reporter_id, week_start_date) DO UPDATE 
SET available_days = ARRAY['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
