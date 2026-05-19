INSERT INTO profiles (id, reporter_id, role)
SELECT au.id, r.id, 'reporter'
FROM auth.users au
JOIN reporters r ON r.email = au.email
WHERE au.email = 'priya@newsroom.com'
ON CONFLICT (id) DO UPDATE SET role = 'reporter', reporter_id = EXCLUDED.reporter_id;