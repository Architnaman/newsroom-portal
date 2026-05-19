import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import Navbar from "../components/Navbar"
import AssignModal from "../components/AssignModal"

const COLUMNS = [
  { key: "unassigned", label: "UNASSIGNED", color: "#555" },
  { key: "assigned", label: "ASSIGNED", color: "#ffb400" },
  { key: "in_progress", label: "IN PROGRESS", color: "#64c896" },
  { key: "filed", label: "FILED", color: "#8888ff" },
  { key: "published", label: "PUBLISHED", color: "#64c896" },
]

const urgencyColor = { breaking: "#ff4444", high: "#ff8800", normal: "#ffb400", low: "#64c896" }

export default function KanbanBoard() {
  const [stories, setStories] = useState([])
  const [assignMap, setAssignMap] = useState({})
  const [assignStory, setAssignStory] = useState(null)
  const [viewFile, setViewFile] = useState(null)
  const [feedbackModal, setFeedbackModal] = useState(null)
  const [feedback, setFeedback] = useState("")
  const [reassignModal, setReassignModal] = useState(null)
  const [reassignReason, setReassignReason] = useState("")
  const [publishing, setPublishing] = useState(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    const { data } = await supabase.from("stories").select("*").order("priority", { ascending: false })
    const { data: assignments } = await supabase.from("assignments").select("story_id, reporter_id").eq("is_active", true)
    const reporterIds = [...new Set((assignments || []).map(a => a.reporter_id))]
    const { data: reporters } = await supabase.from("reporters").select("id, name").in("id", reporterIds.length > 0 ? reporterIds : ["none"])
    const nameMap = {}
    reporters?.forEach(r => { nameMap[r.id] = r.name })
    const map = {}
    assignments?.forEach(a => { map[a.story_id] = nameMap[a.reporter_id] })
    setAssignMap(map)
    setStories(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    const channel = supabase.channel("kanban")
      .on("postgres_changes", { event: "*", schema: "public", table: "stories" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "assignments" }, load)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  async function publishStory(storyId, feedbackText) {
    setPublishing(storyId)
    await supabase.from("stories").update({
      status: "published",
      published_at: new Date().toISOString(),
      editor_feedback: feedbackText && feedbackText.trim() ? feedbackText.trim() : null,
      feedback_at: feedbackText && feedbackText.trim() ? new Date().toISOString() : null
    }).eq("id", storyId)
    setViewFile(null)
    setFeedbackModal(null)
    setFeedback("")
    await load()
    setPublishing(null)
  }

  async function reassignStory() {
    if (!reassignModal || !reassignReason.trim()) return
    await supabase.from("stories").update({
      status: "assigned",
      reassign_reason: reassignReason,
      filed_file_url: null,
      filed_file_name: null,
      filed_at: null
    }).eq("id", reassignModal.id)
    setReassignModal(null)
    setReassignReason("")
    setViewFile(null)
    await load()
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", fontFamily: '"DM Mono","Courier New",monospace' }}>
      <Navbar />
      <div style={{ padding: "24px", overflowX: "auto" }}>
        <div style={{ display: "flex", gap: "16px", minWidth: COLUMNS.length * 260 + "px" }}>
          {COLUMNS.map(col => {
            const colStories = stories.filter(s => s.status === col.key)
            return (
              <div key={col.key} style={{ flex: "0 0 240px", display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px", padding: "0 4px" }}>
                  <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: col.color }} />
                  <span style={{ color: col.color, fontSize: "10px", letterSpacing: "1.5px" }}>{col.label}</span>
                  <span style={{ marginLeft: "auto", background: "rgba(255,255,255,0.07)", color: "#666", fontSize: "10px", borderRadius: "10px", padding: "1px 8px" }}>{colStories.length}</span>
                </div>
                <div style={{ minHeight: "200px", background: "rgba(255,255,255,0.02)", borderRadius: "6px", padding: "8px", border: "1px solid rgba(255,255,255,0.05)", display: "flex", flexDirection: "column", gap: "8px" }}>
                  {loading && col.key === "unassigned" && (
                    <div style={{ color: "#555", fontSize: "12px", textAlign: "center", padding: "20px" }}>Loading...</div>
                  )}
                  {colStories.map(story => (
                    <div key={story.id}
                      style={{ padding: "12px", borderRadius: "5px", background: "#0d0d14", border: "1px solid " + (story.status === "filed" ? "rgba(136,136,255,0.25)" : story.status === "published" ? "rgba(100,200,150,0.25)" : "rgba(255,255,255,0.07)"), cursor: story.status === "unassigned" ? "pointer" : "default" }}
                      onClick={() => story.status === "unassigned" && setAssignStory(story)}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                        <span style={{ padding: "2px 5px", borderRadius: "3px", fontSize: "9px", background: urgencyColor[story.urgency] + "20", color: urgencyColor[story.urgency] }}>{story.urgency?.toUpperCase()}</span>
                        <span style={{ color: "#555", fontSize: "10px", background: "rgba(255,255,255,0.05)", padding: "1px 5px", borderRadius: "3px" }}>P{story.priority}</span>
                      </div>
                      <p style={{ color: "#ddd", fontSize: "12px", margin: "0 0 6px", lineHeight: 1.4 }}>{story.headline}</p>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                        <span style={{ color: "#444", fontSize: "10px" }}>{story.category}</span>
                        <span style={{ color: "#555", fontSize: "10px" }}>{story.deadline}</span>
                      </div>
                      {assignMap[story.id] && (
                        <div style={{ padding: "3px 8px", background: "rgba(255,180,0,0.06)", borderRadius: "3px", color: "#ffb400", fontSize: "10px", marginBottom: "6px" }}>
                          {assignMap[story.id]}
                        </div>
                      )}
                      {story.filed_file_name && (
                        <div style={{ padding: "3px 8px", background: "rgba(136,136,255,0.08)", borderRadius: "3px", color: "#8888ff", fontSize: "10px", marginBottom: "6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {story.filed_file_name}
                        </div>
                      )}
                      {story.editor_feedback && story.status === "published" && (
                        <div style={{ padding: "3px 8px", background: "rgba(255,180,0,0.06)", borderRadius: "3px", color: "#ffb400", fontSize: "10px", marginBottom: "6px" }}>
                          Feedback given
                        </div>
                      )}
                      {story.status === "published" && (
                        <div style={{ padding: "3px 8px", background: "rgba(100,200,150,0.08)", borderRadius: "3px", color: "#64c896", fontSize: "10px", marginBottom: "6px" }}>
                          Published
                        </div>
                      )}
                      {story.status === "unassigned" && (
                        <div style={{ color: "#ffb400", fontSize: "10px", marginTop: "4px" }}>Click to assign</div>
                      )}
                      {story.status === "filed" && (
                        <button onClick={e => { e.stopPropagation(); setViewFile(story) }}
                          style={{ width: "100%", padding: "7px", marginTop: "6px", background: "rgba(136,136,255,0.1)", border: "1px solid rgba(136,136,255,0.3)", borderRadius: "4px", color: "#8888ff", fontSize: "10px", letterSpacing: "1px", cursor: "pointer", fontFamily: "inherit" }}>
                          VIEW AND REVIEW
                        </button>
                      )}
                      {story.status === "published" && story.filed_file_url && (
                        <button onClick={e => { e.stopPropagation(); window.open(story.filed_file_url, "_blank") }}
                          style={{ width: "100%", padding: "7px", marginTop: "6px", background: "rgba(100,200,150,0.08)", border: "1px solid rgba(100,200,150,0.25)", borderRadius: "4px", color: "#64c896", fontSize: "10px", letterSpacing: "1px", cursor: "pointer", fontFamily: "inherit" }}>
                          OPEN REPORT
                        </button>
                      )}
                    </div>
                  ))}
                  {colStories.length === 0 && !loading && (
                    <div style={{ color: "#333", fontSize: "11px", textAlign: "center", padding: "20px 0" }}>Empty</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {assignStory && <AssignModal story={assignStory} onClose={() => setAssignStory(null)} onAssigned={load} />}

      {/* View File Modal */}
      {viewFile && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setViewFile(null) }}>
          <div style={{ background: "#0d0d14", border: "1px solid rgba(136,136,255,0.3)", borderRadius: "8px", width: "100%", maxWidth: "520px", margin: "24px", fontFamily: '"DM Mono","Courier New",monospace', overflow: "hidden", maxHeight: "90vh", overflowY: "auto" }}>

            <div style={{ padding: "20px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                  <span style={{ padding: "2px 8px", borderRadius: "3px", fontSize: "9px", background: "rgba(136,136,255,0.15)", color: "#8888ff", letterSpacing: "1px" }}>FILED</span>
                  <span style={{ color: "#555", fontSize: "11px" }}>{viewFile.category}</span>
                </div>
                <h2 style={{ color: "#fff", margin: 0, fontSize: "16px" }}>{viewFile.headline}</h2>
                <p style={{ color: "#555", fontSize: "11px", margin: "4px 0 0" }}>
                  By: <span style={{ color: "#888" }}>{assignMap[viewFile.id]}</span>
                  {viewFile.filed_at && <span> - {new Date(viewFile.filed_at).toLocaleDateString()}</span>}
                </p>
              </div>
              <button onClick={() => setViewFile(null)} style={{ background: "none", border: "none", color: "#555", fontSize: "20px", cursor: "pointer" }}>x</button>
            </div>

            <div style={{ padding: "20px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <p style={{ color: "#888", fontSize: "11px", letterSpacing: "1px", margin: "0 0 12px" }}>SUBMITTED WORD DOCUMENT</p>
              {viewFile.filed_file_url ? (
                <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px", background: "rgba(136,136,255,0.06)", border: "1px solid rgba(136,136,255,0.2)", borderRadius: "6px" }}>
                  <div style={{ fontSize: "32px" }}>📘</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: "#ddd", fontSize: "13px", marginBottom: "4px" }}>{viewFile.filed_file_name}</div>
                    <div style={{ color: "#555", fontSize: "11px" }}>Word Document</div>
                  </div>
                  <button onClick={() => window.open(viewFile.filed_file_url, "_blank")}
                    style={{ padding: "8px 16px", background: "rgba(136,136,255,0.15)", border: "1px solid rgba(136,136,255,0.3)", borderRadius: "4px", color: "#8888ff", fontSize: "11px", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                    OPEN FILE
                  </button>
                </div>
              ) : (
                <div style={{ color: "#555", fontSize: "12px", textAlign: "center", padding: "20px" }}>No file attached</div>
              )}
            </div>

            {viewFile.reassign_reason && (
              <div style={{ padding: "12px 24px", background: "rgba(255,136,0,0.05)", borderBottom: "1px solid rgba(255,136,0,0.1)" }}>
                <p style={{ color: "#888", fontSize: "10px", letterSpacing: "1px", margin: "0 0 4px" }}>PREVIOUS REASSIGN REASON</p>
                <p style={{ color: "#ff8800", fontSize: "12px", margin: 0 }}>{viewFile.reassign_reason}</p>
              </div>
            )}

            <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <p style={{ color: "#555", fontSize: "11px", letterSpacing: "1px", margin: "0 0 4px" }}>EDITOR ACTIONS</p>

              <button
                onClick={() => publishStory(viewFile.id, null)}
                disabled={publishing === viewFile.id}
                style={{ width: "100%", padding: "13px", background: "rgba(100,200,150,0.15)", border: "1px solid rgba(100,200,150,0.4)", borderRadius: "6px", color: "#64c896", fontSize: "12px", letterSpacing: "1px", fontWeight: "700", cursor: "pointer", fontFamily: "inherit", opacity: publishing === viewFile.id ? 0.6 : 1 }}>
                {publishing === viewFile.id ? "PUBLISHING..." : "APPROVE AND PUBLISH"}
              </button>

              <button
                onClick={() => { setFeedbackModal(viewFile); setViewFile(null); setFeedback("") }}
                style={{ width: "100%", padding: "13px", background: "rgba(255,180,0,0.08)", border: "1px solid rgba(255,180,0,0.25)", borderRadius: "6px", color: "#ffb400", fontSize: "12px", letterSpacing: "1px", cursor: "pointer", fontFamily: "inherit" }}>
                💬 PUBLISH WITH FEEDBACK
              </button>

              <button
                onClick={() => { setReassignModal(viewFile); setViewFile(null) }}
                style={{ width: "100%", padding: "13px", background: "rgba(255,136,0,0.1)", border: "1px solid rgba(255,136,0,0.3)", borderRadius: "6px", color: "#ff8800", fontSize: "12px", letterSpacing: "1px", cursor: "pointer", fontFamily: "inherit" }}>
                REASSIGN WITH REASON
              </button>

              <button onClick={() => setViewFile(null)}
                style={{ width: "100%", padding: "11px", background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "#555", fontSize: "12px", cursor: "pointer", fontFamily: "inherit" }}>
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Feedback Modal - separate from view file */}
      {feedbackModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) { setFeedbackModal(null); setFeedback("") } }}>
          <div style={{ background: "#0d0d14", border: "1px solid rgba(255,180,0,0.3)", borderRadius: "8px", width: "100%", maxWidth: "480px", margin: "24px", padding: "24px", fontFamily: '"DM Mono","Courier New",monospace' }}>

            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
              <h2 style={{ color: "#fff", margin: 0, fontSize: "16px" }}>Publish with Feedback</h2>
              <button onClick={() => { setFeedbackModal(null); setFeedback("") }} style={{ background: "none", border: "none", color: "#555", fontSize: "20px", cursor: "pointer" }}>x</button>
            </div>

            <p style={{ color: "#555", fontSize: "12px", margin: "0 0 20px" }}>
              Story: <span style={{ color: "#ddd" }}>{feedbackModal.headline}</span>
            </p>

            <div style={{ padding: "10px 14px", background: "rgba(255,180,0,0.06)", border: "1px solid rgba(255,180,0,0.15)", borderRadius: "5px", marginBottom: "20px" }}>
              <p style={{ color: "#ffb400", fontSize: "11px", margin: 0 }}>
                Write your feedback for <span style={{ color: "#fff" }}>{assignMap[feedbackModal.id]}</span>. This is optional but will be visible to the reporter after publishing.
              </p>
            </div>

            <div style={{ marginBottom: "20px" }}>
              <label style={{ color: "#888", fontSize: "11px", letterSpacing: "1px", display: "block", marginBottom: "8px" }}>
                YOUR FEEDBACK <span style={{ color: "#555" }}>(optional)</span>
              </label>
              <textarea
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                rows={5}
                placeholder="Great work! The lead paragraph was compelling. The source quotes added credibility. Next time, consider adding more data points in the analysis section..."
                style={{ width: "100%", padding: "12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,180,0,0.2)", borderRadius: "6px", color: "#fff", fontSize: "13px", outline: "none", boxSizing: "border-box", fontFamily: "inherit", resize: "none", lineHeight: 1.6 }}
              />
              <p style={{ color: "#444", fontSize: "10px", margin: "6px 0 0", textAlign: "right" }}>
                {feedback.length} characters
              </p>
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => { setFeedbackModal(null); setFeedback("") }}
                style={{ flex: 1, padding: "11px", background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "#666", fontSize: "12px", cursor: "pointer", fontFamily: "inherit" }}>
                CANCEL
              </button>
              <button
                onClick={() => publishStory(feedbackModal.id, feedback)}
                disabled={publishing === feedbackModal.id}
                style={{ flex: 2, padding: "11px", background: "rgba(100,200,150,0.15)", border: "1px solid rgba(100,200,150,0.4)", borderRadius: "6px", color: "#64c896", fontSize: "12px", fontWeight: "700", cursor: "pointer", fontFamily: "inherit", opacity: publishing === feedbackModal.id ? 0.6 : 1 }}>
                {publishing === feedbackModal.id ? "PUBLISHING..." : feedback.trim() ? "PUBLISH WITH FEEDBACK" : "PUBLISH WITHOUT FEEDBACK"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reassign Modal */}
      {reassignModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) { setReassignModal(null); setReassignReason("") } }}>
          <div style={{ background: "#0d0d14", border: "1px solid rgba(255,136,0,0.3)", borderRadius: "8px", width: "100%", maxWidth: "420px", margin: "24px", padding: "24px", fontFamily: '"DM Mono","Courier New",monospace' }}>
            <h2 style={{ color: "#fff", margin: "0 0 6px", fontSize: "16px" }}>Reassign Story</h2>
            <p style={{ color: "#555", fontSize: "12px", margin: "0 0 16px" }}>Story: <span style={{ color: "#ddd" }}>{reassignModal.headline}</span></p>
            <div style={{ padding: "10px 14px", background: "rgba(255,136,0,0.08)", border: "1px solid rgba(255,136,0,0.2)", borderRadius: "5px", marginBottom: "16px" }}>
              <p style={{ color: "#ff8800", fontSize: "11px", margin: 0 }}>Story moves back to ASSIGNED. Reporter will see your reason and must refile.</p>
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label style={{ color: "#888", fontSize: "11px", letterSpacing: "1px", display: "block", marginBottom: "6px" }}>REASON FOR REASSIGNMENT</label>
              <textarea value={reassignReason} onChange={e => setReassignReason(e.target.value)} rows={4}
                placeholder="Explain what needs to be changed..."
                style={{ width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "#fff", fontSize: "13px", outline: "none", boxSizing: "border-box", fontFamily: "inherit", resize: "none" }} />
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => { setReassignModal(null); setReassignReason("") }}
                style={{ flex: 1, padding: "11px", background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "#666", fontSize: "12px", cursor: "pointer", fontFamily: "inherit" }}>CANCEL</button>
              <button onClick={reassignStory} disabled={!reassignReason.trim()}
                style={{ flex: 1, padding: "11px", background: reassignReason.trim() ? "rgba(255,136,0,0.15)" : "rgba(255,255,255,0.03)", border: "1px solid " + (reassignReason.trim() ? "rgba(255,136,0,0.4)" : "rgba(255,255,255,0.08)"), borderRadius: "6px", color: reassignReason.trim() ? "#ff8800" : "#444", fontSize: "12px", fontWeight: "700", cursor: reassignReason.trim() ? "pointer" : "not-allowed", fontFamily: "inherit", opacity: reassignReason.trim() ? 1 : 0.5 }}>
                CONFIRM REASSIGN
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}