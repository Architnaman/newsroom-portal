import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import { useAuth } from "../context/AuthContext"
import Navbar from "../components/Navbar"
import { useTheme } from "../context/ThemeContext"
import { useCollapse } from "../hooks/useCollapse"
import SectionCard from "../components/SectionCard"

export default function ReporterQueue() {
  const { reporterId } = useAuth()
  const { t } = useTheme()
  const { toggle, isCollapsed } = useCollapse('reporter-queue', ['active', 'filed'])

  const [stories, setStories] = useState<any[]>([])
  const [assignments, setAssignments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [fileModal, setFileModal] = useState<any>(null)
  const [selectedFile, setSelectedFile] = useState<any>(null)
  const [feedbackModal, setFeedbackModal] = useState<any>(null)
  const [overrideModal, setOverrideModal] = useState<{story: any, action: "accept" | "reject"} | null>(null)
  const [overrideResponse, setOverrideResponse] = useState("")
  const [overrideLoading, setOverrideLoading] = useState(false)

  const urgencyColor: Record<string, string> = {
    breaking: t.breaking, high: t.warning, normal: t.accent, low: t.success
  }
  const statusColor: Record<string, string> = {
    assigned: t.warning, in_progress: t.success, filed: "#a78bfa", published: t.success
  }

  async function load() {
    if (!reporterId) return
    const { data } = await supabase
      .from("assignments")
      .select("*, stories(*)")
      .eq("reporter_id", reporterId)
      .eq("is_active", true)
      .order("assigned_at", { ascending: false })
    setAssignments(data || [])
    setStories((data || []).map((a: any) => ({
      ...a.stories,
      assignment_id: a.id,
      is_override: a.is_override,
      override_reason: a.override_reason,
      override_status: a.override_status,
      override_response: a.override_response
    })))
    setLoading(false)
  }

  useEffect(() => { load() }, [reporterId])

  useEffect(() => {
    const handler = () => load()
    window.addEventListener("newsroom-refresh", handler)
    return () => window.removeEventListener("newsroom-refresh", handler)
  }, [reporterId])

  async function startWorking(story: any) {
    setUpdating(story.id)
    await supabase.from("stories").update({ status: "in_progress" }).eq("id", story.id)
    await load()
    setUpdating(null)
  }

  async function handleOverride(story: any, actionType: "accept" | "reject") {
    if (!overrideResponse.trim()) return
    setOverrideLoading(true)
    try {
      if (actionType === "accept") {
        await supabase.from("assignments").update({
          override_status: "accepted",
          override_response: overrideResponse,
          override_responded_at: new Date().toISOString()
        }).eq("id", story.assignment_id)
      } else {
        await supabase.from("assignments").update({
          override_status: "rejected",
          override_response: overrideResponse,
          override_responded_at: new Date().toISOString()
        }).eq("id", story.assignment_id)
        await supabase.from("stories").update({ status: "unassigned" }).eq("id", story.id)
      }
      setOverrideModal(null)
      setOverrideResponse("")
      await load()
    } catch (err: any) { alert("Error: " + err.message) }
    setOverrideLoading(false)
  }

  async function uploadAndFile() {
    if (!selectedFile || !fileModal || !reporterId) return
    setUploadingId(fileModal.id)
    try {
      const fileExt = selectedFile.name.split(".").pop()
      const fileName = fileModal.id + "_" + Date.now() + "." + fileExt
      const { error: uploadError } = await supabase.storage
        .from("story-files").upload(fileName, selectedFile, { upsert: true })
      if (uploadError) { alert("Upload failed: " + uploadError.message); setUploadingId(null); return }
      const { data: urlData } = supabase.storage.from("story-files").getPublicUrl(fileName)
      await supabase.from("stories").update({
        status: "filed",
        filed_file_url: urlData.publicUrl,
        filed_file_name: selectedFile.name,
        filed_at: new Date().toISOString()
      }).eq("id", fileModal.id)
      setFileModal(null)
      setSelectedFile(null)
      await load()
    } catch (err: any) { alert("Error: " + err.message) }
    setUploadingId(null)
  }

  const active = stories.filter(s => s.status !== "filed" && s.status !== "published")
  const filed = stories.filter(s => s.status === "filed" || s.status === "published")

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 14px",
    background: t.bgInput, border: `1px solid ${t.borderInput}`,
    borderRadius: "8px", color: t.textPrimary,
    fontSize: "13px", outline: "none",
    boxSizing: "border-box", fontFamily: "inherit", resize: "none" as const,
  }

  return (
    <div style={{ minHeight: "100vh", background: t.bgPage, fontFamily: '"Inter", "DM Mono", "Courier New", monospace', color: t.textPrimary }}>
      <Navbar />
      <main role="main" style={{ padding: "32px 24px", maxWidth: "860px", margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: "32px" }}>
          <h1 style={{ color: t.textPrimary, margin: "0 0 6px", fontSize: "22px", fontWeight: "700" }}>My Stories</h1>
          <p style={{ color: t.textMuted, margin: 0, fontSize: "13px" }}>Your active assignments and filed reports</p>
        </div>

        {loading ? (
          <div style={{ color: t.textMuted, textAlign: "center", padding: "60px", fontSize: "14px" }}>Loading your stories...</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

            {/* ACTIVE STORIES — collapsible */}
            <SectionCard
              title="ACTIVE STORIES"
              isCollapsed={isCollapsed('active')}
              onToggle={() => toggle('active')}
              badge={active.length}
              badgeColor={t.accent}>
              {active.length === 0 ? (
                <div style={{ color: t.textDisabled, fontSize: "14px", textAlign: "center", padding: "48px", border: `1px dashed ${t.borderCard}`, borderRadius: "10px", background: t.bgPage }}>
                  No active stories assigned to you
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {active.map(story => (
                    <div key={story.id} style={{
                      padding: "20px 24px", borderRadius: "10px",
                      border: `1px solid ${story.is_override && story.override_status === "pending" ? t.dangerBorder : t.borderCard}`,
                      background: story.is_override && story.override_status === "pending" ? t.dangerBg : t.bgPage,
                      boxShadow: t.shadowCard
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>

                          {/* Badges */}
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
                            <span style={{ padding: "3px 10px", borderRadius: "4px", fontSize: "10px", fontWeight: "700", background: `${urgencyColor[story.urgency]}20`, color: urgencyColor[story.urgency], border: `1px solid ${urgencyColor[story.urgency]}40` }}>
                              {story.urgency?.toUpperCase()}
                            </span>
                            <span style={{ padding: "3px 10px", borderRadius: "4px", fontSize: "10px", fontWeight: "600", background: `${statusColor[story.status]}15`, color: statusColor[story.status], border: `1px solid ${statusColor[story.status]}30` }}>
                              {story.status?.replace("_", " ").toUpperCase()}
                            </span>
                            <span style={{ color: t.textMuted, fontSize: "12px" }}>{story.category}</span>
                            {story.is_override && (
                              <span style={{ padding: "3px 10px", borderRadius: "4px", fontSize: "10px", fontWeight: "700", background: t.dangerBg, color: t.danger, border: `1px solid ${t.dangerBorder}` }}>
                                OVERRIDE
                              </span>
                            )}
                          </div>

                          {/* Headline */}
                          <h3 style={{ color: t.textPrimary, margin: "0 0 10px", fontSize: "16px", fontWeight: "700", lineHeight: 1.4 }}>
                            {story.headline}
                          </h3>

                          {/* Meta */}
                          <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
                            <span style={{ color: t.textMuted, fontSize: "12px" }}>
                              Deadline: <span style={{ color: t.textSecondary, fontWeight: "600" }}>{story.deadline}</span>
                            </span>
                            <span style={{ color: t.textMuted, fontSize: "12px" }}>
                              Complexity: <span style={{ color: t.textSecondary, fontWeight: "600" }}>{story.complexity}/5</span>
                            </span>
                          </div>

                          {/* Reassign reason */}
                          {story.reassign_reason && (
                            <div style={{ marginTop: "12px", padding: "12px 16px", background: t.warningBg, border: `1px solid ${t.warningBorder}`, borderRadius: "8px" }}>
                              <p style={{ color: t.textMuted, fontSize: "11px", fontWeight: "600", margin: "0 0 4px" }}>REASSIGNED — EDITOR FEEDBACK</p>
                              <p style={{ color: t.warning, fontSize: "13px", margin: 0, lineHeight: 1.5 }}>{story.reassign_reason}</p>
                            </div>
                          )}

                          {/* Override pending */}
                          {story.is_override && story.override_status === "pending" && (
                            <div style={{ marginTop: "12px", padding: "14px 16px", background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, borderRadius: "8px" }}>
                              <p style={{ color: t.danger, fontSize: "11px", fontWeight: "700", margin: "0 0 8px" }}>
                                OVERRIDE ASSIGNMENT — YOU ARE CURRENTLY UNAVAILABLE
                              </p>
                              <p style={{ color: t.textMuted, fontSize: "12px", margin: "0 0 12px", lineHeight: 1.5 }}>
                                Editor reason: <span style={{ color: t.warning, fontWeight: "600" }}>{story.override_reason}</span>
                              </p>
                              <p style={{ color: t.textMuted, fontSize: "12px", margin: "0 0 12px" }}>
                                Please accept or reject this assignment with a valid reason.
                              </p>
                              <div style={{ display: "flex", gap: "8px" }}>
                                <button onClick={() => setOverrideModal({ story, action: "accept" })}
                                  style={{ flex: 1, padding: "9px", background: t.successBg, border: `1px solid ${t.successBorder}`, borderRadius: "6px", color: t.success, fontSize: "11px", fontWeight: "700", cursor: "pointer", fontFamily: "inherit" }}>
                                  ACCEPT
                                </button>
                                <button onClick={() => setOverrideModal({ story, action: "reject" })}
                                  style={{ flex: 1, padding: "9px", background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, borderRadius: "6px", color: t.danger, fontSize: "11px", fontWeight: "700", cursor: "pointer", fontFamily: "inherit" }}>
                                  REJECT
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Override accepted */}
                          {story.is_override && story.override_status === "accepted" && (
                            <div style={{ marginTop: "12px", padding: "10px 14px", background: t.successBg, border: `1px solid ${t.successBorder}`, borderRadius: "8px" }}>
                              <p style={{ color: t.success, fontSize: "12px", fontWeight: "600", margin: 0 }}>You accepted this override assignment</p>
                            </div>
                          )}
                        </div>

                        {/* Action buttons */}
                        {(!story.is_override || story.override_status === "accepted") && (
                          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginLeft: "20px", flexShrink: 0 }}>
                            {story.status === "assigned" && (
                              <button onClick={() => startWorking(story)} disabled={updating === story.id}
                                style={{ padding: "10px 18px", background: t.warningBg, border: `1px solid ${t.warningBorder}`, borderRadius: "6px", color: t.warning, fontSize: "11px", fontWeight: "700", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", opacity: updating === story.id ? 0.6 : 1 }}>
                                {updating === story.id ? "..." : "START WORKING"}
                              </button>
                            )}
                            {story.status === "in_progress" && (
                              <button onClick={() => setFileModal(story)}
                                style={{ padding: "10px 18px", background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.35)", borderRadius: "6px", color: "#a78bfa", fontSize: "11px", fontWeight: "700", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                                FILE REPORT
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            {/* FILED / PUBLISHED — collapsible */}
            {filed.length > 0 && (
              <SectionCard
                title="FILED / PUBLISHED"
                isCollapsed={isCollapsed('filed')}
                onToggle={() => toggle('filed')}
                badge={filed.length}
                badgeColor={t.success}>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {filed.map(story => (
                    <div key={story.id} style={{
                      padding: "16px 20px", borderRadius: "10px",
                      border: `1px solid ${story.status === "published" ? t.successBorder : "rgba(167,139,250,0.25)"}`,
                      background: story.status === "published" ? t.successBg : "rgba(167,139,250,0.06)",
                      boxShadow: t.shadowCard
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ color: story.status === "published" ? t.textPrimary : t.textSecondary, fontSize: "15px", fontWeight: "700", marginBottom: "6px" }}>
                            {story.headline}
                          </div>
                          {story.filed_file_name && (
                            <div style={{ color: "#a78bfa", fontSize: "11px", marginBottom: "8px", fontWeight: "500" }}>
                              Filed: {story.filed_file_name}
                            </div>
                          )}
                          {story.editor_feedback && story.status === "published" && (
                            <button onClick={() => setFeedbackModal(story)}
                              style={{ padding: "7px 14px", background: t.warningBg, border: `1px solid ${t.warningBorder}`, borderRadius: "6px", color: t.warning, fontSize: "12px", fontWeight: "600", cursor: "pointer", fontFamily: "inherit" }}>
                              Editor left feedback — click to view
                            </button>
                          )}
                        </div>
                        <span style={{
                          padding: "4px 12px", borderRadius: "4px", fontSize: "11px", fontWeight: "700",
                          marginLeft: "16px", whiteSpace: "nowrap",
                          background: story.status === "published" ? t.successBg : "rgba(167,139,250,0.15)",
                          color: story.status === "published" ? t.success : "#a78bfa",
                          border: `1px solid ${story.status === "published" ? t.successBorder : "rgba(167,139,250,0.3)"}`
                        }}>
                          {story.status?.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}
          </div>
        )}
      </main>

      {/* Override Modal */}
      {overrideModal && (
        <div role="dialog" aria-modal="true"
          style={{ position: "fixed", inset: 0, background: t.overlayBg, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) { setOverrideModal(null); setOverrideResponse("") } }}>
          <div style={{ background: t.bgCard, border: `1px solid ${overrideModal.action === "accept" ? t.successBorder : t.dangerBorder}`, borderRadius: "12px", width: "100%", maxWidth: "460px", margin: "24px", padding: "28px", fontFamily: "inherit", boxShadow: t.shadow }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", alignItems: "center" }}>
              <h2 style={{ color: t.textPrimary, margin: 0, fontSize: "18px", fontWeight: "700" }}>
                {overrideModal.action === "accept" ? "Accept Override Assignment" : "Reject Override Assignment"}
              </h2>
              <button onClick={() => { setOverrideModal(null); setOverrideResponse("") }}
                style={{ background: "none", border: "none", color: t.textMuted, fontSize: "22px", cursor: "pointer" }}>x</button>
            </div>
            <p style={{ color: t.textMuted, fontSize: "13px", margin: "0 0 4px" }}>
              Story: <span style={{ color: t.textPrimary, fontWeight: "600" }}>{overrideModal.story.headline}</span>
            </p>
            <p style={{ color: t.textMuted, fontSize: "13px", margin: "0 0 16px" }}>
              Editor reason: <span style={{ color: t.warning, fontWeight: "600" }}>{overrideModal.story.override_reason}</span>
            </p>
            <div style={{ padding: "12px 16px", background: overrideModal.action === "accept" ? t.successBg : t.dangerBg, border: `1px solid ${overrideModal.action === "accept" ? t.successBorder : t.dangerBorder}`, borderRadius: "8px", marginBottom: "16px" }}>
              <p style={{ color: overrideModal.action === "accept" ? t.success : t.danger, fontSize: "12px", margin: 0, lineHeight: 1.5 }}>
                {overrideModal.action === "accept"
                  ? "By accepting, you commit to covering this story despite being unavailable."
                  : "By rejecting, the story will be moved back to unassigned and editor will be notified."}
              </p>
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label style={{ color: t.textSecondary, fontSize: "12px", fontWeight: "600", display: "block", marginBottom: "6px" }}>
                YOUR REASON <span style={{ color: t.danger }}>*required</span>
              </label>
              <textarea value={overrideResponse} onChange={e => setOverrideResponse(e.target.value)} rows={3}
                placeholder={overrideModal.action === "accept" ? "e.g. I can manage the story despite being unavailable today..." : "e.g. I am unable to cover this story due to medical emergency..."}
                style={inputStyle} />
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => { setOverrideModal(null); setOverrideResponse("") }}
                style={{ flex: 1, padding: "12px", background: "transparent", border: `1px solid ${t.borderCard}`, borderRadius: "8px", color: t.textMuted, fontSize: "13px", cursor: "pointer", fontFamily: "inherit" }}>
                CANCEL
              </button>
              <button onClick={() => handleOverride(overrideModal.story, overrideModal.action)} disabled={!overrideResponse.trim() || overrideLoading}
                style={{ flex: 1, padding: "12px", background: overrideResponse.trim() ? (overrideModal.action === "accept" ? t.successBg : t.dangerBg) : t.bgInput, border: `1px solid ${overrideResponse.trim() ? (overrideModal.action === "accept" ? t.successBorder : t.dangerBorder) : t.borderCard}`, borderRadius: "8px", color: overrideResponse.trim() ? (overrideModal.action === "accept" ? t.success : t.danger) : t.textDisabled, fontSize: "13px", fontWeight: "700", cursor: overrideResponse.trim() ? "pointer" : "not-allowed", fontFamily: "inherit", opacity: overrideLoading ? 0.6 : 1 }}>
                {overrideLoading ? "PROCESSING..." : overrideModal.action === "accept" ? "CONFIRM ACCEPT" : "CONFIRM REJECT"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File Upload Modal */}
      {fileModal && (
        <div role="dialog" aria-modal="true" aria-label="File report"
          style={{ position: "fixed", inset: 0, background: t.overlayBg, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) { setFileModal(null); setSelectedFile(null) } }}>
          <div style={{ background: t.bgCard, border: "1px solid rgba(167,139,250,0.35)", borderRadius: "12px", width: "100%", maxWidth: "460px", margin: "24px", padding: "28px", fontFamily: "inherit", boxShadow: t.shadow }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", alignItems: "center" }}>
              <h2 style={{ color: t.textPrimary, margin: 0, fontSize: "18px", fontWeight: "700" }}>File Report</h2>
              <button onClick={() => { setFileModal(null); setSelectedFile(null) }}
                style={{ background: "none", border: "none", color: t.textMuted, fontSize: "22px", cursor: "pointer" }}>x</button>
            </div>
            <p style={{ color: t.textMuted, fontSize: "13px", margin: "0 0 20px" }}>
              Upload Word document for: <span style={{ color: t.textPrimary, fontWeight: "600" }}>{fileModal.headline}</span>
            </p>
            <div role="button" tabIndex={0}
              onClick={() => document.getElementById("file-input")?.click()}
              onKeyDown={e => e.key === "Enter" && document.getElementById("file-input")?.click()}
              style={{ border: `2px dashed ${selectedFile ? "rgba(167,139,250,0.6)" : t.borderCard}`, borderRadius: "10px", padding: "32px 20px", textAlign: "center", cursor: "pointer", marginBottom: "20px", background: selectedFile ? "rgba(167,139,250,0.06)" : t.bgInput, transition: "all 0.15s" }}>
              {selectedFile ? (
                <div>
                  <div style={{ fontSize: "40px", marginBottom: "10px" }}>📘</div>
                  <p style={{ color: "#a78bfa", fontSize: "14px", fontWeight: "600", margin: "0 0 4px" }}>{selectedFile.name}</p>
                  <p style={{ color: t.textMuted, fontSize: "12px", margin: 0 }}>{(selectedFile.size / 1024).toFixed(1)} KB</p>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: "40px", marginBottom: "10px" }}>📘</div>
                  <p style={{ color: t.textSecondary, fontSize: "14px", fontWeight: "600", margin: "0 0 6px" }}>Click to select Word document</p>
                  <p style={{ color: t.textMuted, fontSize: "12px", margin: 0 }}>.doc, .docx files only</p>
                </div>
              )}
              <input id="file-input" type="file" accept=".doc,.docx" style={{ display: "none" }}
                onChange={e => setSelectedFile(e.target.files?.[0] || null)} />
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => { setFileModal(null); setSelectedFile(null) }}
                style={{ flex: 1, padding: "12px", background: "transparent", border: `1px solid ${t.borderCard}`, borderRadius: "8px", color: t.textMuted, fontSize: "13px", cursor: "pointer", fontFamily: "inherit" }}>
                CANCEL
              </button>
              <button onClick={uploadAndFile} disabled={!selectedFile || uploadingId === fileModal.id}
                style={{ flex: 1, padding: "12px", background: selectedFile ? "rgba(167,139,250,0.15)" : t.bgInput, border: `1px solid ${selectedFile ? "rgba(167,139,250,0.4)" : t.borderCard}`, borderRadius: "8px", color: selectedFile ? "#a78bfa" : t.textDisabled, fontSize: "13px", fontWeight: "700", cursor: selectedFile ? "pointer" : "not-allowed", fontFamily: "inherit", opacity: uploadingId === fileModal.id ? 0.6 : 1 }}>
                {uploadingId === fileModal.id ? "UPLOADING..." : "SUBMIT REPORT"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Feedback Modal */}
      {feedbackModal && (
        <div role="dialog" aria-modal="true" aria-label="Editor feedback"
          style={{ position: "fixed", inset: 0, background: t.overlayBg, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setFeedbackModal(null) }}>
          <div style={{ background: t.bgCard, border: `1px solid ${t.warningBorder}`, borderRadius: "12px", width: "100%", maxWidth: "460px", margin: "24px", padding: "28px", fontFamily: "inherit", boxShadow: t.shadow }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px", alignItems: "center" }}>
              <h2 style={{ color: t.textPrimary, margin: 0, fontSize: "18px", fontWeight: "700" }}>Editor Feedback</h2>
              <button onClick={() => setFeedbackModal(null)}
                style={{ background: "none", border: "none", color: t.textMuted, fontSize: "22px", cursor: "pointer" }}>x</button>
            </div>
            <p style={{ color: t.textMuted, fontSize: "13px", margin: "0 0 16px" }}>
              For: <span style={{ color: t.textPrimary, fontWeight: "600" }}>{feedbackModal.headline}</span>
            </p>
            <div style={{ padding: "16px", background: t.warningBg, border: `1px solid ${t.warningBorder}`, borderRadius: "8px", marginBottom: "14px" }}>
              <p style={{ color: t.textMuted, fontSize: "11px", fontWeight: "600", margin: "0 0 10px" }}>EDITOR SAYS</p>
              <p style={{ color: t.warning, fontSize: "15px", fontWeight: "600", margin: 0, lineHeight: 1.6 }}>{feedbackModal.editor_feedback}</p>
              {feedbackModal.feedback_at && (
                <p style={{ color: t.textMuted, fontSize: "11px", margin: "8px 0 0" }}>{new Date(feedbackModal.feedback_at).toLocaleString()}</p>
              )}
            </div>
            <div style={{ padding: "12px 16px", background: t.successBg, border: `1px solid ${t.successBorder}`, borderRadius: "8px", marginBottom: "16px" }}>
              <p style={{ color: t.success, fontSize: "12px", fontWeight: "600", margin: 0 }}>Your report has been published!</p>
            </div>
            <button onClick={() => setFeedbackModal(null)}
              style={{ width: "100%", padding: "12px", background: "transparent", border: `1px solid ${t.borderCard}`, borderRadius: "8px", color: t.textMuted, fontSize: "13px", cursor: "pointer", fontFamily: "inherit" }}>
              CLOSE
            </button>
          </div>
        </div>
      )}
    </div>
  )
}