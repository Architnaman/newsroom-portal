import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'
import { useTheme } from '../context/ThemeContext'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function getCurrentWeekStart(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().split('T')[0]
}

function getCurrentWeekDates(): Record<string, string> {
  const weekStart = getCurrentWeekStart()
  const dates: Record<string, string> = {}
  const d = new Date(weekStart + 'T00:00:00Z')
  DAYS.forEach((day, i) => {
    const date = new Date(d)
    date.setUTCDate(d.getUTCDate() + i)
    dates[day] = date.toISOString().split('T')[0]
  })
  return dates
}

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

  const [selectedDays, setSelectedDays] = useState<string[]>([])
  const [existing, setExisting] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [leaves, setLeaves] = useState<any[]>([])
  const [leaveDates, setLeaveDates] = useState<string[]>([])
  const [showLeave, setShowLeave] = useState(false)
  const [leaveForm, setLeaveForm] = useState({ leave_date: '', leave_type: 'planned', notes: '' })
  const [submittingLeave, setSubmittingLeave] = useState(false)
  const [showRequestFiling, setShowRequestFiling] = useState(false)
  const [filingForm, setFilingForm] = useState({ requested_date: '', leave_type: 'planned', reason: '' })
  const [submittingFiling, setSubmittingFiling] = useState(false)
  const [filingRequests, setFilingRequests] = useState<any[]>([])

  const weekStart = getCurrentWeekStart()
  const weekDates = getCurrentWeekDates()
  const today = getTodayStr()

  const ltc: Record<string, string> = {
    planned: t.warning,
    sick: t.warning,
    emergency: t.danger
  }

  const lsc: Record<string, string> = {
    pending: t.warning,
    acknowledged: t.success,
    rejected: t.danger
  }

  async function load() {
    if (!reporterId) return

    const { data } = await supabase.from('availability')
      .select('*').eq('reporter_id', reporterId)
      .eq('week_start_date', weekStart).maybeSingle()

    if (data) { setExisting(data); setSelectedDays(data.available_days) }
    else { setExisting(null); setSelectedDays([]) }

    const { data: leavesData } = await supabase
      .from('leave_requests').select('*')
      .eq('reporter_id', reporterId)
      .order('created_at', { ascending: false })
    setLeaves(leavesData || [])

    const acknowledgedLeaveDates = (leavesData || [])
      .filter((l: any) => l.status === 'acknowledged')
      .map((l: any) => l.leave_date)
    setLeaveDates(acknowledgedLeaveDates)

    // FIXED: fetch filing requests directly without order by created_at
    // in case created_at column was just added
    const { data: filingData } = await supabase
      .from('leave_filing_requests')
      .select('*')
      .eq('reporter_id', reporterId)
      .order('created_at', { ascending: false })
    setFilingRequests(filingData || [])
  }

  useEffect(() => { load() }, [reporterId])

  function isDaySelectable(day: string): boolean {
    const dateForDay = weekDates[day]
    if (isPast(dateForDay)) return false
    if (leaveDates.includes(dateForDay)) return false
    const hasPendingLeave = leaves.some(
      (l: any) => l.leave_date === dateForDay && l.status === 'pending'
    )
    if (hasPendingLeave) return false
    return true
  }

  function toggleDay(day: string) {
    if (!isDaySelectable(day)) return
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    )
    setSaved(false)
  }

  async function saveAvailability() {
    if (!reporterId) return
    setSaving(true)
    if (existing) {
      await supabase.from('availability')
        .update({ available_days: selectedDays }).eq('id', existing.id)
    } else {
      await supabase.from('availability').insert({
        reporter_id: reporterId,
        week_start_date: weekStart,
        available_days: selectedDays
      })
    }
    setSaving(false)
    setSaved(true)
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
    setSubmittingLeave(false)
    setShowLeave(false)
    setLeaveForm({ leave_date: '', leave_type: 'planned', notes: '' })
    load()
  }

  // FIXED: fetch directly after insert so UI updates immediately
  async function submitFilingRequest() {
    if (!reporterId || !filingForm.requested_date || !filingForm.reason.trim()) return
    setSubmittingFiling(true)

    const { error } = await supabase.from('leave_filing_requests').insert({
      reporter_id: reporterId,
      requested_date: filingForm.requested_date,
      leave_type: filingForm.leave_type,
      reason: filingForm.reason
    })

    if (error) {
      console.error('Filing request error:', error)
      setSubmittingFiling(false)
      return
    }

    // FIXED: fetch directly instead of calling load() which may have stale reporterId
    const { data: filingData } = await supabase
      .from('leave_filing_requests')
      .select('*')
      .eq('reporter_id', reporterId)
      .order('created_at', { ascending: false })

    setFilingRequests(filingData || [])
    setSubmittingFiling(false)
    setShowRequestFiling(false)
    setFilingForm({ requested_date: '', leave_type: 'planned', reason: '' })
  }

  function getDayStatus(day: string) {
    const dateForDay = weekDates[day]
    if (isPast(dateForDay)) return 'past'
    if (leaveDates.includes(dateForDay)) return 'leave_approved'
    const hasPendingLeave = leaves.some(
      (l: any) => l.leave_date === dateForDay && l.status === 'pending'
    )
    if (hasPendingLeave) return 'leave_pending'
    if (selectedDays.includes(day)) return 'available'
    return 'unavailable'
  }

  function getDayStyle(status: string, isToday_: boolean): React.CSSProperties {
    const base: React.CSSProperties = {
      padding: '14px 6px',
      borderRadius: '8px',
      fontFamily: 'inherit',
      textAlign: 'center',
      transition: 'all 0.15s',
      border: '2px solid',
      outline: isToday_ ? `3px solid ${t.accent}` : 'none',
      outlineOffset: '2px',
      cursor: 'pointer',
    }
    switch (status) {
      case 'past':
        return { ...base, borderColor: t.borderCard, background: t.bgPage, color: t.textDisabled, cursor: 'not-allowed' }
      case 'leave_approved':
        return { ...base, borderColor: t.dangerBorder, background: t.dangerBg, color: t.danger, cursor: 'not-allowed' }
      case 'leave_pending':
        return { ...base, borderColor: t.warningBorder, background: t.warningBg, color: t.warning, cursor: 'not-allowed' }
      case 'available':
        return { ...base, borderColor: t.successBorder, background: t.successBg, color: t.success }
      default:
        return { ...base, borderColor: t.borderCard, background: t.bgCard, color: t.textMuted }
    }
  }

  function getDotColor(status: string): string {
    switch (status) {
      case 'past': return t.textDisabled
      case 'leave_approved': return t.danger
      case 'leave_pending': return t.warning
      case 'available': return t.success
      default: return t.borderCard
    }
  }

  function getDayLabel(status: string): string {
    switch (status) {
      case 'past': return 'PAST'
      case 'leave_approved': return 'LEAVE'
      case 'leave_pending': return 'PEND'
      default: return ''
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '11px 14px',
    background: t.bgInput,
    border: `1px solid ${t.borderInput}`,
    borderRadius: '8px',
    color: t.textPrimary,
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  }

  const cardStyle: React.CSSProperties = {
    background: t.bgCard,
    border: `1px solid ${t.borderCard}`,
    borderRadius: '10px',
    padding: '24px',
    boxShadow: t.shadowCard,
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: t.bgPage,
      fontFamily: '"Inter", "DM Mono", "Courier New", monospace',
      color: t.textPrimary
    }}>
      <Navbar />
      <main role="main" style={{ padding: '32px 24px', maxWidth: '760px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ color: t.textPrimary, margin: '0 0 6px', fontSize: '22px', fontWeight: '700' }}>
            Availability
          </h1>
          <p style={{ color: t.textMuted, margin: 0, fontSize: '13px' }}>
            Manage your weekly availability and leave requests
          </p>
        </div>

        {/* Availability Section */}
        <div style={{ ...cardStyle, marginBottom: '24px' }}>
          <div style={{ marginBottom: '20px' }}>
            <h2 style={{ color: t.textPrimary, margin: '0 0 4px', fontSize: '16px', fontWeight: '700' }}>
              This Week's Availability
            </h2>
            <p style={{ color: t.textMuted, margin: 0, fontSize: '13px' }}>
              Week of {weekStart} — Click days to toggle availability
            </p>
          </div>

          {/* Legend */}
          <div style={{
            display: 'flex', gap: '16px', marginBottom: '20px',
            flexWrap: 'wrap', padding: '12px 16px',
            background: t.bgPage, borderRadius: '8px',
            border: `1px solid ${t.borderCard}`
          }}>
            {[
              { color: t.success, border: t.successBorder, label: 'Available' },
              { color: t.textMuted, border: t.borderCard, label: 'Unavailable' },
              { color: t.textDisabled, border: t.borderCard, label: 'Past Day' },
              { color: t.warning, border: t.warningBorder, label: 'Leave Pending' },
              { color: t.danger, border: t.dangerBorder, label: 'Leave Approved' },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{
                  width: '12px', height: '12px', borderRadius: '3px',
                  background: `${item.color}20`,
                  border: `2px solid ${item.border}`
                }} />
                <span style={{ color: t.textMuted, fontSize: '11px', fontWeight: '500' }}>{item.label}</span>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{
                width: '12px', height: '12px', borderRadius: '3px',
                background: t.accentBg, border: `2px solid ${t.accent}`,
                outline: `2px solid ${t.accent}`, outlineOffset: '1px'
              }} />
              <span style={{ color: t.textMuted, fontSize: '11px', fontWeight: '500' }}>Today</span>
            </div>
          </div>

          {/* Day selector */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '8px', marginBottom: '24px' }}>
            {DAYS.map(day => {
              const status = getDayStatus(day)
              const isTodayDay = isToday(weekDates[day])
              return (
                <button
                  key={day}
                  onClick={() => toggleDay(day)}
                  aria-pressed={selectedDays.includes(day)}
                  aria-label={`${day} — ${status}`}
                  style={getDayStyle(status, isTodayDay)}>
                  <div style={{ fontSize: '10px', fontWeight: '700', marginBottom: '6px', color: 'inherit', letterSpacing: '0.5px' }}>
                    {day}
                  </div>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', margin: '0 auto 4px', background: getDotColor(status) }} />
                  <div style={{ fontSize: '8px', letterSpacing: '0.5px', minHeight: '10px', fontWeight: '700', color: 'inherit' }}>
                    {getDayLabel(status)}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Save button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <button
              onClick={saveAvailability}
              disabled={saving}
              aria-busy={saving}
              style={{
                padding: '12px 28px',
                background: saving ? t.textMuted : t.accent,
                border: 'none', borderRadius: '8px',
                color: t.accentText, fontSize: '13px',
                letterSpacing: '0.5px', fontWeight: '700',
                cursor: saving ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', opacity: saving ? 0.7 : 1,
                transition: 'all 0.15s'
              }}>
              {saving ? 'SAVING...' : 'SAVE AVAILABILITY'}
            </button>
            {saved && (
              <span style={{ color: t.success, fontSize: '13px', fontWeight: '600' }}>Saved!</span>
            )}
            <span style={{ color: t.textMuted, fontSize: '13px', marginLeft: 'auto' }}>
              <span style={{ color: t.accent, fontWeight: '700' }}>{selectedDays.length}</span>
              {' '}day{selectedDays.length !== 1 ? 's' : ''} selected
            </span>
          </div>
        </div>

        {/* Leave Requests */}
        <div style={{ ...cardStyle, marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div>
              <h2 style={{ color: t.textPrimary, margin: '0 0 4px', fontSize: '16px', fontWeight: '700' }}>
                Leave Requests
              </h2>
              <p style={{ color: t.textMuted, margin: 0, fontSize: '12px' }}>
                File and track your leave requests
              </p>
            </div>
            <button
              onClick={() => setShowLeave(true)}
              style={{
                padding: '9px 20px', background: t.accentBg,
                border: `1px solid ${t.accentBorder}`, borderRadius: '8px',
                color: t.accent, fontSize: '12px', fontWeight: '700',
                cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.5px'
              }}>
              + FILE LEAVE
            </button>
          </div>

          {leaves.length === 0 ? (
            <div style={{
              color: t.textDisabled, fontSize: '14px', textAlign: 'center',
              padding: '40px', border: `1px dashed ${t.borderCard}`,
              borderRadius: '8px', background: t.bgPage
            }}>
              No leave requests filed yet
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {leaves.map(leave => (
                <div key={leave.id} style={{
                  padding: '16px 18px', borderRadius: '8px',
                  border: `1px solid ${leave.status === 'rejected' ? t.dangerBorder : t.borderCard}`,
                  background: leave.status === 'rejected' ? t.dangerBg : t.bgPage
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
                        <span style={{
                          padding: '3px 10px', borderRadius: '4px', fontSize: '10px',
                          fontWeight: '700', letterSpacing: '0.5px',
                          background: `${ltc[leave.leave_type]}15`, color: ltc[leave.leave_type],
                          border: `1px solid ${ltc[leave.leave_type]}30`
                        }}>
                          {leave.leave_type?.toUpperCase()}
                        </span>
                        <span style={{ color: t.textPrimary, fontSize: '14px', fontWeight: '600' }}>
                          {leave.leave_date}
                        </span>
                        {leave.filed_by_editor && (
                          <span style={{
                            padding: '3px 8px', borderRadius: '4px', fontSize: '10px',
                            fontWeight: '600', background: t.accentBg,
                            color: t.accent, border: `1px solid ${t.accentBorder}`
                          }}>
                            FILED BY EDITOR
                          </span>
                        )}
                        {isPast(leave.leave_date) && leave.status === 'acknowledged' && (
                          <span style={{
                            padding: '3px 8px', borderRadius: '4px', fontSize: '10px',
                            fontWeight: '600', background: t.bgInput,
                            color: t.textMuted, border: `1px solid ${t.borderCard}`
                          }}>
                            COMPLETED
                          </span>
                        )}
                      </div>
                      {leave.notes && (
                        <p style={{ color: t.textMuted, fontSize: '13px', margin: '0 0 4px', lineHeight: 1.5 }}>
                          {leave.notes}
                        </p>
                      )}
                      {leave.status === 'rejected' && leave.reject_reason && (
                        <div style={{
                          padding: '8px 12px', background: t.dangerBg,
                          border: `1px solid ${t.dangerBorder}`, borderRadius: '6px', marginTop: '8px'
                        }}>
                          <p style={{ color: t.danger, fontSize: '12px', fontWeight: '500', margin: 0 }}>
                            Rejected: {leave.reject_reason}
                          </p>
                        </div>
                      )}
                    </div>
                    <span style={{
                      padding: '4px 12px', borderRadius: '4px', fontSize: '11px',
                      fontWeight: '700', letterSpacing: '0.5px',
                      background: `${lsc[leave.status]}15`, color: lsc[leave.status],
                      border: `1px solid ${lsc[leave.status]}30`,
                      whiteSpace: 'nowrap', marginLeft: '12px'
                    }}>
                      {leave.status?.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Request Editor to File Leave */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
            <div>
              <h2 style={{ color: t.textPrimary, margin: '0 0 4px', fontSize: '16px', fontWeight: '700' }}>
                Request Editor to File Leave
              </h2>
              <p style={{ color: t.textMuted, margin: 0, fontSize: '12px' }}>
                Ask your editor to file leave on your behalf with a valid reason
              </p>
            </div>
            <button
              onClick={() => setShowRequestFiling(true)}
              style={{
                padding: '9px 20px', background: t.warningBg,
                border: `1px solid ${t.warningBorder}`, borderRadius: '8px',
                color: t.warning, fontSize: '12px', fontWeight: '700',
                cursor: 'pointer', fontFamily: 'inherit',
                letterSpacing: '0.5px', whiteSpace: 'nowrap'
              }}>
              + REQUEST
            </button>
          </div>

          {filingRequests.length === 0 ? (
            <div style={{
              color: t.textDisabled, fontSize: '14px', textAlign: 'center',
              padding: '32px', border: `1px dashed ${t.borderCard}`,
              borderRadius: '8px', background: t.bgPage
            }}>
              No filing requests sent yet
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {filingRequests.map(req => (
                <div key={req.id} style={{
                  padding: '14px 18px', borderRadius: '8px',
                  border: `1px solid ${req.status === 'approved' ? t.successBorder : req.status === 'rejected' ? t.dangerBorder : t.warningBorder}`,
                  background: req.status === 'approved' ? t.successBg : req.status === 'rejected' ? t.dangerBg : t.warningBg
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                        <span style={{ color: t.textPrimary, fontSize: '14px', fontWeight: '700' }}>
                          {req.requested_date}
                        </span>
                        <span style={{
                          padding: '3px 8px', borderRadius: '4px', fontSize: '10px',
                          fontWeight: '600', background: `${ltc[req.leave_type]}15`,
                          color: ltc[req.leave_type], border: `1px solid ${ltc[req.leave_type]}30`
                        }}>
                          {req.leave_type?.toUpperCase()}
                        </span>
                      </div>
                      <p style={{ color: t.textSecondary, fontSize: '13px', margin: '0 0 2px', lineHeight: 1.5 }}>
                        Reason: {req.reason}
                      </p>
                      {req.editor_note && (
                        <p style={{ color: t.textMuted, fontSize: '12px', margin: '4px 0 0' }}>
                          Editor note: {req.editor_note}
                        </p>
                      )}
                    </div>
                    <span style={{
                      padding: '4px 12px', borderRadius: '4px', fontSize: '11px',
                      fontWeight: '700', letterSpacing: '0.5px',
                      whiteSpace: 'nowrap', marginLeft: '12px',
                      background: req.status === 'approved' ? t.successBg : req.status === 'rejected' ? t.dangerBg : t.warningBg,
                      color: req.status === 'approved' ? t.success : req.status === 'rejected' ? t.danger : t.warning,
                      border: `1px solid ${req.status === 'approved' ? t.successBorder : req.status === 'rejected' ? t.dangerBorder : t.warningBorder}`
                    }}>
                      {req.status?.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* File Leave Modal */}
      {showLeave && (
        <div role="dialog" aria-modal="true" aria-label="File leave request"
          style={{ position: 'fixed', inset: 0, background: t.overlayBg, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setShowLeave(false) }}>
          <div style={{
            background: t.bgCard, border: `1px solid ${t.borderCard}`,
            borderRadius: '12px', width: '100%', maxWidth: '420px',
            margin: '24px', padding: '28px', fontFamily: 'inherit', boxShadow: t.shadow
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', alignItems: 'center' }}>
              <h2 style={{ color: t.textPrimary, margin: 0, fontSize: '18px', fontWeight: '700' }}>File Leave Request</h2>
              <button onClick={() => setShowLeave(false)} aria-label="Close"
                style={{ background: 'none', border: 'none', color: t.textMuted, fontSize: '22px', cursor: 'pointer' }}>x</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ color: t.textSecondary, fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '6px' }}>
                  LEAVE DATE <span style={{ color: t.textMuted, fontWeight: '400' }}>(Any future date)</span>
                </label>
                <input type="date" value={leaveForm.leave_date} min={today}
                  onChange={e => setLeaveForm(p => ({ ...p, leave_date: e.target.value }))}
                  style={{ ...inputStyle, colorScheme: 'dark' }} />
              </div>
              <div>
                <label style={{ color: t.textSecondary, fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '8px' }}>LEAVE TYPE</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px' }} role="group" aria-label="Leave type">
                  {(['planned', 'sick', 'emergency'] as const).map(type => (
                    <button key={type} aria-pressed={leaveForm.leave_type === type}
                      onClick={() => setLeaveForm(p => ({ ...p, leave_type: type }))}
                      style={{
                        padding: '10px', borderRadius: '8px',
                        border: `2px solid ${leaveForm.leave_type === type ? ltc[type] : t.borderCard}`,
                        background: leaveForm.leave_type === type ? `${ltc[type]}15` : 'transparent',
                        color: leaveForm.leave_type === type ? ltc[type] : t.textMuted,
                        fontSize: '11px', fontWeight: leaveForm.leave_type === type ? '700' : '400',
                        letterSpacing: '0.5px', cursor: 'pointer', fontFamily: 'inherit',
                        textTransform: 'uppercase' as const, transition: 'all 0.15s'
                      }}>
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
                  rows={3} placeholder="Reason for leave..."
                  style={{ ...inputStyle, resize: 'none' as const }} />
              </div>
              {leaveForm.leave_type !== 'planned' && (
                <div style={{ padding: '12px 14px', background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, borderRadius: '8px' }}>
                  <p style={{ color: t.danger, fontSize: '12px', fontWeight: '500', margin: 0 }}>
                    Emergency/sick leave will immediately alert editors
                  </p>
                </div>
              )}
              <button onClick={submitLeave} disabled={submittingLeave || !leaveForm.leave_date}
                style={{
                  padding: '14px', background: leaveForm.leave_date ? t.accent : t.textMuted,
                  border: 'none', borderRadius: '8px', color: t.accentText,
                  fontSize: '13px', fontWeight: '700', letterSpacing: '0.5px',
                  cursor: leaveForm.leave_date ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit', opacity: submittingLeave || !leaveForm.leave_date ? 0.6 : 1
                }}>
                {submittingLeave ? 'SUBMITTING...' : 'SUBMIT LEAVE REQUEST'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Request Filing Modal */}
      {showRequestFiling && (
        <div role="dialog" aria-modal="true" aria-label="Request editor to file leave"
          style={{ position: 'fixed', inset: 0, background: t.overlayBg, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setShowRequestFiling(false) }}>
          <div style={{
            background: t.bgCard, border: `1px solid ${t.warningBorder}`,
            borderRadius: '12px', width: '100%', maxWidth: '440px',
            margin: '24px', padding: '28px', fontFamily: 'inherit', boxShadow: t.shadow
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', alignItems: 'center' }}>
              <h2 style={{ color: t.textPrimary, margin: 0, fontSize: '18px', fontWeight: '700' }}>
                Request Editor to File Leave
              </h2>
              <button onClick={() => setShowRequestFiling(false)} aria-label="Close"
                style={{ background: 'none', border: 'none', color: t.textMuted, fontSize: '22px', cursor: 'pointer' }}>x</button>
            </div>
            <div style={{
              padding: '12px 16px', background: t.warningBg,
              border: `1px solid ${t.warningBorder}`, borderRadius: '8px', marginBottom: '20px'
            }}>
              <p style={{ color: t.warning, fontSize: '12px', fontWeight: '500', margin: 0, lineHeight: 1.5 }}>
                Your editor will be notified and can approve or reject this request.
                If approved, the leave will be filed on your behalf.
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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px' }} role="group">
                  {(['planned', 'sick', 'emergency'] as const).map(type => (
                    <button key={type} aria-pressed={filingForm.leave_type === type}
                      onClick={() => setFilingForm(p => ({ ...p, leave_type: type }))}
                      style={{
                        padding: '10px', borderRadius: '8px',
                        border: `2px solid ${filingForm.leave_type === type ? ltc[type] : t.borderCard}`,
                        background: filingForm.leave_type === type ? `${ltc[type]}15` : 'transparent',
                        color: filingForm.leave_type === type ? ltc[type] : t.textMuted,
                        fontSize: '11px', fontWeight: filingForm.leave_type === type ? '700' : '400',
                        cursor: 'pointer', fontFamily: 'inherit',
                        textTransform: 'uppercase' as const, transition: 'all 0.15s'
                      }}>
                      {type}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ color: t.textSecondary, fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '6px' }}>
                  REASON <span style={{ color: t.danger }}>*required</span>
                </label>
                <textarea value={filingForm.reason}
                  onChange={e => setFilingForm(p => ({ ...p, reason: e.target.value }))}
                  rows={3} placeholder="Why do you need the editor to file this leave..."
                  style={{ ...inputStyle, resize: 'none' as const }} />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setShowRequestFiling(false)}
                  style={{
                    flex: 1, padding: '12px', background: 'transparent',
                    border: `1px solid ${t.borderCard}`, borderRadius: '8px',
                    color: t.textMuted, fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit'
                  }}>
                  CANCEL
                </button>
                <button onClick={submitFilingRequest}
                  disabled={!filingForm.requested_date || !filingForm.reason.trim() || submittingFiling}
                  style={{
                    flex: 2, padding: '12px',
                    background: filingForm.requested_date && filingForm.reason.trim() ? t.warning : t.bgInput,
                    border: `1px solid ${filingForm.requested_date && filingForm.reason.trim() ? t.warningBorder : t.borderCard}`,
                    borderRadius: '8px',
                    color: filingForm.requested_date && filingForm.reason.trim() ? t.accentText : t.textDisabled,
                    fontSize: '13px', fontWeight: '700',
                    cursor: filingForm.requested_date && filingForm.reason.trim() ? 'pointer' : 'not-allowed',
                    fontFamily: 'inherit', opacity: submittingFiling ? 0.6 : 1
                  }}>
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