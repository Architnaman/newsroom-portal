import { supabase } from './supabase'

interface NotificationParams {
  recipient_email: string
  subject: string
  body_lines: string[]
  notification_type: string
  reporter_id?: string
  story_id?: string
}

export async function sendNotification(params: NotificationParams) {
  try {
    const { data, error } = await supabase.functions.invoke('send-notification', {
      body: params,
    })
    if (error) {
      console.error('Notification failed:', error)
    }
    return { data, error }
  } catch (err) {
    console.error('Notification error:', err)
    return { data: null, error: err }
  }
}