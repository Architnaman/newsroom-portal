# Newsroom Portal

## Wipro Laptop Setup (Cloud Supabase - No Installation Needed)

### Prerequisites
- Node.js and npm (must be allowed on Wipro laptop)

### Steps
1. Clone repo:
   git clone https://github.com/Architnaman/newsroom-portal.git

2. Go to project:
   cd newsroom-portal/newsroom-ui

3. Install dependencies:
   npm install

4. Create .env file in newsroom-ui folder:
   VITE_SUPABASE_URL=https://vhremychmjzpunymvopt.supabase.co
   VITE_SUPABASE_ANON_KEY=get_from_project_owner
   VITE_GROQ_API_KEY=get_from_project_owner

5. Run:
   npm run dev

6. Open browser: http://localhost:5173

## Personal Laptop Setup (Local Supabase)

### Prerequisites
- Node.js, npm, Supabase CLI, Docker Desktop

### Steps
1. Start Supabase:
   cd reporter_rostering_project
   supabase start
   supabase functions serve --env-file supabase/functions/.env

2. Create .env file in newsroom-ui folder:
   VITE_SUPABASE_URL=http://127.0.0.1:54321
   VITE_SUPABASE_ANON_KEY=get_from_local_supabase_dashboard
   VITE_GROQ_API_KEY=get_from_project_owner

3. Run:
   cd newsroom-ui
   npm run dev

4. Open browser: http://localhost:5173

## Login Credentials
| Role     | Email                  | Password  |
|----------|------------------------|-----------|
| Admin    | admin@newsroom.com     | admin123  |
| Editor   | editor@newsroom.com    | editor123 |
| Reporter | priya@newsroom.com     | editor123 |
| Reporter | arjun@newsroom.com     | editor123 |
| Reporter | fatima@newsroom.com    | editor123 |
| Reporter | ravi@newsroom.com      | editor123 |
| Reporter | sunita@newsroom.com    | editor123 |

## Features
- Editor Dashboard with story management
- Kanban Board with drag and drop
- Reporter Roster with availability tracking
- Calendar with story deadlines
- Reporter Queue and availability management
- Leave request system with override workflow
- Holiday blocking on public holidays
- Admin portal with date format and week start settings
- AI Chatbot powered by Groq
- Dark/Light theme with font size controls
