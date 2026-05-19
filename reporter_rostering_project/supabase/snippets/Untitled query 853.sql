create table if not exists profiles (
  id uuid references auth.users(id) on delete cascade,
  full_name text,
  role text,
  reporter_id text,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  primary key (id)
);

alter table profiles enable row level security;

create policy "Users can view own profile"
on profiles
for select
using (auth.uid() = id);

create policy "Users can insert own profile"
on profiles
for insert
with check (auth.uid() = id);

create policy "Users can update own profile"
on profiles
for update
using (auth.uid() = id);