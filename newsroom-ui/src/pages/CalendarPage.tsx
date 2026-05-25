import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'
import { useTheme } from '../context/ThemeContext'
import { useCollapse } from '../hooks/useCollapse'
import SectionCard from '../components/SectionCard'

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
  const [assignments, setAssignments] = useState<any[]>([])

  const today = new Date().toISOString().split('T')[0]

  const ltc: Record<string, string> = {
    planned: t.warning, sick: t.warning, emergency: t.danger
  }

  const urgencyColor: Record<string, string> = {
    breaking: t.breaking, high: t.warning, normal: t.accent, low: t.success
  }

  const statusColor: Record<string, string> = {
    assigned: t.warning, in_progress: t.success, filed: '#a78bfa', published: t.success
  }

  async function loadHolidays() {
    const { data: holidayData } = await supabase.from('holidays').select('*').order('date')
    setHolidays(holidayData || [])
  }

  // FIXED: accepts targetId directly so no stale state issue
  async function load(targetId?: string) {
    setLoading(true)

    if (targetId) {
      const { data: leaveData } = await supabase
        .from('leave_requests').select('*')
        .eq('reporter_id', targetId).order('leave_date')
      setLeaves(leaveData || [])

      const { data: availData } = await supabase
        .from('availability').select('*').eq('reporter_id', targetId)
      setAvailability(availData || [])

      // FIXED: select assigned_at from assignments table directly, not from stories
      const { data: assignData } = await supabase
        .from('assignments')
        .select(`
          id,
          assigned_at,
          stories (
            id,
            headline,
            urgency,
            status,
            deadline,
            category,
            complexity,
            priority
          )
        `)
        .eq('reporter_id', targetId)
        .eq('is_active', true)

      console.log('Loaded assignments for', targetId, assignData)
      setAssignments(assignData || [])
    } else {
      setLeaves([])
      setAvailability([])
      setAssignments([])
    }

    if (role === 'editor') {
      const { data: reporterData } = await supabase
        .from('reporters').select('id, name, email, beats').eq('status', 'active')
      setReporters(reporterData || [])
    }

    setLoading(false)
  }

  // FIXED: on mount load for reporter directly
  useEffect(() => {
    loadHolidays()
  }, [])

  useEffect(() => {
    if (role === 'reporter' && reporterId) {
      load(reporterId)
    }
  }, [reporterId, role])

  // FIXED: for editor, load reporters first then auto-select first
  useEffect(() => {
    if (role === 'editor') {
      supabase.from('reporters').select('id, name, email, beats').eq('status', 'active')
        .then(({ data }) => {
          setReporters(data || [])
          if (data && data.length > 0 && !selectedReporter) {
            setSelectedReporter(data[0].id)
            load(data[0].id)
          }
        })
    }
  }, [role])

  // FIXED: when editor changes reporter selection
  useEffect(() => {
    if (role === 'editor' && selectedReporter) {
      load(selectedReporter)
    }
  }, [selectedReporter])

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

  // FIXED: parse assigned_at from assignment row (not stories)
  function getAssignedDate(a: any): string {
    if (!a.assigned_at) return ''
    return new Date(a.assigned_at).toISOString().split('T')[0]
  }

  function getStoriesDeadlineOnDate(dateStr: string): any[] {
    return assignments
      .filter(a => a.stories?.deadline === dateStr)
      .map(a => ({
        ...a.stories,
        assigned_at: getAssignedDate(a)
      }))
      .filter(s => s.id)
  }

  function getStoriesActiveOnDate(dateStr: string): any[] {
    return assignments
      .filter(a => {
        const story = a.stories
        if (!story || !story.deadline) return false
        const assignedDate = getAssignedDate(a)
        return assignedDate <= dateStr && story.deadline >= dateStr
      })
      .map(a => ({
        ...a.stories,
        assigned_at: getAssignedDate(a)
      }))
      .filter(s => s.id)
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
    const storiesDeadline = getStoriesDeadlineOnDate(dateStr)
    const storiesActive = getStoriesActiveOnDate(dateStr)
    return { holiday, leave, isWeekend, isPast, isToday, isAvailable, dateStr, storiesDeadline, storiesActive }
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

  function getDayBg(status: any): { bg: string, border: string, color: string } {
    if (!status) return { bg: t.bgCard, border: t.borderCard, color: t.textMuted }
    if (status.holiday) return { bg: t.dangerBg, border: t.dangerBorder, color: t.danger }
    if (status.leave?.status === 'acknowledged') return { bg: t.warningBg, border: t.warningBorder, color: t.warning }
    if (status.leave?.status === 'pending') return { bg: `${t.accent}15`, border: t.accentBorder, color: t.accent }
    if (status.isWeekend) return { bg: t.bgPage, border: t.borderCard, color: t.textDisabled }
    if (status.isPast) return { bg: t.bgPage, border: t.borderCard, color: t.textDisabled }
    if (status.isAvailable) return { bg: t.successBg, border: t.successBorder, color: t.success }
    return { bg: t.bgCard, border: t.borderCard, color: t.textMuted }
  }

  function handleDayClick(dateStr: string) {
    if (!dateStr) return
    const status = getDateStatus(dateStr)
    if (!status) return
    if (role === 'reporter') {
      if (dateStr < today) return
      if (status.holiday || status.leave ||
        status.storiesDeadline.length > 0 || status.storiesActive.length > 0) {
        setDayDetailModal({ dateStr, status })
        return
      }
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
    if (reporterId) load(reporterId)
  }

  const days = getDaysInMonth(currentMonth)
  const monthName = currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px',
    background: t.bgInput, border: `1px solid ${t.borderInput}`,
    borderRadius: '8px', color: t.textPrimary,
    fontSize: '13px', outline: 'none',
    boxSizing: 'border-box', fontFamily: 'inherit',
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
    { color: t.textDisabled, border: t.borderCard, label: 'Weekend' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: t.bgPage, fontFamily: '"Inter", "DM Mono", "Courier New", monospace', color: t.textPrimary }}>
      <Navbar />
      <main role="main" style={{ padding: '32px 24px', maxWidth: '1100px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{ color: t.textPrimary, margin: '0 0 6px', fontSize: '22px', fontWeight: '700' }}>
              {role === 'editor' ? 'Reporter Calendar' : 'My Calendar'}
            </h1>
            <p style={{ color: t.textMuted, margin: 0, fontSize: '13px' }}>
              {role === 'reporter'
                ? 'View your story deadlines, leaves and availability. Click any future date to apply for leave.'
                : 'View reporter story deadlines, leaves and availability.'}
            </p>
          </div>
          {role === 'editor' && (
            <select
              value={selectedReporter}
              onChange={e => setSelectedReporter(e.target.value)}
              aria-label="Select reporter"
              style={{
                padding: '10px 16px', background: t.bgCard,
                border: `1px solid ${t.accentBorder}`, borderRadius: '8px',
                color: t.accent, fontSize: '13px', outline: 'none',
                fontFamily: 'inherit', cursor: 'pointer', fontWeight: '600',
                boxShadow: t.shadowCard
              }}>
              {reporters.map(r => (
                <option key={r.id} value={r.id} style={{ background: t.bgCard }}>{r.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Legend */}
        <div style={{
          display: 'flex', gap: '12px', marginBottom: '24px',
          flexWrap: 'wrap', padding: '14px 18px',
          background: t.bgCard, borderRadius: '10px',
          border: `1px solid ${t.borderCard}`, boxShadow: t.shadowCard
        }}>
          {legend.map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '14px', height: '14px', borderRadius: '4px', background: `${item.color}20`, border: `2px solid ${item.border}` }} />
              <span style={{ color: t.textMuted, fontSize: '11px', fontWeight: '500' }}>{item.label}</span>
            </div>
          ))}
          {['breaking', 'high', 'normal', 'low'].map(u => (
            <div key={u} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: urgencyColor[u] }} />
              <span style={{ color: t.textMuted, fontSize: '11px', fontWeight: '500' }}>{u} story</span>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '14px', height: '14px', borderRadius: '4px', background: t.accentBg, border: `2px solid ${t.accent}`, outline: `2px solid ${t.accent}`, outlineOffset: '1px' }} />
            <span style={{ color: t.textMuted, fontSize: '11px', fontWeight: '500' }}>Today</span>
          </div>
        </div>

        {/* Calendar */}
        <div style={{ ...cardStyle, marginBottom: '20px' }}>

          {/* Month navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <button
              onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
              style={{ padding: '8px 18px', background: t.bgInput, border: `1px solid ${t.borderCard}`, borderRadius: '8px', color: t.textSecondary, fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
              PREV
            </button>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: t.textPrimary, fontSize: '17px', fontWeight: '700', letterSpacing: '1px' }}>
                {monthName.toUpperCase()}
              </div>
              <div style={{ color: t.textMuted, fontSize: '11px', marginTop: '2px' }}>
                {role === 'reporter' ? 'Your calendar' : reporters.find(r => r.id === selectedReporter)?.name || ''}
              </div>
            </div>
            <button
              onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
              style={{ padding: '8px 18px', background: t.bgInput, border: `1px solid ${t.borderCard}`, borderRadius: '8px', color: t.textSecondary, fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
              NEXT
            </button>
          </div>

          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '6px' }}>
            {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((d, i) => (
              <div key={d} style={{ textAlign: 'center', color: i >= 5 ? t.textDisabled : t.textMuted, fontSize: '10px', letterSpacing: '1px', padding: '4px 0', fontWeight: '700' }}>
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          {loading ? (
            <div style={{ color: t.textMuted, textAlign: 'center', padding: '60px', fontSize: '14px' }}>Loading calendar...</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
              {days.map((dateStr, i) => {
                if (!dateStr) return <div key={`empty-${i}`} style={{ minHeight: '80px' }} />
                const status = getDateStatus(dateStr)
                const { bg, border, color } = getDayBg(status)
                const dayNum = parseInt(dateStr.split('-')[2])
                const storiesDeadline = getStoriesDeadlineOnDate(dateStr)
                const storiesActive = getStoriesActiveOnDate(dateStr)
                const allStories = [
                  ...storiesDeadline,
                  ...storiesActive.filter(s => !storiesDeadline.find(d => d.id === s.id))
                ]
                const hasStories = allStories.length > 0
                const isDeadlineDay = storiesDeadline.length > 0

                return (
                  <div
                    key={dateStr}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleDayClick(dateStr)}
                    onKeyDown={e => e.key === 'Enter' && handleDayClick(dateStr)}
                    style={{
                      minHeight: hasStories ? '120px' : '80px',
                      borderRadius: '8px',
                      border: `2px solid ${isDeadlineDay ? urgencyColor[storiesDeadline[0]?.urgency] || t.accent : border}`,
                      background: bg,
                      cursor: 'pointer',
                      padding: '6px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '3px',
                      transition: 'all 0.15s',
                      outline: status.isToday ? `3px solid ${t.accent}` : 'none',
                      outlineOffset: '2px',
                      overflow: 'hidden',
                      boxShadow: isDeadlineDay ? `0 0 0 1px ${urgencyColor[storiesDeadline[0]?.urgency] || t.accent}30` : 'none'
                    }}>

                    {/* Day number + status label */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <span style={{ fontSize: '13px', fontWeight: '700', color, lineHeight: 1 }}>{dayNum}</span>
                      {status.holiday && <span style={{ fontSize: '7px', fontWeight: '700', color: t.danger }}>HOL</span>}
                      {status.leave?.status === 'acknowledged' && <span style={{ fontSize: '7px', fontWeight: '700', color: t.warning }}>LEAVE</span>}
                      {status.leave?.status === 'pending' && <span style={{ fontSize: '7px', fontWeight: '700', color: t.accent }}>PEND</span>}
                      {!status.holiday && !status.leave && !status.isWeekend && !status.isPast && status.isAvailable && !hasStories && (
                        <span style={{ fontSize: '7px', fontWeight: '600', color: t.success }}>AVAIL</span>
                      )}
                    </div>

                    {/* Holiday name */}
                    {status.holiday && (
                      <div style={{ fontSize: '8px', color: t.danger, fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {status.holiday.name}
                      </div>
                    )}

                    {/* Story cards on this day */}
                    {allStories.slice(0, 2).map((story: any) => {
                      const isDeadline = storiesDeadline.find(s => s.id === story.id)
                      const uc = urgencyColor[story.urgency] || t.accent
                      return (
                        <div key={story.id} style={{
                          background: `${uc}15`,
                          border: `1px solid ${uc}40`,
                          borderLeft: `3px solid ${uc}`,
                          borderRadius: '4px',
                          padding: '3px 5px',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                            <span style={{ fontSize: '7px', fontWeight: '700', color: uc, textTransform: 'uppercase' as const }}>
                              {story.urgency}
                            </span>
                            {isDeadline && (
                              <span style={{ fontSize: '7px', fontWeight: '700', color: t.danger, background: `${t.danger}15`, padding: '1px 3px', borderRadius: '2px' }}>
                                DUE
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '9px', fontWeight: '600', color: t.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {story.headline}
                          </div>
                          <div style={{ fontSize: '8px', color: t.textMuted, marginTop: '2px' }}>
                            {story.assigned_at} → {story.deadline}
                          </div>
                        </div>
                      )
                    })}

                    {allStories.length > 2 && (
                      <div style={{ fontSize: '8px', color: t.accent, fontWeight: '700', textAlign: 'center' }}>
                        +{allStories.length - 2} more
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Stats */}
        {!loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
            {[
              { label: 'Holidays This Year', value: holidays.length, color: t.danger, bg: t.dangerBg, border: t.dangerBorder },
              { label: 'Leaves Pending', value: leaves.filter(l => l.status === 'pending' && l.leave_date >= today).length, color: t.accent, bg: t.accentBg, border: t.accentBorder },
              { label: 'Leaves Approved', value: leaves.filter(l => l.status === 'acknowledged' && l.leave_date >= today).length, color: t.warning, bg: t.warningBg, border: t.warningBorder },
              { label: 'Active Stories', value: assignments.length, color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.3)' },
            ].map(stat => (
              <div key={stat.label} style={{ padding: '18px', background: stat.bg, border: `1px solid ${stat.border}`, borderRadius: '10px', textAlign: 'center', boxShadow: t.shadowCard }}>
                <div style={{ color: stat.color, fontSize: '28px', fontWeight: '800', marginBottom: '6px', lineHeight: 1 }}>{stat.value}</div>
                <div style={{ color: t.textMuted, fontSize: '11px', fontWeight: '600', letterSpacing: '0.5px' }}>{stat.label.toUpperCase()}</div>
              </div>
            ))}
          </div>
        )}

        {/* Upcoming Story Deadlines */}
        {assignments.filter(a => a.stories?.deadline >= today).length > 0 && (
          <div style={{ ...cardStyle, marginBottom: '20px' }}>
            <h2 style={{ color: t.textPrimary, margin: '0 0 16px', fontSize: '14px', fontWeight: '700', letterSpacing: '0.5px' }}>
              UPCOMING STORY DEADLINES
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {assignments
                .filter(a => a.stories?.deadline >= today)
                .sort((a, b) => a.stories?.deadline?.localeCompare(b.stories?.deadline))
                .map(a => {
                  const story = a.stories
                  const startDate = getAssignedDate(a)
                  const daysLeft = Math.ceil((new Date(story.deadline).getTime() - new Date(today).getTime()) / 86400000)
                  const uc = urgencyColor[story.urgency] || t.accent
                  return (
                    <div key={a.id} style={{
                      padding: '16px', borderRadius: '8px',
                      border: `1px solid ${uc}30`,
                      background: `${uc}08`,
                      borderLeft: `4px solid ${uc}`
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                            <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', background: `${uc}20`, color: uc, border: `1px solid ${uc}40` }}>
                              {story.urgency?.toUpperCase()}
                            </span>
                            <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '600', background: `${statusColor[story.status]}15`, color: statusColor[story.status] }}>
                              {story.status?.replace('_', ' ').toUpperCase()}
                            </span>
                            <span style={{ color: t.textMuted, fontSize: '12px' }}>{story.category}</span>
                          </div>
                          <div style={{ color: t.textPrimary, fontSize: '15px', fontWeight: '700', marginBottom: '10px', lineHeight: 1.4 }}>
                            {story.headline}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 10px', background: t.bgCard, border: `1px solid ${t.borderCard}`, borderRadius: '6px' }}>
                              <span style={{ color: t.textMuted, fontSize: '11px', fontWeight: '600' }}>ASSIGNED</span>
                              <span style={{ color: t.textSecondary, fontSize: '12px', fontWeight: '700' }}>{startDate}</span>
                            </div>
                            <span style={{ color: t.textMuted, fontSize: '16px' }}>→</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 10px', background: daysLeft <= 1 ? t.dangerBg : daysLeft <= 3 ? t.warningBg : t.accentBg, border: `1px solid ${daysLeft <= 1 ? t.dangerBorder : daysLeft <= 3 ? t.warningBorder : t.accentBorder}`, borderRadius: '6px' }}>
                              <span style={{ color: t.textMuted, fontSize: '11px', fontWeight: '600' }}>DEADLINE</span>
                              <span style={{ color: daysLeft <= 1 ? t.danger : daysLeft <= 3 ? t.warning : t.accent, fontSize: '12px', fontWeight: '700' }}>{story.deadline}</span>
                            </div>
                          </div>
                        </div>
                        <div style={{
                          padding: '10px 16px', borderRadius: '8px', textAlign: 'center', flexShrink: 0,
                          background: daysLeft <= 1 ? t.dangerBg : daysLeft <= 3 ? t.warningBg : t.accentBg,
                          border: `1px solid ${daysLeft <= 1 ? t.dangerBorder : daysLeft <= 3 ? t.warningBorder : t.accentBorder}`
                        }}>
                          <div style={{ color: daysLeft <= 1 ? t.danger : daysLeft <= 3 ? t.warning : t.accent, fontSize: '22px', fontWeight: '800', lineHeight: 1 }}>
                            {daysLeft === 0 ? 'TODAY' : daysLeft < 0 ? 'LATE' : daysLeft}
                          </div>
                          {daysLeft > 0 && (
                            <div style={{ color: t.textMuted, fontSize: '10px', fontWeight: '600', marginTop: '2px' }}>
                              {daysLeft === 1 ? 'DAY LEFT' : 'DAYS LEFT'}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        )}

        {/* Upcoming Holidays */}
        <div style={{ ...cardStyle, marginBottom: '20px' }}>
          <h2 style={{ color: t.textPrimary, margin: '0 0 14px', fontSize: '14px', fontWeight: '700', letterSpacing: '0.5px' }}>UPCOMING HOLIDAYS</h2>
          {holidays.filter(h => h.date.split('T')[0] >= today).length === 0 ? (
            <div style={{ color: t.textDisabled, fontSize: '13px', textAlign: 'center', padding: '20px', border: `1px dashed ${t.borderCard}`, borderRadius: '8px' }}>No upcoming holidays</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {holidays.filter(h => h.date.split('T')[0] >= today).map(h => (
                <div key={h.id} style={{ padding: '12px 16px', borderRadius: '8px', border: `1px solid ${t.dangerBorder}`, background: t.dangerBg, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: t.danger }} />
                    <span style={{ color: t.textPrimary, fontSize: '13px', fontWeight: '600' }}>{h.name}</span>
                  </div>
                  <span style={{ color: t.danger, fontSize: '12px', fontWeight: '600' }}>{h.date.split('T')[0]}</span>
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
                  padding: '14px 16px', borderRadius: '8px',
                  border: `1px solid ${leave.status === 'acknowledged' ? t.warningBorder : leave.status === 'rejected' ? t.dangerBorder : t.accentBorder}`,
                  background: leave.status === 'acknowledged' ? t.warningBg : leave.status === 'rejected' ? t.dangerBg : t.accentBg,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', background: `${ltc[leave.leave_type]}20`, color: ltc[leave.leave_type], border: `1px solid ${ltc[leave.leave_type]}30` }}>
                        {leave.leave_type?.toUpperCase()}
                      </span>
                      <span style={{ color: t.textPrimary, fontSize: '14px', fontWeight: '700' }}>{leave.leave_date}</span>
                    </div>
                    {leave.notes && <p style={{ color: t.textMuted, fontSize: '12px', margin: 0 }}>{leave.notes}</p>}
                    {leave.status === 'rejected' && leave.reject_reason && (
                      <p style={{ color: t.danger, fontSize: '12px', margin: '4px 0 0', fontWeight: '500' }}>Rejected: {leave.reject_reason}</p>
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
        <div role="dialog" aria-modal="true"
          style={{ position: 'fixed', inset: 0, background: t.overlayBg, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) { setLeaveModal(false); setSelectedDate(null) } }}>
          <div style={{ background: t.bgCard, border: `1px solid ${t.accentBorder}`, borderRadius: '12px', width: '100%', maxWidth: '420px', margin: '24px', padding: '28px', fontFamily: 'inherit', boxShadow: t.shadow }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', alignItems: 'center' }}>
              <h2 style={{ color: t.textPrimary, margin: 0, fontSize: '18px', fontWeight: '700' }}>Apply for Leave</h2>
              <button onClick={() => { setLeaveModal(false); setSelectedDate(null) }}
                style={{ background: 'none', border: 'none', color: t.textMuted, fontSize: '22px', cursor: 'pointer' }}>x</button>
            </div>
            <div style={{ padding: '12px 16px', background: t.accentBg, border: `1px solid ${t.accentBorder}`, borderRadius: '8px', marginBottom: '20px' }}>
              <p style={{ color: t.textMuted, fontSize: '11px', fontWeight: '600', margin: '0 0 4px' }}>SELECTED DATE</p>
              <p style={{ color: t.accent, fontSize: '17px', fontWeight: '700', margin: 0 }}>{selectedDate}</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ color: t.textSecondary, fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '8px' }}>LEAVE TYPE</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px' }}>
                  {(['planned', 'sick', 'emergency'] as const).map(type => (
                    <button key={type}
                      onClick={() => setLeaveForm(p => ({ ...p, leave_type: type }))}
                      style={{
                        padding: '10px', borderRadius: '8px',
                        border: `2px solid ${leaveForm.leave_type === type ? ltc[type] : t.borderCard}`,
                        background: leaveForm.leave_type === type ? `${ltc[type]}15` : 'transparent',
                        color: leaveForm.leave_type === type ? ltc[type] : t.textMuted,
                        fontSize: '11px', fontWeight: leaveForm.leave_type === type ? '700' : '400',
                        cursor: 'pointer', fontFamily: 'inherit', textTransform: 'uppercase' as const
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
                  rows={3} placeholder="Reason for leave..." style={inputStyle} />
              </div>
              {leaveForm.leave_type !== 'planned' && (
                <div style={{ padding: '12px 14px', background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, borderRadius: '8px' }}>
                  <p style={{ color: t.danger, fontSize: '12px', fontWeight: '500', margin: 0 }}>Emergency/sick leave will immediately alert the editor</p>
                </div>
              )}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => { setLeaveModal(false); setSelectedDate(null) }}
                  style={{ flex: 1, padding: '12px', background: 'transparent', border: `1px solid ${t.borderCard}`, borderRadius: '8px', color: t.textMuted, fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>
                  CANCEL
                </button>
                <button onClick={submitLeave} disabled={submitting}
                  style={{ flex: 2, padding: '12px', background: submitting ? t.textMuted : t.accent, border: 'none', borderRadius: '8px', color: t.accentText, fontSize: '13px', fontWeight: '700', cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: submitting ? 0.6 : 1 }}>
                  {submitting ? 'SUBMITTING...' : 'SUBMIT LEAVE REQUEST'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Day Detail Modal */}
      {dayDetailModal && (
        <div role="dialog" aria-modal="true"
          style={{ position: 'fixed', inset: 0, background: t.overlayBg, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setDayDetailModal(null) }}>
          <div style={{
            background: t.bgCard, border: `1px solid ${t.borderCard}`,
            borderRadius: '12px', width: '100%', maxWidth: '520px',
            margin: '24px', padding: '28px', fontFamily: 'inherit',
            boxShadow: t.shadow, maxHeight: '88vh', overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', alignItems: 'flex-start' }}>
              <div>
                <p style={{ color: t.textMuted, fontSize: '11px', fontWeight: '600', letterSpacing: '0.5px', margin: '0 0 4px' }}>DATE</p>
                <h2 style={{ color: t.textPrimary, margin: 0, fontSize: '20px', fontWeight: '700' }}>{dayDetailModal.dateStr}</h2>
              </div>
              <button onClick={() => setDayDetailModal(null)}
                style={{ background: 'none', border: 'none', color: t.textMuted, fontSize: '22px', cursor: 'pointer' }}>x</button>
            </div>

            {dayDetailModal.status.isToday && (
              <div style={{ padding: '8px 14px', background: t.accentBg, border: `1px solid ${t.accentBorder}`, borderRadius: '8px', marginBottom: '14px' }}>
                <p style={{ color: t.accent, fontSize: '12px', fontWeight: '700', margin: 0 }}>TODAY</p>
              </div>
            )}

            {/* Stories */}
            {(() => {
              const allS = [
                ...(dayDetailModal.status.storiesDeadline || []),
                ...(dayDetailModal.status.storiesActive || []).filter((s: any) =>
                  !dayDetailModal.status.storiesDeadline?.find((d: any) => d.id === s.id))
              ]
              if (allS.length === 0) return null
              return (
                <div style={{ marginBottom: '14px' }}>
                  <p style={{ color: t.textMuted, fontSize: '11px', fontWeight: '700', letterSpacing: '0.5px', margin: '0 0 10px' }}>
                    STORIES ON THIS DAY — {allS.length}
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {allS.map((story: any) => {
                      const isDeadline = dayDetailModal.status.storiesDeadline?.find((d: any) => d.id === story.id)
                      const uc = urgencyColor[story.urgency] || t.accent
                      const daysLeft = Math.ceil((new Date(story.deadline).getTime() - new Date(today).getTime()) / 86400000)
                      return (
                        <div key={story.id} style={{
                          padding: '14px 16px', borderRadius: '8px',
                          border: `1px solid ${uc}40`, background: `${uc}08`, borderLeft: `4px solid ${uc}`
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                            <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', background: `${uc}20`, color: uc, border: `1px solid ${uc}40` }}>
                              {story.urgency?.toUpperCase()}
                            </span>
                            <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '600', background: `${statusColor[story.status]}15`, color: statusColor[story.status] }}>
                              {story.status?.replace('_', ' ').toUpperCase()}
                            </span>
                            <span style={{ color: t.textMuted, fontSize: '11px' }}>{story.category}</span>
                            {isDeadline && (
                              <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', background: t.dangerBg, color: t.danger, border: `1px solid ${t.dangerBorder}` }}>
                                DEADLINE TODAY
                              </span>
                            )}
                          </div>
                          <p style={{ color: t.textPrimary, fontSize: '15px', fontWeight: '700', margin: '0 0 10px', lineHeight: 1.4 }}>
                            {story.headline}
                          </p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                            <div style={{ padding: '5px 10px', background: t.bgCard, border: `1px solid ${t.borderCard}`, borderRadius: '6px' }}>
                              <span style={{ color: t.textMuted, fontSize: '10px', fontWeight: '600', display: 'block', marginBottom: '1px' }}>START DATE</span>
                              <span style={{ color: t.textSecondary, fontSize: '12px', fontWeight: '700' }}>{story.assigned_at}</span>
                            </div>
                            <span style={{ color: t.textMuted, fontSize: '16px', fontWeight: '700' }}>→</span>
                            <div style={{ padding: '5px 10px', background: daysLeft <= 1 ? t.dangerBg : daysLeft <= 3 ? t.warningBg : t.accentBg, border: `1px solid ${daysLeft <= 1 ? t.dangerBorder : daysLeft <= 3 ? t.warningBorder : t.accentBorder}`, borderRadius: '6px' }}>
                              <span style={{ color: t.textMuted, fontSize: '10px', fontWeight: '600', display: 'block', marginBottom: '1px' }}>DEADLINE</span>
                              <span style={{ color: daysLeft <= 1 ? t.danger : daysLeft <= 3 ? t.warning : t.accent, fontSize: '12px', fontWeight: '700' }}>{story.deadline}</span>
                            </div>
                            <div style={{ padding: '5px 10px', background: daysLeft <= 1 ? t.dangerBg : daysLeft <= 3 ? t.warningBg : t.accentBg, border: `1px solid ${daysLeft <= 1 ? t.dangerBorder : daysLeft <= 3 ? t.warningBorder : t.accentBorder}`, borderRadius: '6px', textAlign: 'center' }}>
                              <span style={{ color: daysLeft <= 1 ? t.danger : daysLeft <= 3 ? t.warning : t.accent, fontSize: '14px', fontWeight: '800' }}>
                                {daysLeft === 0 ? 'TODAY' : daysLeft < 0 ? 'LATE' : `${daysLeft}d`}
                              </span>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '12px' }}>
                            <span style={{ color: t.textMuted, fontSize: '12px' }}>
                              Complexity: <span style={{ color: t.textSecondary, fontWeight: '600' }}>{story.complexity}/5</span>
                            </span>
                            <span style={{ color: t.textMuted, fontSize: '12px' }}>
                              Priority: <span style={{ color: t.textSecondary, fontWeight: '600' }}>P{story.priority}</span>
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {/* Holiday */}
            {dayDetailModal.status.holiday && (
              <div style={{ padding: '14px 16px', background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, borderRadius: '8px', marginBottom: '12px' }}>
                <p style={{ color: t.textMuted, fontSize: '11px', fontWeight: '600', margin: '0 0 6px' }}>PUBLIC HOLIDAY</p>
                <p style={{ color: t.danger, fontSize: '16px', fontWeight: '700', margin: '0 0 4px' }}>{dayDetailModal.status.holiday.name}</p>
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
                <p style={{ color: t.textMuted, fontSize: '11px', fontWeight: '600', margin: '0 0 8px' }}>LEAVE REQUEST</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
              </div>
            )}

            {/* Availability */}
            {!dayDetailModal.status.holiday && !dayDetailModal.status.leave && (
              <div style={{
                padding: '14px 16px',
                background: dayDetailModal.status.isWeekend ? t.bgPage : dayDetailModal.status.isAvailable ? t.successBg : t.dangerBg,
                border: `1px solid ${dayDetailModal.status.isWeekend ? t.borderCard : dayDetailModal.status.isAvailable ? t.successBorder : t.dangerBorder}`,
                borderRadius: '8px', marginBottom: '12px'
              }}>
                <p style={{ color: t.textMuted, fontSize: '11px', fontWeight: '600', margin: '0 0 6px' }}>AVAILABILITY STATUS</p>
                <p style={{
                  color: dayDetailModal.status.isWeekend ? t.textDisabled : dayDetailModal.status.isAvailable ? t.success : t.danger,
                  fontSize: '15px', fontWeight: '700', margin: 0
                }}>
                  {dayDetailModal.status.isWeekend ? 'Weekend — Off by default' : dayDetailModal.status.isPast ? 'Past date' : dayDetailModal.status.isAvailable ? 'Available' : 'Unavailable'}
                </p>
              </div>
            )}

            {role === 'reporter' && !dayDetailModal.status.isWeekend && !dayDetailModal.status.isPast &&
              !dayDetailModal.status.holiday && !dayDetailModal.status.leave && (
              <button
                onClick={() => { setDayDetailModal(null); setSelectedDate(dayDetailModal.dateStr); setLeaveModal(true) }}
                style={{ width: '100%', padding: '12px', marginBottom: '12px', background: t.accentBg, border: `1px solid ${t.accentBorder}`, borderRadius: '8px', color: t.accent, fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                APPLY FOR LEAVE ON THIS DAY
              </button>
            )}

            <button onClick={() => setDayDetailModal(null)}
              style={{ width: '100%', padding: '12px', background: 'transparent', border: `1px solid ${t.borderCard}`, borderRadius: '8px', color: t.textMuted, fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>
              CLOSE
            </button>
          </div>
        </div>
      )}
    </div>
  )
}




