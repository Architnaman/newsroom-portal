import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const cutoff = yesterday.toISOString()

  const { data: pending } = await supabase
    .from('leave_requests')
    .select('*, reporters(name, email)')
    .eq('status', 'pending')
    .lt('created_at', cutoff)

  const { data: editors } = await supabase
    .from('profiles')
    .select('reporter_id, reporters(email)')
    .eq('role', 'editor')

  for (const leave of pending ?? []) {
    for (const editor of editors ?? []) {
      const editorEmail = (editor.reporters as any)?.email
      if (!editorEmail) continue

      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
        },
        body: JSON.stringify({
          to: editorEmail,
          subject: `Reminder: Unacknowledged leave request`,
          html: `
            <h2>Leave Request Pending Acknowledgement</h2>
            <p><strong>Reporter:</strong> ${(leave.reporters as any)?.name}</p>
            <p><strong>Leave Date:</strong> ${leave.leave_date}</p>
            <p><strong>Type:</strong> ${leave.leave_type}</p>
            <p>Please log in to the dashboard to acknowledge this request.</p>
          `,
          recipient_id: editor.reporter_id,
          type: 'leave_escalation',
          reference_id: leave.id
        })
      })
    }
  }

  return new Response(JSON.stringify({ escalated: pending?.length ?? 0 }), {
    headers: { 'Content-Type': 'application/json' }
  })
})