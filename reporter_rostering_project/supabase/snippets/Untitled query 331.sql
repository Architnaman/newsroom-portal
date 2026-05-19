ALTER TABLE reporters 
ADD COLUMN IF NOT EXISTS complexity_level integer DEFAULT 3;

-- Update each reporter
UPDATE reporters SET complexity_level = 2 WHERE email = 'priya@newsroom.com';   -- junior
UPDATE reporters SET complexity_level = 4 WHERE email = 'arjun@newsroom.com';   -- senior
UPDATE reporters SET complexity_level = 3 WHERE email = 'fatima@newsroom.com';  -- mid
UPDATE reporters SET complexity_level = 5 WHERE email = 'ravi@newsroom.com';    -- expert
UPDATE reporters SET complexity_level = 4 WHERE email = 'sunita@newsroom.com';  -- senior