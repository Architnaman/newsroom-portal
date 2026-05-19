CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS reporters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text UNIQUE NOT NULL,
  beats text[] DEFAULT '{}',
  status text DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  max_stories_per_week integer DEFAULT 4,
  complexity_level integer DEFAULT 3,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  headline text NOT NULL,
  description text,
  category text NOT NULL,
  urgency text DEFAULT 'normal' CHECK (urgency IN ('breaking', 'high', 'normal', 'low')),
  complexity integer DEFAULT 3 CHECK (complexity BETWEEN 1 AND 5),
  priority integer DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  status text DEFAULT 'unassigned' CHECK (status IN ('unassigned', 'assigned', 'in_progress', 'filed', 'published')),
  deadline date NOT NULL,
  filed_file_url text,
  filed_file_name text,
  filed_at timestamptz,
  published_at timestamptz,
  reassign_reason text,
  editor_feedback text,
  feedback_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid REFERENCES stories(id) ON DELETE CASCADE,
  reporter_id uuid REFERENCES reporters(id) ON DELETE CASCADE,
  assigned_by uuid,
  assigned_at timestamptz DEFAULT now(),
  reassigned_from uuid,
  is_active boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid REFERENCES reporters(id) ON DELETE CASCADE,
  week_start_date date NOT NULL,
  available_days text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  UNIQUE(reporter_id, week_start_date)
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid REFERENCES reporters(id) ON DELETE CASCADE,
  leave_date date NOT NULL,
  leave_type text DEFAULT 'planned' CHECK (leave_type IN ('planned', 'sick', 'emergency')),
  is_immediate boolean DEFAULT false,
  notes text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'acknowledged', 'rejected')),
  reject_reason text,
  acknowledged_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY,
  reporter_id uuid REFERENCES reporters(id),
  role text DEFAULT 'reporter' CHECK (role IN ('editor', 'reporter')),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid REFERENCES reporters(id),
  type text,
  message text,
  sent_at timestamptz DEFAULT now()
);

ALTER TABLE reporters DISABLE ROW LEVEL SECURITY;
ALTER TABLE stories DISABLE ROW LEVEL SECURITY;
ALTER TABLE assignments DISABLE ROW LEVEL SECURITY;
ALTER TABLE availability DISABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE notification_log DISABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public) VALUES ('story-files', 'story-files', true) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION auto_update_complexity()
RETURNS trigger AS
'
BEGIN
  IF NEW.status IN (''filed'', ''published'') AND OLD.status != NEW.status THEN
    UPDATE reporters r
    SET complexity_level = COALESCE((
      SELECT ROUND(AVG(s.complexity))
      FROM assignments a
      JOIN stories s ON s.id = a.story_id
      WHERE a.reporter_id = r.id
      AND s.status IN (''filed'', ''published'')
    ), 3)
    WHERE r.id IN (
      SELECT reporter_id FROM assignments
      WHERE story_id = NEW.id AND is_active = true
    );
  END IF;
  RETURN NEW;
END
' LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_complexity ON stories;
CREATE TRIGGER trigger_update_complexity
  AFTER UPDATE ON stories
  FOR EACH ROW
  EXECUTE FUNCTION auto_update_complexity();
