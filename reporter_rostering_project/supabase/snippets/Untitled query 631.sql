INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
)
VALUES (
  gen_random_uuid(),
  'priya@newsroom.com',
  crypt('reporter123', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}',
  '{"name":"Priya Mehta","role":"reporter"}'
);

INSERT INTO profiles (id, reporter_id, role)
SELECT au.id, r.id, 'reporter'
FROM auth.users au
JOIN reporters r ON r.email = au.email
WHERE au.email = 'priya@newsroom.com'
ON CONFLICT (id) DO UPDATE SET role = 'reporter', reporter_id = EXCLUDED.reporter_id;