-- Create users directly via SQL
SELECT supabase_admin.create_user(
  '{"email": "editor@newsroom.com", "password": "editor123", "email_confirmed": true}'::jsonb
);