-- Clean all test data
DELETE FROM notification_log;
DELETE FROM assignments;
DELETE FROM leave_requests;
DELETE FROM availability;
DELETE FROM stories;

-- Insert default availability for ALL reporters (current week, all 7 days)
INSERT INTO availability (reporter_id, week_start_date, available_days)
SELECT 
  id,
  date_trunc('week', CURRENT_DATE)::date,
  ARRAY['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
FROM reporters
WHERE status = 'active'
ON CONFLICT (reporter_id, week_start_date) 
DO UPDATE SET available_days = ARRAY['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

-- Verify
SELECT r.name, a.week_start_date, a.available_days 
FROM availability a
JOIN reporters r ON r.id = a.reporter_id;