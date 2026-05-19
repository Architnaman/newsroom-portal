-- Fatima Nair
INSERT INTO auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change,
  email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(), 'authenticated', 'authenticated',
  'fatima@newsroom.com',
  (SELECT encrypted_password FROM auth.users WHERE email = 'editor@newsroom.com'),
  now(), '{"provider":"email","providers":["email"]}',
  '{"name":"Fatima Nair","role":"reporter"}',
  now(), now(), '', '', '', ''
);

INSERT INTO profiles (id, reporter_id, role)
SELECT au.id, r.id, 'reporter'
FROM auth.users au JOIN reporters r ON r.email = au.email
WHERE au.email = 'fatima@newsroom.com'
ON CONFLICT (id) DO UPDATE SET role = 'reporter', reporter_id = EXCLUDED.reporter_id;

-- Ravi Iyer
INSERT INTO auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change,
  email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(), 'authenticated', 'authenticated',
  'ravi@newsroom.com',
  (SELECT encrypted_password FROM auth.users WHERE email = 'editor@newsroom.com'),
  now(), '{"provider":"email","providers":["email"]}',
  '{"name":"Ravi Iyer","role":"reporter"}',
  now(), now(), '', '', '', ''
);

INSERT INTO profiles (id, reporter_id, role)
SELECT au.id, r.id, 'reporter'
FROM auth.users au JOIN reporters r ON r.email = au.email
WHERE au.email = 'ravi@newsroom.com'
ON CONFLICT (id) DO UPDATE SET role = 'reporter', reporter_id = EXCLUDED.reporter_id;

-- Arjun Sharma
INSERT INTO auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change,
  email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(), 'authenticated', 'authenticated',
  'arjun@newsroom.com',
  (SELECT encrypted_password FROM auth.users WHERE email = 'editor@newsroom.com'),
  now(), '{"provider":"email","providers":["email"]}',
  '{"name":"Arjun Sharma","role":"reporter"}',
  now(), now(), '', '', '', ''
);

INSERT INTO profiles (id, reporter_id, role)
SELECT au.id, r.id, 'reporter'
FROM auth.users au JOIN reporters r ON r.email = au.email
WHERE au.email = 'arjun@newsroom.com'
ON CONFLICT (id) DO UPDATE SET role = 'reporter', reporter_id = EXCLUDED.reporter_id;

-- Sunita Rao
INSERT INTO auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change,
  email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(), 'authenticated', 'authenticated',
  'sunita@newsroom.com',
  (SELECT encrypted_password FROM auth.users WHERE email = 'editor@newsroom.com'),
  now(), '{"provider":"email","providers":["email"]}',
  '{"name":"Sunita Rao","role":"reporter"}',
  now(), now(), '', '', '', ''
);

INSERT INTO profiles (id, reporter_id, role)
SELECT au.id, r.id, 'reporter'
FROM auth.users au JOIN reporters r ON r.email = au.email
WHERE au.email = 'sunita@newsroom.com'
ON CONFLICT (id) DO UPDATE SET role = 'reporter', reporter_id = EXCLUDED.reporter_id;