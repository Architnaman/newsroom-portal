import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

let sessionId: string | null = null
function getSessionId(): string {
  if (!sessionId) {
    sessionId = crypto.randomUUID()
  }
  return sessionId
}

export function usePageTracking() {
  const location = useLocation()
  const { user, role, reporterId } = useAuth()

  useEffect(() => {
    if (!user) {
      console.log('[tracking] skipped — no user yet')
      return
    }
    supabase.from('page_events').insert({
      user_id: user.id,
      reporter_id: reporterId || null,
      role: role || 'unknown',
      event_type: 'page_view',
      page_path: location.pathname,
      session_id: getSessionId(),
    }).then(({ error }) => {
      if (error) console.error('[tracking] insert failed:', error)
      else console.log('[tracking] page_view logged:', location.pathname)
    })
  }, [location.pathname, user])
}

export async function trackAction(actionName: string, role: string, userId: string, reporterId?: string | null) {
  await supabase.from('page_events').insert({
    user_id: userId,
    reporter_id: reporterId || null,
    role,
    event_type: 'action',
    page_path: window.location.pathname,
    action_name: actionName,
    session_id: getSessionId(),
  })
}