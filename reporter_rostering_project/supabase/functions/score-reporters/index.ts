import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

function getDayName(dateStr) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  const date = new Date(dateStr + "T00:00:00Z")
  return days[date.getUTCDay()]
}

function getCurrentWeekStart() {
  const d = new Date()
  const day = d.getUTCDay()
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1)
  d.setUTCDate(diff)
  return d.toISOString().split("T")[0]
}

function getDatesInRange(startDate, endDate) {
  const dates = []
  const start = new Date(startDate + "T00:00:00Z")
  const end = new Date(endDate + "T00:00:00Z")
  const current = new Date(start)
  while (current <= end) {
    dates.push(current.toISOString().split("T")[0])
    current.setUTCDate(current.getUTCDate() + 1)
  }
  return dates
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { story_id } = await req.json()

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    )

    const { data: story } = await supabase
      .from("stories").select("*").eq("id", story_id).single()

    if (!story) {
      return new Response(JSON.stringify({ error: "Story not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    const today = new Date().toISOString().split("T")[0]
    const weekStart = getCurrentWeekStart()
    const datesToCheck = getDatesInRange(today, story.deadline)

    const { data: reporters } = await supabase
      .from("reporters").select("*").eq("status", "active")

    const { data: availability } = await supabase
      .from("availability").select("*").eq("week_start_date", weekStart)

    const { data: activeAssignments } = await supabase
      .from("assignments").select("reporter_id").eq("is_active", true)

    const { data: activeLeaves } = await supabase
      .from("leave_requests").select("reporter_id, leave_date, status")
      .in("status", ["pending", "acknowledged"])

    const assignmentCounts = {}
    activeAssignments?.forEach(a => {
      assignmentCounts[a.reporter_id] = (assignmentCounts[a.reporter_id] || 0) + 1
    })

    const leaveMap = {}
    activeLeaves?.forEach(l => {
      if (!leaveMap[l.reporter_id]) leaveMap[l.reporter_id] = new Set()
      leaveMap[l.reporter_id].add(l.leave_date)
    })

    const availMap = {}
    availability?.forEach(a => {
      availMap[a.reporter_id] = a.available_days
    })

    const scored = reporters
      ?.filter(r => {
        if ((assignmentCounts[r.id] || 0) >= r.max_stories_per_week) return false
        if (!availMap[r.id] || availMap[r.id].length === 0) return false
        const hasAtLeastOneAvailableDay = datesToCheck.some(date => {
          const dayName = getDayName(date)
          if (leaveMap[r.id]?.has(date)) return false
          return availMap[r.id].includes(dayName)
        })
        if (!hasAtLeastOneAvailableDay) return false
        return true
      })
      .map(r => {
        const activeCount = assignmentCounts[r.id] || 0
        const beatMatch = r.beats.includes(story.category) ? 1.0 : 0.2
        const availableDaysInRange = datesToCheck.filter(date => {
          const dayName = getDayName(date)
          if (leaveMap[r.id]?.has(date)) return false
          return availMap[r.id].includes(dayName)
        }).length
        const avail = datesToCheck.length > 0 ? availableDaysInRange / datesToCheck.length : 0
        const headroom = (r.max_stories_per_week - activeCount) / r.max_stories_per_week
        const reporterLevel = r.complexity_level ?? 3
        const complexityFit = 1 - Math.abs(story.complexity - reporterLevel) / 5

        let score
        if (story.urgency === "breaking") {
          score = (beatMatch * 0.35) + (avail * 0.40) + (headroom * 0.20) + (complexityFit * 0.05)
        } else {
          score = (beatMatch * 0.35) + (avail * 0.25) + (headroom * 0.20) + (complexityFit * 0.20)
        }
        score = Math.min(score + (r.beats.includes(story.category) ? 0.05 : 0), 1.0)

        return {
          reporter_id: r.id,
          name: r.name,
          email: r.email,
          beats: r.beats,
          complexity_level: reporterLevel,
          score: Math.round(score * 100) / 100,
          beat_match: beatMatch,
          availability: Math.round(avail * 100) / 100,
          headroom: Math.round(headroom * 100) / 100,
          complexity_fit: Math.round(complexityFit * 100) / 100,
          available_days: availableDaysInRange,
          total_days: datesToCheck.length,
          active_stories: activeCount
        }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)

    return new Response(JSON.stringify(scored), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    })
  }
})