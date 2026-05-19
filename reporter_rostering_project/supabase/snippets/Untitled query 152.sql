SELECT au.email, p.role, r.name 
FROM auth.users au
JOIN profiles p ON p.id = au.id
JOIN reporters r ON r.id = p.reporter_id;