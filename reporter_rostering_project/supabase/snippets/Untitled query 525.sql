-- Clear all test data in correct order (respect foreign keys)
DELETE FROM notification_log;
DELETE FROM assignments;
DELETE FROM leave_requests;
DELETE FROM availability;
DELETE FROM stories;

-- Reset reporters to original seed data only (remove any test reporters)
-- Keep only the 5 original reporters
DELETE FROM reporters 
WHERE email NOT IN (
  'priya@newsroom.com',
  'arjun@newsroom.com', 
  'fatima@newsroom.com',
  'ravi@newsroom.com',
  'sunita@newsroom.com',
  'editor@newsroom.com'
);

-- Verify what's left
SELECT name, email, status, beats FROM reporters ORDER BY name;