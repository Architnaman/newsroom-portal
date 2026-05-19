-- Clean all test data
DELETE FROM notification_log;
DELETE FROM assignments;
DELETE FROM leave_requests;
DELETE FROM availability;
DELETE FROM stories;

-- Reset reporter complexity levels to default
UPDATE reporters SET complexity_level = 3 WHERE status = 'active';

-- Set default availability for all reporters (current week, all 7 days)
INSERT INTO availability (reporter_id, week_start_date, available_days)
SELECT 
  id,
  date_trunc('week', CURRENT_DATE)::date,
  ARRAY['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
FROM reporters
WHERE status = 'active'
ON CONFLICT (reporter_id, week_start_date) 
DO UPDATE SET available_days = ARRAY['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

-- Verify everything clean
SELECT 'stories' as table_name, COUNT(*) as count FROM stories
UNION ALL SELECT 'assignments', COUNT(*) FROM assignments
UNION ALL SELECT 'leave_requests', COUNT(*) FROM leave_requests
UNION ALL SELECT 'availability', COUNT(*) FROM availability
UNION ALL SELECT 'notification_log', COUNT(*) FROM notification_log;