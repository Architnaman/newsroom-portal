import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Navbar from '../components/Navbar'
import { useTheme } from '../context/ThemeContext'
import { useDateFormat } from '../context/DateFormatContext'

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

export default function ReporterView() {
  const { reporterId } = useParams<{ reporterId: string }>()
  const navigate = useNavigate()
  const { t } = useTheme()
  const { formatDate } = useDateFormat()

  const [reporter, setReporter] = useState<any>(null)
  const [stories, setStories] = useState<any[]>([])
  const [leaves, setLeaves] = useState<any[]>([])
  const [availability, setAvailability] = useState<any>(null)
  const [holidays, setHolidays] = useState<any[]>([])
  const [filingRequests, setFilingRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [leaveModal, setLeaveModal] = useState(false)
  const [leaveForm, setLeaveForm] = useState({ leave_date: '', leave_type: 'planned', notes: '' })
  const [submitting, setSubmitting] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  const today = new Date().toISOString().split('T')[0]
  const weekStart = getCurrentWeekStart()
  const weekDates = getCurrentWeekDates()

  const urgencyColor: Record<string, string> = {
    breaking: t.breaking, high: t.warning, normal: t.accent, low: t.success
  }
  const statusColor: Record<string, string> = {
    assigned: t.warning, in_progress: t.success, filed: '#a78bfa', published: t.success
  }
  const ltc: Record<string, string> = {
    planned: t.warning, sick: t.warning, emergency: t.danger
  }

  async function load() {
    if (!reporterId) return
    setLoading(true)
    const [
      { data: rep },
      { data: assignments },
      { data: leavesData },
      { data: availData },
      { data: holidayData },
      { data: filingData }
    ] = await Promise.all([
      supabase.from('reporters').select('*').eq('id', reporterId).single(),
      supabase.from('assignments').select('*, stories(*)').eq('reporter_id', reporterId).eq('is_active', true).order('assigned_at', { ascending: false }),
      supabase.from('leave_requests').select('*').eq('reporter_id', reporterId).order('leave_date', { ascending: false }),
      supabase.from('availability').select('*').eq('reporter_id', reporterId).eq('week_start_date', weekStart).maybeSingle(),
      supabase.from('holidays').select('*').order('date'),
      supabase.from('leave_filing_requests').select('*').eq('reporter_id', reporterId).order('created_at', { ascending: false })
    ])
    setReporter(rep)
    setStories((assignments || []).map((a: any) => ({ ...a.stories, assignment_id: a.id })))
    setLeaves(leavesData || [])
    setAvailability(availData)
    setHolidays(holidayData || [])
    setFilingRequests(filingData || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [reporterId])

  async function fileLeaveOnBehalf() {
    if (!reporterId || !leaveForm.leave_date) return
    setSubmitting(true)
    await supabase.from('leave_requests').insert({
      reporter_id: reporterId,
      leave_date: leaveForm.leave_date,
      leave_type: leaveForm.leave_type,
      is_immediate: leaveForm.leave_type === 'sick' || leaveForm.leave_type === 'emergency',
      notes: leaveForm.notes,
      status: 'acknowledged',
      filed_by_editor: true,
      editor_note: 'Filed by editor on behalf of reporter',
      acknowledged_at: new Date().toISOString()
    })
    const leaveDate = new Date(leaveForm.leave_date + 'T00:00:00Z')
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const dayName = days[leaveDate.getUTCDay()]
    const d = new Date(leaveForm.leave_date + 'T00:00:00')
    const dayOfWeek = d.getDay()
    const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)
    d.setDate(diff)
    const leaveWeekStart = d.toISOString().split('T')[0]
    const { data: avail } = await supabase.from('availability').select('*')
      .eq('reporter_id', reporterId).eq('week_start_date', leaveWeekStart).maybeSingle()
    if (avail) {
      const updatedDays = avail.available_days.filter((dd: string) => dd !== dayName)
      await supabase.from('availability').update({ available_days: updatedDays }).eq('id', avail.id)
    }
    setSubmitting(false)
    setLeaveModal(false)
    setLeaveForm({ leave_date: '', leave_type: 'planned', notes: '' })
    setSuccessMsg('Leave filed successfully on behalf of ' + reporter?.name)
    setTimeout(() => setSuccessMsg(''), 3000)
    load()
  }

  function getDayStatus(day: string) {
    const dateForDay = weekDates[day]
    const holiday = holidays.find(h => h.date === dateForDay)
    if (holiday) return 'holiday'
    const leaveOnDay = leaves.find(l => l.leave_date === dateForDay && l.status === 'acknowledged')
    if (leaveOnDay) return 'leave_approved'
    const pendingLeave = leaves.find(l => l.leave_date === dateForDay && l.status === 'pending')
    if (pendingLeave) return 'leave_pending'
    if (dateForDay < today) return 'past'
    if (availability?.available_days?.includes(day)) return 'available'
    return 'unavailable'
  }

  const active = stories.filter(s => s.status !== 'filed' && s.status !== 'published')
  const filed = stories.filter(s => s.status === 'filed' || s.status === 'published')

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '11px 14px',
    background: t.bgInput, border: `1px solid ${t.borderInput}`,
    borderRadius: '8px', color: t.textPrimary,
    fontSize: '13px', outline: 'none',
    boxSizing: 'border-box', fontFamily: 'inherit',
  }

  const cardStyle: React.CSSProperties = {
    background: t.bgCard,
    border: `1px solid ${t.borderCard}`,
    borderRadius: '10px',
    padding: '20px 24px',
    boxShadow: t.shadowCard,
    marginBottom: '24px'
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: t.bgPage, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: t.textMuted, fontFamily: 'monospace', fontSize: '14px' }}>Loading reporter view...</p>
    </div>
  )

  return (
    <div style={{
      minHeight: '100vh',
      background: t.bgPage,
      fontFamily: '"Inter", "DM Mono", "Courier New", monospace',
      color: t.textPrimary
    }}>
      <Navbar />

      {/* Impersonation Banner */}
      <div style={{
        background: t.accentBg,
        borderBottom: `1px solid ${t.accentBorder}`,
        padding: '10px 24px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: t.accent }} />
          <span style={{ color: t.accent, fontSize: '12px', fontWeight: '600', letterSpacing: '0.5px' }}>
            VIEWING AS: <span style={{ color: t.textPrimary, fontWeight: '700' }}>{reporter?.name?.toUpperCase()}</span>
          </span>
          <span style={{ color: t.textMuted, fontSize: '11px' }}>— Editor View (Read Only + File Leave)</span>
        </div>
        <button
          onClick={() => navigate('/roster')}
          style={{
            padding: '7px 18px', background: t.accentBg,
            border: `1px solid ${t.accentBorder}`, borderRadius: '6px',
            color: t.accent, fontSize: '11px', fontWeight: '700',
            letterSpacing: '0.5px', cursor: 'pointer', fontFamily: 'inherit',
            transition: 'all 0.15s'
          }}>
          EXIT VIEW
        </button>
      </div>

      {/* Success message */}
      {successMsg && (
        <div style={{
          background: t.successBg,
          borderBottom: `1px solid ${t.successBorder}`,
          padding: '10px 24px'
        }}>
          <span style={{ color: t.success, fontSize: '13px', fontWeight: '600' }}>✓ {successMsg}</span>
        </div>
      )}

      <main role="main" style={{ padding: '32px 24px', maxWidth: '960px', margin: '0 auto' }}>

        {/* Reporter Info Card */}
        <div style={{
          ...cardStyle,
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', flexWrap: 'wrap', gap: '16px',
          border: `1px solid ${t.accentBorder}`
        }}>
          <div>
            <h1 style={{ color: t.textPrimary, margin: '0 0 4px', fontSize: '22px', fontWeight: '700' }}>
              {reporter?.name}
            </h1>
            <p style={{ color: t.textMuted, margin: '0 0 10px', fontSize: '13px' }}>
              {reporter?.email}
            </p>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {reporter?.beats?.map((b: string) => (
                <span key={b} style={{
                  padding: '3px 10px', background: t.accentBg,
                  border: `1px solid ${t.accentBorder}`, borderRadius: '4px',
                  color: t.accent, fontSize: '11px', fontWeight: '600'
                }}>
                  {b}
                </span>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: t.accent, fontSize: '28px', fontWeight: '800', lineHeight: 1 }}>
                {active.length}
              </div>
              <div style={{ color: t.textMuted, fontSize: '10px', fontWeight: '600', letterSpacing: '0.5px', marginTop: '4px' }}>
                ACTIVE
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: t.success, fontSize: '28px', fontWeight: '800', lineHeight: 1 }}>
                {reporter?.complexity_level}
              </div>
              <div style={{ color: t.textMuted, fontSize: '10px', fontWeight: '600', letterSpacing: '0.5px', marginTop: '4px' }}>
                COMPLEXITY
              </div>
            </div>
            <button
              onClick={() => setLeaveModal(true)}
              style={{
                padding: '10px 18px', background: t.warningBg,
                border: `1px solid ${t.warningBorder}`, borderRadius: '8px',
                color: t.warning, fontSize: '12px', fontWeight: '700',
                letterSpacing: '0.5px', cursor: 'pointer', fontFamily: 'inherit',
                transition: 'all 0.15s'
              }}>
              + FILE LEAVE ON BEHALF
            </button>
          </div>
        </div>

        {/* This Week Availability */}
        <div style={cardStyle}>
          <h2 style={{ color: t.textPrimary, margin: '0 0 16px', fontSize: '14px', fontWeight: '700', letterSpacing: '0.5px' }}>
            THIS WEEK AVAILABILITY
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px' }}>
            {DAYS.map(day => {
              const status = getDayStatus(day)
              const isToday_ = weekDates[day] === today
              const holiday = holidays.find(h => h.date === weekDates[day])

              const colors: Record<string, { bg: string, border: string, color: string, label: string }> = {
                available: { bg: t.successBg, border: t.successBorder, color: t.success, label: 'AVAIL' },
                unavailable: { bg: t.bgPage, border: t.borderCard, color: t.textMuted, label: '–' },
                leave_approved: { bg: t.dangerBg, border: t.dangerBorder, color: t.danger, label: 'LEAVE' },
                leave_pending: { bg: t.warningBg, border: t.warningBorder, color: t.warning, label: 'PEND' },
                holiday: { bg: t.dangerBg, border: t.dangerBorder, color: t.danger, label: 'HOL' },
                past: { bg: t.bgPage, border: t.borderCard, color: t.textDisabled, label: '' },
              }
              const c = colors[status] || colors.unavailable

              return (
                <div key={day} style={{
                  padding: '12px 6px', borderRadius: '8px',
                  background: c.bg, border: `2px solid ${c.border}`,
                  textAlign: 'center',
                  outline: isToday_ ? `3px solid ${t.accent}` : 'none',
                  outlineOffset: '2px'
                }}>
                  <div style={{ color: t.textMuted, fontSize: '10px', fontWeight: '700', marginBottom: '6px', letterSpacing: '0.5px' }}>
                    {day}
                  </div>
                  <div style={{ color: c.color, fontSize: '10px', fontWeight: '700' }}>
                    {c.label}
                  </div>
                  {holiday && (
                    <div style={{ color: t.danger, fontSize: '7px', marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {holiday.name}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Active Stories */}
        <div style={cardStyle}>
          <h2 style={{ color: t.textPrimary, margin: '0 0 16px', fontSize: '14px', fontWeight: '700', letterSpacing: '0.5px' }}>
            ACTIVE STORIES
            <span style={{ marginLeft: '8px', padding: '2px 10px', background: t.accentBg, color: t.accent, borderRadius: '10px', fontSize: '12px', border: `1px solid ${t.accentBorder}` }}>
              {active.length}
            </span>
          </h2>
          {active.length === 0 ? (
            <div style={{ color: t.textDisabled, fontSize: '14px', textAlign: 'center', padding: '32px', border: `1px dashed ${t.borderCard}`, borderRadius: '8px', background: t.bgPage }}>
              No active stories
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {active.map(story => (
                <div key={story.id} style={{
                  padding: '16px 20px', borderRadius: '8px',
                  border: `1px solid ${t.borderCard}`, background: t.bgPage
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                    <span style={{
                      padding: '3px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '700',
                      background: `${urgencyColor[story.urgency]}20`, color: urgencyColor[story.urgency],
                      border: `1px solid ${urgencyColor[story.urgency]}40`
                    }}>
                      {story.urgency?.toUpperCase()}
                    </span>
                    <span style={{
                      padding: '3px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '600',
                      background: `${statusColor[story.status]}15`, color: statusColor[story.status]
                    }}>
                      {story.status?.replace('_', ' ').toUpperCase()}
                    </span>
                    <span style={{ color: t.textMuted, fontSize: '12px' }}>{story.category}</span>
                  </div>
                  <div style={{ color: t.textPrimary, fontSize: '15px', fontWeight: '700', marginBottom: '6px' }}>
                    {story.headline}
                  </div>
                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    <span style={{ color: t.textMuted, fontSize: '12px' }}>
                      Deadline: <span style={{ color: t.textSecondary, fontWeight: '600' }}>{formatDate(story.deadline)}</span>
                    </span>
                    <span style={{ color: t.textMuted, fontSize: '12px' }}>
                      Complexity: <span style={{ color: t.textSecondary, fontWeight: '600' }}>{story.complexity}/5</span>
                    </span>
                  </div>
                  {story.reassign_reason && (
                    <div style={{ marginTop: '10px', padding: '10px 14px', background: t.warningBg, border: `1px solid ${t.warningBorder}`, borderRadius: '6px' }}>
                      <p style={{ color: t.textMuted, fontSize: '11px', fontWeight: '600', margin: '0 0 4px', letterSpacing: '0.5px' }}>REASSIGN REASON</p>
                      <p style={{ color: t.warning, fontSize: '12px', margin: 0 }}>{story.reassign_reason}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Filed / Published */}
        {filed.length > 0 && (
          <div style={cardStyle}>
            <h2 style={{ color: t.textPrimary, margin: '0 0 16px', fontSize: '14px', fontWeight: '700', letterSpacing: '0.5px' }}>
              FILED / PUBLISHED
              <span style={{ marginLeft: '8px', padding: '2px 10px', background: t.successBg, color: t.success, borderRadius: '10px', fontSize: '12px', border: `1px solid ${t.successBorder}` }}>
                {filed.length}
              </span>
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filed.map(story => (
                <div key={story.id} style={{
                  padding: '14px 18px', borderRadius: '8px',
                  border: `1px solid ${story.status === 'published' ? t.successBorder : 'rgba(167,139,250,0.3)'}`,
                  background: story.status === 'published' ? t.successBg : 'rgba(167,139,250,0.08)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                  <div>
                    <div style={{ color: t.textPrimary, fontSize: '14px', fontWeight: '600', marginBottom: '2px' }}>
                      {story.headline}
                    </div>
                    {story.filed_file_name && (
                      <div style={{ color: '#a78bfa', fontSize: '11px', fontWeight: '500' }}>
                        Filed: {story.filed_file_name}
                      </div>
                    )}
                  </div>
                  <span style={{
                    padding: '3px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: '700',
                    letterSpacing: '0.5px', marginLeft: '12px',
                    background: story.status === 'published' ? t.successBg : 'rgba(167,139,250,0.15)',
                    color: story.status === 'published' ? t.success : '#a78bfa',
                    border: `1px solid ${story.status === 'published' ? t.successBorder : 'rgba(167,139,250,0.3)'}`
                  }}>
                    {story.status?.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Leave History */}
        <div style={cardStyle}>
          <h2 style={{ color: t.textPrimary, margin: '0 0 16px', fontSize: '14px', fontWeight: '700', letterSpacing: '0.5px' }}>
            LEAVE HISTORY
          </h2>
          {leaves.length === 0 ? (
            <div style={{ color: t.textDisabled, fontSize: '13px', textAlign: 'center', padding: '24px', border: `1px dashed ${t.borderCard}`, borderRadius: '8px', background: t.bgPage }}>
              No leave requests
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {leaves.map(leave => (
                <div key={leave.id} style={{
                  padding: '14px 16px', borderRadius: '8px',
                  border: `1px solid ${leave.status === 'acknowledged' ? t.successBorder : leave.status === 'rejected' ? t.dangerBorder : t.warningBorder}`,
                  background: leave.status === 'acknowledged' ? t.successBg : leave.status === 'rejected' ? t.dangerBg : t.warningBg,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                      <span style={{
                        padding: '3px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '700',
                        background: `${ltc[leave.leave_type]}15`, color: ltc[leave.leave_type],
                        border: `1px solid ${ltc[leave.leave_type]}30`
                      }}>
                        {leave.leave_type?.toUpperCase()}
                      </span>
                      <span style={{ color: t.textPrimary, fontSize: '13px', fontWeight: '600' }}>
                        {formatDate(leave.leave_date)}
                      </span>
                      {leave.filed_by_editor && (
                        <span style={{
                          padding: '3px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '600',
                          background: t.accentBg, color: t.accent, border: `1px solid ${t.accentBorder}`
                        }}>
                          FILED BY EDITOR
                        </span>
                      )}
                    </div>
                    {leave.notes && (
                      <p style={{ color: t.textMuted, fontSize: '12px', margin: 0 }}>{leave.notes}</p>
                    )}
                    {leave.status === 'rejected' && leave.reject_reason && (
                      <p style={{ color: t.danger, fontSize: '12px', margin: '4px 0 0', fontWeight: '500' }}>
                        Rejected: {leave.reject_reason}
                      </p>
                    )}
                  </div>
                  <span style={{
                    padding: '4px 12px', borderRadius: '4px', fontSize: '11px', fontWeight: '700',
                    letterSpacing: '0.5px', whiteSpace: 'nowrap', marginLeft: '12px',
                    background: leave.status === 'acknowledged' ? t.successBg : leave.status === 'rejected' ? t.dangerBg : t.warningBg,
                    color: leave.status === 'acknowledged' ? t.success : leave.status === 'rejected' ? t.danger : t.warning,
                    border: `1px solid ${leave.status === 'acknowledged' ? t.successBorder : leave.status === 'rejected' ? t.dangerBorder : t.warningBorder}`
                  }}>
                    {leave.status?.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Leave Filing Requests from Reporter */}
        {filingRequests.length > 0 && (
          <div style={cardStyle}>
            <h2 style={{ color: t.textPrimary, margin: '0 0 16px', fontSize: '14px', fontWeight: '700', letterSpacing: '0.5px' }}>
              REPORTER LEAVE FILING REQUESTS
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filingRequests.map(req => (
                <div key={req.id} style={{
                  padding: '14px 16px', borderRadius: '8px',
                  border: `1px solid ${req.status === 'approved' ? t.successBorder : req.status === 'rejected' ? t.dangerBorder : t.warningBorder}`,
                  background: req.status === 'approved' ? t.successBg : req.status === 'rejected' ? t.dangerBg : t.warningBg
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '4px', alignItems: 'center' }}>
                        <span style={{ color: t.textPrimary, fontSize: '14px', fontWeight: '700' }}>
                          {formatDate(req.requested_date)}
                        </span>
                        <span style={{
                          padding: '3px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '600',
                          background: `${ltc[req.leave_type]}15`, color: ltc[req.leave_type],
                          border: `1px solid ${ltc[req.leave_type]}30`
                        }}>
                          {req.leave_type?.toUpperCase()}
                        </span>
                      </div>
                      <p style={{ color: t.textSecondary, fontSize: '12px', margin: 0 }}>
                        Reason: {req.reason}
                      </p>
                      {req.editor_note && (
                        <p style={{ color: t.textMuted, fontSize: '12px', margin: '4px 0 0' }}>
                          Editor note: {req.editor_note}
                        </p>
                      )}
                    </div>
                    <span style={{
                      padding: '4px 12px', borderRadius: '4px', fontSize: '11px', fontWeight: '700',
                      letterSpacing: '0.5px', whiteSpace: 'nowrap', marginLeft: '12px',
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
          </div>
        )}
      </main>

      {/* File Leave on Behalf Modal */}
      {leaveModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="File leave on behalf of reporter"
          style={{
            position: 'fixed', inset: 0, background: t.overlayBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
          }}
          onClick={e => { if (e.target === e.currentTarget) setLeaveModal(false) }}>
          <div style={{
            background: t.bgCard, border: `1px solid ${t.warningBorder}`,
            borderRadius: '12px', width: '100%', maxWidth: '440px',
            margin: '24px', padding: '28px', fontFamily: 'inherit', boxShadow: t.shadow
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', alignItems: 'center' }}>
              <h2 style={{ color: t.textPrimary, margin: 0, fontSize: '18px', fontWeight: '700' }}>
                File Leave on Behalf
              </h2>
              <button
                onClick={() => setLeaveModal(false)}
                aria-label="Close"
                style={{ background: 'none', border: 'none', color: t.textMuted, fontSize: '22px', cursor: 'pointer' }}>
                x
              </button>
            </div>

            <div style={{
              padding: '12px 16px', background: t.warningBg,
              border: `1px solid ${t.warningBorder}`, borderRadius: '8px', marginBottom: '20px'
            }}>
              <p style={{ color: t.warning, fontSize: '12px', fontWeight: '500', margin: 0, lineHeight: 1.5 }}>
                Filing leave for <span style={{ color: t.textPrimary, fontWeight: '700' }}>{reporter?.name}</span>.
                This will be auto-approved and marked as <strong>Filed by Editor</strong>.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ color: t.textSecondary, fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '6px' }}>
                  LEAVE DATE
                </label>
                <input
                  type="date"
                  value={leaveForm.leave_date}
                  min={today}
                  onChange={e => setLeaveForm(p => ({ ...p, leave_date: e.target.value }))}
                  style={{ ...inputStyle, colorScheme: 'dark' }}
                />
              </div>
              <div>
                <label style={{ color: t.textSecondary, fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '8px' }}>
                  LEAVE TYPE
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px' }} role="group">
                  {(['planned', 'sick', 'emergency'] as const).map(type => (
                    <button
                      key={type}
                      aria-pressed={leaveForm.leave_type === type}
                      onClick={() => setLeaveForm(p => ({ ...p, leave_type: type }))}
                      style={{
                        padding: '10px', borderRadius: '8px',
                        border: `2px solid ${leaveForm.leave_type === type ? ltc[type] : t.borderCard}`,
                        background: leaveForm.leave_type === type ? `${ltc[type]}15` : 'transparent',
                        color: leaveForm.leave_type === type ? ltc[type] : t.textMuted,
                        fontSize: '11px', fontWeight: leaveForm.leave_type === type ? '700' : '400',
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
                  NOTES <span style={{ color: t.textMuted, fontWeight: '400' }}>(optional)</span>
                </label>
                <textarea
                  value={leaveForm.notes}
                  onChange={e => setLeaveForm(p => ({ ...p, notes: e.target.value }))}
                  rows={3}
                  placeholder="Reason for filing on behalf..."
                  style={{ ...inputStyle, resize: 'none' as const }}
                />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setLeaveModal(false)}
                  style={{
                    flex: 1, padding: '12px', background: 'transparent',
                    border: `1px solid ${t.borderCard}`, borderRadius: '8px',
                    color: t.textMuted, fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit'
                  }}>
                  CANCEL
                </button>
                <button
                  onClick={fileLeaveOnBehalf}
                  disabled={!leaveForm.leave_date || submitting}
                  style={{
                    flex: 2, padding: '12px',
                    background: leaveForm.leave_date ? t.warning : t.bgInput,
                    border: `1px solid ${leaveForm.leave_date ? t.warningBorder : t.borderCard}`,
                    borderRadius: '8px',
                    color: leaveForm.leave_date ? t.accentText : t.textDisabled,
                    fontSize: '13px', fontWeight: '700',
                    cursor: leaveForm.leave_date ? 'pointer' : 'not-allowed',
                    fontFamily: 'inherit', opacity: submitting ? 0.6 : 1
                  }}>
                  {submitting ? 'FILING...' : 'FILE LEAVE ON BEHALF'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}



