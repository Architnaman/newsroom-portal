-- ================================================
-- NEWSROOM OS - Seed Data
-- ================================================

-- Insert Reporters
INSERT INTO reporters (id, name, email, beats, status, max_stories_per_week, complexity_level)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Priya Mehta',  'priya@newsroom.com',  ARRAY['Politics','Economy'],        'active', 4, 3),
  ('22222222-2222-2222-2222-222222222222', 'Arjun Sharma', 'arjun@newsroom.com',  ARRAY['Tech','Science'],            'active', 4, 3),
  ('33333333-3333-3333-3333-333333333333', 'Fatima Nair',  'fatima@newsroom.com', ARRAY['Crime','Local'],             'active', 4, 3),
  ('44444444-4444-4444-4444-444444444444', 'Ravi Iyer',    'ravi@newsroom.com',   ARRAY['Sports','Entertainment'],    'active', 4, 3),
  ('55555555-5555-5555-5555-555555555555', 'Sunita Rao',   'sunita@newsroom.com', ARRAY['Business','Economy'],        'active', 4, 3),
  ('66666666-6666-6666-6666-666666666666', 'Editor Admin', 'editor@newsroom.com', ARRAY[]::text[],                   'inactive', 0, 3)
ON CONFLICT (email) DO NOTHING;

-- ================================================
-- MODIFIED: Using crypt() instead of hardcoded hash
-- so passwords work correctly on any device
-- Password for all users: editor123
-- ================================================
INSERT INTO auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change,
  email_change_token_new, recovery_token
)
VALUES
  ('00000000-0000-0000-0000-000000000000',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'authenticated', 'authenticated',
   'editor@newsroom.com',
   crypt('editor123', gen_salt('bf')), -- MODIFIED: dynamic password hashing
   now(),
   '{"provider":"email","providers":["email"]}',
   '{"name":"Editor Admin","role":"editor"}',
   now(), now(), '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'authenticated', 'authenticated',
   'priya@newsroom.com',
   crypt('editor123', gen_salt('bf')), -- MODIFIED: dynamic password hashing
   now(),
   '{"provider":"email","providers":["email"]}',
   '{"name":"Priya Mehta","role":"reporter"}',
   now(), now(), '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000',
   'cccccccc-cccc-cccc-cccc-cccccccccccc',
   'authenticated', 'authenticated',
   'arjun@newsroom.com',
   crypt('editor123', gen_salt('bf')), -- MODIFIED: dynamic password hashing
   now(),
   '{"provider":"email","providers":["email"]}',
   '{"name":"Arjun Sharma","role":"reporter"}',
   now(), now(), '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000',
   'dddddddd-dddd-dddd-dddd-dddddddddddd',
   'authenticated', 'authenticated',
   'fatima@newsroom.com',
   crypt('editor123', gen_salt('bf')), -- MODIFIED: dynamic password hashing
   now(),
   '{"provider":"email","providers":["email"]}',
   '{"name":"Fatima Nair","role":"reporter"}',
   now(), now(), '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000',
   'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
   'authenticated', 'authenticated',
   'ravi@newsroom.com',
   crypt('editor123', gen_salt('bf')), -- MODIFIED: dynamic password hashing
   now(),
   '{"provider":"email","providers":["email"]}',
   '{"name":"Ravi Iyer","role":"reporter"}',
   now(), now(), '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000',
   'ffffffff-ffff-ffff-ffff-ffffffffffff',
   'authenticated', 'authenticated',
   'sunita@newsroom.com',
   crypt('editor123', gen_salt('bf')), -- MODIFIED: dynamic password hashing
   now(),
   '{"provider":"email","providers":["email"]}',
   '{"name":"Sunita Rao","role":"reporter"}',
   now(), now(), '', '', '', '')
ON CONFLICT (id) DO NOTHING;

-- Insert Profiles
INSERT INTO profiles (id, reporter_id, role)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '66666666-6666-6666-6666-666666666666', 'editor'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'reporter'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222', 'reporter'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', '33333333-3333-3333-3333-333333333333', 'reporter'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '44444444-4444-4444-4444-444444444444', 'reporter'),
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', '55555555-5555-5555-5555-555555555555', 'reporter')
ON CONFLICT (id) DO NOTHING;

-- ================================================
-- ADDED: Default availability for all reporters
-- Sets all 7 days available for current week
-- ================================================
INSERT INTO availability (reporter_id, week_start_date, available_days)
SELECT
  id,
  date_trunc('week', CURRENT_DATE)::date,
  ARRAY['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
FROM reporters
WHERE status = 'active'
ON CONFLICT (reporter_id, week_start_date)
DO UPDATE SET available_days = ARRAY['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

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