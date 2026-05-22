import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'

export default function CalendarPage() {
  const { role, reporterId } = useAuth()
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
    planned: '#ffb400', sick: '#ff8800', emergency: '#ff4444'
  }

  async function loadHolidays() {
  const { data: holidayData } = await supabase
    .from('holidays').select('*').order('date')
  console.log('Holidays loaded:', holidayData)
  setHolidays(holidayData || [])
}

async function load(repId?: string) {
  setLoading(true)
  const targetId = repId || (role === 'reporter' ? reporterId : selectedReporter)

  if (targetId) {
    const { data: leaveData } = await supabase
      .from('leave_requests').select('*')
      .eq('reporter_id', targetId)
      .order('leave_date')
    setLeaves(leaveData || [])

    const { data: availData } = await supabase
      .from('availability').select('*')
      .eq('reporter_id', targetId)
    setAvailability(availData || [])
  } else {
    setLeaves([])
    setAvailability([])
  }

  if (role === 'editor') {
    const { data: reporterData } = await supabase
      .from('reporters').select('id, name, email, beats')
      .eq('status', 'active')
    setReporters(reporterData || [])
    if (!repId && !selectedReporter && reporterData && reporterData.length > 0) {
      setSelectedReporter(reporterData[0].id)
    }
  }

  setLoading(false)
}

  // REPLACE the two existing useEffects with these three:

useEffect(() => {
  loadHolidays()
}, [])

useEffect(() => {
  load()
}, [reporterId])

useEffect(() => {
  if (selectedReporter) load(selectedReporter)
}, [selectedReporter])

  // Get week start (Monday) for any date
  function getWeekStart(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00')
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    d.setDate(diff)
    return d.toISOString().split('T')[0]
  }

  // FIXED: Check if reporter is available on a date
  // Default = available on weekdays unless explicitly set to unavailable
  function isAvailableOnDate(dateStr: string): boolean {
    const d = new Date(dateStr + 'T00:00:00')
    const dayOfWeek = d.getDay()
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const dayName = dayNames[dayOfWeek]

    // Weekends always unavailable by default
    if (dayOfWeek === 0 || dayOfWeek === 6) return false

    const weekStartStr = getWeekStart(dateStr)
    const weekAvail = availability.find(a => a.week_start_date === weekStartStr)

    // FIXED: If no availability record exists for this week
    // assume available on all weekdays by default
    if (!weekAvail) return true

    return weekAvail.available_days?.includes(dayName) || false
  }

  // FIXED: Get complete status of a date
  function getDateStatus(dateStr: string) {
    const d = new Date(dateStr + 'T00:00:00')
    const dayOfWeek = d.getDay()
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
    const isPast = dateStr < today
    const isToday = dateStr === today

    // FIXED: Use exact string match for holiday
    const holiday = holidays.find(h => {
      const hDate = h.date.split('T')[0]
      return hDate === dateStr
    })

    const leave = leaves.find(l => {
      const lDate = l.leave_date.split('T')[0]
      return lDate === dateStr
    })

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

  // FIXED: More distinct color scheme for each status
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
      position: 'relative',
      transition: 'all 0.15s',
      fontFamily: 'inherit',
      outline: status.isToday ? '3px solid #ffb400' : 'none',
      outlineOffset: '2px',
      padding: '4px 2px',
      boxSizing: 'border-box'
    }

    if (!status) return base

    // Holiday — bright red
    if (status.holiday) return {
      ...base,
      background: 'rgba(255,50,50,0.25)',
      borderColor: '#ff3232',
      color: '#ff6b6b',
      cursor: 'pointer'
    }

    // Approved leave — deep orange
    if (status.leave?.status === 'acknowledged') return {
      ...base,
      background: 'rgba(255,100,0,0.25)',
      borderColor: '#ff6400',
      color: '#ff8800',
      cursor: 'pointer'
    }

    // Pending leave — yellow
    if (status.leave?.status === 'pending') return {
      ...base,
      background: 'rgba(255,180,0,0.15)',
      borderColor: '#ffb400',
      color: '#ffb400',
      cursor: 'pointer'
    }

    // Rejected leave — treat as normal day
    // Weekend — dark grey
    if (status.isWeekend) return {
      ...base,
      background: 'rgba(255,255,255,0.02)',
      borderColor: 'rgba(255,255,255,0.06)',
      color: '#3a3a3a',
      cursor: 'default'
    }

    // Past day
    if (status.isPast) return {
      ...base,
      background: 'rgba(255,255,255,0.02)',
      borderColor: 'rgba(255,255,255,0.05)',
      color: '#333',
      cursor: 'default'
    }

    // Available — bright green
    if (status.isAvailable) return {
      ...base,
      background: 'rgba(80,220,120,0.15)',
      borderColor: '#50dc78',
      color: '#64c896',
      cursor: role === 'reporter' ? 'pointer' : 'default'
    }

    // Explicitly unavailable — muted red
    return {
      ...base,
      background: 'rgba(255,255,255,0.03)',
      borderColor: 'rgba(255,255,255,0.08)',
      color: '#444',
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
    if (!status) return '#555'
    if (status.holiday) return '#ff4444'
    if (status.leave?.status === 'acknowledged') return '#ff8800'
    if (status.leave?.status === 'pending') return '#ffb400'
    if (status.isWeekend) return '#2a2a2a'
    if (status.isPast) return '#2a2a2a'
    if (status.isAvailable) return '#50dc78'
    return '#444'
  }

  function handleDayClick(dateStr: string) {
    if (!dateStr) return
    const status = getDateStatus(dateStr)
    if (!status) return

    if (role === 'reporter') {
      if (dateStr < today) return
      if (status.holiday) {
        setDayDetailModal({ dateStr, status })
        return
      }
      if (status.leave) {
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
    load()
  }

  const days = getDaysInMonth(currentMonth)
  const monthName = currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })

  const legend = [
    { color: '#50dc78', border: '#50dc78', label: 'Available (default)' },
    { color: '#444', border: 'rgba(255,255,255,0.08)', label: 'Unavailable' },
    { color: '#ff3232', border: '#ff3232', label: 'Public Holiday' },
    { color: '#ff6400', border: '#ff6400', label: 'Leave Approved' },
    { color: '#ffb400', border: '#ffb400', label: 'Leave Pending' },
    { color: '#3a3a3a', border: 'rgba(255,255,255,0.06)', label: 'Weekend / Off' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', fontFamily: '"DM Mono", "Courier New", monospace' }}>
      <Navbar />
      <div style={{ padding: '32px 24px', maxWidth: '960px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{ color: '#fff', margin: '0 0 4px', fontSize: '20px', letterSpacing: '1px' }}>
              {role === 'editor' ? 'REPORTER CALENDAR' : 'MY CALENDAR'}
            </h1>
            <p style={{ color: '#555', margin: 0, fontSize: '12px' }}>
              {role === 'reporter'
                ? 'Click any future date to apply for leave. Green = available by default.'
                : 'View reporter availability, leaves and holidays.'}
            </p>
          </div>

          {role === 'editor' && (
            <select
              value={selectedReporter}
              onChange={e => setSelectedReporter(e.target.value)}
              style={{
                padding: '10px 16px', background: '#0d0d14',
                border: '1px solid rgba(255,180,0,0.4)', borderRadius: '6px',
                color: '#ffb400', fontSize: '12px', outline: 'none',
                fontFamily: 'inherit', cursor: 'pointer', letterSpacing: '1px'
              }}>
              {reporters.map(r => (
                <option key={r.id} value={r.id} style={{ background: '#0d0d14' }}>
                  {r.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '24px', flexWrap: 'wrap', padding: '14px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
          {legend.map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{
                width: '14px', height: '14px', borderRadius: '3px',
                background: item.color === '#444' ? 'rgba(255,255,255,0.03)' : item.color === '#3a3a3a' ? 'rgba(255,255,255,0.02)' : `${item.color}30`,
                border: `2px solid ${item.border}`
              }} />
              <span style={{ color: '#666', fontSize: '10px', letterSpacing: '0.5px' }}>{item.label}</span>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '14px', height: '14px', borderRadius: '3px', background: 'rgba(255,180,0,0.1)', border: '2px solid #ffb400', outline: '2px solid #ffb400', outlineOffset: '1px' }} />
            <span style={{ color: '#666', fontSize: '10px' }}>Today</span>
          </div>
        </div>

        {/* Calendar */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '10px', padding: '24px' }}>

          {/* Month navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <button
              onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
              style={{ padding: '8px 18px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '5px', color: '#888', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '1px' }}>
              PREV
            </button>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: '#fff', fontSize: '16px', letterSpacing: '2px', fontWeight: '700' }}>
                {monthName.toUpperCase()}
              </div>
              <div style={{ color: '#555', fontSize: '10px', marginTop: '2px' }}>
                {role === 'reporter' ? 'Your calendar' : reporters.find(r => r.id === selectedReporter)?.name || ''}
              </div>
            </div>
            <button
              onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
              style={{ padding: '8px 18px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '5px', color: '#888', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '1px' }}>
              NEXT
            </button>
          </div>

          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px', marginBottom: '8px' }}>
            {[
              { label: 'MON', color: '#888' },
              { label: 'TUE', color: '#888' },
              { label: 'WED', color: '#888' },
              { label: 'THU', color: '#888' },
              { label: 'FRI', color: '#888' },
              { label: 'SAT', color: '#444' },
              { label: 'SUN', color: '#444' },
            ].map(d => (
              <div key={d.label} style={{ textAlign: 'center', color: d.color, fontSize: '9px', letterSpacing: '1px', padding: '4px 0', fontWeight: '600' }}>
                {d.label}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          {loading ? (
            <div style={{ color: '#555', textAlign: 'center', padding: '60px', fontSize: '12px' }}>Loading calendar...</div>
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
                    style={getDayStyle(status)}>
                    <span style={{ fontSize: '13px', fontWeight: '700', lineHeight: 1 }}>{dayNum}</span>
                    <span style={{
                      fontSize: '7px',
                      color: getDayLabelColor(status),
                      marginTop: '3px',
                      letterSpacing: '0.3px',
                      lineHeight: 1
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginTop: '20px' }}>
            {[
              { label: 'Holidays This Year', value: holidays.length, color: '#ff4444' },
              { label: 'Leaves Pending', value: leaves.filter(l => l.status === 'pending' && l.leave_date >= today).length, color: '#ffb400' },
              { label: 'Leaves Approved', value: leaves.filter(l => l.status === 'acknowledged' && l.leave_date >= today).length, color: '#ff8800' },
              { label: 'Total Upcoming Off', value: holidays.filter(h => h.date >= today).length + leaves.filter(l => l.status === 'acknowledged' && l.leave_date >= today).length, color: '#8888ff' },
            ].map(stat => (
              <div key={stat.label} style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ color: stat.color, fontSize: '24px', fontWeight: '700', marginBottom: '4px' }}>{stat.value}</div>
                <div style={{ color: '#555', fontSize: '10px', letterSpacing: '0.5px' }}>{stat.label.toUpperCase()}</div>
              </div>
            ))}
          </div>
        )}

        {/* Upcoming holidays */}
        <div style={{ marginTop: '24px' }}>
          <h2 style={{ color: '#fff', margin: '0 0 12px', fontSize: '13px', letterSpacing: '1px' }}>UPCOMING HOLIDAYS</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {holidays.filter(h => h.date.split('T')[0] >= today).map(h => (
              <div key={h.id} style={{
                padding: '10px 16px', borderRadius: '6px',
                border: '1px solid rgba(255,50,50,0.25)',
                background: 'rgba(255,50,50,0.06)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ff4444' }} />
                  <span style={{ color: '#ff8888', fontSize: '12px', fontWeight: '600' }}>{h.name}</span>
                </div>
                <span style={{ color: '#ff6b6b', fontSize: '11px', letterSpacing: '1px' }}>{h.date.split('T')[0]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming leaves */}
        {leaves.filter(l => l.leave_date >= today).length > 0 && (
          <div style={{ marginTop: '24px' }}>
            <h2 style={{ color: '#fff', margin: '0 0 12px', fontSize: '13px', letterSpacing: '1px' }}>
              {role === 'reporter' ? 'MY UPCOMING LEAVES' : 'REPORTER UPCOMING LEAVES'}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {leaves.filter(l => l.leave_date >= today).map(leave => (
                <div key={leave.id} style={{
                  padding: '12px 16px', borderRadius: '6px',
                  border: `1px solid ${leave.status === 'acknowledged' ? 'rgba(255,136,0,0.3)' : leave.status === 'rejected' ? 'rgba(255,68,68,0.2)' : 'rgba(255,180,0,0.2)'}`,
                  background: leave.status === 'acknowledged' ? 'rgba(255,136,0,0.06)' : leave.status === 'rejected' ? 'rgba(255,68,68,0.04)' : 'rgba(255,180,0,0.04)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                      <span style={{ padding: '2px 6px', borderRadius: '3px', fontSize: '9px', background: `${ltc[leave.leave_type]}20`, color: ltc[leave.leave_type], letterSpacing: '1px' }}>
                        {leave.leave_type?.toUpperCase()}
                      </span>
                      <span style={{ color: '#ddd', fontSize: '13px', fontWeight: '600' }}>{leave.leave_date}</span>
                    </div>
                    {leave.notes && <p style={{ color: '#555', fontSize: '11px', margin: 0 }}>{leave.notes}</p>}
                    {leave.status === 'rejected' && leave.reject_reason && (
                      <p style={{ color: '#ff8888', fontSize: '11px', margin: '2px 0 0' }}>Rejected: {leave.reject_reason}</p>
                    )}
                  </div>
                  <span style={{
                    padding: '4px 12px', borderRadius: '4px', fontSize: '10px', letterSpacing: '1px', fontWeight: '600',
                    background: leave.status === 'acknowledged' ? 'rgba(100,200,150,0.15)' : leave.status === 'rejected' ? 'rgba(255,68,68,0.15)' : 'rgba(255,136,0,0.15)',
                    color: leave.status === 'acknowledged' ? '#64c896' : leave.status === 'rejected' ? '#ff6b6b' : '#ff8800'
                  }}>
                    {leave.status?.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Leave Filing Modal */}
      {leaveModal && selectedDate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) { setLeaveModal(false); setSelectedDate(null) } }}>
          <div style={{ background: '#0d0d14', border: '1px solid rgba(255,180,0,0.3)', borderRadius: '10px', width: '100%', maxWidth: '420px', margin: '24px', padding: '28px', fontFamily: '"DM Mono", "Courier New", monospace' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h2 style={{ color: '#fff', margin: 0, fontSize: '16px' }}>Apply for Leave</h2>
              <button onClick={() => { setLeaveModal(false); setSelectedDate(null) }} style={{ background: 'none', border: 'none', color: '#555', fontSize: '20px', cursor: 'pointer' }}>x</button>
            </div>

            <div style={{ padding: '12px 16px', background: 'rgba(255,180,0,0.08)', border: '1px solid rgba(255,180,0,0.2)', borderRadius: '6px', marginBottom: '20px' }}>
              <p style={{ color: '#888', fontSize: '10px', letterSpacing: '1px', margin: '0 0 4px' }}>SELECTED DATE</p>
              <p style={{ color: '#ffb400', fontSize: '16px', fontWeight: '700', margin: 0 }}>{selectedDate}</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ color: '#888', fontSize: '11px', letterSpacing: '1px', display: 'block', marginBottom: '8px' }}>LEAVE TYPE</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px' }}>
                  {(['planned', 'sick', 'emergency'] as const).map(t => (
                    <button key={t} onClick={() => setLeaveForm(p => ({ ...p, leave_type: t }))} style={{
                      padding: '10px', borderRadius: '6px', border: '2px solid',
                      borderColor: leaveForm.leave_type === t ? ltc[t] : 'rgba(255,255,255,0.08)',
                      background: leaveForm.leave_type === t ? `${ltc[t]}15` : 'transparent',
                      color: leaveForm.leave_type === t ? ltc[t] : '#555',
                      fontSize: '10px', letterSpacing: '1px', cursor: 'pointer',
                      fontFamily: 'inherit', textTransform: 'uppercase' as const,
                      fontWeight: leaveForm.leave_type === t ? '700' : '400'
                    }}>{t}</button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ color: '#888', fontSize: '11px', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>NOTES <span style={{ color: '#444' }}>(optional)</span></label>
                <textarea
                  value={leaveForm.notes}
                  onChange={e => setLeaveForm(p => ({ ...p, notes: e.target.value }))}
                  rows={3} placeholder="Reason for leave..."
                  style={{ width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', fontSize: '13px', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'none' }} />
              </div>

              {leaveForm.leave_type !== 'planned' && (
                <div style={{ padding: '10px 14px', background: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.2)', borderRadius: '6px' }}>
                  <p style={{ color: '#ff8888', fontSize: '11px', margin: 0 }}>Emergency/sick leave will immediately alert the editor</p>
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => { setLeaveModal(false); setSelectedDate(null) }} style={{
                  flex: 1, padding: '12px', background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px',
                  color: '#666', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit'
                }}>CANCEL</button>
                <button onClick={submitLeave} disabled={submitting} style={{
                  flex: 2, padding: '12px', background: '#ffb400', border: 'none',
                  borderRadius: '6px', color: '#0a0a0f', fontSize: '12px',
                  fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit',
                  opacity: submitting ? 0.6 : 1
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setDayDetailModal(null) }}>
          <div style={{ background: '#0d0d14', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', width: '100%', maxWidth: '400px', margin: '24px', padding: '28px', fontFamily: '"DM Mono", "Courier New", monospace' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <p style={{ color: '#555', fontSize: '10px', letterSpacing: '1px', margin: '0 0 4px' }}>DATE</p>
                <h2 style={{ color: '#fff', margin: 0, fontSize: '18px', fontWeight: '700' }}>{dayDetailModal.dateStr}</h2>
              </div>
              <button onClick={() => setDayDetailModal(null)} style={{ background: 'none', border: 'none', color: '#555', fontSize: '20px', cursor: 'pointer' }}>x</button>
            </div>

            {/* Today badge */}
            {dayDetailModal.status.isToday && (
              <div style={{ padding: '8px 14px', background: 'rgba(255,180,0,0.1)', border: '1px solid rgba(255,180,0,0.3)', borderRadius: '5px', marginBottom: '12px' }}>
                <p style={{ color: '#ffb400', fontSize: '11px', margin: 0, fontWeight: '600' }}>TODAY</p>
              </div>
            )}

            {/* Holiday */}
            {dayDetailModal.status.holiday && (
              <div style={{ padding: '14px', background: 'rgba(255,50,50,0.1)', border: '1px solid rgba(255,50,50,0.3)', borderRadius: '6px', marginBottom: '12px' }}>
                <p style={{ color: '#888', fontSize: '10px', letterSpacing: '1px', margin: '0 0 6px' }}>PUBLIC HOLIDAY</p>
                <p style={{ color: '#ff4444', fontSize: '15px', margin: 0, fontWeight: '700' }}>{dayDetailModal.status.holiday.name}</p>
                <p style={{ color: '#555', fontSize: '11px', margin: '6px 0 0' }}>All reporters are unavailable on this day by default. Override assign is still possible.</p>
              </div>
            )}

            {/* Leave */}
            {dayDetailModal.status.leave && (
              <div style={{
                padding: '14px',
                background: dayDetailModal.status.leave.status === 'acknowledged' ? 'rgba(255,100,0,0.1)' : dayDetailModal.status.leave.status === 'rejected' ? 'rgba(255,68,68,0.08)' : 'rgba(255,180,0,0.08)',
                border: `1px solid ${dayDetailModal.status.leave.status === 'acknowledged' ? 'rgba(255,100,0,0.3)' : dayDetailModal.status.leave.status === 'rejected' ? 'rgba(255,68,68,0.2)' : 'rgba(255,180,0,0.2)'}`,
                borderRadius: '6px', marginBottom: '12px'
              }}>
                <p style={{ color: '#888', fontSize: '10px', letterSpacing: '1px', margin: '0 0 6px' }}>LEAVE REQUEST</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ color: ltc[dayDetailModal.status.leave.leave_type], fontSize: '12px', fontWeight: '600' }}>
                    {dayDetailModal.status.leave.leave_type?.toUpperCase()}
                  </span>
                  <span style={{
                    padding: '3px 10px', borderRadius: '3px', fontSize: '10px', fontWeight: '700',
                    background: dayDetailModal.status.leave.status === 'acknowledged' ? 'rgba(100,200,150,0.2)' : dayDetailModal.status.leave.status === 'rejected' ? 'rgba(255,68,68,0.2)' : 'rgba(255,136,0,0.2)',
                    color: dayDetailModal.status.leave.status === 'acknowledged' ? '#64c896' : dayDetailModal.status.leave.status === 'rejected' ? '#ff6b6b' : '#ff8800'
                  }}>
                    {dayDetailModal.status.leave.status?.toUpperCase()}
                  </span>
                </div>
                {dayDetailModal.status.leave.notes && (
                  <p style={{ color: '#666', fontSize: '11px', margin: '4px 0 0' }}>{dayDetailModal.status.leave.notes}</p>
                )}
                {dayDetailModal.status.leave.status === 'rejected' && dayDetailModal.status.leave.reject_reason && (
                  <p style={{ color: '#ff8888', fontSize: '11px', margin: '6px 0 0' }}>Reason: {dayDetailModal.status.leave.reject_reason}</p>
                )}
              </div>
            )}

            {/* Availability status */}
            {!dayDetailModal.status.holiday && !dayDetailModal.status.leave && (
              <div style={{
                padding: '14px',
                background: dayDetailModal.status.isWeekend ? 'rgba(255,255,255,0.02)' : dayDetailModal.status.isAvailable ? 'rgba(80,220,120,0.08)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${dayDetailModal.status.isWeekend ? 'rgba(255,255,255,0.06)' : dayDetailModal.status.isAvailable ? 'rgba(80,220,120,0.2)' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: '6px', marginBottom: '12px'
              }}>
                <p style={{ color: '#888', fontSize: '10px', letterSpacing: '1px', margin: '0 0 6px' }}>AVAILABILITY STATUS</p>
                <p style={{
                  color: dayDetailModal.status.isWeekend ? '#444' : dayDetailModal.status.isAvailable ? '#50dc78' : '#ff6b6b',
                  fontSize: '14px', margin: 0, fontWeight: '700'
                }}>
                  {dayDetailModal.status.isWeekend ? 'Weekend — Off by default' : dayDetailModal.status.isPast ? 'Past date' : dayDetailModal.status.isAvailable ? 'Available' : 'Unavailable'}
                </p>
              </div>
            )}

            <button onClick={() => setDayDetailModal(null)} style={{
              width: '100%', padding: '12px', background: 'transparent',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px',
              color: '#555', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '1px'
            }}>CLOSE</button>
          </div>
        </div>
      )}
    </div>
  )
}