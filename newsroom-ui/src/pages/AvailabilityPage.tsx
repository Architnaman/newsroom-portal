import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'
import { useTheme } from '../context/ThemeContext'
import { useDateFormat } from '../context/DateFormatContext'
import { useCollapse } from '../hooks/useCollapse'
import SectionCard from '../components/SectionCard'
import { useResponsive } from '../hooks/useResponsive'
import { sendNotification } from '../lib/notifications'

function getTodayStr(): string {
  return new Date().toISOString().split('T')[0]
}

function isPast(dateStr: string): boolean {
  return dateStr < getTodayStr()
}

function isToday(dateStr: string): boolean {
  return dateStr === getTodayStr()
}

export default function AvailabilityPage() {
  const { reporterId } = useAuth()
  const { t } = useTheme()
  const { formatDate, getWeekStart, getWeekDates, weekStartDay } = useDateFormat()
  const { toggle, isCollapsed } = useCollapse('availability', ['availability', 'leaves', 'filing'])
  const { isMobile, isTablet } = useResponsive()

  const DAYS = weekStartDay === 'sunday'
    ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  const weekStart = getWeekStart()
  const weekDates = getWeekDates()
  const today = getTodayStr()

  const [selectedDays, setSelectedDays] = useState<string[]>([])
  const [existing, setExisting] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [leaves, setLeaves] = useState<any[]>([])
  const [leaveDates, setLeaveDates] = useState<string[]>([])
  const [holidays, setHolidays] = useState<any[]>([])
  const [showLeave, setShowLeave] = useState(false)
  const [leaveForm, setLeaveForm] = useState({ leave_date: '', leave_type: 'planned', notes: '' })
  const [submittingLeave, setSubmittingLeave] = useState(false)
  const [showRequestFiling, setShowRequestFiling] = useState(false)
  const [filingForm, setFilingForm] = useState({ requested_date: '', leave_type: 'planned', reason: '' })
  const [submittingFiling, setSubmittingFiling] = useState(false)
  const [filingRequests, setFilingRequests] = useState<any[]>([])

  const ltc: Record<string, string> = {
    planned: t.warning, sick: t.warning, emergency: t.danger
  }
  const lsc: Record<string, string> = {
    pending: t.warning, acknowledged: t.success, rejected: t.danger
  }

  // ── Helper: get editor emails for notifications ──
  async function getEditorEmails(): Promise<string[]> {
    const { data } = await supabase
      .from('profiles')
      .select('reporter_id')
      .eq('role', 'editor')
    const reporterIds = (data || []).map((p: any) => p.reporter_id).filter(Boolean)
    if (reporterIds.length === 0) return []
    const { data: editorReporters } = await supabase
      .from('reporters')
      .select('email')
      .in('id', reporterIds)
    return (editorReporters || []).map((r: any) => r.email).filter(Boolean)
  }

  async function load() {
    if (!reporterId) return
    const { data: holidayData } = await supabase.from('holidays').select('*')
    setHolidays(holidayData || [])
    const { data } = await supabase.from('availability')
      .select('*').eq('reporter_id', reporterId)
      .eq('week_start_date', weekStart).maybeSingle()
    if (data) {
      setExisting(data)
      setSelectedDays(data.available_days)
    } else {
      setExisting(null)
      const defaultDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].filter(day => {
        const dateForDay = weekDates[day]
        if (!dateForDay) return true
        return !(holidayData || []).some((h: any) => h.date.split('T')[0] === dateForDay)
      })
      setSelectedDays(defaultDays)
    }
    const { data: leavesData } = await supabase
      .from('leave_requests').select('*')
      .eq('reporter_id', reporterId)
      .order('created_at', { ascending: false })
    setLeaves(leavesData || [])
    setLeaveDates((leavesData || [])
      .filter((l: any) => l.status === 'acknowledged')
      .map((l: any) => l.leave_date))
    const { data: filingData } = await supabase
      .from('leave_filing_requests').select('*')
      .eq('reporter_id', reporterId)
      .order('created_at', { ascending: false })
    setFilingRequests(filingData || [])
  }

  useEffect(() => { load() }, [reporterId])

  function isHoliday(dateStr: string): boolean {
    return holidays.some((h: any) => h.date.split('T')[0] === dateStr)
  }

  function isDaySelectable(day: string): boolean {
    if (day === 'Sat' || day === 'Sun') return false
    const dateForDay = weekDates[day]
    if (!dateForDay) return false
    if (isPast(dateForDay)) return false
    if (isHoliday(dateForDay)) return false
    if (leaveDates.includes(dateForDay)) return false
    if (leaves.some((l: any) => l.leave_date === dateForDay && l.status === 'pending')) return false
    return true
  }

  function toggleDay(day: string) {
    if (!isDaySelectable(day)) return
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    )
  }

  async function saveAvailability() {
    if (!reporterId) return
    setSaving(true)
    if (existing) {
      await supabase.from('availability').update({ available_days: selectedDays }).eq('id', existing.id)
    } else {
      await supabase.from('availability').insert({
        reporter_id: reporterId, week_start_date: weekStart, available_days: selectedDays
      })
    }
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    load()
  }

  async function submitLeave() {
    if (!reporterId || !leaveForm.leave_date) return
    setSubmittingLeave(true)
    await supabase.from('leave_requests').insert({
      reporter_id: reporterId,
      leave_date: leaveForm.leave_date,
      leave_type: leaveForm.leave_type,
      is_immediate: leaveForm.leave_type === 'emergency' || leaveForm.leave_type === 'sick',
      notes: leaveForm.notes,
      status: 'pending'
    })

    const editorEmails = await getEditorEmails()
    editorEmails.forEach(email => {
      sendNotification({
        recipient_email: email,
        subject: `Leave Request: ${formatDate(leaveForm.leave_date)} (${leaveForm.leave_type})`,
        body_lines: [
          `A reporter has filed a <strong>${leaveForm.leave_type}</strong> leave request for ${formatDate(leaveForm.leave_date)}.`,
          leaveForm.notes ? `Notes: ${leaveForm.notes}` : `No additional notes provided.`,
          leaveForm.leave_type !== 'planned' ? `This is marked as urgent — please review promptly.` : `Please review and acknowledge or reject from your dashboard.`,
        ],
        notification_type: 'leave_requested',
        reporter_id: reporterId,
      })
    })

    setSubmittingLeave(false)
    setShowLeave(false)
    setLeaveForm({ leave_date: '', leave_type: 'planned', notes: '' })
    load()
  }

  async function submitFilingRequest() {
    if (!reporterId || !filingForm.requested_date || !filingForm.reason.trim()) return
    setSubmittingFiling(true)
    const { error } = await supabase.from('leave_filing_requests').insert({
      reporter_id: reporterId,
      requested_date: filingForm.requested_date,
      leave_type: filingForm.leave_type,
      reason: filingForm.reason
    })
    if (error) { console.error('Filing request error:', error); setSubmittingFiling(false); return }
    const { data: filingData } = await supabase
      .from('leave_filing_requests').select('*')
      .eq('reporter_id', reporterId)
      .order('created_at', { ascending: false })
    setFilingRequests(filingData || [])
    setSubmittingFiling(false)
    setShowRequestFiling(false)
    setFilingForm({ requested_date: '', leave_type: 'planned', reason: '' })
  }

  function getDayStatus(day: string) {
    if (day === 'Sat' || day === 'Sun') return 'weekend'
    const dateForDay = weekDates[day]
    if (!dateForDay) return 'unavailable'
    if (isHoliday(dateForDay)) return 'holiday'
    if (isPast(dateForDay)) return 'past'
    if (leaveDates.includes(dateForDay)) return 'leave_approved'
    if (leaves.some((l: any) => l.leave_date === dateForDay && l.status === 'pending')) return 'leave_pending'
    if (selectedDays.includes(day)) return 'available'
    return 'unavailable'
  }

  function getDayStyle(status: string, isToday_: boolean): React.CSSProperties {
    const base: React.CSSProperties = {
      padding: isMobile ? '10px 4px' : '14px 6px',
      borderRadius: '8px', fontFamily: 'inherit',
      textAlign: 'center', transition: 'all 0.15s', border: '2px solid',
      outline: isToday_ ? `3px solid ${t.accent}` : 'none',
      outlineOffset: '2px', cursor: 'pointer',
    }
    switch (status) {
      case 'holiday':        return { ...base, borderColor: t.dangerBorder, background: t.dangerBg, color: t.danger, cursor: 'not-allowed' }
      case 'weekend':        return { ...base, borderColor: t.borderCard, background: t.bgPage, color: t.textDisabled, cursor: 'not-allowed', opacity: 0.4 }
      case 'past':           return { ...base, borderColor: t.borderCard, background: t.bgPage, color: t.textDisabled, cursor: 'not-allowed' }
      case 'leave_approved': return { ...base, borderColor: t.dangerBorder, background: t.dangerBg, color: t.danger, cursor: 'not-allowed' }
      case 'leave_pending':  return { ...base, borderColor: t.warningBorder, background: t.warningBg, color: t.warning, cursor: 'not-allowed' }
      case 'available':      return { ...base, borderColor: t.successBorder, background: t.successBg, color: t.success }
      default:               return { ...base, borderColor: t.borderCard, background: t.bgCard, color: t.textMuted }
    }
  }

  function getDotColor(status: string): string {
    switch (status) {
      case 'holiday':        return t.danger
      case 'past':           return t.textDisabled
      case 'leave_approved': return t.danger
      case 'leave_pending':  return t.warning
      case 'available':      return t.success
      default:               return t.borderCard
    }
  }

  function getDayLabel(status: string): string {
    switch (status) {
      case 'holiday':        return 'HOL'
      case 'weekend':        return 'OFF'
      case 'past':           return 'PAST'
      case 'leave_approved': return 'LEAVE'
      case 'leave_pending':  return 'PEND'
      default:               return ''
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '11px 14px',
    background: t.bgInput, border: `1px solid ${t.borderInput}`,
    borderRadius: '8px', color: t.textPrimary,
    fontSize: isMobile ? '16px' : '14px',
    outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
  }

  const pendingLeaves = leaves.filter(l => l.status === 'pending').length
  const pendingFiling = filingRequests.filter(r => r.status === 'pending').length

  return (
    <div style={{ minHeight: '100vh', background: t.bgPage, fontFamily: '"Inter", "DM Mono", "Courier New", monospace', color: t.textPrimary }}>
      <Navbar />
      <main role="main" style={{
        padding: isMobile ? '16px 12px' : isTablet ? '24px 16px' : '32px 24px',
        maxWidth: isMobile ? '100%' : '760px',
        margin: '0 auto'
      }}>

        <div style={{ marginBottom: isMobile ? '20px' : '32px' }}>
          <h1 style={{ color: t.textPrimary, margin: '0 0 6px', fontSize: isMobile ? '18px' : '22px', fontWeight: '700' }}>Availability</h1>
          <p style={{ color: t.textMuted, margin: 0, fontSize: '13px' }}>Manage your weekly availability and leave requests</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '12px' : '20px' }}>

          {/* AVAILABILITY */}
          <SectionCard
            title="THIS WEEK'S AVAILABILITY"
            isCollapsed={isCollapsed('availability')}
            onToggle={() => toggle('availability')}
            badge={`${selectedDays.filter(d => !['Sat', 'Sun'].includes(d)).length} days`}
            badgeColor={t.success}>

            <p style={{ color: t.textMuted, margin: '0 0 16px', fontSize: '13px' }}>
              Week of {formatDate(weekStart)} — Click days to toggle availability
            </p>

            {/* Legend */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap', padding: '10px 14px', background: t.bgPage, borderRadius: '8px', border: `1px solid ${t.borderCard}` }}>
              {[
                { color: t.success, border: t.successBorder, label: 'Available' },
                { color: t.textMuted, border: t.borderCard, label: 'Unavailable' },
                { color: t.textDisabled, border: t.borderCard, label: 'Past Day' },
                { color: t.warning, border: t.warningBorder, label: 'Leave Pending' },
                { color: t.danger, border: t.dangerBorder, label: 'Leave / Holiday' },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: `${item.color}20`, border: `2px solid ${item.border}` }} />
                  <span style={{ color: t.textMuted, fontSize: isMobile ? '10px' : '11px', fontWeight: '500' }}>{item.label}</span>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: t.accentBg, border: `2px solid ${t.accent}`, outline: `2px solid ${t.accent}`, outlineOffset: '1px' }} />
                <span style={{ color: t.textMuted, fontSize: isMobile ? '10px' : '11px', fontWeight: '500' }}>Today</span>
              </div>
            </div>

            {/* Day selector — 7 cols on all sizes but smaller on mobile */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: isMobile ? '4px' : '8px',
              marginBottom: '24px'
            }}>
              {DAYS.map(day => {
                const status = getDayStatus(day)
                const isTodayDay = isToday(weekDates[day] || '')
                return (
                  <button key={day} onClick={() => toggleDay(day)}
                    aria-pressed={selectedDays.includes(day)}
                    aria-label={`${day} — ${status}`}
                    style={getDayStyle(status, isTodayDay)}>
                    <div style={{ fontSize: isMobile ? '9px' : '10px', fontWeight: '700', marginBottom: '6px', color: 'inherit', letterSpacing: '0.5px' }}>{day}</div>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', margin: '0 auto 4px', background: getDotColor(status) }} />
                    <div style={{ fontSize: isMobile ? '7px' : '8px', letterSpacing: '0.5px', minHeight: '10px', fontWeight: '700', color: 'inherit' }}>{getDayLabel(status)}</div>
                  </button>
                )
              })}
            </div>

            {/* Save */}
            <div style={{
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              alignItems: isMobile ? 'stretch' : 'center',
              gap: '14px'
            }}>
              <button onClick={saveAvailability} disabled={saving}
                style={{ padding: '12px 28px', background: saving ? t.textMuted : t.accent, border: 'none', borderRadius: '8px', color: t.accentText, fontSize: '13px', fontWeight: '700', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1, minHeight: '48px' }}>
                {saving ? 'SAVING...' : 'SAVE AVAILABILITY'}
              </button>
              {saved && <span style={{ color: t.success, fontSize: '13px', fontWeight: '600' }}>✓ Saved!</span>}
              <span style={{ color: t.textMuted, fontSize: '13px', marginLeft: isMobile ? '0' : 'auto' }}>
                <span style={{ color: t.accent, fontWeight: '700' }}>{selectedDays.filter(d => !['Sat', 'Sun'].includes(d)).length}</span> days selected
              </span>
            </div>
          </SectionCard>

          {/* LEAVE REQUESTS */}
          <SectionCard
            title="LEAVE REQUESTS"
            isCollapsed={isCollapsed('leaves')}
            onToggle={() => toggle('leaves')}
            badge={pendingLeaves > 0 ? pendingLeaves : leaves.length}
            badgeColor={pendingLeaves > 0 ? t.warning : t.accent}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
              <button onClick={() => setShowLeave(true)}
                style={{ padding: '9px 20px', background: t.accentBg, border: `1px solid ${t.accentBorder}`, borderRadius: '8px', color: t.accent, fontSize: '12px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', minHeight: '44px' }}>
                + FILE LEAVE
              </button>
            </div>
            {leaves.length === 0 ? (
              <div style={{ color: t.textDisabled, fontSize: '14px', textAlign: 'center', padding: isMobile ? '24px 12px' : '40px', border: `1px dashed ${t.borderCard}`, borderRadius: '8px', background: t.bgPage }}>
                No leave requests filed yet
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {leaves.map(leave => (
                  <div key={leave.id} style={{ padding: isMobile ? '12px' : '16px 18px', borderRadius: '8px', border: `1px solid ${leave.status === 'rejected' ? t.dangerBorder : t.borderCard}`, background: leave.status === 'rejected' ? t.dangerBg : t.bgPage }}>
                    <div style={{
                      display: 'flex',
                      flexDirection: isMobile ? 'column' : 'row',
                      justifyContent: 'space-between',
                      alignItems: isMobile ? 'flex-start' : 'flex-start',
                      gap: isMobile ? '8px' : '0'
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
                          <span style={{ padding: '3px 10px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', background: `${ltc[leave.leave_type]}15`, color: ltc[leave.leave_type], border: `1px solid ${ltc[leave.leave_type]}30` }}>
                            {leave.leave_type?.toUpperCase()}
                          </span>
                          <span style={{ color: t.textPrimary, fontSize: isMobile ? '13px' : '14px', fontWeight: '600' }}>{formatDate(leave.leave_date)}</span>
                          {leave.filed_by_editor && (
                            <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '600', background: t.accentBg, color: t.accent, border: `1px solid ${t.accentBorder}` }}>FILED BY EDITOR</span>
                          )}
                          {isPast(leave.leave_date) && leave.status === 'acknowledged' && (
                            <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '600', background: t.bgInput, color: t.textMuted, border: `1px solid ${t.borderCard}` }}>COMPLETED</span>
                          )}
                        </div>
                        {leave.notes && <p style={{ color: t.textMuted, fontSize: '13px', margin: '0 0 4px', lineHeight: 1.5 }}>{leave.notes}</p>}
                        {leave.status === 'rejected' && leave.reject_reason && (
                          <div style={{ padding: '8px 12px', background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, borderRadius: '6px', marginTop: '8px' }}>
                            <p style={{ color: t.danger, fontSize: '12px', fontWeight: '500', margin: 0 }}>Rejected: {leave.reject_reason}</p>
                          </div>
                        )}
                      </div>
                      <span style={{ padding: '4px 12px', borderRadius: '4px', fontSize: '11px', fontWeight: '700', background: `${lsc[leave.status]}15`, color: lsc[leave.status], border: `1px solid ${lsc[leave.status]}30`, whiteSpace: 'nowrap', marginLeft: isMobile ? '0' : '12px', alignSelf: isMobile ? 'flex-start' : 'auto' }}>
                        {leave.status?.toUpperCase()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* REQUEST EDITOR TO FILE LEAVE */}
          <SectionCard
            title="REQUEST EDITOR TO FILE LEAVE"
            isCollapsed={isCollapsed('filing')}
            onToggle={() => toggle('filing')}
            badge={pendingFiling > 0 ? pendingFiling : undefined}
            badgeColor={t.warning}>
            <div style={{
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              justifyContent: 'space-between',
              alignItems: isMobile ? 'flex-start' : 'center',
              marginBottom: '16px',
              gap: isMobile ? '10px' : '0'
            }}>
              <p style={{ color: t.textMuted, margin: 0, fontSize: '13px' }}>
                Ask your editor to file leave on your behalf with a valid reason
              </p>
              <button onClick={() => setShowRequestFiling(true)}
                style={{ padding: '9px 20px', background: t.warningBg, border: `1px solid ${t.warningBorder}`, borderRadius: '8px', color: t.warning, fontSize: '12px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', marginLeft: isMobile ? '0' : '12px', minHeight: '44px', width: isMobile ? '100%' : 'auto' }}>
                + REQUEST
              </button>
            </div>
            {filingRequests.length === 0 ? (
              <div style={{ color: t.textDisabled, fontSize: '14px', textAlign: 'center', padding: isMobile ? '24px 12px' : '32px', border: `1px dashed ${t.borderCard}`, borderRadius: '8px', background: t.bgPage }}>
                No filing requests sent yet
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {filingRequests.map(req => (
                  <div key={req.id} style={{ padding: isMobile ? '12px' : '14px 18px', borderRadius: '8px', border: `1px solid ${req.status === 'approved' ? t.successBorder : req.status === 'rejected' ? t.dangerBorder : t.warningBorder}`, background: req.status === 'approved' ? t.successBg : req.status === 'rejected' ? t.dangerBg : t.warningBg }}>
                    <div style={{
                      display: 'flex',
                      flexDirection: isMobile ? 'column' : 'row',
                      justifyContent: 'space-between',
                      alignItems: isMobile ? 'flex-start' : 'flex-start',
                      gap: isMobile ? '8px' : '0'
                    }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
                          <span style={{ color: t.textPrimary, fontSize: isMobile ? '13px' : '14px', fontWeight: '700' }}>{formatDate(req.requested_date)}</span>
                          <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '600', background: `${ltc[req.leave_type]}15`, color: ltc[req.leave_type], border: `1px solid ${ltc[req.leave_type]}30` }}>
                            {req.leave_type?.toUpperCase()}
                          </span>
                        </div>
                        <p style={{ color: t.textSecondary, fontSize: '13px', margin: '0 0 2px', lineHeight: 1.5 }}>Reason: {req.reason}</p>
                        {req.editor_note && <p style={{ color: t.textMuted, fontSize: '12px', margin: '4px 0 0' }}>Editor note: {req.editor_note}</p>}
                      </div>
                      <span style={{ padding: '4px 12px', borderRadius: '4px', fontSize: '11px', fontWeight: '700', whiteSpace: 'nowrap', marginLeft: isMobile ? '0' : '12px', background: req.status === 'approved' ? t.successBg : req.status === 'rejected' ? t.dangerBg : t.warningBg, color: req.status === 'approved' ? t.success : req.status === 'rejected' ? t.danger : t.warning, border: `1px solid ${req.status === 'approved' ? t.successBorder : req.status === 'rejected' ? t.dangerBorder : t.warningBorder}`, alignSelf: isMobile ? 'flex-start' : 'auto' }}>
                        {req.status?.toUpperCase()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </main>

      {/* File Leave Modal */}
      {showLeave && (
        <div role="dialog" aria-modal="true"
          style={{ position: 'fixed', inset: 0, background: t.overlayBg, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setShowLeave(false) }}>
          <div style={{ background: t.bgCard, border: `1px solid ${t.borderCard}`, borderRadius: isMobile ? '14px 14px 0 0' : '12px', width: '100%', maxWidth: isMobile ? '100%' : '420px', margin: isMobile ? '0' : '24px', padding: isMobile ? '20px 16px' : '28px', fontFamily: 'inherit', boxShadow: t.shadow }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', alignItems: 'center' }}>
              <h2 style={{ color: t.textPrimary, margin: 0, fontSize: isMobile ? '16px' : '18px', fontWeight: '700' }}>File Leave Request</h2>
              <button onClick={() => setShowLeave(false)} style={{ background: 'none', border: 'none', color: t.textMuted, fontSize: '22px', cursor: 'pointer', minWidth: '44px', minHeight: '44px' }}>x</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ color: t.textSecondary, fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '6px' }}>LEAVE DATE</label>
                <input type="date" value={leaveForm.leave_date} min={today}
                  onChange={e => setLeaveForm(p => ({ ...p, leave_date: e.target.value }))}
                  style={{ ...inputStyle, colorScheme: 'dark' }} />
              </div>
              <div>
                <label style={{ color: t.textSecondary, fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '8px' }}>LEAVE TYPE</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px' }}>
                  {(['planned', 'sick', 'emergency'] as const).map(type => (
                    <button key={type} onClick={() => setLeaveForm(p => ({ ...p, leave_type: type }))}
                      style={{ padding: '10px', borderRadius: '8px', border: `2px solid ${leaveForm.leave_type === type ? ltc[type] : t.borderCard}`, background: leaveForm.leave_type === type ? `${ltc[type]}15` : 'transparent', color: leaveForm.leave_type === type ? ltc[type] : t.textMuted, fontSize: '11px', fontWeight: leaveForm.leave_type === type ? '700' : '400', cursor: 'pointer', fontFamily: 'inherit', textTransform: 'uppercase' as const, minHeight: '44px' }}>
                      {type}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ color: t.textSecondary, fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '6px' }}>
                  NOTES <span style={{ color: t.textMuted, fontWeight: '400' }}>(optional)</span>
                </label>
                <textarea value={leaveForm.notes} onChange={e => setLeaveForm(p => ({ ...p, notes: e.target.value }))}
                  rows={3} placeholder="Reason for leave..." style={{ ...inputStyle, resize: 'none' as const }} />
              </div>
              {leaveForm.leave_type !== 'planned' && (
                <div style={{ padding: '12px 14px', background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, borderRadius: '8px' }}>
                  <p style={{ color: t.danger, fontSize: '12px', fontWeight: '500', margin: 0 }}>Emergency/sick leave will immediately alert editors</p>
                </div>
              )}
              <button onClick={submitLeave} disabled={submittingLeave || !leaveForm.leave_date}
                style={{ padding: '14px', background: leaveForm.leave_date ? t.accent : t.textMuted, border: 'none', borderRadius: '8px', color: t.accentText, fontSize: '13px', fontWeight: '700', cursor: leaveForm.leave_date ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: submittingLeave || !leaveForm.leave_date ? 0.6 : 1, minHeight: '48px' }}>
                {submittingLeave ? 'SUBMITTING...' : 'SUBMIT LEAVE REQUEST'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Request Filing Modal */}
      {showRequestFiling && (
        <div role="dialog" aria-modal="true"
          style={{ position: 'fixed', inset: 0, background: t.overlayBg, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setShowRequestFiling(false) }}>
          <div style={{ background: t.bgCard, border: `1px solid ${t.warningBorder}`, borderRadius: isMobile ? '14px 14px 0 0' : '12px', width: '100%', maxWidth: isMobile ? '100%' : '440px', margin: isMobile ? '0' : '24px', padding: isMobile ? '20px 16px' : '28px', fontFamily: 'inherit', boxShadow: t.shadow }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', alignItems: 'center' }}>
              <h2 style={{ color: t.textPrimary, margin: 0, fontSize: isMobile ? '15px' : '18px', fontWeight: '700' }}>Request Editor to File Leave</h2>
              <button onClick={() => setShowRequestFiling(false)} style={{ background: 'none', border: 'none', color: t.textMuted, fontSize: '22px', cursor: 'pointer', minWidth: '44px', minHeight: '44px' }}>x</button>
            </div>
            <div style={{ padding: '12px 16px', background: t.warningBg, border: `1px solid ${t.warningBorder}`, borderRadius: '8px', marginBottom: '20px' }}>
              <p style={{ color: t.warning, fontSize: '12px', fontWeight: '500', margin: 0, lineHeight: 1.5 }}>
                Your editor will be notified and can approve or reject this request.
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ color: t.textSecondary, fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '6px' }}>LEAVE DATE</label>
                <input type="date" value={filingForm.requested_date} min={today}
                  onChange={e => setFilingForm(p => ({ ...p, requested_date: e.target.value }))}
                  style={{ ...inputStyle, colorScheme: 'dark' }} />
              </div>
              <div>
                <label style={{ color: t.textSecondary, fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '8px' }}>LEAVE TYPE</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px' }}>
                  {(['planned', 'sick', 'emergency'] as const).map(type => (
                    <button key={type} onClick={() => setFilingForm(p => ({ ...p, leave_type: type }))}
                      style={{ padding: '10px', borderRadius: '8px', border: `2px solid ${filingForm.leave_type === type ? ltc[type] : t.borderCard}`, background: filingForm.leave_type === type ? `${ltc[type]}15` : 'transparent', color: filingForm.leave_type === type ? ltc[type] : t.textMuted, fontSize: '11px', fontWeight: filingForm.leave_type === type ? '700' : '400', cursor: 'pointer', fontFamily: 'inherit', textTransform: 'uppercase' as const, minHeight: '44px' }}>
                      {type}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ color: t.textSecondary, fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '6px' }}>
                  REASON <span style={{ color: t.danger }}>*required</span>
                </label>
                <textarea value={filingForm.reason} onChange={e => setFilingForm(p => ({ ...p, reason: e.target.value }))}
                  rows={3} placeholder="Why do you need the editor to file this leave..."
                  style={{ ...inputStyle, resize: 'none' as const }} />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setShowRequestFiling(false)}
                  style={{ flex: 1, padding: '12px', background: 'transparent', border: `1px solid ${t.borderCard}`, borderRadius: '8px', color: t.textMuted, fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', minHeight: '48px' }}>
                  CANCEL
                </button>
                <button onClick={submitFilingRequest} disabled={!filingForm.requested_date || !filingForm.reason.trim() || submittingFiling}
                  style={{ flex: 2, padding: '12px', background: filingForm.requested_date && filingForm.reason.trim() ? t.warning : t.bgInput, border: `1px solid ${filingForm.requested_date && filingForm.reason.trim() ? t.warningBorder : t.borderCard}`, borderRadius: '8px', color: filingForm.requested_date && filingForm.reason.trim() ? t.accentText : t.textDisabled, fontSize: '13px', fontWeight: '700', cursor: filingForm.requested_date && filingForm.reason.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: submittingFiling ? 0.6 : 1, minHeight: '48px' }}>
                  {submittingFiling ? 'SENDING...' : 'SEND REQUEST'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}