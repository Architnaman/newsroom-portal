-- Insert directly into auth.users
INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
)
VALUES (
  gen_random_uuid(),
  'editor@newsroom.com',
  crypt('editor123', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}',
  '{"name":"Editor Admin","role":"editor"}'
);