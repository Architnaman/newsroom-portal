CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'role', 'reporter'));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

