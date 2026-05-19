-- Find and deactivate assignments for editor
UPDATE assignments 
SET is_active = false 
WHERE reporter_id = (
  SELECT id FROM reporters WHERE email = 'editor@newsroom.com'
);

-- Update those stories back to unassigned
UPDATE stories 
SET status = 'unassigned'
WHERE id IN (
  SELECT story_id FROM assignments 
  WHERE reporter_id = (
    SELECT id FROM reporters WHERE email = 'editor@newsroom.com'
  )
);

-- Now mark editor as inactive in reporters
UPDATE reporters 
SET status = 'inactive' 
WHERE email = 'editor'