import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Role = 'editor' | 'reporter'

export interface Reporter { id: string; name: string; email: string; beats: string[]; max_stories_per_week: number; status: string; created_at: string }

export interface Story { id: string; headline: string; category: string; complexity: number; urgency: 'breaking'|'high'|'normal'|'low'; priority: number; status: string; deadline: string; description?: string; created_by?: string; created_at: string }

export interface LeaveRequest { id: string; reporter_id: string; leave_date: string; leave_type: 'planned'|'sick'|'emergency'; is_immediate: boolean; status: string; notes?: string; created_at: string }