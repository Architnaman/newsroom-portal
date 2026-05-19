UPDATE auth.users 
SET encrypted_password = (
  SELECT encrypted_password 
  FROM auth.users 
  WHERE email = 'editor@newsroom.com'
),
email_confirmed_at = now()
WHERE email = 'priya@newsroom.com';