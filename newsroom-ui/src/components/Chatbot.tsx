import { useState, useRef, useEffect } from "react"
import { supabase } from "../lib/supabase"
import { useAuth } from "../context/AuthContext"
import { useTheme } from "../context/ThemeContext"

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY

export default function Chatbot() {
  const { role, reporterId } = useAuth()
  const { t } = useTheme()

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

  function isActionAllowedForRole(actionType: string): boolean {
    const editorOnlyActions = ["create_story", "assign_story", "override_assign_story", "approve_leave", "reject_leave", "publish_story"]
    const reporterOnlyActions = ["start_working", "file_leave", "update_availability", "accept_override", "reject_override"]
    if (role === "editor" && editorOnlyActions.includes(actionType)) return true
    if (role === "reporter" && reporterOnlyActions.includes(actionType)) return true
    return false
  }

  async function executeAction(action: any) {
    if (!isActionAllowedForRole(action.type)) {
      return "Sorry, you do not have permission to perform this action. " +
        (role === "reporter" ? "Only editors can create stories, assign reporters and publish stories." : "")
    }

    try {
      if (action.type === "create_story") {
        const { data, error } = await supabase.from("stories").insert({
          headline: action.headline, category: action.category || "General",
          urgency: action.urgency || "normal", complexity: action.complexity || 3,
          priority: action.priority || 3, deadline: action.deadline,
          description: action.description || "", status: "unassigned"
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
          const d = new Date(); const day = d.getDay()
          const diff = d.getDate() - day + (day === 0 ? -6 : 1); d.setDate(diff)
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
        await supabase.from("assignments").insert({ story_id: action.story_id, reporter_id: action.reporter_id, is_active: true, is_override: false })
        await supabase.from("stories").update({ status: "assigned" }).eq("id", action.story_id)
        return "Story assigned successfully!"
      }

      if (action.type === "override_assign_story") {
        await supabase.from("assignments").update({ is_active: false }).eq("story_id", action.story_id)
        await supabase.from("assignments").insert({ story_id: action.story_id, reporter_id: action.reporter_id, is_active: true, is_override: true, override_reason: action.reason, override_status: "pending" })
        await supabase.from("stories").update({ status: "assigned" }).eq("id", action.story_id)
        return "Story assigned with override! Reporter will be notified to accept or reject with a reason."
      }

      if (action.type === "accept_override") {
        await supabase.from("assignments").update({ override_status: "accepted", override_response: action.response, override_responded_at: new Date().toISOString() }).eq("id", action.assignment_id)
        return "Assignment accepted! You have committed to covering this story."
      }

      if (action.type === "reject_override") {
        await supabase.from("assignments").update({ override_status: "rejected", override_response: action.response, override_responded_at: new Date().toISOString() }).eq("id", action.assignment_id)
        await supabase.from("stories").update({ status: "unassigned" }).eq("id", action.story_id)
        return "Assignment rejected. Story moved back to unassigned. Editor will be notified."
      }

      if (action.type === "publish_story") {
        await supabase.from("stories").update({ status: "published", published_at: new Date().toISOString(), editor_feedback: action.feedback || null, feedback_at: action.feedback ? new Date().toISOString() : null }).eq("id", action.story_id)
        return "Story published!" + (action.feedback ? " Feedback sent to reporter." : "")
      }

      if (action.type === "start_working") {
        await supabase.from("stories").update({ status: "in_progress" }).eq("id", action.story_id)
        return "Story status updated to IN PROGRESS!"
      }

      if (action.type === "file_leave") {
        await supabase.from("leave_requests").insert({ reporter_id: reporterId, leave_date: action.leave_date, leave_type: action.leave_type || "planned", is_immediate: action.leave_type === "sick" || action.leave_type === "emergency", notes: action.notes || "", status: "pending" })
        return "Leave request filed for " + action.leave_date + " (" + (action.leave_type || "planned") + "). Waiting for editor approval."
      }

      if (action.type === "update_availability") {
        const d = new Date(); const day = d.getDay()
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); d.setDate(diff)
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

  function extractAndParseJSON(text: string) {
    let cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
    cleaned = cleaned.replace(/\}\}\s*,\s*"message"/g, '}, "message"')
    cleaned = cleaned.replace(/,\s*\}/g, '}')
    cleaned = cleaned.replace(/,\s*\]/g, ']')
    cleaned = cleaned.replace(/^\{\{/, '{')
    try {
      return JSON.parse(cleaned)
    } catch (e) {
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try { return JSON.parse(jsonMatch[0]) }
        catch (e2) { return null }
      }
      return null
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
1. Create story: {"action": {"type": "create_story", "headline": "...", "category": "Politics/Economy/Tech/Science/Crime/Local/Sports/Entertainment/Business", "urgency": "breaking/high/normal/low", "complexity": 1-5, "priority": 1-5, "deadline": "YYYY-MM-DD", "description": "..."}, "message": "..."}
2. Normal assign: {"action": {"type": "assign_story", "story_id": "...", "reporter_id": "..."}, "message": "..."}
3. Override assign: {"action": {"type": "override_assign_story", "story_id": "...", "reporter_id": "...", "reason": "..."}, "message": "..."}
4. Approve leave: {"action": {"type": "approve_leave", "leave_id": "..."}, "message": "..."}
5. Reject leave: {"action": {"type": "reject_leave", "leave_id": "...", "reason": "..."}, "message": "..."}
6. Publish story: {"action": {"type": "publish_story", "story_id": "...", "feedback": "optional"}, "message": "..."}

FIELD VALIDATION RULES:
- For create_story: ALWAYS ask for headline first, then deadline, then category, then urgency one by one if not provided
- For assign_story: ALWAYS ask which story and which reporter if not specified
- NEVER create or assign with placeholder or default values
- NEVER assume any field — always ask the user

CRITICAL JSON RULES:
- Return ONLY a single valid JSON object with exactly two keys: "action" and "message"
- The format MUST be: {"action": {...}, "message": "..."}
- NEVER use double closing braces like }}
- NEVER add text before or after the JSON
- NEVER wrap in markdown code blocks
- When asking questions return ONLY plain text with no JSON
- Be friendly and conversational`

        : `You are an AI assistant for a Newsroom OS portal helping a REPORTER.
Today is ${today}.
Reporter ID: ${reporterId}
Database context: ${JSON.stringify(dbContext)}

YOU ARE HELPING A REPORTER - NOT AN EDITOR.
REPORTERS CANNOT CREATE STORIES - STORIES ARE CREATED BY EDITORS ONLY.
REPORTERS CANNOT ASSIGN STORIES - ONLY EDITORS CAN ASSIGN.
REPORTERS CANNOT PUBLISH STORIES - ONLY EDITORS CAN PUBLISH.
REPORTERS CANNOT APPROVE OR REJECT LEAVES OF OTHERS.

If reporter asks to create a story say: "Only editors can create stories. Please contact your editor."
If reporter asks to assign a story say: "Only editors can assign stories."
If reporter asks to publish a story say: "Only editors can publish stories."

IMPORTANT:
- Check overrideAssignments in context
- If there are pending override assignments (is_override=true, override_status=pending), immediately inform the reporter and ask them to accept or reject with a reason

You can ONLY perform these actions for reporters:
1. Start working: {"action": {"type": "start_working", "story_id": "..."}, "message": "..."}
2. File leave: {"action": {"type": "file_leave", "leave_date": "YYYY-MM-DD", "leave_type": "planned/sick/emergency", "notes": "..."}, "message": "..."}
3. Update availability: {"action": {"type": "update_availability", "days": ["Mon","Tue","Wed","Thu","Fri"]}, "message": "..."}
4. Accept override: {"action": {"type": "accept_override", "assignment_id": "...", "response": "..."}, "message": "..."}
5. Reject override: {"action": {"type": "reject_override", "assignment_id": "...", "story_id": "...", "response": "..."}, "message": "..."}

FIELD VALIDATION RULES:
- For file_leave: ALWAYS ask for leave date and type if not provided
- For start_working: ALWAYS ask which story if multiple are assigned
- NEVER assume any field — always ask the user

CRITICAL JSON RULES:
- Return ONLY a single valid JSON object with exactly two keys: "action" and "message"
- The format MUST be: {"action": {...}, "message": "..."}
- NEVER use double closing braces like }}
- NEVER add text before or after the JSON
- NEVER wrap in markdown code blocks
- When asking questions return ONLY plain text with no JSON
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
            messages: [{ role: "system", content: systemPrompt }, ...conversationHistory],
            temperature: 0.1,
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

      const parsed = extractAndParseJSON(rawText)
      if (parsed && parsed.action) {
        const actionResult = await executeAction(parsed.action)
        assistantMessage = (parsed.message || "Done!") + "\n\n" + actionResult
        window.dispatchEvent(new Event("newsroom-refresh"))
      } else {
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
    <div style={{
      position: "fixed",
      bottom: "24px",
      right: "24px",
      zIndex: 9999,
      fontFamily: '"Inter", "DM Mono", "Courier New", monospace'
    }}>
      {open && (
        <div style={{
          width: "400px",
          height: "540px",
          background: t.bgCard,
          border: `1px solid ${t.accentBorder}`,
          borderRadius: "14px",
          display: "flex",
          flexDirection: "column",
          marginBottom: "12px",
          boxShadow: t.shadow,
          overflow: "hidden"
        }}>

          {/* Header */}
          <div style={{
            padding: "16px 20px",
            borderBottom: `1px solid ${t.borderCard}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: t.accentBg
          }}>
            <div>
              <div style={{
                color: t.accent,
                fontSize: "14px",
                fontWeight: "700",
                letterSpacing: "1px"
              }}>
                NEWSROOM AI
              </div>
              <div style={{
                color: t.textMuted,
                fontSize: "11px",
                fontWeight: "500",
                marginTop: "2px"
              }}>
                {role === "editor" ? "Editor Assistant" : "Reporter Assistant"}
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              style={{
                background: t.bgInput,
                border: `1px solid ${t.borderCard}`,
                color: t.textMuted,
                fontSize: "16px",
                cursor: "pointer",
                borderRadius: "6px",
                width: "32px",
                height: "32px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "inherit"
              }}>
              X
            </button>
          </div>

          {/* Messages */}
          <div style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            background: t.bgPage
          }}>
            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: msg.role === "user" ? "flex-end" : "flex-start"
                }}>
                <div style={{
                  maxWidth: "82%",
                  padding: "10px 14px",
                  borderRadius: msg.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                  background: msg.role === "user" ? t.accentBg : t.bgCard,
                  border: `1px solid ${msg.role === "user" ? t.accentBorder : t.borderCard}`,
                  color: msg.role === "user" ? t.accent : t.textPrimary,
                  fontSize: "13px",
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                  fontWeight: msg.role === "user" ? "500" : "400",
                  boxShadow: t.shadowCard
                }}>
                  {msg.text}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div style={{
                  padding: "10px 16px",
                  borderRadius: "14px 14px 14px 4px",
                  background: t.bgCard,
                  border: `1px solid ${t.borderCard}`,
                  color: t.textMuted,
                  fontSize: "13px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}>
                  <div style={{
                    width: "6px", height: "6px",
                    borderRadius: "50%",
                    background: t.accent,
                    animation: "pulse 1s infinite"
                  }} />
                  Thinking...
                  <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: "12px 16px",
            borderTop: `1px solid ${t.borderCard}`,
            display: "flex",
            gap: "8px",
            background: t.bgCard
          }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
              placeholder="Type a message..."
              aria-label="Chat message input"
              style={{
                flex: 1,
                padding: "10px 14px",
                background: t.bgInput,
                border: `1px solid ${t.borderInput}`,
                borderRadius: "8px",
                color: t.textPrimary,
                fontSize: "13px",
                outline: "none",
                fontFamily: "inherit",
                transition: "border-color 0.15s"
              }}
              onFocus={e => e.target.style.borderColor = t.accent}
              onBlur={e => e.target.style.borderColor = t.borderInput}
            />
            <button
              onClick={sendMessage}
              disabled={loading}
              aria-label="Send message"
              style={{
                padding: "10px 18px",
                background: loading ? t.textMuted : t.accent,
                border: "none",
                borderRadius: "8px",
                color: t.accentText,
                fontSize: "12px",
                fontWeight: "700",
                letterSpacing: "0.5px",
                cursor: loading ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                opacity: loading ? 0.6 : 1,
                transition: "all 0.15s"
              }}>
              SEND
            </button>
          </div>
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setOpen(!open)}
        aria-label={open ? "Close AI assistant" : "Open AI assistant"}
        aria-expanded={open}
        style={{
          width: "56px",
          height: "56px",
          borderRadius: "50%",
          background: t.accent,
          border: `2px solid ${t.accentBorder}`,
          cursor: "pointer",
          fontSize: "20px",
          fontWeight: "700",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: `0 4px 20px ${t.accent}40`,
          marginLeft: "auto",
          color: t.accentText,
          fontFamily: "inherit",
          transition: "all 0.15s"
        }}>
        {open ? "✕" : "AI"}
      </button>
    </div>
  )
}