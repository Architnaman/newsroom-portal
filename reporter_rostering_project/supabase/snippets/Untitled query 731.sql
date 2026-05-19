-- Run this to see all your tables
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;