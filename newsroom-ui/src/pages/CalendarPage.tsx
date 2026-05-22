import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'
import { useTheme } from '../context/ThemeContext'

export default function CalendarPage() {
  const { role, reporterId } = useAuth()
  const { t } = useTheme()

  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [holidays, setHolidays] = useState<any[]>([])
  const [leaves, setLeaves] = useState<any[]>([])
  const [availability, setAvailability] = useState<any[]>([])
  const [reporters, setReporters] = useState<any[]>([])
  const [selectedReporter, setSelectedReporter] = useState<string>('')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [leaveModal, setLeaveModal] = useState(false)
  const [dayDetailModal, setDayDetailModal] = useState<any>(null)
  const [leaveForm, setLeaveForm] = useState({ leave_type: 'planned', notes: '' })
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)

  const today = new Date().toISOString().split('T')[0]

  const ltc: Record<string, string> = {
    planned: t.warning,
    sick: t.warning,
    emergency: t.danger
  }

  async function loadHolidays() {
    const { data: holidayData } = await supabase.from('holidays').select('*').order('date')
    setHolidays(holidayData || [])
  }

  async function load(repId?: string) {
    setLoading(true)
    const targetId = repId || (role === 'reporter' ? reporterId : selectedReporter)

    if (targetId) {
      const { data: leaveData } = await supabase
        .from('leave_requests').select('*')
        .eq('reporter_id', targetId).order('leave_date')
      setLeaves(leaveData || [])

      const { data: availData } = await supabase
        .from('availability').select('*').eq('reporter_id', targetId)
      setAvailability(availData || [])
    } else {
      setLeaves([])
      setAvailability([])
    }

    if (role === 'editor') {
      const { data: reporterData } = await supabase
        .from('reporters').select('id, name, email, beats').eq('status', 'active')
      setReporters(reporterData || [])
      if (!repId && !selectedReporter && reporterData && reporterData.length > 0) {
        setSelectedReporter(reporterData[0].id)
      }
    }

    setLoading(false)
  }

  useEffect(() => { loadHolidays() }, [])
  useEffect(() => { load() }, [reporterId])
  useEffect(() => { if (selectedReporter) load(selectedReporter) }, [selectedReporter])

  function getWeekStart(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00')
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    d.setDate(diff)
    return d.toISOString().split('T')[0]
  }

  function isAvailableOnDate(dateStr: string): boolean {
    const d = new Date(dateStr + 'T00:00:00')
    const dayOfWeek = d.getDay()
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const dayName = dayNames[dayOfWeek]
    if (dayOfWeek === 0 || dayOfWeek === 6) return false
    const weekStartStr = getWeekStart(dateStr)
    const weekAvail = availability.find(a => a.week_start_date === weekStartStr)
    if (!weekAvail) return true
    return weekAvail.available_days?.includes(dayName) || false
  }

  function getDateStatus(dateStr: string) {
    const d = new Date(dateStr + 'T00:00:00')
    const dayOfWeek = d.getDay()
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
    const isPast = dateStr < today
    const isToday = dateStr === today
    const holiday = holidays.find(h => h.date.split('T')[0] === dateStr)
    const leave = leaves.find(l => l.leave_date.split('T')[0] === dateStr)
    const isAvailable = isAvailableOnDate(dateStr)
    return { holiday, leave, isWeekend, isPast, isToday, isAvailable, dateStr }
  }

  function getDaysInMonth(date: Date) {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const days: (string | null)[] = []
    let startDow = firstDay.getDay() - 1
    if (startDow < 0) startDow = 6
    for (let i = 0; i < startDow; i++) days.push(null)
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
    }
    return days
  }

  // MODIFIED: Uses theme tokens for all colors
  function getDayStyle(status: any): React.CSSProperties {
    const base: React.CSSProperties = {
      width: '100%',
      aspectRatio: '1',
      borderRadius: '8px',
      border: '2px solid',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      fontSize: '13px',
      fontWeight: '700',
      transition: 'all 0.15s',
      fontFamily: 'inherit',
      outline: status?.isToday ? `3px solid ${t.accent}` : 'none',
      outlineOffset: '2px',
      padding: '4px 2px',
      boxSizing: 'border-box' as const
    }

    if (!status) return base

    if (status.holiday) return {
      ...base,
      background: t.dangerBg,
      borderColor: t.dangerBorder,
      color: t.danger,
    }

    if (status.leave?.status === 'acknowledged') return {
      ...base,
      background: t.warningBg,
      borderColor: t.warningBorder,
      color: t.warning,
    }

    if (status.leave?.status === 'pending') return {
      ...base,
      background: `${t.accent}15`,
      borderColor: t.accentBorder,
      color: t.accent,
    }

    if (status.isWeekend) return {
      ...base,
      background: t.bgPage,
      borderColor: t.borderCard,
      color: t.textDisabled,
      cursor: 'default'
    }

    if (status.isPast) return {
      ...base,
      background: t.bgPage,
      borderColor: t.borderCard,
      color: t.textDisabled,
      cursor: 'default',
      opacity: 0.5
    }

    if (status.isAvailable) return {
      ...base,
      background: t.successBg,
      borderColor: t.successBorder,
      color: t.success,
      cursor: role === 'reporter' ? 'pointer' : 'default'
    }

    return {
      ...base,
      background: t.bgCard,
      borderColor: t.borderCard,
      color: t.textMuted,
      cursor: role === 'reporter' ? 'pointer' : 'default'
    }
  }

  function getDayLabel(status: any): string {
    if (!status) return ''
    if (status.holiday) return 'HOL'
    if (status.leave?.status === 'acknowledged') return 'LEAVE'
    if (status.leave?.status === 'pending') return 'PEND'
    if (status.isWeekend) return 'OFF'
    if (status.isPast) return ''
    if (status.isAvailable) return 'AVAIL'
    return 'UNAVAIL'
  }

  function getDayLabelColor(status: any): string {
    if (!status) return t.textMuted
    if (status.holiday) return t.danger
    if (status.leave?.status === 'acknowledged') return t.warning
    if (status.leave?.status === 'pending') return t.accent
    if (status.isWeekend) return t.textDisabled
    if (status.isPast) return t.textDisabled
    if (status.isAvailable) return t.success
    return t.textMuted
  }

  function handleDayClick(dateStr: string) {
    if (!dateStr) return
    const status = getDateStatus(dateStr)
    if (!status) return
    if (role === 'reporter') {
      if (dateStr < today) return
      if (status.holiday || status.leave) { setDayDetailModal({ dateStr, status }); return }
      setSelectedDate(dateStr)
      setLeaveModal(true)
    } else {
      setDayDetailModal({ dateStr, status })
    }
  }

  async function submitLeave() {
    if (!reporterId || !selectedDate) return
    setSubmitting(true)
    await supabase.from('leave_requests').insert({
      reporter_id: reporterId,
      leave_date: selectedDate,
      leave_type: leaveForm.leave_type,
      is_immediate: leaveForm.leave_type === 'emergency' || leaveForm.leave_type === 'sick',
      notes: leaveForm.notes,
      status: 'pending'
    })
    setSubmitting(false)
    setLeaveModal(false)
    setSelectedDate(null)
    setLeaveForm({ leave_type: 'planned', notes: '' })
    load()
  }

  const days = getDaysInMonth(currentMonth)
  const monthName = currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    background: t.bgInput,
    border: `1px solid ${t.borderInput}`,
    borderRadius: '8px',
    color: t.textPrimary,
    fontSize: '13px',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    resize: 'none' as const,
  }

  const cardStyle: React.CSSProperties = {
    background: t.bgCard,
    border: `1px solid ${t.borderCard}`,
    borderRadius: '10px',
    padding: '20px',
    boxShadow: t.shadowCard,
  }

  const legend = [
    { color: t.success, border: t.successBorder, label: 'Available' },
    { color: t.textMuted, border: t.borderCard, label: 'Unavailable' },
    { color: t.danger, border: t.dangerBorder, label: 'Public Holiday' },
    { color: t.warning, border: t.warningBorder, label: 'Leave Approved' },
    { color: t.accent, border: t.accentBorder, label: 'Leave Pending' },
    { color: t.textDisabled, border: t.borderCard, label: 'Weekend / Off' },
  ]

  return (
    <div style={{
      minHeight: '100vh',
      background: t.bgPage,
      fontFamily: '"Inter", "DM Mono", "Courier New", monospace',
      color: t.textPrimary
    }}>
      <Navbar />
      <main role="main" style={{ padding: '32px 24px', maxWidth: '1000px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{ color: t.textPrimary, margin: '0 0 6px', fontSize: '22px', fontWeight: '700' }}>
              {role === 'editor' ? 'Reporter Calendar' : 'My Calendar'}
            </h1>
            <p style={{ color: t.textMuted, margin: 0, fontSize: '13px' }}>
              {role === 'reporter'
                ? 'Click any future date to apply for leave. Green = available by default.'
                : 'View reporter availability, leaves and holidays.'}
            </p>
          </div>

          {/* Editor reporter selector */}
          {role === 'editor' && (
            <select
              value={selectedReporter}
              onChange={e => setSelectedReporter(e.target.value)}
              aria-label="Select reporter"
              style={{
                padding: '10px 16px',
                background: t.bgCard,
                border: `1px solid ${t.accentBorder}`,
                borderRadius: '8px',
                color: t.accent,
                fontSize: '13px',
                outline: 'none',
                fontFamily: 'inherit',
                cursor: 'pointer',
                fontWeight: '600',
                boxShadow: t.shadowCard
              }}>
              {reporters.map(r => (
                <option key={r.id} value={r.id} style={{ background: t.bgCard }}>
                  {r.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Legend */}
        <div style={{
          display: 'flex', gap: '12px', marginBottom: '24px',
          flexWrap: 'wrap', padding: '14px 18px',
          background: t.bgCard,
          borderRadius: '10px',
          border: `1px solid ${t.borderCard}`,
          boxShadow: t.shadowCard
        }}>
          {legend.map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{
                width: '14px', height: '14px', borderRadius: '4px',
                background: `${item.color}20`,
                border: `2px solid ${item.border}`
              }} />
              <span style={{ color: t.textMuted, fontSize: '11px', fontWeight: '500' }}>
                {item.label}
              </span>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{
              width: '14px', height: '14px', borderRadius: '4px',
              background: t.accentBg,
              border: `2px solid ${t.accent}`,
              outline: `2px solid ${t.accent}`,
              outlineOffset: '1px'
            }} />
            <span style={{ color: t.textMuted, fontSize: '11px', fontWeight: '500' }}>Today</span>
          </div>
        </div>

        {/* Calendar */}
        <div style={{ ...cardStyle, marginBottom: '20px' }}>

          {/* Month navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <button
              onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
              aria-label="Previous month"
              style={{
                padding: '8px 18px',
                background: t.bgInput,
                border: `1px solid ${t.borderCard}`,
                borderRadius: '8px',
                color: t.textSecondary,
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
                fontFamily: 'inherit',
                letterSpacing: '0.5px',
                transition: 'all 0.15s'
              }}>
              PREV
            </button>

            <div style={{ textAlign: 'center' }}>
              <div style={{ color: t.textPrimary, fontSize: '17px', letterSpacing: '1px', fontWeight: '700' }}>
                {monthName.toUpperCase()}
              </div>
              <div style={{ color: t.textMuted, fontSize: '11px', marginTop: '2px', fontWeight: '500' }}>
                {role === 'reporter'
                  ? 'Your calendar'
                  : reporters.find(r => r.id === selectedReporter)?.name || ''}
              </div>
            </div>

            <button
              onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
              aria-label="Next month"
              style={{
                padding: '8px 18px',
                background: t.bgInput,
                border: `1px solid ${t.borderCard}`,
                borderRadius: '8px',
                color: t.textSecondary,
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
                fontFamily: 'inherit',
                letterSpacing: '0.5px',
                transition: 'all 0.15s'
              }}>
              NEXT
            </button>
          </div>

          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px', marginBottom: '8px' }}>
            {[
              { label: 'MON', weekend: false },
              { label: 'TUE', weekend: false },
              { label: 'WED', weekend: false },
              { label: 'THU', weekend: false },
              { label: 'FRI', weekend: false },
              { label: 'SAT', weekend: true },
              { label: 'SUN', weekend: true },
            ].map(d => (
              <div key={d.label} style={{
                textAlign: 'center',
                color: d.weekend ? t.textDisabled : t.textMuted,
                fontSize: '10px',
                letterSpacing: '1px',
                padding: '4px 0',
                fontWeight: '700'
              }}>
                {d.label}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          {loading ? (
            <div style={{
              color: t.textMuted,
              textAlign: 'center',
              padding: '60px',
              fontSize: '14px'
            }}>
              Loading calendar...
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px' }}>
              {days.map((dateStr, i) => {
                if (!dateStr) return <div key={`empty-${i}`} />
                const status = getDateStatus(dateStr)
                const dayNum = parseInt(dateStr.split('-')[2])
                return (
                  <button
                    key={dateStr}
                    onClick={() => handleDayClick(dateStr)}
                    aria-label={`${dateStr} — ${getDayLabel(status)}`}
                    style={getDayStyle(status)}>
                    <span style={{ fontSize: '13px', fontWeight: '700', lineHeight: 1 }}>
                      {dayNum}
                    </span>
                    <span style={{
                      fontSize: '7px',
                      color: getDayLabelColor(status),
                      marginTop: '3px',
                      letterSpacing: '0.3px',
                      lineHeight: 1,
                      fontWeight: '700'
                    }}>
                      {getDayLabel(status)}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Stats row */}
        {!loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
            {[
              { label: 'Holidays This Year', value: holidays.length, color: t.danger, bg: t.dangerBg, border: t.dangerBorder },
              { label: 'Leaves Pending', value: leaves.filter(l => l.status === 'pending' && l.leave_date >= today).length, color: t.accent, bg: t.accentBg, border: t.accentBorder },
              { label: 'Leaves Approved', value: leaves.filter(l => l.status === 'acknowledged' && l.leave_date >= today).length, color: t.warning, bg: t.warningBg, border: t.warningBorder },
              { label: 'Total Upcoming Off', value: holidays.filter(h => h.date >= today).length + leaves.filter(l => l.status === 'acknowledged' && l.leave_date >= today).length, color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.3)' },
            ].map(stat => (
              <div key={stat.label} style={{
                padding: '18px',
                background: stat.bg,
                border: `1px solid ${stat.border}`,
                borderRadius: '10px',
                textAlign: 'center',
                boxShadow: t.shadowCard
              }}>
                <div style={{ color: stat.color, fontSize: '28px', fontWeight: '800', marginBottom: '6px', lineHeight: 1 }}>
                  {stat.value}
                </div>
                <div style={{ color: t.textMuted, fontSize: '11px', fontWeight: '600', letterSpacing: '0.5px' }}>
                  {stat.label.toUpperCase()}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Upcoming Holidays */}
        <div style={{ ...cardStyle, marginBottom: '20px' }}>
          <h2 style={{ color: t.textPrimary, margin: '0 0 14px', fontSize: '14px', fontWeight: '700', letterSpacing: '0.5px' }}>
            UPCOMING HOLIDAYS
          </h2>
          {holidays.filter(h => h.date.split('T')[0] >= today).length === 0 ? (
            <div style={{ color: t.textDisabled, fontSize: '13px', textAlign: 'center', padding: '20px', border: `1px dashed ${t.borderCard}`, borderRadius: '8px' }}>
              No upcoming holidays
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {holidays.filter(h => h.date.split('T')[0] >= today).map(h => (
                <div key={h.id} style={{
                  padding: '12px 16px',
                  borderRadius: '8px',
                  border: `1px solid ${t.dangerBorder}`,
                  background: t.dangerBg,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: t.danger, flexShrink: 0 }} />
                    <span style={{ color: t.textPrimary, fontSize: '13px', fontWeight: '600' }}>{h.name}</span>
                  </div>
                  <span style={{ color: t.danger, fontSize: '12px', fontWeight: '600', letterSpacing: '0.5px' }}>
                    {h.date.split('T')[0]}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Leaves */}
        {leaves.filter(l => l.leave_date >= today).length > 0 && (
          <div style={cardStyle}>
            <h2 style={{ color: t.textPrimary, margin: '0 0 14px', fontSize: '14px', fontWeight: '700', letterSpacing: '0.5px' }}>
              {role === 'reporter' ? 'MY UPCOMING LEAVES' : 'REPORTER UPCOMING LEAVES'}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {leaves.filter(l => l.leave_date >= today).map(leave => (
                <div key={leave.id} style={{
                  padding: '14px 16px',
                  borderRadius: '8px',
                  border: `1px solid ${leave.status === 'acknowledged' ? t.warningBorder : leave.status === 'rejected' ? t.dangerBorder : t.accentBorder}`,
                  background: leave.status === 'acknowledged' ? t.warningBg : leave.status === 'rejected' ? t.dangerBg : t.accentBg,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{
                        padding: '3px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '700',
                        background: `${ltc[leave.leave_type]}20`, color: ltc[leave.leave_type],
                        border: `1px solid ${ltc[leave.leave_type]}30`, letterSpacing: '0.5px'
                      }}>
                        {leave.leave_type?.toUpperCase()}
                      </span>
                      <span style={{ color: t.textPrimary, fontSize: '14px', fontWeight: '700' }}>
                        {leave.leave_date}
                      </span>
                    </div>
                    {leave.notes && (
                      <p style={{ color: t.textMuted, fontSize: '12px', margin: 0 }}>{leave.notes}</p>
                    )}
                    {leave.status === 'rejected' && leave.reject_reason && (
                      <p style={{ color: t.danger, fontSize: '12px', margin: '4px 0 0' }}>
                        Rejected: {leave.reject_reason}
                      </p>
                    )}
                  </div>
                  <span style={{
                    padding: '4px 12px', borderRadius: '4px', fontSize: '11px', fontWeight: '700',
                    letterSpacing: '0.5px', whiteSpace: 'nowrap', marginLeft: '12px',
                    background: leave.status === 'acknowledged' ? t.successBg : leave.status === 'rejected' ? t.dangerBg : t.accentBg,
                    color: leave.status === 'acknowledged' ? t.success : leave.status === 'rejected' ? t.danger : t.accent,
                    border: `1px solid ${leave.status === 'acknowledged' ? t.successBorder : leave.status === 'rejected' ? t.dangerBorder : t.accentBorder}`
                  }}>
                    {leave.status?.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Leave Filing Modal */}
      {leaveModal && selectedDate && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Apply for leave"
          style={{
            position: 'fixed', inset: 0,
            background: t.overlayBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={e => { if (e.target === e.currentTarget) { setLeaveModal(false); setSelectedDate(null) } }}>
          <div style={{
            background: t.bgCard,
            border: `1px solid ${t.accentBorder}`,
            borderRadius: '12px',
            width: '100%', maxWidth: '420px',
            margin: '24px', padding: '28px',
            fontFamily: 'inherit', boxShadow: t.shadow
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', alignItems: 'center' }}>
              <h2 style={{ color: t.textPrimary, margin: 0, fontSize: '18px', fontWeight: '700' }}>
                Apply for Leave
              </h2>
              <button
                onClick={() => { setLeaveModal(false); setSelectedDate(null) }}
                aria-label="Close"
                style={{ background: 'none', border: 'none', color: t.textMuted, fontSize: '22px', cursor: 'pointer' }}>
                x
              </button>
            </div>

            <div style={{
              padding: '12px 16px',
              background: t.accentBg,
              border: `1px solid ${t.accentBorder}`,
              borderRadius: '8px', marginBottom: '20px'
            }}>
              <p style={{ color: t.textMuted, fontSize: '11px', fontWeight: '600', letterSpacing: '0.5px', margin: '0 0 4px' }}>
                SELECTED DATE
              </p>
              <p style={{ color: t.accent, fontSize: '17px', fontWeight: '700', margin: 0 }}>
                {selectedDate}
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
                        padding: '10px', borderRadius: '8px', border: '2px solid',
                        borderColor: leaveForm.leave_type === type ? ltc[type] : t.borderCard,
                        background: leaveForm.leave_type === type ? `${ltc[type]}15` : 'transparent',
                        color: leaveForm.leave_type === type ? ltc[type] : t.textMuted,
                        fontSize: '11px', fontWeight: leaveForm.leave_type === type ? '700' : '400',
                        letterSpacing: '0.5px', cursor: 'pointer',
                        fontFamily: 'inherit', textTransform: 'uppercase' as const,
                        transition: 'all 0.15s'
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
                  placeholder="Reason for leave..."
                  style={inputStyle}
                />
              </div>

              {leaveForm.leave_type !== 'planned' && (
                <div style={{
                  padding: '12px 14px',
                  background: t.dangerBg,
                  border: `1px solid ${t.dangerBorder}`,
                  borderRadius: '8px'
                }}>
                  <p style={{ color: t.danger, fontSize: '12px', fontWeight: '500', margin: 0 }}>
                    Emergency/sick leave will immediately alert the editor
                  </p>
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => { setLeaveModal(false); setSelectedDate(null) }}
                  style={{
                    flex: 1, padding: '12px', background: 'transparent',
                    border: `1px solid ${t.borderCard}`, borderRadius: '8px',
                    color: t.textMuted, fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit'
                  }}>
                  CANCEL
                </button>
                <button
                  onClick={submitLeave}
                  disabled={submitting}
                  style={{
                    flex: 2, padding: '12px',
                    background: submitting ? t.textMuted : t.accent,
                    border: 'none', borderRadius: '8px',
                    color: t.accentText, fontSize: '13px', fontWeight: '700',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit', opacity: submitting ? 0.6 : 1
                  }}>
                  {submitting ? 'SUBMITTING...' : 'SUBMIT LEAVE REQUEST'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Day Detail Modal */}
      {dayDetailModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Day details"
          style={{
            position: 'fixed', inset: 0,
            background: t.overlayBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={e => { if (e.target === e.currentTarget) setDayDetailModal(null) }}>
          <div style={{
            background: t.bgCard,
            border: `1px solid ${t.borderCard}`,
            borderRadius: '12px',
            width: '100%', maxWidth: '420px',
            margin: '24px', padding: '28px',
            fontFamily: 'inherit', boxShadow: t.shadow
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', alignItems: 'flex-start' }}>
              <div>
                <p style={{ color: t.textMuted, fontSize: '11px', fontWeight: '600', letterSpacing: '0.5px', margin: '0 0 4px' }}>
                  DATE
                </p>
                <h2 style={{ color: t.textPrimary, margin: 0, fontSize: '20px', fontWeight: '700' }}>
                  {dayDetailModal.dateStr}
                </h2>
              </div>
              <button
                onClick={() => setDayDetailModal(null)}
                aria-label="Close"
                style={{ background: 'none', border: 'none', color: t.textMuted, fontSize: '22px', cursor: 'pointer' }}>
                x
              </button>
            </div>

            {/* Today badge */}
            {dayDetailModal.status.isToday && (
              <div style={{
                padding: '8px 14px', background: t.accentBg,
                border: `1px solid ${t.accentBorder}`, borderRadius: '8px', marginBottom: '12px'
              }}>
                <p style={{ color: t.accent, fontSize: '12px', fontWeight: '700', margin: 0 }}>TODAY</p>
              </div>
            )}

            {/* Holiday */}
            {dayDetailModal.status.holiday && (
              <div style={{
                padding: '14px 16px', background: t.dangerBg,
                border: `1px solid ${t.dangerBorder}`, borderRadius: '8px', marginBottom: '12px'
              }}>
                <p style={{ color: t.textMuted, fontSize: '11px', fontWeight: '600', letterSpacing: '0.5px', margin: '0 0 6px' }}>
                  PUBLIC HOLIDAY
                </p>
                <p style={{ color: t.danger, fontSize: '16px', fontWeight: '700', margin: '0 0 4px' }}>
                  {dayDetailModal.status.holiday.name}
                </p>
                <p style={{ color: t.textMuted, fontSize: '12px', margin: 0, lineHeight: 1.5 }}>
                  All reporters are unavailable on this day by default. Override assign is still possible.
                </p>
              </div>
            )}

            {/* Leave */}
            {dayDetailModal.status.leave && (
              <div style={{
                padding: '14px 16px',
                background: dayDetailModal.status.leave.status === 'acknowledged' ? t.warningBg : dayDetailModal.status.leave.status === 'rejected' ? t.dangerBg : t.accentBg,
                border: `1px solid ${dayDetailModal.status.leave.status === 'acknowledged' ? t.warningBorder : dayDetailModal.status.leave.status === 'rejected' ? t.dangerBorder : t.accentBorder}`,
                borderRadius: '8px', marginBottom: '12px'
              }}>
                <p style={{ color: t.textMuted, fontSize: '11px', fontWeight: '600', letterSpacing: '0.5px', margin: '0 0 8px' }}>
                  LEAVE REQUEST
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ color: ltc[dayDetailModal.status.leave.leave_type], fontSize: '13px', fontWeight: '700' }}>
                    {dayDetailModal.status.leave.leave_type?.toUpperCase()}
                  </span>
                  <span style={{
                    padding: '3px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: '700',
                    background: dayDetailModal.status.leave.status === 'acknowledged' ? t.successBg : dayDetailModal.status.leave.status === 'rejected' ? t.dangerBg : t.accentBg,
                    color: dayDetailModal.status.leave.status === 'acknowledged' ? t.success : dayDetailModal.status.leave.status === 'rejected' ? t.danger : t.accent,
                    border: `1px solid ${dayDetailModal.status.leave.status === 'acknowledged' ? t.successBorder : dayDetailModal.status.leave.status === 'rejected' ? t.dangerBorder : t.accentBorder}`
                  }}>
                    {dayDetailModal.status.leave.status?.toUpperCase()}
                  </span>
                </div>
                {dayDetailModal.status.leave.notes && (
                  <p style={{ color: t.textSecondary, fontSize: '13px', margin: '4px 0 0', lineHeight: 1.5 }}>
                    {dayDetailModal.status.leave.notes}
                  </p>
                )}
                {dayDetailModal.status.leave.status === 'rejected' && dayDetailModal.status.leave.reject_reason && (
                  <p style={{ color: t.danger, fontSize: '12px', margin: '6px 0 0', fontWeight: '500' }}>
                    Reason: {dayDetailModal.status.leave.reject_reason}
                  </p>
                )}
              </div>
            )}

            {/* Availability */}
            {!dayDetailModal.status.holiday && !dayDetailModal.status.leave && (
              <div style={{
                padding: '14px 16px',
                background: dayDetailModal.status.isWeekend ? t.bgPage
                  : dayDetailModal.status.isAvailable ? t.successBg : t.dangerBg,
                border: `1px solid ${dayDetailModal.status.isWeekend ? t.borderCard
                  : dayDetailModal.status.isAvailable ? t.successBorder : t.dangerBorder}`,
                borderRadius: '8px', marginBottom: '12px'
              }}>
                <p style={{ color: t.textMuted, fontSize: '11px', fontWeight: '600', letterSpacing: '0.5px', margin: '0 0 6px' }}>
                  AVAILABILITY STATUS
                </p>
                <p style={{
                  color: dayDetailModal.status.isWeekend ? t.textDisabled
                    : dayDetailModal.status.isAvailable ? t.success : t.danger,
                  fontSize: '15px', fontWeight: '700', margin: 0
                }}>
                  {dayDetailModal.status.isWeekend
                    ? 'Weekend — Off by default'
                    : dayDetailModal.status.isPast
                    ? 'Past date'
                    : dayDetailModal.status.isAvailable
                    ? 'Available'
                    : 'Unavailable'}
                </p>
              </div>
            )}

            <button
              onClick={() => setDayDetailModal(null)}
              style={{
                width: '100%', padding: '12px', background: 'transparent',
                border: `1px solid ${t.borderCard}`, borderRadius: '8px',
                color: t.textMuted, fontSize: '13px', cursor: 'pointer',
                fontFamily: 'inherit', letterSpacing: '0.5px'
              }}>
              CLOSE
            </button>
          </div>
        </div>
      )}
    </div>
  )
}