import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import { useAuth } from "../context/AuthContext"
import Navbar from "../components/Navbar"

const urgencyColor = { breaking: "#ff4444", high: "#ff8800", normal: "#ffb400", low: "#64c896" }
const statusColor = { assigned: "#ffb400", in_progress: "#64c896", filed: "#8888ff", published: "#64c896" }

export default function ReporterQueue() {
  const { reporterId } = useAuth()
  const [stories, setStories] = useState([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(null)
  const [uploadingId, setUploadingId] = useState(null)
  const [fileModal, setFileModal] = useState(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [feedbackModal, setFeedbackModal] = useState(null)

  async function load() {
    if (!reporterId) return
    const { data } = await supabase.from("assignments").select("*, stories(*)").eq("reporter_id", reporterId).eq("is_active", true).order("assigned_at", { ascending: false })
    setStories((data || []).map(a => ({ ...a.stories, assignment_id: a.id })))
    setLoading(false)
  }

  useEffect(() => { load() }, [reporterId])

  async function startWorking(story) {
    setUpdating(story.id)
    await supabase.from("stories").update({ status: "in_progress" }).eq("id", story.id)
    await load()
    setUpdating(null)
  }

  async function uploadAndFile() {
    if (!selectedFile || !fileModal || !reporterId) return
    setUploadingId(fileModal.id)
    try {
      const fileExt = selectedFile.name.split(".").pop()
      const fileName = fileModal.id + "_" + Date.now() + "." + fileExt
      const { error: uploadError } = await supabase.storage.from("story-files").upload(fileName, selectedFile, { upsert: true })
      if (uploadError) { alert("Upload failed: " + uploadError.message); setUploadingId(null); return }
      const { data: urlData } = supabase.storage.from("story-files").getPublicUrl(fileName)
      await supabase.from("stories").update({ status: "filed", filed_file_url: urlData.publicUrl, filed_file_name: selectedFile.name, filed_at: new Date().toISOString() }).eq("id", fileModal.id)
      setFileModal(null)
      setSelectedFile(null)
      await load()
    } catch (err) { alert("Error: " + err.message) }
    setUploadingId(null)
  }

  const active = stories.filter(s => s.status !== "filed" && s.status !== "published")
  const filed = stories.filter(s => s.status === "filed" || s.status === "published")

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", fontFamily: "DM Mono, Courier New, monospace" }}>
      <Navbar />
      <div style={{ padding: "32px 24px", maxWidth: "800px", margin: "0 auto" }}>
        <div style={{ marginBottom: "32px" }}>
          <h1 style={{ color: "#fff", margin: "0 0 4px", fontSize: "18px" }}>My Stories</h1>
          <p style={{ color: "#555", margin: 0, fontSize: "12px" }}>Your active assignments</p>
        </div>
        {loading ? (
          <div style={{ color: "#555", textAlign: "center", padding: "60px" }}>Loading...</div>
        ) : (
          <div>
            <div style={{ marginBottom: "32px" }}>
              <h2 style={{ color: "#888", fontSize: "11px", letterSpacing: "1.5px", margin: "0 0 12px" }}>{"ACTIVE - " + active.length}</h2>
              {active.length === 0 ? (
                <div style={{ color: "#333", fontSize: "13px", textAlign: "center", padding: "40px", border: "1px dashed rgba(255,255,255,0.07)", borderRadius: "6px" }}>No active stories</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {active.map(story => (
                    <div key={story.id} style={{ padding: "20px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
                            <span style={{ padding: "2px 8px", borderRadius: "3px", fontSize: "9px", background: urgencyColor[story.urgency] + "20", color: urgencyColor[story.urgency] }}>{story.urgency ? story.urgency.toUpperCase() : ""}</span>
                            <span style={{ padding: "2px 8px", borderRadius: "3px", fontSize: "9px", background: statusColor[story.status] + "15", color: statusColor[story.status] }}>{story.status ? story.status.replace("_", " ").toUpperCase() : ""}</span>
                            <span style={{ color: "#444", fontSize: "11px" }}>{story.category}</span>
                          </div>
                          <h3 style={{ color: "#fff", margin: "0 0 8px", fontSize: "15px", fontWeight: "600" }}>{story.headline}</h3>
                          <div style={{ display: "flex", gap: "16px" }}>
                            <span style={{ color: "#555", fontSize: "11px" }}>Deadline: <span style={{ color: "#888" }}>{story.deadline}</span></span>
                            <span style={{ color: "#555", fontSize: "11px" }}>Complexity: <span style={{ color: "#888" }}>{story.complexity}/5</span></span>
                          </div>
                          {story.reassign_reason && (
                            <div style={{ marginTop: "10px", padding: "10px 14px", background: "rgba(255,136,0,0.08)", border: "1px solid rgba(255,136,0,0.2)", borderRadius: "6px" }}>
                              <p style={{ color: "#888", fontSize: "10px", margin: "0 0 4px" }}>REASSIGNED - EDITOR FEEDBACK</p>
                              <p style={{ color: "#ff8800", fontSize: "12px", margin: 0 }}>{story.reassign_reason}</p>
                            </div>
                          )}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginLeft: "16px" }}>
                          {story.status === "assigned" && (
                            <button onClick={() => startWorking(story)} disabled={updating === story.id}
                              style={{ padding: "10px 16px", background: "rgba(255,180,0,0.1)", border: "1px solid rgba(255,180,0,0.3)", borderRadius: "4px", color: "#ffb400", fontSize: "10px", letterSpacing: "1px", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", opacity: updating === story.id ? 0.6 : 1 }}>
                              {updating === story.id ? "..." : "START WORKING"}
                            </button>
                          )}
                          {story.status === "in_progress" && (
                            <button onClick={() => setFileModal(story)}
                              style={{ padding: "10px 16px", background: "rgba(136,136,255,0.1)", border: "1px solid rgba(136,136,255,0.3)", borderRadius: "4px", color: "#8888ff", fontSize: "10px", letterSpacing: "1px", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                              FILE REPORT
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {filed.length > 0 && (
              <div>
                <h2 style={{ color: "#555", fontSize: "11px", letterSpacing: "1.5px", margin: "0 0 12px" }}>{"FILED / PUBLISHED - " + filed.length}</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {filed.map(story => (
                    <div key={story.id} style={{ padding: "16px 20px", borderRadius: "6px", border: "1px solid " + (story.status === "published" ? "rgba(100,200,150,0.2)" : "rgba(255,255,255,0.06)"), background: story.status === "published" ? "rgba(100,200,150,0.04)" : "rgba(255,255,255,0.02)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ color: story.status === "published" ? "#ddd" : "#666", fontSize: "14px", fontWeight: "600", marginBottom: "6px" }}>{story.headline}</div>
                          {story.filed_file_name && (
                            <div style={{ color: "#8888ff", fontSize: "10px", marginBottom: "8px" }}>{"Filed: " + story.filed_file_name}</div>
                          )}
                          {story.editor_feedback && story.status === "published" && (
                            <button onClick={() => setFeedbackModal(story)}
                              style={{ padding: "6px 12px", background: "rgba(255,180,0,0.08)", border: "1px solid rgba(255,180,0,0.25)", borderRadius: "4px", color: "#ffb400", fontSize: "11px", cursor: "pointer", fontFamily: "inherit", marginBottom: "4px" }}>
                              Editor left feedback - click to view
                            </button>
                          )}
                        </div>
                        <span style={{ color: story.status === "published" ? "#64c896" : "#8888ff", fontSize: "10px", letterSpacing: "1px", marginLeft: "12px", whiteSpace: "nowrap" }}>
                          {story.status ? story.status.toUpperCase() : ""}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {fileModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) { setFileModal(null); setSelectedFile(null) } }}>
          <div style={{ background: "#0d0d14", border: "1px solid rgba(136,136,255,0.3)", borderRadius: "8px", width: "100%", maxWidth: "440px", margin: "24px", padding: "24px", fontFamily: "DM Mono, Courier New, monospace" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <h2 style={{ color: "#fff", margin: 0, fontSize: "16px" }}>File Report</h2>
              <button onClick={() => { setFileModal(null); setSelectedFile(null) }} style={{ background: "none", border: "none", color: "#555", fontSize: "20px", cursor: "pointer" }}>x</button>
            </div>
            <p style={{ color: "#555", fontSize: "12px", margin: "0 0 20px" }}>Upload Word document for: <span style={{ color: "#ddd" }}>{fileModal.headline}</span></p>
            <div onClick={() => document.getElementById("file-input").click()}
              style={{ border: "2px dashed " + (selectedFile ? "rgba(136,136,255,0.5)" : "rgba(255,255,255,0.1)"), borderRadius: "8px", padding: "28px 20px", textAlign: "center", cursor: "pointer", marginBottom: "16px", background: selectedFile ? "rgba(136,136,255,0.05)" : "transparent" }}>
              {selectedFile ? (
                <div>
                  <div style={{ fontSize: "32px", marginBottom: "8px" }}>📘</div>
                  <p style={{ color: "#8888ff", fontSize: "13px", margin: "0 0 4px" }}>{selectedFile.name}</p>
                  <p style={{ color: "#555", fontSize: "11px", margin: 0 }}>{(selectedFile.size / 1024).toFixed(1) + " KB"}</p>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: "32px", marginBottom: "8px" }}>📘</div>
                  <p style={{ color: "#888", fontSize: "13px", margin: "0 0 4px" }}>Click to select Word document</p>
                  <p style={{ color: "#555", fontSize: "11px", margin: 0 }}>.doc, .docx files only</p>
                </div>
              )}
              <input id="file-input" type="file" accept=".doc,.docx" style={{ display: "none" }} onChange={e => setSelectedFile(e.target.files[0] || null)} />
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => { setFileModal(null); setSelectedFile(null) }}
                style={{ flex: 1, padding: "11px", background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "#666", fontSize: "12px", cursor: "pointer", fontFamily: "inherit" }}>CANCEL</button>
              <button onClick={uploadAndFile} disabled={!selectedFile || uploadingId === fileModal.id}
                style={{ flex: 1, padding: "11px", background: selectedFile ? "rgba(136,136,255,0.2)" : "rgba(255,255,255,0.05)", border: "1px solid " + (selectedFile ? "rgba(136,136,255,0.4)" : "rgba(255,255,255,0.1)"), borderRadius: "6px", color: selectedFile ? "#8888ff" : "#444", fontSize: "12px", fontWeight: "700", cursor: selectedFile ? "pointer" : "not-allowed", fontFamily: "inherit", opacity: uploadingId === fileModal.id ? 0.6 : 1 }}>
                {uploadingId === fileModal.id ? "UPLOADING..." : "SUBMIT REPORT"}
              </button>
            </div>
          </div>
        </div>
      )}

      {feedbackModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setFeedbackModal(null) }}>
          <div style={{ background: "#0d0d14", border: "1px solid rgba(255,180,0,0.3)", borderRadius: "8px", width: "100%", maxWidth: "440px", margin: "24px", padding: "24px", fontFamily: "DM Mono, Courier New, monospace" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px" }}>
              <h2 style={{ color: "#fff", margin: 0, fontSize: "16px" }}>Editor Feedback</h2>
              <button onClick={() => setFeedbackModal(null)} style={{ background: "none", border: "none", color: "#555", fontSize: "20px", cursor: "pointer" }}>x</button>
            </div>
            <p style={{ color: "#555", fontSize: "12px", margin: "0 0 16px" }}>For: <span style={{ color: "#ddd" }}>{feedbackModal.headline}</span></p>
            <div style={{ padding: "16px", background: "rgba(255,180,0,0.06)", border: "1px solid rgba(255,180,0,0.2)", borderRadius: "6px", marginBottom: "16px" }}>
              <p style={{ color: "#888", fontSize: "10px", letterSpacing: "1px", margin: "0 0 8px" }}>EDITOR SAYS</p>
              <p style={{ color: "#ffb400", fontSize: "14px", margin: 0, lineHeight: 1.6 }}>{feedbackModal.editor_feedback}</p>
              {feedbackModal.feedback_at && (
                <p style={{ color: "#555", fontSize: "10px", margin: "8px 0 0" }}>{new Date(feedbackModal.feedback_at).toLocaleString()}</p>
              )}
            </div>
            <div style={{ padding: "10px", background: "rgba(100,200,150,0.08)", border: "1px solid rgba(100,200,150,0.2)", borderRadius: "5px", marginBottom: "16px" }}>
              <p style={{ color: "#64c896", fontSize: "11px", margin: 0 }}>Your report has been published!</p>
            </div>
            <button onClick={() => setFeedbackModal(null)}
              style={{ width: "100%", padding: "11px", background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "#555", fontSize: "12px", cursor: "pointer", fontFamily: "inherit" }}>
              CLOSE
            </button>
          </div>
        </div>
      )}
    </div>
  )
}