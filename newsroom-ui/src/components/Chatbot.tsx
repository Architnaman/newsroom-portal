import { useState, useRef, useEffect } from "react"
import { supabase } from "../lib/supabase"
import { useAuth } from "../context/AuthContext"

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY

export default function Chatbot() {
  const { role, reporterId } = useAuth()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([
    {
      role: "assistant", text: role === "editor"
        ? "Hi Editor! I can help you create stories, assign reporters, approve leaves and publish stories. What would you like to do?"
        : "Hi Reporter! I can help you start working on stories, file leaves, check your stories and update availability. What would you like to do?"
    }
  ])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  async function getDBContext() {
    if (role === "editor") {
      const { data: stories } = await supabase.from("stories").select("id, headline, status, category, urgency, deadline, complexity, priority").order("created_at", { ascending: false }).limit(10)
      const { data: reporters } = await supabase.from("reporters").select("id, name, email, beats, status, max_stories_per_week, complexity_level").eq("status", "active")
      const { data: leaves } = await supabase.from("leave_requests").select("id, reporter_id, leave_date, leave_type, status, notes").in("status", ["pending", "acknowledged"])
      const { data: assignments } = await supabase.from("assignments").select("story_id, reporter_id").eq("is_active", true)
      const { data: availability } = await supabase.from("availability").select("reporter_id, week_start_date, available_days")
      const today = new Date().toISOString().split("T")[0]

      const reporterAvailability = reporters?.map(r => {
        const reporterLeaves = leaves?.filter(l => l.reporter_id === r.id) || []
        const reporterAvail = availability?.find(a => a.reporter_id === r.id)
        return {
          id: r.id,
          name: r.name,
          leaves: reporterLeaves.map(l => ({ date: l.leave_date, status: l.status })),
          available_days: reporterAvail?.available_days || [],
          is_on_leave_today: reporterLeaves.some(l => l.leave_date === today)
        }
      })

      return { stories, reporters, leaves, assignments, reporterAvailability, today }
    } else {
      const { data: myAssignments } = await supabase.from("assignments").select("*, stories(*)").eq("reporter_id", reporterId).eq("is_active", true)
      const { data: leaves } = await supabase.from("leave_requests").select("*").eq("reporter_id", reporterId)
      const { data: availability } = await supabase.from("availability").select("*").eq("reporter_id", reporterId)
      const { data: overrideAssignments } = await supabase.from("assignments").select("*, stories(*)").eq("reporter_id", reporterId).eq("is_active", true).eq("is_override", true).eq("override_status", "pending")
      return { myAssignments, leaves, availability, overrideAssignments }
    }
  }

  async function executeAction(action: any) {
    try {
      if (action.type === "create_story") {
        const { data, error } = await supabase.from("stories").insert({
          headline: action.headline,
          category: action.category || "General",
          urgency: action.urgency || "normal",
          complexity: action.complexity || 3,
          priority: action.priority || 3,
          deadline: action.deadline,
          description: action.description || "",
          status: "unassigned"
        }).select().single()
        if (error) return "Failed to create story: " + error.message
        return "Story created! Headline: " + data.headline + " | Deadline: " + data.deadline + " | Status: UNASSIGNED"
      }

      if (action.type === "approve_leave") {
        const { data: leave } = await supabase.from("leave_requests").select("*").eq("id", action.leave_id).single()
        if (leave) {
          const leaveDate = new Date(leave.leave_date + "T00:00:00Z")
          const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
          const dayName = days[leaveDate.getUTCDay()]
          const d = new Date()
          const day = d.getDay()
          const diff = d.getDate() - day + (day === 0 ? -6 : 1)
          d.setDate(diff)
          const weekStart = d.toISOString().split("T")[0]
          const { data: avail } = await supabase.from("availability").select("*").eq("reporter_id", leave.reporter_id).eq("week_start_date", weekStart).maybeSingle()
          if (avail) {
            const updatedDays = avail.available_days.filter((d: string) => d !== dayName)
            await supabase.from("availability").update({ available_days: updatedDays }).eq("id", avail.id)
          }
        }
        await supabase.from("leave_requests").update({ status: "acknowledged", acknowledged_at: new Date().toISOString() }).eq("id", action.leave_id)
        return "Leave approved! Day removed from reporter availability."
      }

      if (action.type === "reject_leave") {
        await supabase.from("leave_requests").update({ status: "rejected", reject_reason: action.reason }).eq("id", action.leave_id)
        return "Leave rejected with reason: " + action.reason
      }

      if (action.type === "assign_story") {
        await supabase.from("assignments").update({ is_active: false }).eq("story_id", action.story_id)
        await supabase.from("assignments").insert({
          story_id: action.story_id,
          reporter_id: action.reporter_id,
          is_active: true,
          is_override: false
        })
        await supabase.from("stories").update({ status: "assigned" }).eq("id", action.story_id)
        return "Story assigned successfully!"
      }

      if (action.type === "override_assign_story") {
        await supabase.from("assignments").update({ is_active: false }).eq("story_id", action.story_id)
        await supabase.from("assignments").insert({
          story_id: action.story_id,
          reporter_id: action.reporter_id,
          is_active: true,
          is_override: true,
          override_reason: action.reason,
          override_status: "pending"
        })
        await supabase.from("stories").update({ status: "assigned" }).eq("id", action.story_id)
        return "Story assigned with override! Reporter will be notified to accept or reject with a reason."
      }

      if (action.type === "accept_override") {
        await supabase.from("assignments").update({
          override_status: "accepted",
          override_response: action.response,
          override_responded_at: new Date().toISOString()
        }).eq("id", action.assignment_id)
        return "Assignment accepted! You have committed to covering this story."
      }

      if (action.type === "reject_override") {
        await supabase.from("assignments").update({
          override_status: "rejected",
          override_response: action.response,
          override_responded_at: new Date().toISOString()
        }).eq("id", action.assignment_id)
        await supabase.from("stories").update({ status: "unassigned" }).eq("id", action.story_id)
        return "Assignment rejected. Story moved back to unassigned. Editor will be notified."
      }

      if (action.type === "publish_story") {
        await supabase.from("stories").update({
          status: "published",
          published_at: new Date().toISOString(),
          editor_feedback: action.feedback || null,
          feedback_at: action.feedback ? new Date().toISOString() : null
        }).eq("id", action.story_id)
        return "Story published!" + (action.feedback ? " Feedback sent to reporter." : "")
      }

      if (action.type === "start_working") {
        await supabase.from("stories").update({ status: "in_progress" }).eq("id", action.story_id)
        return "Story status updated to IN PROGRESS!"
      }

      if (action.type === "file_leave") {
        await supabase.from("leave_requests").insert({
          reporter_id: reporterId,
          leave_date: action.leave_date,
          leave_type: action.leave_type || "planned",
          is_immediate: action.leave_type === "sick" || action.leave_type === "emergency",
          notes: action.notes || "",
          status: "pending"
        })
        return "Leave request filed for " + action.leave_date + " (" + (action.leave_type || "planned") + "). Waiting for editor approval."
      }

      if (action.type === "update_availability") {
        const d = new Date()
        const day = d.getDay()
        const diff = d.getDate() - day + (day === 0 ? -6 : 1)
        d.setDate(diff)
        const weekStart = d.toISOString().split("T")[0]
        const { data: existing } = await supabase.from("availability").select("*").eq("reporter_id", reporterId).eq("week_start_date", weekStart).maybeSingle()
        if (existing) {
          await supabase.from("availability").update({ available_days: action.days }).eq("id", existing.id)
        } else {
          await supabase.from("availability").insert({ reporter_id: reporterId, week_start_date: weekStart, available_days: action.days })
        }
        return "Availability updated! Days: " + action.days.join(", ")
      }

      return "Action completed!"
    } catch (err: any) {
      return "Error: " + err.message
    }
  }

  async function sendMessage() {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput("")
    setMessages(prev => [...prev, { role: "user", text: userMsg }])
    setLoading(true)

    try {
      const dbContext = await getDBContext()
      const today = new Date().toISOString().split("T")[0]

      const systemPrompt = role === "editor"
        ? `You are an AI assistant for a Newsroom OS portal helping an EDITOR.
Today is ${today}.
Database context: ${JSON.stringify(dbContext)}

IMPORTANT - Before suggesting reporters for assignment:
- Check reporterAvailability in the context
- If a reporter has is_on_leave_today = true, clearly say they are ON LEAVE today
- If a reporter has no available_days, say they are UNAVAILABLE
- Still ALLOW editor to override-assign with a valid reason

You can perform these actions by returning JSON:
1. Create story: {"action": {"type": "create_story", "headline": "...", "category": "Politics/Economy/Tech/Science/Crime/Local/Sports/Entertainment/Business", "urgency": "breaking/high/normal/low", "complexity": 1-5, "priority": 1-5, "deadline": "YYYY-MM-DD", "description": "..."}}
2. Normal assign: {"action": {"type": "assign_story", "story_id": "...", "reporter_id": "..."}}
3. Override assign (reporter unavailable): {"action": {"type": "override_assign_story", "story_id": "...", "reporter_id": "...", "reason": "editor reason"}}
4. Approve leave: {"action": {"type": "approve_leave", "leave_id": "..."}}
5. Reject leave: {"action": {"type": "reject_leave", "leave_id": "...", "reason": "..."}}
6. Publish story: {"action": {"type": "publish_story", "story_id": "...", "feedback": "optional"}}

RULES:
- Always check reporterAvailability before suggesting reporters
- If reporter is on leave or unavailable, clearly mention it and ask for override reason
- If editor wants to assign to unavailable reporter, ask for reason then use override_assign_story
- Deadline must be within current week (${today} to Sunday)
- When executing return ONLY valid JSON: {"action": {...}, "message": "..."}
- When asking questions return ONLY plain text
- Never wrap JSON in markdown code blocks
- Be friendly and conversational`
        : `You are an AI assistant for a Newsroom OS portal helping a REPORTER.
Today is ${today}.
Reporter ID: ${reporterId}
Database context: ${JSON.stringify(dbContext)}

IMPORTANT:
- Check overrideAssignments in context
- If there are pending override assignments (is_override=true, override_status=pending), immediately inform the reporter and ask them to accept or reject with a reason
- Override accept/reject is ONLY for assignments where is_override = true

You can perform these actions by returning JSON:
1. Start working: {"action": {"type": "start_working", "story_id": "..."}}
2. File leave: {"action": {"type": "file_leave", "leave_date": "YYYY-MM-DD", "leave_type": "planned/sick/emergency", "notes": "..."}}
3. Update availability: {"action": {"type": "update_availability", "days": ["Mon","Tue","Wed","Thu","Fri"]}}
4. Accept override: {"action": {"type": "accept_override", "assignment_id": "...", "response": "reason for accepting"}}
5. Reject override: {"action": {"type": "reject_override", "assignment_id": "...", "story_id": "...", "response": "reason for rejecting"}}

RULES:
- If reporter has pending override assignments proactively tell them
- If fields are missing ask for them one by one
- When executing return ONLY valid JSON: {"action": {...}, "message": "..."}
- When asking questions return ONLY plain text
- Never wrap JSON in markdown code blocks
- Be friendly and conversational`

      const conversationHistory = messages.slice(-6).map(m => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.text
      }))
      conversationHistory.push({ role: "user", content: userMsg })

      const response = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + GROQ_API_KEY
          },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: [
              { role: "system", content: systemPrompt },
              ...conversationHistory
            ],
            temperature: 0.3,
            max_tokens: 1000
          })
        }
      )

      const data = await response.json()

      if (!response.ok) {
        console.error("Groq API error:", data)
        setMessages(prev => [...prev, { role: "assistant", text: "API Error: " + (data.error?.message || "Unknown error") }])
        setLoading(false)
        return
      }

      const rawText = data.choices?.[0]?.message?.content || "Sorry I could not process that."
      let assistantMessage = rawText

      try {
        const cleanText = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
        const parsed = JSON.parse(cleanText)
        if (parsed.action) {
          const actionResult = await executeAction(parsed.action)
          assistantMessage = (parsed.message || "") + "\n\n" + actionResult
          window.dispatchEvent(new Event("newsroom-refresh"))
        }
      } catch (e) {
        assistantMessage = rawText
      }

      setMessages(prev => [...prev, { role: "assistant", text: assistantMessage }])
    } catch (err: any) {
      console.error("Chatbot error:", err)
      setMessages(prev => [...prev, { role: "assistant", text: "Sorry something went wrong: " + err.message }])
    }
    setLoading(false)
  }

  return (
    <div style={{ position: "fixed", bottom: "24px", right: "24px", zIndex: 9999, fontFamily: "DM Mono, Courier New, monospace" }}>
      {open && (
        <div style={{ width: "380px", height: "520px", background: "#0d0d14", border: "1px solid rgba(255,180,0,0.3)", borderRadius: "12px", display: "flex", flexDirection: "column", marginBottom: "12px", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ color: "#ffb400", fontSize: "13px", fontWeight: "700", letterSpacing: "1px" }}>NEWSROOM AI</div>
              <div style={{ color: "#555", fontSize: "10px" }}>{role === "editor" ? "Editor Assistant" : "Reporter Assistant"}</div>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#555", fontSize: "18px", cursor: "pointer" }}>X</button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: "80%", padding: "10px 14px",
                  borderRadius: msg.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                  background: msg.role === "user" ? "rgba(255,180,0,0.15)" : "rgba(255,255,255,0.04)",
                  border: msg.role === "user" ? "1px solid rgba(255,180,0,0.3)" : "1px solid rgba(255,255,255,0.06)",
                  color: msg.role === "user" ? "#ffb400" : "#ddd",
                  fontSize: "12px", lineHeight: 1.6, whiteSpace: "pre-wrap"
                }}>
                  {msg.text}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div style={{ padding: "10px 14px", borderRadius: "12px 12px 12px 2px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", color: "#555", fontSize: "12px" }}>
                  Thinking...
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: "8px" }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
              placeholder="Type a message..."
              style={{ flex: 1, padding: "10px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "#fff", fontSize: "12px", outline: "none", fontFamily: "inherit" }}
            />
            <button onClick={sendMessage} disabled={loading}
              style={{ padding: "10px 16px", background: "#ffb400", border: "none", borderRadius: "6px", color: "#0a0a0f", fontSize: "12px", fontWeight: "700", cursor: "pointer", fontFamily: "inherit", opacity: loading ? 0.6 : 1 }}>
              SEND
            </button>
          </div>
        </div>
      )}

      <button onClick={() => setOpen(!open)}
        style={{ width: "56px", height: "56px", borderRadius: "50%", background: "#ffb400", border: "none", cursor: "pointer", fontSize: "24px", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 20px rgba(255,180,0,0.4)", marginLeft: "auto" }}>
        {open ? "X" : "AI"}
      </button>
    </div>
  )
}