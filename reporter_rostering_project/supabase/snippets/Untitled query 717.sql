-- Update password using pgcrypto
UPDATE auth.users 
SET 
  encrypted_password = crypt('editor123', gen_salt('bf')),
  updated_at = now()
WHERE email = 'editor@newsroom.com';

-- Verify
SELECT email, email_confirmed_at, updated_at FROM auth.users WHERE email = 'editor@newsroom.com';