-- Delete the existing editor user and recreate properly
DELETE FROM profiles WHERE id = '6bc675d9-1430-4342-b836-1cbb04d1ede6';
DELETE FROM auth.users WHERE email = 'editor@newsroom.com';