-- Clean up everything
DELETE FROM profiles WHERE id IN (SELECT id FROM auth.users WHERE email IN ('editor@newsroom.com', 'priya@newsroom.com'));
DELETE FROM auth.users WHERE email IN ('editor@newsroom.com', 'priya@newsroom.com');