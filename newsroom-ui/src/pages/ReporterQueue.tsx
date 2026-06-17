import { useEffect, useState, useRef, useCallback } from "react"
import { supabase } from "../lib/supabase"
import { useAuth } from "../context/AuthContext"
import Navbar from "../components/Navbar"
import { useTheme } from "../context/ThemeContext"
import { useDateFormat } from '../context/DateFormatContext'
import { useCollapse } from "../hooks/useCollapse"
import SectionCard from "../components/SectionCard"
import { useResponsive } from "../hooks/useResponsive"
import { sendNotification } from "../lib/notifications"

export default function ReporterQueue() {
  const { reporterId } = useAuth()
  const { t } = useTheme()
  const { formatDate } = useDateFormat()
  const { toggle, isCollapsed } = useCollapse('reporter-queue', ['active', 'filed', 'ai-reports'])
  const { isMobile, isTablet } = useResponsive()

  const [stories, setStories] = useState<any[]>([])
  const [assignments, setAssignments] = useState<any[]>([])
  const [aiReports, setAiReports] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [fileModal, setFileModal] = useState<any>(null)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [feedbackModal, setFeedbackModal] = useState<any>(null)
  const [overrideModal, setOverrideModal] = useState<{story: any, action: "accept" | "reject"} | null>(null)
  const [overrideResponse, setOverrideResponse] = useState("")
  const [overrideLoading, setOverrideLoading] = useState(false)
  const [viewReportModal, setViewReportModal] = useState<any>(null)

  // ── File upload enhancements ──
  const [dragOver, setDragOver] = useState(false)
  const [showCamera, setShowCamera] = useState(false)
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [cropMode, setCropMode] = useState(false)
  const [cropStart, setCropStart] = useState<{x: number, y: number} | null>(null)
  const [cropRect, setCropRect] = useState<{x: number, y: number, w: number, h: number} | null>(null)
  const [isCropping, setIsCropping] = useState(false)
  const [cropImageIndex, setCropImageIndex] = useState<number | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cropCanvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)

  const urgencyColor: Record<string, string> = {
    breaking: t.breaking, high: t.warning, normal: t.accent, low: t.success
  }
  const statusColor: Record<string, string> = {
    assigned: t.warning, in_progress: t.success, filed: "#a78bfa", published: t.success
  }

  // ── Helper: get editor emails for notifications ──
  async function getEditorEmails(): Promise<string[]> {
    const { data } = await supabase
      .from("profiles")
      .select("reporter_id")
      .eq("role", "editor")
    const reporterIds = (data || []).map((p: any) => p.reporter_id).filter(Boolean)
    if (reporterIds.length === 0) return []
    const { data: editorReporters } = await supabase
      .from("reporters")
      .select("email")
      .in("id", reporterIds)
    return (editorReporters || []).map((r: any) => r.email).filter(Boolean)
  }

  async function load() {
    if (!reporterId) return
    const { data } = await supabase
      .from("assignments").select("*, stories(*)")
      .eq("reporter_id", reporterId).eq("is_active", true)
      .order("assigned_at", { ascending: false })
    setAssignments(data || [])
    setStories((data || []).map((a: any) => ({
      ...a.stories, assignment_id: a.id, is_override: a.is_override,
      override_reason: a.override_reason, override_status: a.override_status,
      override_response: a.override_response
    })))
    const { data: reports } = await supabase.from("ai_reports").select("*")
      .eq("status", "approved").order("approved_at", { ascending: false })
    setAiReports(reports || [])
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
    await load(); setUpdating(null)
  }

  async function handleOverride(story: any, actionType: "accept" | "reject") {
    if (!overrideResponse.trim()) return
    setOverrideLoading(true)
    try {
      if (actionType === "accept") {
        await supabase.from("assignments").update({
          override_status: "accepted", override_response: overrideResponse,
          override_responded_at: new Date().toISOString()
        }).eq("id", story.assignment_id)
      } else {
        await supabase.from("assignments").update({
          override_status: "rejected", override_response: overrideResponse,
          override_responded_at: new Date().toISOString()
        }).eq("id", story.assignment_id)
        await supabase.from("stories").update({ status: "unassigned" }).eq("id", story.id)
      }

      const editorEmails = await getEditorEmails()
      editorEmails.forEach(email => {
        sendNotification({
          recipient_email: email,
          subject: `Override Assignment ${actionType === "accept" ? "Accepted" : "Rejected"}: ${story.headline}`,
          body_lines: [
            `The reporter has <strong>${actionType === "accept" ? "ACCEPTED" : "REJECTED"}</strong> the override assignment for <strong>"${story.headline}"</strong>.`,
            `Reporter's reason: ${overrideResponse.trim()}`,
            actionType === "reject" ? `The story has been moved back to UNASSIGNED and needs reassignment.` : `The reporter will proceed with covering this story.`,
          ],
          notification_type: "override_response",
          reporter_id: reporterId,
          story_id: story.id,
        })
      })

      setOverrideModal(null); setOverrideResponse(""); await load()
    } catch (err: any) { alert("Error: " + err.message) }
    setOverrideLoading(false)
  }

  async function uploadAndFile() {
    if (!selectedFiles.length || !fileModal || !reporterId) return
    setUploadingId(fileModal.id)
    try {
      const uploadedUrls: string[] = []
      const uploadedNames: string[] = []

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i]
        // Unique filename — story id + timestamp + random to avoid collisions
        const fileExt = file.name.split(".").pop() || "bin"
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
        const fileName = `${fileModal.id}_${Date.now()}_${Math.random().toString(36).slice(2)}_${safeName}`

        const { error: uploadError } = await supabase.storage
          .from("story-files").upload(fileName, file, { upsert: true })

        if (uploadError) {
          alert(`Upload failed for ${file.name}: ${uploadError.message}`)
          continue
        }

        const { data: urlData } = supabase.storage.from("story-files").getPublicUrl(fileName)
        uploadedUrls.push(urlData.publicUrl)
        uploadedNames.push(file.name)
      }

      if (uploadedUrls.length === 0) {
        alert("No files were uploaded successfully.")
        setUploadingId(null)
        return
      }

      // ── KEY FIX: Store ALL urls as JSON array so editor can open each one ──
      await supabase.from("stories").update({
        status: "filed",
        filed_file_url: JSON.stringify(uploadedUrls),
        filed_file_name: uploadedNames.join(", "),
        filed_at: new Date().toISOString()
      }).eq("id", fileModal.id)

      const editorEmails = await getEditorEmails()
      editorEmails.forEach(email => {
        sendNotification({
          recipient_email: email,
          subject: `Story Filed: ${fileModal.headline}`,
          body_lines: [
            `A reporter has filed their report for <strong>"${fileModal.headline}"</strong>.`,
            `${uploadedNames.length} file(s) submitted: ${uploadedNames.join(", ")}`,
            `Please review and publish from the Story Board.`,
          ],
          notification_type: "story_filed",
          reporter_id: reporterId,
          story_id: fileModal.id,
        })
      })

      closeFileModal()
      await load()
    } catch (err: any) {
      alert("Error: " + err.message)
    }
    setUploadingId(null)
  }

  function closeFileModal() {
    stopCamera()
    setFileModal(null); setSelectedFiles([]); setDragOver(false)
    setShowCamera(false); setCapturedImage(null); setCropMode(false)
    setCropRect(null); setCropStart(null); setCropImageIndex(null)
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length) setSelectedFiles(prev => [...prev, ...files])
  }, [])

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: isMobile ? "environment" : "user" }, audio: false
      })
      setCameraStream(stream)
      setShowCamera(true)
      setCapturedImage(null)
      setCropRect(null)
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream
      }, 100)
    } catch {
      alert("Camera not available. Please use file upload instead.")
    }
  }

  function stopCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop())
      setCameraStream(null)
    }
    setShowCamera(false)
  }

  function capturePhoto() {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9)
    setCapturedImage(dataUrl)
    stopCamera()
    setCropMode(true)
    setCropRect(null)
  }

  function getCropCoords(e: React.MouseEvent<HTMLDivElement>, container: HTMLDivElement) {
    const rect = container.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
    }
  }

  function onCropMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    const pos = getCropCoords(e, e.currentTarget)
    setCropStart(pos); setIsCropping(true); setCropRect(null)
  }

  function onCropMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!isCropping || !cropStart) return
    const pos = getCropCoords(e, e.currentTarget)
    setCropRect({
      x: Math.min(cropStart.x, pos.x), y: Math.min(cropStart.y, pos.y),
      w: Math.abs(pos.x - cropStart.x), h: Math.abs(pos.y - cropStart.y)
    })
  }

  function onCropMouseUp() { setIsCropping(false) }

  function applyCrop() {
    if (!capturedImage || !cropCanvasRef.current) return
    const img = new Image()
    img.onload = () => {
      const canvas = cropCanvasRef.current!
      const r = cropRect || { x: 0, y: 0, w: 1, h: 1 }
      const sx = r.x * img.width, sy = r.y * img.height
      const sw = (r.w || 1) * img.width, sh = (r.h || 1) * img.height
      canvas.width = sw; canvas.height = sh
      const ctx = canvas.getContext("2d")!
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
      canvas.toBlob(blob => {
        if (blob) {
          const file = new File([blob], `capture_${Date.now()}.jpg`, { type: "image/jpeg" })
          if (cropImageIndex !== null) {
            setSelectedFiles(prev => prev.map((f, i) => i === cropImageIndex ? file : f))
            setCropImageIndex(null)
          } else {
            setSelectedFiles(prev => [...prev, file])
          }
          setCapturedImage(null); setCropMode(false); setCropRect(null)
        }
      }, "image/jpeg", 0.9)
    }
    img.src = capturedImage
  }

  function skipCrop() {
    if (!capturedImage) return
    fetch(capturedImage).then(r => r.blob()).then(blob => {
      const file = new File([blob], `capture_${Date.now()}.jpg`, { type: "image/jpeg" })
      if (cropImageIndex !== null) {
        setSelectedFiles(prev => prev.map((f, i) => i === cropImageIndex ? file : f))
        setCropImageIndex(null)
      } else {
        setSelectedFiles(prev => [...prev, file])
      }
      setCapturedImage(null); setCropMode(false)
    })
  }

  function recropFile(index: number) {
    const file = selectedFiles[index]
    if (!file.type.startsWith("image/")) return
    const reader = new FileReader()
    reader.onload = e => {
      setCapturedImage(e.target?.result as string)
      setCropMode(true); setCropRect(null); setCropImageIndex(index)
    }
    reader.readAsDataURL(file)
  }

  function getFileIcon(file: File): string {
    const type = file.type
    if (type.startsWith("image/")) return "🖼️"
    if (type.includes("pdf")) return "📄"
    if (type.includes("word") || file.name.endsWith(".doc") || file.name.endsWith(".docx")) return "📘"
    if (type.includes("sheet") || file.name.endsWith(".xlsx") || file.name.endsWith(".csv")) return "📊"
    if (type.includes("video")) return "🎬"
    if (type.includes("audio")) return "🎵"
    return "📎"
  }

  const active = stories.filter(s => s.status !== "filed" && s.status !== "published")
  const filed = stories.filter(s => s.status === "filed" || s.status === "published")

  function getConfidenceColor(score: number) {
    if (score >= 75) return t.success
    if (score >= 50) return t.warning
    return t.danger
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 14px",
    background: t.bgInput, border: `1px solid ${t.borderInput}`,
    borderRadius: "8px", color: t.textPrimary,
    fontSize: isMobile ? "16px" : "13px",
    outline: "none", boxSizing: "border-box",
    fontFamily: "inherit", resize: "none" as const,
  }

  return (
    <div style={{ minHeight: "100vh", background: t.bgPage, fontFamily: '"Inter", "DM Mono", "Courier New", monospace', color: t.textPrimary }}>
      <Navbar />
      <main role="main" style={{ padding: isMobile ? "16px 12px" : isTablet ? "24px 16px" : "32px 24px", maxWidth: isMobile ? "100%" : "860px", margin: "0 auto" }}>

        <div style={{ marginBottom: isMobile ? "20px" : "32px" }}>
          <h1 style={{ color: t.textPrimary, margin: "0 0 6px", fontSize: isMobile ? "18px" : "22px", fontWeight: "700" }}>My Stories</h1>
          <p style={{ color: t.textMuted, margin: 0, fontSize: "13px" }}>Your active assignments, filed reports and AI-generated reports</p>
        </div>

        {loading ? (
          <div style={{ color: t.textMuted, textAlign: "center", padding: "60px", fontSize: "14px" }}>Loading your stories...</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? "12px" : "20px" }}>

            {/* ACTIVE STORIES */}
            <SectionCard title="ACTIVE STORIES" isCollapsed={isCollapsed('active')} onToggle={() => toggle('active')} badge={active.length} badgeColor={t.accent}>
              {active.length === 0 ? (
                <div style={{ color: t.textDisabled, fontSize: "14px", textAlign: "center", padding: isMobile ? "32px 16px" : "48px", border: `1px dashed ${t.borderCard}`, borderRadius: "10px", background: t.bgPage }}>No active stories assigned to you</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {active.map(story => (
                    <div key={story.id} style={{ padding: isMobile ? "14px" : "20px 24px", borderRadius: "10px", border: `1px solid ${story.is_override && story.override_status === "pending" ? t.dangerBorder : t.borderCard}`, background: story.is_override && story.override_status === "pending" ? t.dangerBg : t.bgPage, boxShadow: t.shadowCard }}>
                      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: "flex-start", gap: isMobile ? "12px" : "0" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
                            <span style={{ padding: "3px 10px", borderRadius: "4px", fontSize: "10px", fontWeight: "700", background: `${urgencyColor[story.urgency]}20`, color: urgencyColor[story.urgency], border: `1px solid ${urgencyColor[story.urgency]}40` }}>{story.urgency?.toUpperCase()}</span>
                            <span style={{ padding: "3px 10px", borderRadius: "4px", fontSize: "10px", fontWeight: "600", background: `${statusColor[story.status]}15`, color: statusColor[story.status], border: `1px solid ${statusColor[story.status]}30` }}>{story.status?.replace("_", " ").toUpperCase()}</span>
                            <span style={{ color: t.textMuted, fontSize: "12px" }}>{story.category}</span>
                            {story.is_override && <span style={{ padding: "3px 10px", borderRadius: "4px", fontSize: "10px", fontWeight: "700", background: t.dangerBg, color: t.danger, border: `1px solid ${t.dangerBorder}` }}>OVERRIDE</span>}
                          </div>
                          <h3 style={{ color: t.textPrimary, margin: "0 0 10px", fontSize: isMobile ? "14px" : "16px", fontWeight: "700", lineHeight: 1.4 }}>{story.headline}</h3>
                          <div style={{ display: "flex", gap: isMobile ? "12px" : "20px", flexWrap: "wrap" }}>
                            <span style={{ color: t.textMuted, fontSize: "12px" }}>Deadline: <span style={{ color: t.textSecondary, fontWeight: "600" }}>{formatDate(story.deadline)}</span></span>
                            <span style={{ color: t.textMuted, fontSize: "12px" }}>Complexity: <span style={{ color: t.textSecondary, fontWeight: "600" }}>{story.complexity}/5</span></span>
                          </div>
                          {story.reassign_reason && (
                            <div style={{ marginTop: "12px", padding: "12px 16px", background: t.warningBg, border: `1px solid ${t.warningBorder}`, borderRadius: "8px" }}>
                              <p style={{ color: t.textMuted, fontSize: "11px", fontWeight: "600", margin: "0 0 4px" }}>REASSIGNED — EDITOR FEEDBACK</p>
                              <p style={{ color: t.warning, fontSize: "13px", margin: 0, lineHeight: 1.5 }}>{story.reassign_reason}</p>
                            </div>
                          )}
                          {story.is_override && story.override_status === "pending" && (
                            <div style={{ marginTop: "12px", padding: "14px 16px", background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, borderRadius: "8px" }}>
                              <p style={{ color: t.danger, fontSize: "11px", fontWeight: "700", margin: "0 0 8px" }}>OVERRIDE ASSIGNMENT — YOU ARE CURRENTLY UNAVAILABLE</p>
                              <p style={{ color: t.textMuted, fontSize: "12px", margin: "0 0 12px", lineHeight: 1.5 }}>Editor reason: <span style={{ color: t.warning, fontWeight: "600" }}>{story.override_reason}</span></p>
                              <div style={{ display: "flex", gap: "8px" }}>
                                <button onClick={() => setOverrideModal({ story, action: "accept" })} style={{ flex: 1, padding: "9px", background: t.successBg, border: `1px solid ${t.successBorder}`, borderRadius: "6px", color: t.success, fontSize: "11px", fontWeight: "700", cursor: "pointer", fontFamily: "inherit", minHeight: "44px" }}>ACCEPT</button>
                                <button onClick={() => setOverrideModal({ story, action: "reject" })} style={{ flex: 1, padding: "9px", background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, borderRadius: "6px", color: t.danger, fontSize: "11px", fontWeight: "700", cursor: "pointer", fontFamily: "inherit", minHeight: "44px" }}>REJECT</button>
                              </div>
                            </div>
                          )}
                          {story.is_override && story.override_status === "accepted" && (
                            <div style={{ marginTop: "12px", padding: "10px 14px", background: t.successBg, border: `1px solid ${t.successBorder}`, borderRadius: "8px" }}>
                              <p style={{ color: t.success, fontSize: "12px", fontWeight: "600", margin: 0 }}>You accepted this override assignment</p>
                            </div>
                          )}
                        </div>
                        {(!story.is_override || story.override_status === "accepted") && (
                          <div style={{ display: "flex", flexDirection: isMobile ? "row" : "column", gap: "8px", marginLeft: isMobile ? "0" : "20px", flexShrink: 0, width: isMobile ? "100%" : "auto" }}>
                            {story.status === "assigned" && (
                              <button onClick={() => startWorking(story)} disabled={updating === story.id} style={{ padding: "10px 18px", background: t.warningBg, border: `1px solid ${t.warningBorder}`, borderRadius: "6px", color: t.warning, fontSize: "11px", fontWeight: "700", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", opacity: updating === story.id ? 0.6 : 1, flex: isMobile ? 1 : "none", minHeight: "44px" }}>
                                {updating === story.id ? "..." : "START WORKING"}
                              </button>
                            )}
                            {story.status === "in_progress" && (
                              <button onClick={() => setFileModal(story)} style={{ padding: "10px 18px", background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.35)", borderRadius: "6px", color: "#a78bfa", fontSize: "11px", fontWeight: "700", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", flex: isMobile ? 1 : "none", minHeight: "44px" }}>
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

            {/* FILED / PUBLISHED */}
            {filed.length > 0 && (
              <SectionCard title="FILED / PUBLISHED" isCollapsed={isCollapsed('filed')} onToggle={() => toggle('filed')} badge={filed.length} badgeColor={t.success}>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {filed.map(story => (
                    <div key={story.id} style={{ padding: isMobile ? "12px" : "16px 20px", borderRadius: "10px", border: `1px solid ${story.status === "published" ? t.successBorder : "rgba(167,139,250,0.25)"}`, background: story.status === "published" ? t.successBg : "rgba(167,139,250,0.06)", boxShadow: t.shadowCard }}>
                      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: "flex-start", gap: isMobile ? "8px" : "0" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ color: story.status === "published" ? t.textPrimary : t.textSecondary, fontSize: isMobile ? "13px" : "15px", fontWeight: "700", marginBottom: "6px" }}>{story.headline}</div>
                          {story.filed_file_name && <div style={{ color: "#a78bfa", fontSize: "11px", marginBottom: "8px", fontWeight: "500" }}>Filed: {story.filed_file_name}</div>}
                          {story.editor_feedback && story.status === "published" && (
                            <button onClick={() => setFeedbackModal(story)} style={{ padding: "7px 14px", background: t.warningBg, border: `1px solid ${t.warningBorder}`, borderRadius: "6px", color: t.warning, fontSize: "12px", fontWeight: "600", cursor: "pointer", fontFamily: "inherit", minHeight: "44px" }}>Editor left feedback — click to view</button>
                          )}
                        </div>
                        <span style={{ padding: "4px 12px", borderRadius: "4px", fontSize: "11px", fontWeight: "700", marginLeft: isMobile ? "0" : "16px", whiteSpace: "nowrap", background: story.status === "published" ? t.successBg : "rgba(167,139,250,0.15)", color: story.status === "published" ? t.success : "#a78bfa", border: `1px solid ${story.status === "published" ? t.successBorder : "rgba(167,139,250,0.3)"}` }}>
                          {story.status?.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}

            {/* AI REPORTS */}
            <SectionCard title="AMBIENT SCRIBE REPORTS" isCollapsed={isCollapsed('ai-reports')} onToggle={() => toggle('ai-reports')} badge={aiReports.length} badgeColor={t.accent}>
              {aiReports.length === 0 ? (
                <div style={{ color: t.textDisabled, fontSize: "14px", textAlign: "center", padding: isMobile ? "24px 12px" : "40px", border: `1px dashed ${t.borderCard}`, borderRadius: "10px", background: t.bgPage }}>No approved AI reports yet — your editor will publish reports here</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {aiReports.map(r => (
                    <div key={r.id} style={{ padding: isMobile ? "14px" : "18px 20px", borderRadius: "10px", border: `1px solid ${t.accentBorder}`, background: t.accentBg, boxShadow: t.shadowCard }}>
                      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px", gap: isMobile ? "10px" : "0" }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px", flexWrap: "wrap" }}>
                            <div style={{ padding: "4px 12px", background: t.accentBg, border: `1px solid ${t.accentBorder}`, borderRadius: "6px" }}>
                              <span style={{ color: t.accent, fontSize: "10px", fontWeight: "700", letterSpacing: "1px" }}>AMBIENT SCRIBE</span>
                            </div>
                            <span style={{ padding: "3px 10px", borderRadius: "4px", fontSize: "10px", fontWeight: "700", background: t.successBg, color: t.success, border: `1px solid ${t.successBorder}` }}>✓ APPROVED</span>
                          </div>
                          <p style={{ color: t.textMuted, fontSize: "12px", margin: 0 }}>Published: {formatDate(r.approved_at?.split('T')[0])}{r.story_ids?.length > 0 && ` | ${r.story_ids.length} stor${r.story_ids.length > 1 ? 'ies' : 'y'} referenced`}</p>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", width: isMobile ? "100%" : "auto", justifyContent: isMobile ? "space-between" : "flex-end" }}>
                          <div style={{ textAlign: "right" as const }}>
                            <div style={{ fontSize: isMobile ? "20px" : "24px", fontWeight: "800", color: getConfidenceColor(r.confidence_score) }}>{r.confidence_score}%</div>
                            <div style={{ color: t.textMuted, fontSize: "10px", fontWeight: "600" }}>CONFIDENCE</div>
                          </div>
                          <button onClick={() => setViewReportModal(r)} style={{ padding: "8px 16px", background: t.accent, border: "none", borderRadius: "6px", color: t.accentText, fontSize: "11px", fontWeight: "700", cursor: "pointer", fontFamily: "inherit", minHeight: "44px" }}>READ REPORT</button>
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: "8px" }}>
                        {[
                          { label: "📝 Story Notes", content: r.story_notes, color: t.accent },
                          { label: "👤 Assignment Notes", content: r.assignment_notes, color: "#a78bfa" },
                          { label: "📅 Rostering Notes", content: r.rostering_notes, color: t.success },
                        ].map(s => (
                          <div key={s.label} style={{ padding: "10px 12px", background: t.bgCard, borderRadius: "8px", border: `1px solid ${t.borderCard}` }}>
                            <p style={{ color: s.color, fontSize: "10px", fontWeight: "700", margin: "0 0 4px", letterSpacing: "0.5px" }}>{s.label}</p>
                            <p style={{ color: t.textMuted, fontSize: "11px", margin: 0, lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>{s.content}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
        )}
      </main>

      {/* View Full Report Modal */}
      {viewReportModal && (
        <div style={{ position: "fixed", inset: 0, background: t.overlayBg, display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setViewReportModal(null) }}>
          <div style={{ background: t.bgCard, border: `1px solid ${t.accentBorder}`, borderRadius: isMobile ? "14px 14px 0 0" : "14px", width: "100%", maxWidth: isMobile ? "100%" : "700px", margin: isMobile ? "0" : "24px", padding: isMobile ? "20px 16px" : "28px", boxShadow: t.shadow, maxHeight: isMobile ? "90vh" : "88vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "5px 12px", background: t.accentBg, border: `1px solid ${t.accentBorder}`, borderRadius: "6px", marginBottom: "8px" }}>
                  <span style={{ color: t.accent, fontSize: "10px", fontWeight: "700", letterSpacing: "1px" }}>AMBIENT SCRIBE REPORT</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                  <span style={{ padding: "3px 10px", borderRadius: "4px", fontSize: "10px", fontWeight: "700", background: t.successBg, color: t.success, border: `1px solid ${t.successBorder}` }}>✓ APPROVED</span>
                  <span style={{ color: t.textMuted, fontSize: "12px" }}>Published: {formatDate(viewReportModal.approved_at?.split('T')[0])}</span>
                  <div style={{ fontSize: "18px", fontWeight: "800", color: getConfidenceColor(viewReportModal.confidence_score) }}>{viewReportModal.confidence_score}% confidence</div>
                </div>
              </div>
              <button onClick={() => setViewReportModal(null)} style={{ background: "none", border: "none", color: t.textMuted, fontSize: "22px", cursor: "pointer", minWidth: "44px", minHeight: "44px" }}>x</button>
            </div>
            {[
              { label: "📝 Notes about the Story", content: viewReportModal.story_notes, color: t.accent, border: t.accentBorder, bg: t.accentBg },
              { label: "👤 Notes about Assignment to Reporter", content: viewReportModal.assignment_notes, color: "#a78bfa", border: "rgba(167,139,250,0.3)", bg: "rgba(167,139,250,0.08)" },
              { label: "📅 Notes about Reporter Rostering", content: viewReportModal.rostering_notes, color: t.success, border: t.successBorder, bg: t.successBg },
            ].map(section => (
              <div key={section.label} style={{ marginBottom: "16px", padding: isMobile ? "14px" : "18px", borderRadius: "8px", border: `1px solid ${section.border}`, background: section.bg }}>
                <h3 style={{ color: section.color, margin: "0 0 12px", fontSize: "13px", fontWeight: "700", letterSpacing: "0.5px" }}>{section.label}</h3>
                <p style={{ color: t.textPrimary, fontSize: "13px", margin: 0, lineHeight: 1.8 }}>{section.content}</p>
              </div>
            ))}
            <button onClick={() => setViewReportModal(null)} style={{ width: "100%", padding: "13px", background: t.accent, border: "none", borderRadius: "8px", color: t.accentText, fontSize: "13px", fontWeight: "700", cursor: "pointer", fontFamily: "inherit", minHeight: "48px" }}>CLOSE</button>
          </div>
        </div>
      )}

      {/* Override Modal */}
      {overrideModal && (
        <div role="dialog" aria-modal="true"
          style={{ position: "fixed", inset: 0, background: t.overlayBg, display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) { setOverrideModal(null); setOverrideResponse("") } }}>
          <div style={{ background: t.bgCard, border: `1px solid ${overrideModal.action === "accept" ? t.successBorder : t.dangerBorder}`, borderRadius: isMobile ? "14px 14px 0 0" : "12px", width: "100%", maxWidth: isMobile ? "100%" : "460px", margin: isMobile ? "0" : "24px", padding: isMobile ? "20px 16px" : "28px", fontFamily: "inherit", boxShadow: t.shadow }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", alignItems: "center" }}>
              <h2 style={{ color: t.textPrimary, margin: 0, fontSize: isMobile ? "16px" : "18px", fontWeight: "700" }}>{overrideModal.action === "accept" ? "Accept Override Assignment" : "Reject Override Assignment"}</h2>
              <button onClick={() => { setOverrideModal(null); setOverrideResponse("") }} style={{ background: "none", border: "none", color: t.textMuted, fontSize: "22px", cursor: "pointer", minWidth: "44px", minHeight: "44px" }}>x</button>
            </div>
            <p style={{ color: t.textMuted, fontSize: "13px", margin: "0 0 4px" }}>Story: <span style={{ color: t.textPrimary, fontWeight: "600" }}>{overrideModal.story.headline}</span></p>
            <p style={{ color: t.textMuted, fontSize: "13px", margin: "0 0 16px" }}>Editor reason: <span style={{ color: t.warning, fontWeight: "600" }}>{overrideModal.story.override_reason}</span></p>
            <div style={{ padding: "12px 16px", background: overrideModal.action === "accept" ? t.successBg : t.dangerBg, border: `1px solid ${overrideModal.action === "accept" ? t.successBorder : t.dangerBorder}`, borderRadius: "8px", marginBottom: "16px" }}>
              <p style={{ color: overrideModal.action === "accept" ? t.success : t.danger, fontSize: "12px", margin: 0, lineHeight: 1.5 }}>
                {overrideModal.action === "accept" ? "By accepting, you commit to covering this story despite being unavailable." : "By rejecting, the story will be moved back to unassigned and editor will be notified."}
              </p>
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label style={{ color: t.textSecondary, fontSize: "12px", fontWeight: "600", display: "block", marginBottom: "6px" }}>YOUR REASON <span style={{ color: t.danger }}>*required</span></label>
              <textarea value={overrideResponse} onChange={e => setOverrideResponse(e.target.value)} rows={3}
                placeholder={overrideModal.action === "accept" ? "e.g. I can manage the story despite being unavailable today..." : "e.g. I am unable to cover this story due to medical emergency..."}
                style={inputStyle} />
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => { setOverrideModal(null); setOverrideResponse("") }} style={{ flex: 1, padding: "12px", background: "transparent", border: `1px solid ${t.borderCard}`, borderRadius: "8px", color: t.textMuted, fontSize: "13px", cursor: "pointer", fontFamily: "inherit", minHeight: "48px" }}>CANCEL</button>
              <button onClick={() => handleOverride(overrideModal.story, overrideModal.action)} disabled={!overrideResponse.trim() || overrideLoading}
                style={{ flex: 1, padding: "12px", background: overrideResponse.trim() ? (overrideModal.action === "accept" ? t.successBg : t.dangerBg) : t.bgInput, border: `1px solid ${overrideResponse.trim() ? (overrideModal.action === "accept" ? t.successBorder : t.dangerBorder) : t.borderCard}`, borderRadius: "8px", color: overrideResponse.trim() ? (overrideModal.action === "accept" ? t.success : t.danger) : t.textDisabled, fontSize: "13px", fontWeight: "700", cursor: overrideResponse.trim() ? "pointer" : "not-allowed", fontFamily: "inherit", opacity: overrideLoading ? 0.6 : 1, minHeight: "48px" }}>
                {overrideLoading ? "PROCESSING..." : overrideModal.action === "accept" ? "CONFIRM ACCEPT" : "CONFIRM REJECT"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ENHANCED FILE UPLOAD MODAL ── */}
      {fileModal && (
        <div role="dialog" aria-modal="true"
          style={{ position: "fixed", inset: 0, background: t.overlayBg, display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) closeFileModal() }}>
          <div style={{ background: t.bgCard, border: "1px solid rgba(167,139,250,0.35)", borderRadius: isMobile ? "14px 14px 0 0" : "12px", width: "100%", maxWidth: isMobile ? "100%" : "560px", margin: isMobile ? "0" : "24px", padding: isMobile ? "20px 16px" : "28px", fontFamily: "inherit", boxShadow: t.shadow, maxHeight: isMobile ? "92vh" : "90vh", overflowY: "auto" }}>

            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", alignItems: "center" }}>
              <h2 style={{ color: t.textPrimary, margin: 0, fontSize: isMobile ? "16px" : "18px", fontWeight: "700" }}>File Report</h2>
              <button onClick={closeFileModal} style={{ background: "none", border: "none", color: t.textMuted, fontSize: "22px", cursor: "pointer", minWidth: "44px", minHeight: "44px" }}>x</button>
            </div>
            <p style={{ color: t.textMuted, fontSize: "13px", margin: "0 0 16px" }}>
              Submit for: <span style={{ color: t.textPrimary, fontWeight: "600" }}>{fileModal.headline}</span>
            </p>

            {/* ── CAMERA VIEW ── */}
            {showCamera && (
              <div style={{ marginBottom: "16px" }}>
                <div style={{ position: "relative", borderRadius: "10px", overflow: "hidden", background: "#000", marginBottom: "10px" }}>
                  <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", display: "block", borderRadius: "10px" }} />
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button onClick={capturePhoto}
                    style={{ flex: 1, padding: "12px", background: t.accent, border: "none", borderRadius: "8px", color: t.accentText, fontSize: "13px", fontWeight: "700", cursor: "pointer", fontFamily: "inherit", minHeight: "48px" }}>
                    📸 CAPTURE PHOTO
                  </button>
                  <button onClick={stopCamera}
                    style={{ padding: "12px 16px", background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, borderRadius: "8px", color: t.danger, fontSize: "13px", fontWeight: "700", cursor: "pointer", fontFamily: "inherit", minHeight: "48px" }}>
                    CANCEL
                  </button>
                </div>
                <canvas ref={canvasRef} style={{ display: "none" }} />
              </div>
            )}

            {/* ── CROP VIEW ── */}
            {cropMode && capturedImage && (
              <div style={{ marginBottom: "16px" }}>
                <p style={{ color: t.textMuted, fontSize: "12px", margin: "0 0 8px", fontWeight: "600" }}>
                  ✂️ DRAG TO SELECT CROP AREA — or use full image
                </p>
                <div
                  style={{ position: "relative", userSelect: "none", cursor: "crosshair", borderRadius: "8px", overflow: "hidden", border: `2px solid ${t.accentBorder}` }}
                  onMouseDown={onCropMouseDown}
                  onMouseMove={onCropMouseMove}
                  onMouseUp={onCropMouseUp}
                  onMouseLeave={onCropMouseUp}
                  onTouchStart={e => {
                    const touch = e.touches[0]
                    const rect = e.currentTarget.getBoundingClientRect()
                    setCropStart({ x: (touch.clientX - rect.left) / rect.width, y: (touch.clientY - rect.top) / rect.height })
                    setIsCropping(true); setCropRect(null)
                  }}
                  onTouchMove={e => {
                    if (!isCropping || !cropStart) return
                    const touch = e.touches[0]
                    const rect = e.currentTarget.getBoundingClientRect()
                    const pos = { x: Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (touch.clientY - rect.top) / rect.height)) }
                    setCropRect({ x: Math.min(cropStart.x, pos.x), y: Math.min(cropStart.y, pos.y), w: Math.abs(pos.x - cropStart.x), h: Math.abs(pos.y - cropStart.y) })
                  }}
                  onTouchEnd={() => setIsCropping(false)}>
                  <img src={capturedImage} alt="Crop" style={{ width: "100%", display: "block", pointerEvents: "none" }} />
                  {cropRect && (
                    <div style={{ position: "absolute", left: `${cropRect.x * 100}%`, top: `${cropRect.y * 100}%`, width: `${cropRect.w * 100}%`, height: `${cropRect.h * 100}%`, border: `2px solid ${t.accent}`, background: `${t.accent}25`, pointerEvents: "none" }} />
                  )}
                </div>
                <canvas ref={cropCanvasRef} style={{ display: "none" }} />
                <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
                  <button onClick={applyCrop} disabled={!cropRect}
                    style={{ flex: 1, padding: "11px", background: cropRect ? t.accent : t.bgInput, border: "none", borderRadius: "8px", color: cropRect ? t.accentText : t.textDisabled, fontSize: "12px", fontWeight: "700", cursor: cropRect ? "pointer" : "not-allowed", fontFamily: "inherit", minHeight: "44px" }}>
                    ✂️ APPLY CROP
                  </button>
                  <button onClick={skipCrop}
                    style={{ flex: 1, padding: "11px", background: t.bgPage, border: `1px solid ${t.borderCard}`, borderRadius: "8px", color: t.textMuted, fontSize: "12px", fontWeight: "600", cursor: "pointer", fontFamily: "inherit", minHeight: "44px" }}>
                    USE FULL IMAGE
                  </button>
                  <button onClick={() => { setCapturedImage(null); setCropMode(false); setCropRect(null); setCropImageIndex(null) }}
                    style={{ padding: "11px 14px", background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, borderRadius: "8px", color: t.danger, fontSize: "12px", fontWeight: "700", cursor: "pointer", fontFamily: "inherit", minHeight: "44px" }}>
                    DISCARD
                  </button>
                </div>
              </div>
            )}

            {/* ── MAIN UPLOAD UI ── */}
            {!showCamera && !cropMode && (
              <>
                {/* Source buttons */}
                <div style={{ display: "flex", gap: "8px", marginBottom: "14px", flexWrap: "wrap" }}>
                  <button onClick={() => fileInputRef.current?.click()}
                    style={{ flex: 1, padding: "10px", background: t.accentBg, border: `1px solid ${t.accentBorder}`, borderRadius: "8px", color: t.accent, fontSize: "12px", fontWeight: "700", cursor: "pointer", fontFamily: "inherit", minHeight: "44px", minWidth: "80px" }}>
                    📁 BROWSE
                  </button>
                  <button onClick={startCamera}
                    style={{ flex: 1, padding: "10px", background: t.warningBg, border: `1px solid ${t.warningBorder}`, borderRadius: "8px", color: t.warning, fontSize: "12px", fontWeight: "700", cursor: "pointer", fontFamily: "inherit", minHeight: "44px", minWidth: "80px" }}>
                    📷 CAMERA
                  </button>
                  {isMobile && (
                    <button onClick={() => {
                      const input = document.createElement("input")
                      input.type = "file"; input.accept = "image/*"; input.multiple = true
                      input.onchange = (e: any) => {
                        const files = Array.from(e.target.files || []) as File[]
                        if (files.length) setSelectedFiles(prev => [...prev, ...files])
                      }
                      input.click()
                    }}
                      style={{ flex: 1, padding: "10px", background: t.successBg, border: `1px solid ${t.successBorder}`, borderRadius: "8px", color: t.success, fontSize: "12px", fontWeight: "700", cursor: "pointer", fontFamily: "inherit", minHeight: "44px", minWidth: "80px" }}>
                      🖼️ GALLERY
                    </button>
                  )}
                </div>

                {/* Hidden file input — all types, multiple */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="*/*"
                  multiple
                  style={{ display: "none" }}
                  onChange={e => {
                    const files = Array.from(e.target.files || []) as File[]
                    if (files.length) setSelectedFiles(prev => [...prev, ...files])
                    if (fileInputRef.current) fileInputRef.current.value = ""
                  }}
                />

                {/* Drop zone */}
                <div
                  ref={dropZoneRef}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  style={{ border: `2px dashed ${dragOver ? t.accent : t.borderCard}`, borderRadius: "10px", padding: isMobile ? "20px 14px" : "24px 20px", textAlign: "center", cursor: "pointer", marginBottom: selectedFiles.length ? "16px" : "20px", background: dragOver ? t.accentBg : t.bgInput, transition: "all 0.15s" }}>
                  <div style={{ fontSize: "32px", marginBottom: "8px" }}>📎</div>
                  <p style={{ color: t.textSecondary, fontSize: "14px", fontWeight: "600", margin: "0 0 4px" }}>
                    {isMobile ? "Tap to add files" : "Drop files here or click to browse"}
                  </p>
                  <p style={{ color: t.textMuted, fontSize: "11px", margin: 0 }}>All types accepted · Multiple files allowed</p>
                </div>

                {/* Selected files list */}
                {selectedFiles.length > 0 && (
                  <div style={{ marginBottom: "16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                      <p style={{ color: t.textMuted, fontSize: "11px", fontWeight: "700", letterSpacing: "0.5px", margin: 0 }}>
                        {selectedFiles.length} FILE{selectedFiles.length > 1 ? "S" : ""} SELECTED
                      </p>
                      <button onClick={() => setSelectedFiles([])}
                        style={{ padding: "3px 10px", background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, borderRadius: "4px", color: t.danger, fontSize: "10px", fontWeight: "700", cursor: "pointer", fontFamily: "inherit" }}>
                        CLEAR ALL
                      </button>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "220px", overflowY: "auto" }}>
                      {selectedFiles.map((file, index) => (
                        <div key={index} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", background: t.bgPage, border: `1px solid ${t.borderCard}`, borderRadius: "8px" }}>
                          {file.type.startsWith("image/") ? (
                            <img src={URL.createObjectURL(file)} alt={file.name} style={{ width: "36px", height: "36px", objectFit: "cover", borderRadius: "4px", flexShrink: 0 }} />
                          ) : (
                            <span style={{ fontSize: "28px", flexShrink: 0 }}>{getFileIcon(file)}</span>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ color: t.textPrimary, fontSize: "12px", fontWeight: "600", margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</p>
                            <p style={{ color: t.textMuted, fontSize: "10px", margin: 0 }}>{(file.size / 1024).toFixed(1)} KB</p>
                          </div>
                          {/* Crop button — for images on both desktop and mobile */}
                          {file.type.startsWith("image/") && (
                            <button onClick={() => recropFile(index)}
                              style={{ padding: "5px 10px", background: t.accentBg, border: `1px solid ${t.accentBorder}`, borderRadius: "5px", color: t.accent, fontSize: "10px", fontWeight: "700", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0 }}>
                              ✂️ CROP
                            </button>
                          )}
                          <button onClick={() => setSelectedFiles(prev => prev.filter((_, i) => i !== index))}
                            style={{ padding: "5px 8px", background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, borderRadius: "5px", color: t.danger, fontSize: "12px", fontWeight: "700", cursor: "pointer", fontFamily: "inherit", flexShrink: 0, lineHeight: 1 }}>
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                    <button onClick={() => fileInputRef.current?.click()}
                      style={{ width: "100%", marginTop: "8px", padding: "8px", background: "transparent", border: `1px dashed ${t.borderCard}`, borderRadius: "6px", color: t.textMuted, fontSize: "12px", fontWeight: "600", cursor: "pointer", fontFamily: "inherit" }}>
                      + ADD MORE FILES
                    </button>
                  </div>
                )}

                {/* File type chips */}
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "16px" }}>
                  {["📘 Word", "📄 PDF", "🖼️ Image", "📊 Excel", "🎬 Video", "📎 Any"].map(label => (
                    <span key={label} style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "10px", fontWeight: "600", background: t.bgPage, border: `1px solid ${t.borderCard}`, color: t.textMuted }}>{label}</span>
                  ))}
                </div>

                {/* Submit buttons */}
                <div style={{ display: "flex", gap: "8px" }}>
                  <button onClick={closeFileModal}
                    style={{ flex: 1, padding: "12px", background: "transparent", border: `1px solid ${t.borderCard}`, borderRadius: "8px", color: t.textMuted, fontSize: "13px", cursor: "pointer", fontFamily: "inherit", minHeight: "48px" }}>
                    CANCEL
                  </button>
                  <button onClick={uploadAndFile} disabled={!selectedFiles.length || uploadingId === fileModal.id}
                    style={{ flex: 2, padding: "12px", background: selectedFiles.length ? "rgba(167,139,250,0.15)" : t.bgInput, border: `1px solid ${selectedFiles.length ? "rgba(167,139,250,0.4)" : t.borderCard}`, borderRadius: "8px", color: selectedFiles.length ? "#a78bfa" : t.textDisabled, fontSize: "13px", fontWeight: "700", cursor: selectedFiles.length ? "pointer" : "not-allowed", fontFamily: "inherit", opacity: uploadingId === fileModal.id ? 0.6 : 1, minHeight: "48px" }}>
                    {uploadingId === fileModal.id ? "UPLOADING..." : `SUBMIT ${selectedFiles.length > 1 ? selectedFiles.length + " FILES" : "REPORT"}`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Feedback Modal */}
      {feedbackModal && (
        <div role="dialog" aria-modal="true"
          style={{ position: "fixed", inset: 0, background: t.overlayBg, display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setFeedbackModal(null) }}>
          <div style={{ background: t.bgCard, border: `1px solid ${t.warningBorder}`, borderRadius: isMobile ? "14px 14px 0 0" : "12px", width: "100%", maxWidth: isMobile ? "100%" : "460px", margin: isMobile ? "0" : "24px", padding: isMobile ? "20px 16px" : "28px", fontFamily: "inherit", boxShadow: t.shadow }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px", alignItems: "center" }}>
              <h2 style={{ color: t.textPrimary, margin: 0, fontSize: isMobile ? "16px" : "18px", fontWeight: "700" }}>Editor Feedback</h2>
              <button onClick={() => setFeedbackModal(null)} style={{ background: "none", border: "none", color: t.textMuted, fontSize: "22px", cursor: "pointer", minWidth: "44px", minHeight: "44px" }}>x</button>
            </div>
            <p style={{ color: t.textMuted, fontSize: "13px", margin: "0 0 16px" }}>For: <span style={{ color: t.textPrimary, fontWeight: "600" }}>{feedbackModal.headline}</span></p>
            <div style={{ padding: "16px", background: t.warningBg, border: `1px solid ${t.warningBorder}`, borderRadius: "8px", marginBottom: "14px" }}>
              <p style={{ color: t.textMuted, fontSize: "11px", fontWeight: "600", margin: "0 0 10px" }}>EDITOR SAYS</p>
              <p style={{ color: t.warning, fontSize: "15px", fontWeight: "600", margin: 0, lineHeight: 1.6 }}>{feedbackModal.editor_feedback}</p>
              {feedbackModal.feedback_at && <p style={{ color: t.textMuted, fontSize: "11px", margin: "8px 0 0" }}>{new Date(feedbackModal.feedback_at).toLocaleString()}</p>}
            </div>
            <div style={{ padding: "12px 16px", background: t.successBg, border: `1px solid ${t.successBorder}`, borderRadius: "8px", marginBottom: "16px" }}>
              <p style={{ color: t.success, fontSize: "12px", fontWeight: "600", margin: 0 }}>Your report has been published!</p>
            </div>
            <button onClick={() => setFeedbackModal(null)} style={{ width: "100%", padding: "12px", background: "transparent", border: `1px solid ${t.borderCard}`, borderRadius: "8px", color: t.textMuted, fontSize: "13px", cursor: "pointer", fontFamily: "inherit", minHeight: "48px" }}>CLOSE</button>
          </div>
        </div>
      )}
    </div>
  )
}