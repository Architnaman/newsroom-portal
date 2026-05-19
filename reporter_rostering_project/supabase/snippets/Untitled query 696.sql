-- Create editor user correctly
SELECT auth.create_user(
  '{"email": "editor@newsroom.com", "password": "editor123", "email_confirmed": true, "user_metadata": {"role": "editor", "name": "Editor Admin"}}'::jsonb
);