-- Update password for editor
UPDATE auth.users 
SET encrypted_password = crypt('editor123', gen_salt('bf'))
WHERE email = 'editor@newsroom.com';