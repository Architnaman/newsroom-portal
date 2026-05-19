-- Reporters
CREATE TABLE reporters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(100) NOT NULL,
  email varchar(150) NOT NULL UNIQUE,
  beats text[] NOT NULL DEFAULT '{}',
  max_stories_per_week integer NOT NULL DEFAULT 4,
  status varchar(20) NOT NULL DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);

-- Stories
CREATE TABLE stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  headline varchar(255) NOT NULL,
  category varchar(50) NOT NULL,
  complexity integer NOT NULL CHECK (complexity BETWEEN 1 AND 5),
  urgency varchar(20) NOT NULL CHECK (urgency IN ('breaking','high','normal','low')),
  priority integer NOT NULL CHECK (priority BETWEEN 1 AND 5),
  status varchar(20) DEFAULT 'unassigned',
  deadline date NOT NULL,
  description text,
  created_by uuid REFERENCES reporters(id),
  created_at timestamptz DEFAULT now()
);

-- Assignments
CREATE TABLE assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid REFERENCES stories(id),
  reporter_id uuid REFERENCES reporters(id),
  assigned_by uuid REFERENCES reporters(id),
  assigned_at timestamptz DEFAULT now(),
  reassigned_from uuid REFERENCES reporters(id),
  reassignment_reason text,
  is_active boolean DEFAULT true
);

-- Availability
CREATE TABLE availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid REFERENCES reporters(id),
  week_start_date date NOT NULL,
  available_days text[] NOT NULL,
  submitted_at timestamptz DEFAULT now(),
  UNIQUE(reporter_id, week_start_date)
);

-- Leave requests
CREATE TABLE leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid REFERENCES reporters(id),
  leave_date date NOT NULL,
  leave_type varchar(20) NOT NULL CHECK (leave_type IN ('planned','sick','emergency')),
  is_immediate boolean DEFAULT false,
  status varchar(20) DEFAULT 'pending',
  acknowledged_by uuid REFERENCES reporters(id),
  acknowledged_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Notification log
CREATE TABLE notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid REFERENCES reporters(id),
  type varchar(50) NOT NULL,
  reference_id uuid,
  email_status varchar(20) DEFAULT 'pending',
  retry_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  sent_at timestamptz
);