-- Make sure email is confirmed
UPDATE auth.users 
SET email_confirmed_at = now()
WHERE email = 'editor@newsroom.com' AND email_confirmed_at IS NULL;