# Newsroom OS - Reporter Assignment Portal

A full-stack newsroom management portal built with React + Supabase.

## Tech Stack
- Frontend: React + TypeScript + Vite
- Backend: Supabase (local)
- Edge Functions: Deno
- Auth: Supabase Auth

## Prerequisites
- Node.js 18+
- Supabase CLI (https://supabase.com/docs/guides/cli)
- Git
- Docker Desktop (required for local Supabase)

## Setup Instructions

### 1. Clone the repository
git clone https://github.com/Architnaman/newsroom-portal.git
cd newsroom-portal

### 2. Install Supabase CLI
npm install -g supabase

### 3. Start local Supabase
cd reporter_rostering_project
supabase start

When Supabase starts it will show credentials like this:

Development Tools:
  Studio  : http://127.0.0.1:54323
  Mailpit : http://127.0.0.1:54324

APIs:
  Project URL    : http://127.0.0.1:54321
  REST           : http://127.0.0.1:54321/rest/v1
  Edge Functions : http://127.0.0.1:54321/functions/v1

Database:
  URL : postgresql://postgres:postgres@127.0.0.1:54322/postgres

NOTE: Copy the Publishable and Secret keys shown after supabase start.
Use them in Step 5 and Step 7 below.

### 4. Run database migrations and seed data
supabase db reset

This will automatically create all tables and insert default reporters and users.

### 5. Setup Edge Functions environment
Create this file: reporter_rostering_project/supabase/functions/.env

Paste this content (replace with your keys from supabase start):
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=your-secret-key-here

### 6. Start Edge Functions
cd reporter_rostering_project
supabase functions serve --env-file supabase/functions/.env

### 7. Setup React app environment
Create this file: newsroom-ui/.env

Paste this content (replace with your keys from supabase start):
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=your-publishable-key-here

### 8. Install React dependencies and start
cd newsroom-ui
npm install
npm run dev

Open http://localhost:5173

## Default Login Credentials
Role       | Email                  | Password
-----------|------------------------|----------
Editor     | editor@newsroom.com    | editor123
Reporter 1 | priya@newsroom.com     | editor123
Reporter 2 | arjun@newsroom.com     | editor123
Reporter 3 | fatima@newsroom.com    | editor123
Reporter 4 | ravi@newsroom.com      | editor123
Reporter 5 | sunita@newsroom.com    | editor123

## Reporter Beats
Reporter     | Beats                  | Complexity Level
-------------|------------------------|------------------
Priya Mehta  | Politics, Economy      | Auto-calculated
Arjun Sharma | Tech, Science          | Auto-calculated
Fatima Nair  | Crime, Local           | Auto-calculated
Ravi Iyer    | Sports, Entertainment  | Auto-calculated
Sunita Rao   | Business, Economy      | Auto-calculated

## Features
- Editor Dashboard with this-week story management
- Kanban board with 5 columns
- AI-powered reporter scoring engine
- Leave management with Approve and Reject
- Weekly availability tracking
- Reporter roster with availability grid
- Word document filing system
- Editor feedback on publish
- Reassign story with reason
- Auto complexity level calculation

## Running Both Servers

Terminal 1 - Supabase Functions:
  cd reporter_rostering_project
  supabase functions serve --env-file supabase/functions/.env

Terminal 2 - React App:
  cd newsroom-ui
  npm run dev

## Folder Structure
newsroom-portal/
├── reporter_rostering_project/    (Supabase backend)
│   ├── supabase/
│   │   ├── migrations/            (Database schema)
│   │   ├── functions/             (Edge functions)
│   │   │   └── score-reporters/   (Scoring engine)
│   │   └── seed.sql               (Default data)
└── newsroom-ui/                   (React frontend)
    └── src/
        ├── pages/
        ├── components/
        ├── context/
        └── lib/