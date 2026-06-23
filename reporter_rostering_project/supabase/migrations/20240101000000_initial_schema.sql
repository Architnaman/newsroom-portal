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
  complexity_level integer DEFAULT 3,
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
  filed_file_url text,
  filed_file_name text,
  filed_at timestamptz,
  published_at timestamptz,
  reassign_reason text,
  editor_feedback text,
  feedback_at timestamptz,
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
  is_override boolean DEFAULT false,
  override_reason text,
  override_status text DEFAULT 'pending' CHECK (override_status IN ('pending', 'accepted', 'rejected')),
  override_response text,
  override_responded_at timestamptz
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
  reject_reason text,
  acknowledged_at timestamptz,
  filed_by_editor boolean DEFAULT false,
  editor_note text,
  created_at timestamptz DEFAULT now()
);

-- ================================================
-- TABLE: profiles
-- ================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY,
  reporter_id uuid REFERENCES reporters(id),
  role text DEFAULT 'reporter' CHECK (role IN ('editor', 'reporter', 'admin')),
  created_at timestamptz DEFAULT now()
);

-- ================================================
-- TABLE: notification_log
-- ================================================
CREATE TABLE IF NOT EXISTS notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid REFERENCES reporters(id),
  story_id uuid REFERENCES stories(id) ON DELETE SET NULL,
  type text,
  message text,
  recipient_email text,
  email_status text DEFAULT 'pending' CHECK (email_status IN ('pending', 'sent', 'failed')),
  error_message text,
  sent_at timestamptz DEFAULT now()
);

-- ================================================
-- TABLE: holidays
-- ================================================
CREATE TABLE IF NOT EXISTS holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL UNIQUE,
  name text NOT NULL,
  is_recurring boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- ================================================
-- STORAGE BUCKET: story-files
-- ================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('story-files', 'story-files', true)
ON CONFLICT (id) DO NOTHING;

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
-- Default US public holidays for 2026
-- ================================================
INSERT INTO holidays (date, name, is_recurring) VALUES
  ('2026-01-01', 'New Year''s Day', true),
  ('2026-01-19', 'Martin Luther King Jr. Day', true),
  ('2026-02-16', 'Presidents'' Day', true),
  ('2026-05-25', 'Memorial Day', true),
  ('2026-06-19', 'Juneteenth National Independence Day', true),
  ('2026-07-03', 'Independence Day (observed)', true),
  ('2026-09-07', 'Labor Day', true),
  ('2026-10-12', 'Columbus Day', true),
  ('2026-11-11', 'Veterans Day', true),
  ('2026-11-26', 'Thanksgiving Day', true),
  ('2026-12-25', 'Christmas Day', true)
ON CONFLICT (date) DO NOTHING;

-- ================================================
-- AUTO COMPLEXITY TRIGGER
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
-- WEEKLY REPORTER LOAD RESET
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
-- APP SETTINGS TABLE
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

-- ================================================
-- PAGE EVENTS TABLE (App Usage Analytics)
-- ================================================
CREATE TABLE IF NOT EXISTS page_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  reporter_id uuid REFERENCES reporters(id),
  role text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('page_view', 'action')),
  page_path text NOT NULL,
  action_name text,
  session_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_page_events_created_at ON page_events(created_at);
CREATE INDEX IF NOT EXISTS idx_page_events_session_id ON page_events(session_id);
CREATE INDEX IF NOT EXISTS idx_page_events_user_id ON page_events(user_id);

-- ================================================================
-- ================================================================
--                  ROW LEVEL SECURITY (RLS)
-- ================================================================
-- ================================================================

-- ----------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
DROP POLICY IF EXISTS "profiles_select_anon_own" ON profiles;
DROP POLICY IF EXISTS "profiles_select_authenticated" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_auth" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_authenticated" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;

CREATE POLICY "profiles_select_authenticated"
  ON profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "profiles_insert_authenticated"
  ON profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- ----------------------------------------------------------------
-- stories
-- ----------------------------------------------------------------
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stories_select_authenticated" ON stories;
DROP POLICY IF EXISTS "stories_insert_editor_only" ON stories;
DROP POLICY IF EXISTS "stories_update_editor_or_reporter" ON stories;
DROP POLICY IF EXISTS "stories_delete_editor_only" ON stories;

CREATE POLICY "stories_select_authenticated"
  ON stories FOR SELECT TO authenticated USING (true);

CREATE POLICY "stories_insert_editor_only"
  ON stories FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin'));

CREATE POLICY "stories_update_editor_or_reporter"
  ON stories FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
    OR (
      (SELECT role FROM profiles WHERE id = auth.uid()) = 'reporter'
      AND status IN ('in_progress', 'filed')
    )
  );

CREATE POLICY "stories_delete_editor_only"
  ON stories FOR DELETE TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin'));

-- ----------------------------------------------------------------
-- assignments
-- ----------------------------------------------------------------
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "assignments_select" ON assignments;
DROP POLICY IF EXISTS "assignments_insert_editor_only" ON assignments;
DROP POLICY IF EXISTS "assignments_update" ON assignments;
DROP POLICY IF EXISTS "assignments_delete_editor_only" ON assignments;

CREATE POLICY "assignments_select"
  ON assignments FOR SELECT TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
    OR reporter_id = (SELECT reporter_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "assignments_insert_editor_only"
  ON assignments FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin'));

CREATE POLICY "assignments_update"
  ON assignments FOR UPDATE TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
    OR reporter_id = (SELECT reporter_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
    OR reporter_id = (SELECT reporter_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "assignments_delete_editor_only"
  ON assignments FOR DELETE TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin'));

-- ----------------------------------------------------------------
-- availability
-- ----------------------------------------------------------------
ALTER TABLE availability ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "availability_select" ON availability;
DROP POLICY IF EXISTS "availability_insert" ON availability;
DROP POLICY IF EXISTS "availability_update" ON availability;
DROP POLICY IF EXISTS "availability_delete_editor_only" ON availability;

CREATE POLICY "availability_select"
  ON availability FOR SELECT TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
    OR reporter_id = (SELECT reporter_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "availability_insert"
  ON availability FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
    OR reporter_id = (SELECT reporter_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "availability_update"
  ON availability FOR UPDATE TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
    OR reporter_id = (SELECT reporter_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
    OR reporter_id = (SELECT reporter_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "availability_delete_editor_only"
  ON availability FOR DELETE TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin'));

-- ----------------------------------------------------------------
-- leave_requests
-- ----------------------------------------------------------------
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leave_requests_select" ON leave_requests;
DROP POLICY IF EXISTS "leave_requests_insert" ON leave_requests;
DROP POLICY IF EXISTS "leave_requests_update_editor_only" ON leave_requests;
DROP POLICY IF EXISTS "leave_requests_delete_editor_only" ON leave_requests;

CREATE POLICY "leave_requests_select"
  ON leave_requests FOR SELECT TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
    OR reporter_id = (SELECT reporter_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "leave_requests_insert"
  ON leave_requests FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
    OR reporter_id = (SELECT reporter_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "leave_requests_update_editor_only"
  ON leave_requests FOR UPDATE TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin'))
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin'));

CREATE POLICY "leave_requests_delete_editor_only"
  ON leave_requests FOR DELETE TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin'));

-- ----------------------------------------------------------------
-- reporters
-- ----------------------------------------------------------------
ALTER TABLE reporters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reporters_select_authenticated" ON reporters;
DROP POLICY IF EXISTS "reporters_insert_editor_only" ON reporters;
DROP POLICY IF EXISTS "reporters_update" ON reporters;
DROP POLICY IF EXISTS "reporters_delete_editor_only" ON reporters;

CREATE POLICY "reporters_select_authenticated"
  ON reporters FOR SELECT TO authenticated USING (true);

CREATE POLICY "reporters_insert_editor_only"
  ON reporters FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin'));

CREATE POLICY "reporters_update"
  ON reporters FOR UPDATE TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
    OR id = (SELECT reporter_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
    OR id = (SELECT reporter_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "reporters_delete_editor_only"
  ON reporters FOR DELETE TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin'));

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

CREATE POLICY "holidays_select_authenticated"
  ON holidays FOR SELECT TO authenticated USING (true);

CREATE POLICY "holidays_insert_editor_only"
  ON holidays FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin'));

CREATE POLICY "holidays_update_editor_only"
  ON holidays FOR UPDATE TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin'))
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin'));

CREATE POLICY "holidays_delete_editor_only"
  ON holidays FOR DELETE TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin'));

-- ----------------------------------------------------------------
-- notification_log
-- ----------------------------------------------------------------
ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_log_select" ON notification_log;
DROP POLICY IF EXISTS "notification_log_insert_authenticated" ON notification_log;
DROP POLICY IF EXISTS "notification_log_update_editor_only" ON notification_log;
DROP POLICY IF EXISTS "notification_log_delete_editor_only" ON notification_log;

CREATE POLICY "notification_log_select"
  ON notification_log FOR SELECT TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
    OR reporter_id = (SELECT reporter_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "notification_log_insert_authenticated"
  ON notification_log FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "notification_log_update_editor_only"
  ON notification_log FOR UPDATE TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin'))
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin'));

CREATE POLICY "notification_log_delete_editor_only"
  ON notification_log FOR DELETE TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin'));

-- ----------------------------------------------------------------
-- ai_reports
-- ----------------------------------------------------------------
ALTER TABLE ai_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_reports_select_authenticated" ON ai_reports;
DROP POLICY IF EXISTS "ai_reports_insert_editor_only" ON ai_reports;
DROP POLICY IF EXISTS "ai_reports_update_editor_only" ON ai_reports;
DROP POLICY IF EXISTS "ai_reports_delete_editor_only" ON ai_reports;

CREATE POLICY "ai_reports_select_authenticated"
  ON ai_reports FOR SELECT TO authenticated USING (true);

CREATE POLICY "ai_reports_insert_editor_only"
  ON ai_reports FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin'));

CREATE POLICY "ai_reports_update_editor_only"
  ON ai_reports FOR UPDATE TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin'))
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin'));

CREATE POLICY "ai_reports_delete_editor_only"
  ON ai_reports FOR DELETE TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin'));

-- ----------------------------------------------------------------
-- admins
-- ----------------------------------------------------------------
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_select_admin_only" ON admins;
DROP POLICY IF EXISTS "admins_insert_admin_only" ON admins;
DROP POLICY IF EXISTS "admins_update_admin_only" ON admins;
DROP POLICY IF EXISTS "admins_delete_admin_only" ON admins;

CREATE POLICY "admins_select_admin_only"
  ON admins FOR SELECT TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "admins_insert_admin_only"
  ON admins FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "admins_update_admin_only"
  ON admins FOR UPDATE TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "admins_delete_admin_only"
  ON admins FOR DELETE TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- ----------------------------------------------------------------
-- app_settings
-- ----------------------------------------------------------------
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_settings_select_authenticated" ON app_settings;
DROP POLICY IF EXISTS "app_settings_insert_editor_only" ON app_settings;
DROP POLICY IF EXISTS "app_settings_update_editor_only" ON app_settings;
DROP POLICY IF EXISTS "app_settings_delete_editor_only" ON app_settings;

CREATE POLICY "app_settings_select_authenticated"
  ON app_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "app_settings_insert_editor_only"
  ON app_settings FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin'));

CREATE POLICY "app_settings_update_editor_only"
  ON app_settings FOR UPDATE TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin'))
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin'));

CREATE POLICY "app_settings_delete_editor_only"
  ON app_settings FOR DELETE TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin'));

-- ----------------------------------------------------------------
-- page_events
-- ----------------------------------------------------------------
ALTER TABLE page_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "page_events_insert_own" ON page_events;
DROP POLICY IF EXISTS "page_events_select_admin" ON page_events;

CREATE POLICY "page_events_insert_own"
  ON page_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "page_events_select_admin"
  ON page_events FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- ================================================================
-- ================================================================
--                  TEAM CHAT FEATURE
-- ================================================================
-- ================================================================

-- ----------------------------------------------------------------
-- chat_channels
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('dm', 'group')),
  created_by UUID REFERENCES reporters(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_archived BOOLEAN DEFAULT FALSE
);

-- ----------------------------------------------------------------
-- chat_channel_members
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_channel_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES chat_channels(id) ON DELETE CASCADE,
  reporter_id UUID REFERENCES reporters(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  last_read_at TIMESTAMPTZ DEFAULT NOW(),
  is_admin BOOLEAN DEFAULT FALSE,
  UNIQUE(channel_id, reporter_id)
);

-- ----------------------------------------------------------------
-- chat_messages
-- Note: has TWO foreign keys to reporters (sender_id, pinned_by)
-- Frontend must specify reporters!chat_messages_sender_id_fkey
-- when joining to avoid PGRST201 ambiguous relationship error.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES chat_channels(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES reporters(id),
  content TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  is_deleted BOOLEAN DEFAULT FALSE,
  reply_to_id UUID REFERENCES chat_messages(id),
  is_pinned BOOLEAN DEFAULT FALSE,
  pinned_by UUID REFERENCES reporters(id),
  pinned_at TIMESTAMPTZ
);

-- ----------------------------------------------------------------
-- chat_reactions
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES chat_messages(id) ON DELETE CASCADE,
  reporter_id UUID REFERENCES reporters(id),
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_id, reporter_id, emoji)
);

-- ----------------------------------------------------------------
-- chat_typing
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_typing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES chat_channels(id) ON DELETE CASCADE,
  reporter_id UUID REFERENCES reporters(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(channel_id, reporter_id)
);

-- ----------------------------------------------------------------
-- chat_attachments
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES chat_messages(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- Indexes
-- ----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_chat_messages_channel ON chat_messages(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_members_reporter ON chat_channel_members(reporter_id);
CREATE INDEX IF NOT EXISTS idx_chat_members_channel ON chat_channel_members(channel_id);
CREATE INDEX IF NOT EXISTS idx_chat_reactions_message ON chat_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_chat_typing_channel ON chat_typing(channel_id);

-- ----------------------------------------------------------------
-- Online status column on reporters
-- ----------------------------------------------------------------
ALTER TABLE reporters ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- ----------------------------------------------------------------
-- Enable Realtime on chat tables
-- ----------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'chat_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'chat_typing') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE chat_typing;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'chat_reactions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE chat_reactions;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'chat_channel_members') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE chat_channel_members;
  END IF;
END $$;

-- ----------------------------------------------------------------
-- STORAGE BUCKET: chat-files
-- ----------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-files', 'chat-files', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "chat_files_open_access" ON storage.objects;
CREATE POLICY "chat_files_open_access" ON storage.objects
FOR ALL USING (bucket_id = 'chat-files')
WITH CHECK (bucket_id = 'chat-files');

-- ----------------------------------------------------------------
-- Helper function to avoid RLS infinite recursion on
-- chat_channel_members. SECURITY DEFINER bypasses RLS
-- inside this function only.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_channel_member(p_channel_id uuid, p_reporter_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM chat_channel_members
    WHERE channel_id = p_channel_id AND reporter_id = p_reporter_id
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ----------------------------------------------------------------
-- RLS: chat_channels
-- ----------------------------------------------------------------
ALTER TABLE chat_channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "channels_select_members" ON chat_channels;
DROP POLICY IF EXISTS "channels_insert_authenticated" ON chat_channels;
DROP POLICY IF EXISTS "channels_update_members" ON chat_channels;

CREATE POLICY "channels_select_members"
  ON chat_channels FOR SELECT TO authenticated
  USING (
    is_channel_member(id, (SELECT reporter_id FROM profiles WHERE id = auth.uid()))
    OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
  );

CREATE POLICY "channels_insert_authenticated"
  ON chat_channels FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "channels_update_members"
  ON chat_channels FOR UPDATE TO authenticated
  USING (
    created_by = (SELECT reporter_id FROM profiles WHERE id = auth.uid())
    OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
  );

-- ----------------------------------------------------------------
-- RLS: chat_channel_members
-- ----------------------------------------------------------------
ALTER TABLE chat_channel_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members_select" ON chat_channel_members;
DROP POLICY IF EXISTS "members_insert_authenticated" ON chat_channel_members;
DROP POLICY IF EXISTS "members_update_own" ON chat_channel_members;

CREATE POLICY "members_select"
  ON chat_channel_members FOR SELECT TO authenticated
  USING (
    is_channel_member(channel_id, (SELECT reporter_id FROM profiles WHERE id = auth.uid()))
    OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
  );

CREATE POLICY "members_insert_authenticated"
  ON chat_channel_members FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "members_update_own"
  ON chat_channel_members FOR UPDATE TO authenticated
  USING (
    reporter_id = (SELECT reporter_id FROM profiles WHERE id = auth.uid())
    OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
  );

-- ----------------------------------------------------------------
-- RLS: chat_messages
-- ----------------------------------------------------------------
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages_select_members" ON chat_messages;
DROP POLICY IF EXISTS "messages_insert_members" ON chat_messages;
DROP POLICY IF EXISTS "messages_update_own" ON chat_messages;

CREATE POLICY "messages_select_members"
  ON chat_messages FOR SELECT TO authenticated
  USING (is_channel_member(channel_id, (SELECT reporter_id FROM profiles WHERE id = auth.uid())));

CREATE POLICY "messages_insert_members"
  ON chat_messages FOR INSERT TO authenticated
  WITH CHECK (is_channel_member(channel_id, (SELECT reporter_id FROM profiles WHERE id = auth.uid())));

CREATE POLICY "messages_update_own"
  ON chat_messages FOR UPDATE TO authenticated
  USING (
    sender_id = (SELECT reporter_id FROM profiles WHERE id = auth.uid())
    OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'admin')
  );

-- ----------------------------------------------------------------
-- RLS: chat_reactions
-- ----------------------------------------------------------------
ALTER TABLE chat_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reactions_select" ON chat_reactions;
DROP POLICY IF EXISTS "reactions_insert" ON chat_reactions;
DROP POLICY IF EXISTS "reactions_delete_own" ON chat_reactions;

CREATE POLICY "reactions_select"
  ON chat_reactions FOR SELECT TO authenticated USING (true);

CREATE POLICY "reactions_insert"
  ON chat_reactions FOR INSERT TO authenticated
  WITH CHECK (reporter_id = (SELECT reporter_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "reactions_delete_own"
  ON chat_reactions FOR DELETE TO authenticated
  USING (reporter_id = (SELECT reporter_id FROM profiles WHERE id = auth.uid()));

-- ----------------------------------------------------------------
-- RLS: chat_typing
-- ----------------------------------------------------------------
ALTER TABLE chat_typing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "typing_all" ON chat_typing;

CREATE POLICY "typing_all"
  ON chat_typing FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------
-- RLS: chat_attachments
-- ----------------------------------------------------------------
ALTER TABLE chat_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "attachments_select" ON chat_attachments;
DROP POLICY IF EXISTS "attachments_insert" ON chat_attachments;

CREATE POLICY "attachments_select"
  ON chat_attachments FOR SELECT TO authenticated USING (true);

CREATE POLICY "attachments_insert"
  ON chat_attachments FOR INSERT TO authenticated WITH CHECK (true);
-- ================================================================
-- VERIFICATION QUERIES
-- Run these after applying the migration to confirm everything
-- is set up correctly.
-- ================================================================

-- Core tables (12) — RLS enabled with expected policy counts
-- SELECT
--   tablename,
--   rowsecurity AS rls_enabled,
--   (SELECT COUNT(*) FROM pg_policies WHERE tablename = t.tablename) AS policy_count
-- FROM pg_tables t
-- WHERE schemaname = 'public'
-- AND tablename IN (
--   'profiles', 'stories', 'assignments', 'availability',
--   'leave_requests', 'reporters', 'holidays',
--   'notification_log', 'ai_reports', 'admins', 'app_settings',
--   'page_events'
-- )
-- ORDER BY tablename;

-- Chat tables (6) — RLS enabled with expected policy counts
-- SELECT
--   tablename,
--   rowsecurity AS rls_enabled,
--   (SELECT COUNT(*) FROM pg_policies WHERE tablename = t.tablename) AS policy_count
-- FROM pg_tables t
-- WHERE schemaname = 'public'
-- AND tablename LIKE 'chat_%'
-- ORDER BY tablename;

-- Confirm helper function exists
-- SELECT proname FROM pg_proc WHERE proname = 'is_channel_member';

-- Confirm storage buckets exist
-- SELECT id, name, public FROM storage.buckets WHERE id IN ('story-files', 'chat-files');

-- Confirm page_events table and RLS
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'page_events';

-- Confirm holidays loaded (should be 11 US federal holidays)
-- SELECT COUNT(*) FROM holidays;