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

4. Create .env file in newsroom-ui folder with these exact values:
   VITE_SUPABASE_URL=https://vhremychmjzpunymvopt.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZocmVteWNobWp6cHVueW12b3B0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NjAzMTMsImV4cCI6MjA5NTMzNjMxM30.n3H2W8PqEayuCvLLB5lLr7xejilhKThb81u5kx-AugQ
   VITE_GROQ_API_KEY=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

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
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRFA0NiK7URIqUfev2YJ8m3XOtqGMSj4txOwOqxbFec
   VITE_GROQ_API_KEY=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

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
