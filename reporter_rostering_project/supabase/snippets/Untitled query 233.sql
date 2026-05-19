UPDATE auth.users 
SET encrypted_password = crypt('reporter123', gen_salt('bf'))
WHERE email = 'priya@newsroom.com';