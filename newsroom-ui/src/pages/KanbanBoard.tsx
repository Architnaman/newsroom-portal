import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import Navbar from "../components/Navbar"
import AssignModal from "../components/AssignModal"
import { useTheme } from "../context/ThemeContext"
import { useCollapse } from "../hooks/useCollapse"

export default function KanbanBoard() {
  const { t } = useTheme()
  const { toggle, isCollapsed } = useCollapse('kanban', [
    'unassigned', 'assigned', 'in_progress', 'filed', 'published'
  ])

  const COLUMNS = [
    { key: "unassigned", label: "UNASSIGNED", color: t.textMuted },
    { key: "assigned", label: "ASSIGNED", color: t.warning },
    { key: "in_progress", label: "IN PROGRESS", color: t.success },
    { key: "filed", label: "FILED", color: "#a78bfa" },
    { key: "published", label: "PUBLISHED", color: t.success },
  ]

  const urgencyColor: Record<string, string> = {
    breaking: t.breaking, high: t.warning, normal: t.accent, low: t.success
  }

  const [stories, setStories] = useState<any[]>([])
  const [assignMap, setAssignMap] = useState<Record<string, string>>({})
  const [assignStory, setAssignStory] = useState<any>(null)
  const [viewFile, setViewFile] = useState<any>(null)
  const [feedbackModal, setFeedbackModal] = useState<any>(null)
  const [feedback, setFeedback] = useState("")
  const [reassignModal, setReassignModal] = useState<any>(null)
  const [reassignReason, setReassignReason] = useState("")
  const [publishing, setPublishing] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    const { data } = await supabase
      .from("stories").select("*")
      .order("priority", { ascending: false })
    const { data: assignments } = await supabase
      .from("assignments").select("story_id, reporter_id").eq("is_active", true)
    const reporterIds = [...new Set((assignments || []).map((a: any) => a.reporter_id))]
    const { data: reporters } = await supabase
      .from("reporters").select("id, name")
      .in("id", reporterIds.length > 0 ? reporterIds : ["none"])
    const nameMap: Record<string, string> = {}
    reporters?.forEach((r: any) => { nameMap[r.id] = r.name })
    const map: Record<string, string> = {}
    assignments?.forEach((a: any) => { map[a.story_id] = nameMap[a.reporter_id] })
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

  useEffect(() => {
    const handler = () => load()
    window.addEventListener("newsroom-refresh", handler)
    return () => window.removeEventListener("newsroom-refresh", handler)
  }, [])

  async function publishStory(storyId: string, feedbackText: string | null) {
    setPublishing(storyId)
    await supabase.from("stories").update({
      status: "published",
      published_at: new Date().toISOString(),
      editor_feedback: feedbackText?.trim() || null,
      feedback_at: feedbackText?.trim() ? new Date().toISOString() : null
    }).eq("id", storyId)
    setViewFile(null); setFeedbackModal(null); setFeedback("")
    await load(); setPublishing(null)
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

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 14px",
    background: t.bgInput, border: `1px solid ${t.borderInput}`,
    borderRadius: "8px", color: t.textPrimary,
    fontSize: "13px", outline: "none",
    boxSizing: "border-box", fontFamily: "inherit", resize: "none" as const,
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: t.bgPage,
      fontFamily: '"Inter", "DM Mono", "Courier New", monospace',
      color: t.textPrimary
    }}>
      <Navbar />

      <div style={{ padding: "28px 24px" }}>

        {/* Page title */}
        <div style={{ marginBottom: "24px" }}>
          <h1 style={{ color: t.textPrimary, margin: "0 0 4px", fontSize: "20px", fontWeight: "700", letterSpacing: "0.5px" }}>
            Story Board
          </h1>
          <p style={{ color: t.textMuted, margin: 0, fontSize: "13px" }}>
            Manage and track all stories across their lifecycle
          </p>
        </div>

        {/* Collapsible columns */}
        <div style={{ overflowX: "auto" }}>
          <div style={{ display: "flex", gap: "16px", minWidth: COLUMNS.length * 280 + "px" }}>
            {COLUMNS.map(col => {
              const colStories = stories.filter(s => s.status === col.key)
              const collapsed = isCollapsed(col.key)

              return (
                <div key={col.key} style={{ flex: "0 0 260px", display: "flex", flexDirection: "column" }}>

                  {/* Column header — clickable to collapse */}
                  <button
                    onClick={() => toggle(col.key)}
                    aria-expanded={!collapsed}
                    style={{
                      display: "flex", alignItems: "center", gap: "8px",
                      marginBottom: collapsed ? "0" : "12px",
                      padding: "10px 12px",
                      background: t.bgCard,
                      borderRadius: "8px",
                      border: `1px solid ${t.borderCard}`,
                      boxShadow: t.shadowCard,
                      cursor: "pointer", fontFamily: "inherit", width: "100%",
                      transition: "all 0.15s",
                      outline: "none"
                    }}>
                    <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: col.color, flexShrink: 0 }} />
                    <span style={{ color: col.color, fontSize: "11px", letterSpacing: "1.5px", fontWeight: "700", flex: 1, textAlign: "left" as const }}>
                      {col.label}
                    </span>
                    <span style={{ background: t.bgInput, color: t.textMuted, fontSize: "11px", fontWeight: "600", borderRadius: "12px", padding: "2px 10px", border: `1px solid ${t.borderCard}` }}>
                      {colStories.length}
                    </span>
                    <span style={{
                      color: t.textMuted, fontSize: "14px",
                      transition: "transform 0.2s",
                      transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
                      display: "inline-block", lineHeight: "1", marginLeft: "4px"
                    }}>v</span>
                  </button>

                  {/* Column body */}
                  {!collapsed && (
                    <div style={{
                      minHeight: "300px",
                      background: t.bgInput,
                      borderRadius: "8px",
                      padding: "8px",
                      border: `1px solid ${t.borderCard}`,
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px"
                    }}>
                      {loading && col.key === "unassigned" && (
                        <div style={{ color: t.textMuted, fontSize: "13px", textAlign: "center", padding: "32px 20px" }}>
                          Loading...
                        </div>
                      )}

                      {colStories.map(story => (
                        <div
                          key={story.id}
                          role={story.status === "unassigned" ? "button" : undefined}
                          aria-label={story.status === "unassigned" ? `Assign story: ${story.headline}` : undefined}
                          tabIndex={story.status === "unassigned" ? 0 : undefined}
                          style={{
                            padding: "14px",
                            borderRadius: "8px",
                            background: t.bgCard,
                            border: `1px solid ${
                              story.status === "filed"
                                ? "rgba(167,139,250,0.35)"
                                : story.status === "published"
                                ? t.successBorder
                                : t.borderCard
                            }`,
                            cursor: story.status === "unassigned" ? "pointer" : "default",
                            boxShadow: t.shadowCard,
                            transition: "all 0.15s"
                          }}
                          onClick={() => story.status === "unassigned" && setAssignStory(story)}
                          onMouseEnter={e => {
                            if (story.status === "unassigned") {
                              e.currentTarget.style.borderColor = t.accentBorder
                              e.currentTarget.style.boxShadow = `0 0 0 2px ${t.accentBg}`
                            }
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.borderColor = story.status === "filed"
                              ? "rgba(167,139,250,0.35)"
                              : story.status === "published"
                              ? t.successBorder
                              : t.borderCard
                            e.currentTarget.style.boxShadow = t.shadowCard
                          }}>

                          {/* Urgency + Priority */}
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", alignItems: "center" }}>
                            <span style={{
                              padding: "3px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: "700",
                              letterSpacing: "0.5px",
                              background: `${urgencyColor[story.urgency]}20`,
                              color: urgencyColor[story.urgency],
                              border: `1px solid ${urgencyColor[story.urgency]}40`
                            }}>
                              {story.urgency?.toUpperCase()}
                            </span>
                            <span style={{
                              color: t.textMuted, fontSize: "11px", fontWeight: "600",
                              background: t.bgInput, padding: "2px 7px",
                              borderRadius: "4px", border: `1px solid ${t.borderCard}`
                            }}>
                              P{story.priority}
                            </span>
                          </div>

                          {/* Headline */}
                          <p style={{ color: t.textPrimary, fontSize: "13px", fontWeight: "600", margin: "0 0 8px", lineHeight: 1.5 }}>
                            {story.headline}
                          </p>

                          {/* Category + Deadline */}
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                            <span style={{ color: t.textMuted, fontSize: "11px", fontWeight: "500" }}>{story.category}</span>
                            <span style={{ color: t.textMuted, fontSize: "11px" }}>{story.deadline}</span>
                          </div>

                          {/* Reporter badge */}
                          {assignMap[story.id] && (
                            <div style={{
                              padding: "4px 10px", background: t.accentBg,
                              borderRadius: "4px", color: t.accent,
                              fontSize: "11px", fontWeight: "600",
                              marginBottom: "6px", border: `1px solid ${t.accentBorder}`
                            }}>
                              {assignMap[story.id]}
                            </div>
                          )}

                          {/* Filed file badge */}
                          {story.filed_file_name && (
                            <div style={{
                              padding: "4px 10px",
                              background: "rgba(167,139,250,0.1)",
                              borderRadius: "4px", color: "#a78bfa",
                              fontSize: "11px", marginBottom: "6px",
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                              border: "1px solid rgba(167,139,250,0.25)"
                            }}>
                              {story.filed_file_name}
                            </div>
                          )}

                          {/* Feedback badge */}
                          {story.editor_feedback && story.status === "published" && (
                            <div style={{
                              padding: "4px 10px", background: t.warningBg,
                              borderRadius: "4px", color: t.warning,
                              fontSize: "11px", marginBottom: "6px",
                              fontWeight: "500", border: `1px solid ${t.warningBorder}`
                            }}>
                              Feedback given
                            </div>
                          )}

                          {/* Published badge */}
                          {story.status === "published" && (
                            <div style={{
                              padding: "4px 10px", background: t.successBg,
                              borderRadius: "4px", color: t.success,
                              fontSize: "11px", marginBottom: "6px",
                              fontWeight: "600", border: `1px solid ${t.successBorder}`
                            }}>
                              Published
                            </div>
                          )}

                          {/* Reassign reason badge */}
                          {story.reassign_reason && story.status === "assigned" && (
                            <div style={{
                              padding: "6px 10px", background: t.warningBg,
                              borderRadius: "4px", color: t.warning,
                              fontSize: "11px", marginBottom: "6px",
                              border: `1px solid ${t.warningBorder}`
                            }}>
                              <span style={{ fontWeight: "600", display: "block", marginBottom: "2px" }}>Reassigned:</span>
                              {story.reassign_reason}
                            </div>
                          )}

                          {/* Click to assign hint */}
                          {story.status === "unassigned" && (
                            <div style={{ color: t.accent, fontSize: "11px", marginTop: "6px", fontWeight: "500" }}>
                              Click to assign →
                            </div>
                          )}

                          {/* View and Review button */}
                          {story.status === "filed" && (
                            <button
                              onClick={e => { e.stopPropagation(); setViewFile(story) }}
                              style={{
                                width: "100%", padding: "8px", marginTop: "8px",
                                background: "rgba(167,139,250,0.1)",
                                border: "1px solid rgba(167,139,250,0.35)",
                                borderRadius: "6px", color: "#a78bfa",
                                fontSize: "11px", fontWeight: "600",
                                letterSpacing: "0.5px", cursor: "pointer", fontFamily: "inherit"
                              }}>
                              VIEW AND REVIEW
                            </button>
                          )}

                          {/* Open report button */}
                          {story.status === "published" && story.filed_file_url && (
                            <button
                              onClick={e => { e.stopPropagation(); window.open(story.filed_file_url, "_blank") }}
                              style={{
                                width: "100%", padding: "8px", marginTop: "8px",
                                background: t.successBg, border: `1px solid ${t.successBorder}`,
                                borderRadius: "6px", color: t.success,
                                fontSize: "11px", fontWeight: "600",
                                letterSpacing: "0.5px", cursor: "pointer", fontFamily: "inherit"
                              }}>
                              OPEN REPORT
                            </button>
                          )}
                        </div>
                      ))}

                      {colStories.length === 0 && !loading && (
                        <div style={{
                          color: t.textDisabled, fontSize: "12px",
                          textAlign: "center", padding: "32px 0", fontStyle: "italic"
                        }}>
                          No stories
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {assignStory && (
        <AssignModal
          story={assignStory}
          onClose={() => setAssignStory(null)}
          onAssigned={load}
        />
      )}

      {/* View File Modal */}
      {viewFile && (
        <div role="dialog" aria-modal="true" aria-label="Review filed story"
          style={{ position: "fixed", inset: 0, background: t.overlayBg, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setViewFile(null) }}>
          <div style={{
            background: t.bgCard, border: "1px solid rgba(167,139,250,0.35)",
            borderRadius: "12px", width: "100%", maxWidth: "540px",
            margin: "24px", fontFamily: "inherit", overflow: "hidden",
            maxHeight: "90vh", overflowY: "auto", boxShadow: t.shadow
          }}>
            {/* Modal Header */}
            <div style={{ padding: "20px 24px", borderBottom: `1px solid ${t.borderCard}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
                  <span style={{ padding: "3px 10px", borderRadius: "4px", fontSize: "10px", fontWeight: "700", background: "rgba(167,139,250,0.15)", color: "#a78bfa", letterSpacing: "0.5px", border: "1px solid rgba(167,139,250,0.3)" }}>
                    FILED
                  </span>
                  <span style={{ color: t.textMuted, fontSize: "12px", fontWeight: "500" }}>{viewFile.category}</span>
                  {viewFile.urgency && (
                    <span style={{ padding: "3px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: "700", background: `${urgencyColor[viewFile.urgency]}20`, color: urgencyColor[viewFile.urgency], border: `1px solid ${urgencyColor[viewFile.urgency]}40` }}>
                      {viewFile.urgency?.toUpperCase()}
                    </span>
                  )}
                </div>
                <h2 style={{ color: t.textPrimary, margin: "0 0 6px", fontSize: "18px", fontWeight: "700" }}>
                  {viewFile.headline}
                </h2>
                <p style={{ color: t.textMuted, fontSize: "12px", margin: "0 0 4px" }}>
                  By: <span style={{ color: t.textSecondary, fontWeight: "600" }}>{assignMap[viewFile.id]}</span>
                  {viewFile.filed_at && (
                    <span style={{ marginLeft: "8px" }}>— {new Date(viewFile.filed_at).toLocaleDateString()}</span>
                  )}
                </p>
                <div style={{ display: "flex", gap: "16px", marginTop: "8px", flexWrap: "wrap" }}>
                  <span style={{ color: t.textMuted, fontSize: "12px" }}>Deadline: <span style={{ color: t.textSecondary, fontWeight: "500" }}>{viewFile.deadline}</span></span>
                  <span style={{ color: t.textMuted, fontSize: "12px" }}>Complexity: <span style={{ color: t.textSecondary, fontWeight: "500" }}>{viewFile.complexity}/5</span></span>
                  <span style={{ color: t.textMuted, fontSize: "12px" }}>Priority: <span style={{ color: t.textSecondary, fontWeight: "500" }}>P{viewFile.priority}</span></span>
                </div>
                {viewFile.description && (
                  <div style={{ marginTop: "12px", padding: "10px 14px", background: t.bgPage, border: `1px solid ${t.borderCard}`, borderRadius: "6px" }}>
                    <p style={{ color: t.textMuted, fontSize: "11px", fontWeight: "600", margin: "0 0 4px", letterSpacing: "0.5px" }}>STORY DESCRIPTION</p>
                    <p style={{ color: t.textSecondary, fontSize: "13px", margin: 0, lineHeight: 1.6 }}>{viewFile.description}</p>
                  </div>
                )}
              </div>
              <button onClick={() => setViewFile(null)} aria-label="Close"
                style={{ background: "none", border: "none", color: t.textMuted, fontSize: "22px", cursor: "pointer", marginLeft: "12px", lineHeight: 1 }}>
                x
              </button>
            </div>

            {/* File section */}
            <div style={{ padding: "20px 24px", borderBottom: `1px solid ${t.borderCard}` }}>
              <p style={{ color: t.textMuted, fontSize: "11px", fontWeight: "600", letterSpacing: "0.5px", margin: "0 0 12px" }}>
                SUBMITTED WORD DOCUMENT
              </p>
              {viewFile.filed_file_url ? (
                <div style={{ display: "flex", alignItems: "center", gap: "14px", padding: "16px", background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.25)", borderRadius: "8px" }}>
                  <div style={{ fontSize: "36px" }}>📘</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: t.textPrimary, fontSize: "14px", fontWeight: "600", marginBottom: "4px" }}>{viewFile.filed_file_name}</div>
                    <div style={{ color: t.textMuted, fontSize: "12px" }}>Word Document</div>
                  </div>
                  <button onClick={() => window.open(viewFile.filed_file_url, "_blank")}
                    style={{ padding: "9px 18px", background: "rgba(167,139,250,0.15)", border: "1px solid rgba(167,139,250,0.35)", borderRadius: "6px", color: "#a78bfa", fontSize: "12px", fontWeight: "600", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                    OPEN FILE
                  </button>
                </div>
              ) : (
                <div style={{ color: t.textMuted, fontSize: "13px", textAlign: "center", padding: "20px" }}>No file attached</div>
              )}
            </div>

            {/* Previous reassign reason */}
            {viewFile.reassign_reason && (
              <div style={{ padding: "14px 24px", background: t.warningBg, borderBottom: `1px solid ${t.warningBorder}` }}>
                <p style={{ color: t.textMuted, fontSize: "11px", fontWeight: "600", letterSpacing: "0.5px", margin: "0 0 6px" }}>PREVIOUS REASSIGN REASON</p>
                <p style={{ color: t.warning, fontSize: "13px", margin: 0, lineHeight: 1.5 }}>{viewFile.reassign_reason}</p>
              </div>
            )}

            {/* Editor actions */}
            <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <p style={{ color: t.textMuted, fontSize: "11px", fontWeight: "600", letterSpacing: "0.5px", margin: "0 0 4px" }}>EDITOR ACTIONS</p>
              <button onClick={() => publishStory(viewFile.id, null)} disabled={publishing === viewFile.id}
                style={{ width: "100%", padding: "14px", background: t.successBg, border: `1px solid ${t.successBorder}`, borderRadius: "8px", color: t.success, fontSize: "13px", fontWeight: "700", letterSpacing: "0.5px", cursor: "pointer", fontFamily: "inherit", opacity: publishing === viewFile.id ? 0.6 : 1 }}>
                {publishing === viewFile.id ? "PUBLISHING..." : "APPROVE AND PUBLISH"}
              </button>
              <button onClick={() => { setFeedbackModal(viewFile); setViewFile(null); setFeedback("") }}
                style={{ width: "100%", padding: "14px", background: t.warningBg, border: `1px solid ${t.warningBorder}`, borderRadius: "8px", color: t.warning, fontSize: "13px", fontWeight: "600", letterSpacing: "0.5px", cursor: "pointer", fontFamily: "inherit" }}>
                PUBLISH WITH FEEDBACK
              </button>
              <button onClick={() => { setReassignModal(viewFile); setViewFile(null) }}
                style={{ width: "100%", padding: "14px", background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, borderRadius: "8px", color: t.danger, fontSize: "13px", fontWeight: "600", letterSpacing: "0.5px", cursor: "pointer", fontFamily: "inherit" }}>
                REASSIGN WITH REASON
              </button>
              <button onClick={() => setViewFile(null)}
                style={{ width: "100%", padding: "12px", background: "transparent", border: `1px solid ${t.borderCard}`, borderRadius: "8px", color: t.textMuted, fontSize: "13px", cursor: "pointer", fontFamily: "inherit" }}>
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Feedback Modal */}
      {feedbackModal && (
        <div role="dialog" aria-modal="true" aria-label="Publish with feedback"
          style={{ position: "fixed", inset: 0, background: t.overlayBg, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) { setFeedbackModal(null); setFeedback("") } }}>
          <div style={{ background: t.bgCard, border: `1px solid ${t.warningBorder}`, borderRadius: "12px", width: "100%", maxWidth: "500px", margin: "24px", padding: "28px", fontFamily: "inherit", boxShadow: t.shadow }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", alignItems: "center" }}>
              <h2 style={{ color: t.textPrimary, margin: 0, fontSize: "18px", fontWeight: "700" }}>Publish with Feedback</h2>
              <button onClick={() => { setFeedbackModal(null); setFeedback("") }} aria-label="Close"
                style={{ background: "none", border: "none", color: t.textMuted, fontSize: "22px", cursor: "pointer" }}>x</button>
            </div>
            <p style={{ color: t.textMuted, fontSize: "13px", margin: "0 0 20px" }}>
              Story: <span style={{ color: t.textPrimary, fontWeight: "600" }}>{feedbackModal.headline}</span>
            </p>
            <div style={{ padding: "12px 16px", background: t.warningBg, border: `1px solid ${t.warningBorder}`, borderRadius: "8px", marginBottom: "20px" }}>
              <p style={{ color: t.warning, fontSize: "12px", margin: 0, lineHeight: 1.5 }}>
                Write feedback for <span style={{ color: t.textPrimary, fontWeight: "600" }}>{assignMap[feedbackModal.id]}</span>. Optional — visible to reporter after publishing.
              </p>
            </div>
            <div style={{ marginBottom: "20px" }}>
              <label style={{ color: t.textSecondary, fontSize: "12px", fontWeight: "600", display: "block", marginBottom: "8px" }}>
                YOUR FEEDBACK <span style={{ color: t.textMuted, fontWeight: "400" }}>(optional)</span>
              </label>
              <textarea value={feedback} onChange={e => setFeedback(e.target.value)} rows={5}
                placeholder="Great work! The lead paragraph was compelling..."
                style={{ ...inputStyle, border: `1px solid ${t.warningBorder}`, lineHeight: "1.6" }} />
              <p style={{ color: t.textDisabled, fontSize: "11px", margin: "6px 0 0", textAlign: "right" as const }}>
                {feedback.length} characters
              </p>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => { setFeedbackModal(null); setFeedback("") }}
                style={{ flex: 1, padding: "12px", background: "transparent", border: `1px solid ${t.borderCard}`, borderRadius: "8px", color: t.textMuted, fontSize: "13px", cursor: "pointer", fontFamily: "inherit" }}>
                CANCEL
              </button>
              <button onClick={() => publishStory(feedbackModal.id, feedback)} disabled={publishing === feedbackModal.id}
                style={{ flex: 2, padding: "12px", background: t.successBg, border: `1px solid ${t.successBorder}`, borderRadius: "8px", color: t.success, fontSize: "13px", fontWeight: "700", cursor: "pointer", fontFamily: "inherit", opacity: publishing === feedbackModal.id ? 0.6 : 1 }}>
                {publishing === feedbackModal.id ? "PUBLISHING..." : feedback.trim() ? "PUBLISH WITH FEEDBACK" : "PUBLISH WITHOUT FEEDBACK"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reassign Modal */}
      {reassignModal && (
        <div role="dialog" aria-modal="true" aria-label="Reassign story"
          style={{ position: "fixed", inset: 0, background: t.overlayBg, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) { setReassignModal(null); setReassignReason("") } }}>
          <div style={{ background: t.bgCard, border: `1px solid ${t.dangerBorder}`, borderRadius: "12px", width: "100%", maxWidth: "440px", margin: "24px", padding: "28px", fontFamily: "inherit", boxShadow: t.shadow }}>
            <h2 style={{ color: t.textPrimary, margin: "0 0 8px", fontSize: "18px", fontWeight: "700" }}>Reassign Story</h2>
            <p style={{ color: t.textMuted, fontSize: "13px", margin: "0 0 16px" }}>
              Story: <span style={{ color: t.textPrimary, fontWeight: "600" }}>{reassignModal.headline}</span>
            </p>
            <div style={{ padding: "12px 16px", background: t.warningBg, border: `1px solid ${t.warningBorder}`, borderRadius: "8px", marginBottom: "16px" }}>
              <p style={{ color: t.warning, fontSize: "12px", margin: 0, lineHeight: 1.5 }}>
                Story moves back to ASSIGNED. Reporter will see your reason and must refile.
              </p>
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label style={{ color: t.textSecondary, fontSize: "12px", fontWeight: "600", display: "block", marginBottom: "6px" }}>REASON FOR REASSIGNMENT</label>
              <textarea value={reassignReason} onChange={e => setReassignReason(e.target.value)} rows={4}
                placeholder="Explain what needs to be changed..." style={inputStyle} />
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => { setReassignModal(null); setReassignReason("") }}
                style={{ flex: 1, padding: "12px", background: "transparent", border: `1px solid ${t.borderCard}`, borderRadius: "8px", color: t.textMuted, fontSize: "13px", cursor: "pointer", fontFamily: "inherit" }}>
                CANCEL
              </button>
              <button onClick={reassignStory} disabled={!reassignReason.trim()}
                style={{ flex: 1, padding: "12px", background: reassignReason.trim() ? t.dangerBg : t.bgInput, border: `1px solid ${reassignReason.trim() ? t.dangerBorder : t.borderCard}`, borderRadius: "8px", color: reassignReason.trim() ? t.danger : t.textDisabled, fontSize: "13px", fontWeight: "700", cursor: reassignReason.trim() ? "pointer" : "not-allowed", fontFamily: "inherit", opacity: reassignReason.trim() ? 1 : 0.5 }}>
                CONFIRM REASSIGN
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}