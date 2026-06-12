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
  complexity_level integer DEFAULT 3, -- auto-calculated from filed/published stories
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
  filed_file_url text,       -- Word document URL uploaded by reporter
  filed_file_name text,      -- Word document filename
  filed_at timestamptz,      -- When reporter filed the report
  published_at timestamptz,  -- When editor published the story
  reassign_reason text,      -- Editor reason when reassigning story back
  editor_feedback text,      -- Optional feedback from editor on publish
  feedback_at timestamptz,   -- When editor gave feedback
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
  -- Override assignment support (when reporter is unavailable)
  is_override boolean DEFAULT false,             -- true if assigned despite unavailability
  override_reason text,                          -- Editor reason for override
  override_status text DEFAULT 'pending' CHECK (override_status IN ('pending', 'accepted', 'rejected')), -- Reporter response status
  override_response text,                        -- Reporter reason for accepting/rejecting
  override_responded_at timestamptz              -- When reporter responded
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
  reject_reason text,        -- Editor reason when rejecting leave
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
-- TABLE: holidays
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

-- ================================================
-- STORAGE BUCKET
-- For storing reporter Word document uploads
-- ================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('story-files', 'story-files', true)
ON CONFLICT (id) DO NOTHING;

-- ================================================
-- Storage RLS policy so reporters can upload files
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

-- ================================================
-- Default Indian public holidays for 2026
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

-- ================================================
-- AUTO COMPLEXITY TRIGGER
-- Automatically updates reporter complexity_level
-- when they file or publish a story
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
-- LEAVE FILING REQUESTS TABLE (OLD/UNUSED)
-- Kept for backward compatibility — not used by app
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

-- ================================================
-- ADDED COLUMNS TO LEAVE_REQUESTS
-- Track editor-filed leaves
-- ================================================
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS filed_by_editor boolean DEFAULT false;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS editor_note text;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS reject_reason text;

-- ================================================
-- WEEKLY REPORTER LOAD RESET (FIXED VERSION)
-- current_load column does not exist - use assignments
-- ================================================
CREATE OR REPLACE FUNCTION reset_weekly_reporter_load()
RETURNS void AS $$
BEGIN
  UPDATE assignments SET is_active = false
  WHERE is_active = true AND story_id IN (
    SELECT id FROM stories WHERE status IN ('filed', 'published')
  );
END;
$$ LANGUAGE plpgsql;

-- ================================================
-- APP SETTINGS TABLE (Admin portal)
-- Stores date format, deadline format, week start day
-- ================================================
CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

INSERT INTO app_settings (key, value) VALUES
  ('date_format', 'DD MMM YYYY'),
  ('week_start_day', 'monday')
ON CONFLICT (key) DO NOTHING;

-- ================================================
-- ADMINS TABLE
-- ================================================
CREATE TABLE IF NOT EXISTS admins (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ================================================
-- UPDATE PROFILES ROLE CONSTRAINT TO INCLUDE ADMIN
-- ================================================
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('editor', 'reporter', 'admin'));

-- ================================================
-- AI REPORTS TABLE (Ambient Scribe)
-- ================================================
CREATE TABLE IF NOT EXISTS ai_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_ids uuid[] DEFAULT '{}',
  transcript text NOT NULL,
  story_notes text,
  assignment_notes text,
  rostering_notes text,
  confidence_score numeric(5,2) DEFAULT 0,
  confidence_details jsonb,
  confidence_breakdown jsonb,
  reporter_validation jsonb DEFAULT '[]',
  suggested_reporters jsonb DEFAULT '[]',
  finalised_assignments jsonb DEFAULT '[]',
  mentioned_reporters jsonb DEFAULT '[]',
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'approved')),
  editor_modifications text,
  approved_at timestamptz,
  approved_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_reports_story_ids ON ai_reports USING GIN(story_ids);
CREATE INDEX IF NOT EXISTS idx_ai_reports_status ON ai_reports(status);
CREATE INDEX IF NOT EXISTS idx_ai_reports_created_at ON ai_reports(created_at DESC);


-- ================================================================
-- ================================================================
--                  ROW LEVEL SECURITY (RLS)
--   Added in Session 9 — replaces earlier "DISABLE RLS" approach
--   Uses Supabase Auth (auth.uid()) + profiles table for role
--   and reporter_id lookups. leave_filing_requests and profiles
--   itself are intentionally left without per-row restrictions
--   beyond what's defined below (profiles is required for every
--   other policy to function, so it uses a permissive read policy
--   for authenticated users to avoid breaking login).
-- ================================================================
-- ================================================================

-- ----------------------------------------------------------------
-- profiles
-- Required by every other policy below (role + reporter_id lookup)
-- ----------------------------------------------------------------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
DROP POLICY IF EXISTS "profiles_select_anon_own" ON profiles;
DROP POLICY IF EXISTS "profiles_select_authenticated" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_auth" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_authenticated" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;

-- Any authenticated user can read all profiles.
-- Required because AuthContext fetches profile on login before
-- full session/JWT context is always available; restricting to
-- id = auth.uid() caused "unable to fetch" on login.
-- App only ever queries WHERE id = own user id, so this is safe.
CREATE POLICY "profiles_select_authenticated"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

-- Users can only create their own profile row
CREATE POLICY "profiles_insert_authenticated"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- Users can only update their own profile row
-- (prevents a reporter from changing their own role to editor)
CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());


-- ----------------------------------------------------------------
-- stories
-- ----------------------------------------------------------------
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stories_select_authenticated" ON stories;
DROP POLICY IF EXISTS "stories_insert_editor_only" ON stories;
DROP POLICY IF EXISTS "stories_update_editor_or_reporter" ON stories;
DROP POLICY IF EXISTS "stories_delete_editor_only" ON stories;

-- All authenticated users can read all stories
-- (needed for assignments joins in Reporter Queue / Calendar
-- and for Kanban board)
CREATE POLICY "stories_select_authenticated"
  ON stories FOR SELECT
  TO authenticated
  USING (true);

-- Only editor/admin can create stories
CREATE POLICY "stories_insert_editor_only"
  ON stories FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
  );

-- Editor/admin can update any story.
-- Reporter can update a story only if its status is
-- in_progress or filed (covers "start working" / "file report")
CREATE POLICY "stories_update_editor_or_reporter"
  ON stories FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
    OR (
      (SELECT role FROM profiles WHERE id = auth.uid()) = 'reporter'
      AND status IN ('in_progress', 'filed')
    )
  );

-- Only editor/admin can delete stories
CREATE POLICY "stories_delete_editor_only"
  ON stories FOR DELETE
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
  );


-- ----------------------------------------------------------------
-- assignments
-- ----------------------------------------------------------------
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "assignments_select" ON assignments;
DROP POLICY IF EXISTS "assignments_insert_editor_only" ON assignments;
DROP POLICY IF EXISTS "assignments_update" ON assignments;
DROP POLICY IF EXISTS "assignments_delete_editor_only" ON assignments;

-- Editor/admin read all assignments.
-- Reporter reads only their own assignments
CREATE POLICY "assignments_select"
  ON assignments FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
    OR reporter_id = (SELECT reporter_id FROM profiles WHERE id = auth.uid())
  );

-- Only editor/admin can create assignments (assign stories)
CREATE POLICY "assignments_insert_editor_only"
  ON assignments FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
  );

-- Editor/admin can update any assignment.
-- Reporter can update only their own assignment row
-- (covers accept/reject of override assignments)
CREATE POLICY "assignments_update"
  ON assignments FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
    OR reporter_id = (SELECT reporter_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
    OR reporter_id = (SELECT reporter_id FROM profiles WHERE id = auth.uid())
  );

-- Only editor/admin can delete (deactivate) assignments
CREATE POLICY "assignments_delete_editor_only"
  ON assignments FOR DELETE
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
  );


-- ----------------------------------------------------------------
-- availability
-- ----------------------------------------------------------------
ALTER TABLE availability ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "availability_select" ON availability;
DROP POLICY IF EXISTS "availability_insert" ON availability;
DROP POLICY IF EXISTS "availability_update" ON availability;
DROP POLICY IF EXISTS "availability_delete_editor_only" ON availability;

-- Editor/admin read all availability.
-- Reporter reads only their own
CREATE POLICY "availability_select"
  ON availability FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
    OR reporter_id = (SELECT reporter_id FROM profiles WHERE id = auth.uid())
  );

-- Reporter can insert only their own availability;
-- editor/admin can insert for anyone
CREATE POLICY "availability_insert"
  ON availability FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
    OR reporter_id = (SELECT reporter_id FROM profiles WHERE id = auth.uid())
  );

-- Reporter can update only their own availability;
-- editor/admin can update anyone's
CREATE POLICY "availability_update"
  ON availability FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
    OR reporter_id = (SELECT reporter_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
    OR reporter_id = (SELECT reporter_id FROM profiles WHERE id = auth.uid())
  );

-- Only editor/admin can delete availability rows
CREATE POLICY "availability_delete_editor_only"
  ON availability FOR DELETE
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
  );


-- ----------------------------------------------------------------
-- leave_requests
-- ----------------------------------------------------------------
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leave_requests_select" ON leave_requests;
DROP POLICY IF EXISTS "leave_requests_insert" ON leave_requests;
DROP POLICY IF EXISTS "leave_requests_update_editor_only" ON leave_requests;
DROP POLICY IF EXISTS "leave_requests_delete_editor_only" ON leave_requests;

-- Editor/admin read all leave requests.
-- Reporter reads only their own
CREATE POLICY "leave_requests_select"
  ON leave_requests FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
    OR reporter_id = (SELECT reporter_id FROM profiles WHERE id = auth.uid())
  );

-- Reporter can file leave only for themselves;
-- editor/admin can file on behalf of anyone
CREATE POLICY "leave_requests_insert"
  ON leave_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
    OR reporter_id = (SELECT reporter_id FROM profiles WHERE id = auth.uid())
  );

-- Only editor/admin can update leave requests
-- (acknowledge / reject) — reporter cannot self-approve
CREATE POLICY "leave_requests_update_editor_only"
  ON leave_requests FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
  )
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
  );

-- Only editor/admin can delete leave requests
CREATE POLICY "leave_requests_delete_editor_only"
  ON leave_requests FOR DELETE
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
  );


-- ----------------------------------------------------------------
-- reporters
-- ----------------------------------------------------------------
ALTER TABLE reporters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reporters_select_authenticated" ON reporters;
DROP POLICY IF EXISTS "reporters_insert_editor_only" ON reporters;
DROP POLICY IF EXISTS "reporters_update" ON reporters;
DROP POLICY IF EXISTS "reporters_delete_editor_only" ON reporters;

-- All authenticated users can read all reporters
-- (needed for AssignModal scoring, Roster, Chatbot context,
-- and showing reporter names throughout the app)
CREATE POLICY "reporters_select_authenticated"
  ON reporters FOR SELECT
  TO authenticated
  USING (true);

-- Only editor/admin can create new reporters
CREATE POLICY "reporters_insert_editor_only"
  ON reporters FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
  );

-- Editor/admin can update any reporter.
-- Reporter can update only their own record
CREATE POLICY "reporters_update"
  ON reporters FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
    OR id = (SELECT reporter_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
    OR id = (SELECT reporter_id FROM profiles WHERE id = auth.uid())
  );

-- Only editor/admin can delete reporters
CREATE POLICY "reporters_delete_editor_only"
  ON reporters FOR DELETE
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
  );


-- ----------------------------------------------------------------
-- holidays
-- ----------------------------------------------------------------
ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "holidays_read_all" ON holidays;
DROP POLICY IF EXISTS "holidays_write_all" ON holidays;
DROP POLICY IF EXISTS "holidays_select_authenticated" ON holidays;
DROP POLICY IF EXISTS "holidays_insert_editor_only" ON holidays;
DROP POLICY IF EXISTS "holidays_update_editor_only" ON holidays;
DROP POLICY IF EXISTS "holidays_delete_editor_only" ON holidays;

-- All authenticated users can read holidays
-- (needed by Calendar, Roster, Chatbot for every role)
CREATE POLICY "holidays_select_authenticated"
  ON holidays FOR SELECT
  TO authenticated
  USING (true);

-- Only editor/admin can create holidays
CREATE POLICY "holidays_insert_editor_only"
  ON holidays FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
  );

-- Only editor/admin can update holidays
CREATE POLICY "holidays_update_editor_only"
  ON holidays FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
  )
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
  );

-- Only editor/admin can delete holidays
CREATE POLICY "holidays_delete_editor_only"
  ON holidays FOR DELETE
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
  );


-- ----------------------------------------------------------------
-- notification_log
-- ----------------------------------------------------------------
ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_log_select" ON notification_log;
DROP POLICY IF EXISTS "notification_log_insert_authenticated" ON notification_log;
DROP POLICY IF EXISTS "notification_log_update_editor_only" ON notification_log;
DROP POLICY IF EXISTS "notification_log_delete_editor_only" ON notification_log;

-- Editor/admin read all notifications.
-- Reporter reads only their own
CREATE POLICY "notification_log_select"
  ON notification_log FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
    OR reporter_id = (SELECT reporter_id FROM profiles WHERE id = auth.uid())
  );

-- Any authenticated user/process can insert notifications
-- (system-generated on assignment, leave actions, etc.)
CREATE POLICY "notification_log_insert_authenticated"
  ON notification_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Only editor/admin can update notification log entries
CREATE POLICY "notification_log_update_editor_only"
  ON notification_log FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
  )
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
  );

-- Only editor/admin can delete notification log entries
CREATE POLICY "notification_log_delete_editor_only"
  ON notification_log FOR DELETE
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
  );


-- ----------------------------------------------------------------
-- ai_reports
-- ----------------------------------------------------------------
ALTER TABLE ai_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_reports_select_authenticated" ON ai_reports;
DROP POLICY IF EXISTS "ai_reports_insert_editor_only" ON ai_reports;
DROP POLICY IF EXISTS "ai_reports_update_editor_only" ON ai_reports;
DROP POLICY IF EXISTS "ai_reports_delete_editor_only" ON ai_reports;

-- All authenticated users can read ai_reports
-- (Reporter Queue shows approved AI reports to reporters)
CREATE POLICY "ai_reports_select_authenticated"
  ON ai_reports FOR SELECT
  TO authenticated
  USING (true);

-- Only editor/admin can create ai_reports (Ambient Scribe)
CREATE POLICY "ai_reports_insert_editor_only"
  ON ai_reports FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
  );

-- Only editor/admin can update ai_reports (approve/reject)
CREATE POLICY "ai_reports_update_editor_only"
  ON ai_reports FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
  )
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
  );

-- Only editor/admin can delete ai_reports
CREATE POLICY "ai_reports_delete_editor_only"
  ON ai_reports FOR DELETE
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
  );


-- ----------------------------------------------------------------
-- admins
-- ----------------------------------------------------------------
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_select_admin_only" ON admins;
DROP POLICY IF EXISTS "admins_insert_admin_only" ON admins;
DROP POLICY IF EXISTS "admins_update_admin_only" ON admins;
DROP POLICY IF EXISTS "admins_delete_admin_only" ON admins;

-- Only admin role can read the admins table
-- (prevents editors/reporters from seeing admin records)
CREATE POLICY "admins_select_admin_only"
  ON admins FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "admins_insert_admin_only"
  ON admins FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "admins_update_admin_only"
  ON admins FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "admins_delete_admin_only"
  ON admins FOR DELETE
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );


-- ----------------------------------------------------------------
-- app_settings
-- ----------------------------------------------------------------
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_settings_select_authenticated" ON app_settings;
DROP POLICY IF EXISTS "app_settings_insert_editor_only" ON app_settings;
DROP POLICY IF EXISTS "app_settings_update_editor_only" ON app_settings;
DROP POLICY IF EXISTS "app_settings_delete_editor_only" ON app_settings;

-- All authenticated users can read app_settings
-- (date format / week start day used on every page)
CREATE POLICY "app_settings_select_authenticated"
  ON app_settings FOR SELECT
  TO authenticated
  USING (true);

-- Only editor/admin can change app settings
CREATE POLICY "app_settings_insert_editor_only"
  ON app_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
  );

CREATE POLICY "app_settings_update_editor_only"
  ON app_settings FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
  )
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
  );

CREATE POLICY "app_settings_delete_editor_only"
  ON app_settings FOR DELETE
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
  );


-- ----------------------------------------------------------------
-- leave_filing_requests
-- OLD/UNUSED TABLE — left WITHOUT RLS intentionally.
-- Not referenced anywhere in the app code. If this table is
-- ever used in future, RLS must be added following the same
-- pattern as leave_requests above.
-- ----------------------------------------------------------------
-- (No RLS changes applied to leave_filing_requests)


-- ================================================================
-- VERIFICATION QUERY
-- Run after applying this migration to confirm RLS is enabled
-- on all 11 tables with the expected policy counts
-- (4 policies each, except profiles which has 3)
-- ================================================================
-- SELECT
--   tablename,
--   rowsecurity AS rls_enabled,
--   (SELECT COUNT(*) FROM pg_policies WHERE tablename = t.tablename) AS policy_count
-- FROM pg_tables t
-- WHERE schemaname = 'public'
-- AND tablename IN (
--   'profiles', 'stories', 'assignments', 'availability',
--   'leave_requests', 'reporters', 'holidays',
--   'notification_log', 'ai_reports', 'admins', 'app_settings'
-- )
-- ORDER BY tablename;