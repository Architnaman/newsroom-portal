-- Check active leave requests that might be blocking
SELECT * FROM leave_requests WHERE status IN ('pending', 'acknowledged');

-- Also check the story deadlines
SELECT id, headline, deadline, status FROM stories;