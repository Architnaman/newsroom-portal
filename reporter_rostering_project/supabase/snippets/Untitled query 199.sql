SELECT lr.*, r.name 
FROM leave_requests lr
JOIN reporters r ON r.id = lr.reporter_id
WHERE lr.status = 'pending';