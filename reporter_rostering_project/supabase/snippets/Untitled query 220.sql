create table if not exists reporters (
  id bigint generated always as identity primary key,
  name text,
  email text unique,
  beats text[],
  max_stories_per_week integer default 4,
  status text default 'active',
  created_at timestamptz default now()
);

alter table reporters enable row level security;

create policy "Allow all inserts"
on reporters
for insert
with check (true);

create policy "Allow all selects"
on reporters
for select
using (true);