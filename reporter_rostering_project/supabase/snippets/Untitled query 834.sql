INSERT INTO profiles (id, reporter_id, role)
SELECT au.id, r.id, 'editor'
FROM auth.users au
JOIN reporters r ON r.email = au.email
WHERE au.email = 'editor@newsroom.com'
ON CONFLICT (id) DO UPDATE SET role = 'editor', reporter_id = EXCLUDED.reporter_id;