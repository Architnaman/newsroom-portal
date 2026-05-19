import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const { data: failed } = await supabase
    .from('notification_log')
    .select('*')
    .eq('email_status', 'failed')
    .lt('retry_count', 3)

  let retried = 0
  for (const log of failed ?? []) {
    await supabase
      .from('notification_log')
      .update({ retry_count: log.retry_count + 1, email_status: 'pending' })
      .eq('id', log.id)
    retried++
  }

  return new Response(JSON.stringify({ retried }), {
    headers: { 'Content-Type': 'application/json' }
  })
})