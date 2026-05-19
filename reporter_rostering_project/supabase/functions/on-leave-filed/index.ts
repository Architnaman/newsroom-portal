import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
  try {
    const payload = await req.json()
    const leave = payload.record

    if (!leave.is_immediate) {
      return new Response(JSON.stringify({ skipped: true }), { status: 200 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: reporter } = await supabase
      .from('reporters').select('name, email').eq('id', leave.reporter_id).single()

    const { data: affected } = await supabase
      .from('assignments')
      .select('story_id, stories(headline, urgency, deadline)')
      .eq('reporter_id', leave.reporter_id)
      .eq('is_active', true)

    const { data: editors } = await supabase
      .from('profiles')
      .select('reporter_id, reporters(email, name)')
      .eq('role', 'editor')

    for (const editor of editors ?? []) {
      const editorEmail = (editor.reporters as any)?.email
      if (!editorEmail) continue

      const storyList = affected?.map(a =>
        `<li>${(a.stories as any)?.headline} — ${(a.stories as any)?.urgency} — due ${(a.stories as any)?.deadline}</li>`
      ).join('') || '<li>No active stories</li>'

      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
        body: JSON.stringify({
          to: editorEmail,
          subject: `${reporter?.name} on leave — stories affected`,
          html: `<h2>${reporter?.name} has filed emergency leave</h2><ul>${storyList}</ul>`,
          recipient_id: editor.reporter_id,
          type: 'emergency_leave',
          reference_id: leave.id
        })
      })
    }

    return new Response(JSON.stringify({ notified: true }), { status: 200 })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})