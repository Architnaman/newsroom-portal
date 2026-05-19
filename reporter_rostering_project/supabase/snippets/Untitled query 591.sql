INSERT INTO auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change,
  email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated', 'authenticated',
  'priya@newsroom.com',
  '$2a$10$PnjEFcMPxE.IG/GC0u4H.OtXNJWLmdbkWBSGKbFl7R62oQ8rUVUKO',
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"name":"Priya Mehta","role":"reporter"}',
  now(), now(), '', '', '', ''
);