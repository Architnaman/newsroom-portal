CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  reporter_id uuid REFERENCES reporters(id),
  role varchar(20) NOT NULL DEFAULT 'reporter' CHECK (role IN ('editor','reporter'))
);