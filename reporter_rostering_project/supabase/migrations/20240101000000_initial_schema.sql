CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ================================================
-- TABLE: reporters
-- ================================================
CREATE TABLE IF NOT EXISTS reporters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text UNIQUE NOT NULL,
  beats text[] DEFAULT '{}',
  status text DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  max_stories_per_week integer DEFAULT 4,
  complexity_level integer DEFAULT 3, -- ADDED: auto-calculated from filed/published stories
  created_at timestamptz DEFAULT now()
);

-- ================================================
-- TABLE: stories
-- ================================================
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
  filed_file_url text,       -- ADDED: Word document URL uploaded by reporter
  filed_file_name text,      -- ADDED: Word document filename
  filed_at timestamptz,      -- ADDED: When reporter filed the report
  published_at timestamptz,  -- ADDED: When editor published the story
  reassign_reason text,      -- ADDED: Editor reason when reassigning story back
  editor_feedback text,      -- ADDED: Optional feedback from editor on publish
  feedback_at timestamptz,   -- ADDED: When editor gave feedback
  created_at timestamptz DEFAULT now()
);

-- ================================================
-- TABLE: assignments
-- ================================================
CREATE TABLE IF NOT EXISTS assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid REFERENCES stories(id) ON DELETE CASCADE,
  reporter_id uuid REFERENCES reporters(id) ON DELETE CASCADE,
  assigned_by uuid,
  assigned_at timestamptz DEFAULT now(),
  reassigned_from uuid,
  is_active boolean DEFAULT true,
  -- ADDED: Override assignment support (when reporter is unavailable)
  is_override boolean DEFAULT false,             -- ADDED: true if assigned despite unavailability
  override_reason text,                          -- ADDED: Editor reason for override
  override_status text DEFAULT 'pending' CHECK (override_status IN ('pending', 'accepted', 'rejected')), -- ADDED: Reporter response status
  override_response text,                        -- ADDED: Reporter reason for accepting/rejecting
  override_responded_at timestamptz              -- ADDED: When reporter responded
  -- END ADDED
);

-- ================================================
-- TABLE: availability
-- ================================================
CREATE TABLE IF NOT EXISTS availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid REFERENCES reporters(id) ON DELETE CASCADE,
  week_start_date date NOT NULL,
  available_days text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  UNIQUE(reporter_id, week_start_date)
);

-- ================================================
-- TABLE: leave_requests
-- ================================================
CREATE TABLE IF NOT EXISTS leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid REFERENCES reporters(id) ON DELETE CASCADE,
  leave_date date NOT NULL,
  leave_type text DEFAULT 'planned' CHECK (leave_type IN ('planned', 'sick', 'emergency')),
  is_immediate boolean DEFAULT false,
  notes text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'acknowledged', 'rejected')),
  reject_reason text,        -- ADDED: Editor reason when rejecting leave
  acknowledged_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- ================================================
-- TABLE: profiles
-- ================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY,
  reporter_id uuid REFERENCES reporters(id),
  role text DEFAULT 'reporter' CHECK (role IN ('editor', 'reporter')),
  created_at timestamptz DEFAULT now()
);

-- ================================================
-- TABLE: notification_log
-- ================================================
CREATE TABLE IF NOT EXISTS notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid REFERENCES reporters(id),
  type text,
  message text,
  sent_at timestamptz DEFAULT now()
);

-- ================================================
-- ADDED: TABLE: holidays
-- Stores default public holidays on which all
-- reporters are unavailable by default
-- ================================================
CREATE TABLE IF NOT EXISTS holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL UNIQUE,
  name text NOT NULL,
  is_recurring boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
-- END ADDED

-- ================================================
-- DISABLE RLS (local dev)
-- ================================================
ALTER TABLE reporters DISABLE ROW LEVEL SECURITY;
ALTER TABLE stories DISABLE ROW LEVEL SECURITY;
ALTER TABLE assignments DISABLE ROW LEVEL SECURITY;
ALTER TABLE availability DISABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE notification_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE holidays DISABLE ROW LEVEL SECURITY; -- ADDED

-- ================================================
-- ADDED: Grant read access to holidays table
-- Fixes RLS blocking anon key from reading holidays
-- ================================================
GRANT SELECT ON holidays TO anon;
GRANT SELECT ON holidays TO authenticated;
-- END ADDED

-- ================================================
-- STORAGE BUCKET
-- ADDED: For storing reporter Word document uploads
-- ================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('story-files', 'story-files', true)
ON CONFLICT (id) DO NOTHING;

-- ================================================
-- ADDED: Fix storage RLS for local dev
-- Drops all existing policies and creates one
-- open policy so reporters can upload Word files
-- ================================================
DROP POLICY IF EXISTS "story_files_upload" ON storage.objects;
DROP POLICY IF EXISTS "story_files_read" ON storage.objects;
DROP POLICY IF EXISTS "story_files_delete" ON storage.objects;
DROP POLICY IF EXISTS "allow_all" ON storage.objects;
DROP POLICY IF EXISTS "allow_upload" ON storage.objects;
DROP POLICY IF EXISTS "allow_read" ON storage.objects;
DROP POLICY IF EXISTS "allow_delete" ON storage.objects;
DROP POLICY IF EXISTS "auth_upload" ON storage.objects;
DROP POLICY IF EXISTS "public_read" ON storage.objects;
DROP POLICY IF EXISTS "auth_delete" ON storage.objects;
DROP POLICY IF EXISTS "story_files_update" ON storage.objects;
DROP POLICY IF EXISTS "story_files_public_read" ON storage.objects;
DROP POLICY IF EXISTS "open_access" ON storage.objects;

CREATE POLICY "open_access" ON storage.objects
FOR ALL USING (true)
WITH CHECK (true);
-- END ADDED

-- ================================================
-- ADDED: Default Indian public holidays for 2026
-- These make all reporters unavailable by default
-- on these dates unless override assigned
-- ================================================
INSERT INTO holidays (date, name, is_recurring) VALUES
  ('2026-01-01', 'New Year Day', true),
  ('2026-01-26', 'Republic Day', true),
  ('2026-03-25', 'Holi', true),
  ('2026-04-03', 'Good Friday', true),
  ('2026-04-14', 'Dr. Ambedkar Jayanti', true),
  ('2026-04-30', 'Eid ul-Fitr', true),
  ('2026-05-25', 'Buddha Purnima', true),
  ('2026-07-07', 'Eid ul-Adha', true),
  ('2026-08-15', 'Independence Day', true),
  ('2026-08-28', 'Janmashtami', true),
  ('2026-09-17', 'Ganesh Chaturthi', true),
  ('2026-10-02', 'Gandhi Jayanti', true),
  ('2026-10-20', 'Dussehra', true),
  ('2026-11-08', 'Diwali', true),
  ('2026-11-24', 'Guru Nanak Jayanti', true),
  ('2026-12-25', 'Christmas', true)
ON CONFLICT (date) DO NOTHING;
-- END ADDED

-- ================================================
-- AUTO COMPLEXITY TRIGGER
-- ADDED: Automatically updates reporter complexity_level
-- when they file or publish a story based on average
-- complexity of all their completed stories
-- ================================================
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
-- ================================================
-- LEAVE FILING REQUESTS TABLE
-- Reporter can request editor to file leave on their behalf
-- ================================================
CREATE TABLE IF NOT EXISTS leave_filing_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid REFERENCES reporters(id) ON DELETE CASCADE,
  requested_date date NOT NULL,
  leave_type text DEFAULT 'planned' CHECK (leave_type IN ('planned', 'sick', 'emergency')),
  reason text NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  editor_note text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE leave_filing_requests DISABLE ROW LEVEL SECURITY;
GRANT ALL ON leave_filing_requests TO anon;
GRANT ALL ON leave_filing_requests TO authenticated;

-- ================================================
-- ADDED COLUMNS TO LEAVE_REQUESTS
-- Track editor-filed leaves
-- ================================================
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS filed_by_editor boolean DEFAULT false;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS editor_note text;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS reject_reason text;

-- ================================================
-- WEEKLY REPORTER LOAD RESET
-- ================================================
CREATE OR REPLACE FUNCTION reset_weekly_reporter_load()
RETURNS void AS $$
BEGIN
  UPDATE reporters SET current_load = 0 WHERE status = 'active';
  UPDATE assignments SET is_active = false
  WHERE is_active = true AND story_id IN (
    SELECT id FROM stories WHERE status IN ('filed', 'published')
  );
END;
$$ LANGUAGE plpgsql;
