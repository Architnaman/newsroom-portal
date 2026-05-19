ALTER TABLE leave_requests 
ADD COLUMN IF NOT EXISTS reject_reason text;

ALTER TABLE leave_requests 
DROP CONSTRAINT IF EXISTS leave_requests_status_check;

ALTER TABLE leave_requests 
ADD CONSTRAINT leave_requests_status_check 
CHECK (status IN ('pending', 'acknowledged', 'rejected'));