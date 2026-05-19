import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'

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
  const [selectedDays, setSelectedDays] = useState<string[]>([])
  const [existing, setExisting] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [leaves, setLeaves] = useState<any[]>([])
  const [leaveDates, setLeaveDates] = useState<string[]>([])
  const [showLeave, setShowLeave] = useState(false)
  const [leaveForm, setLeaveForm] = useState({
    leave_date: '', leave_type: 'planned', notes: ''
  })
  const [submittingLeave, setSubmittingLeave] = useState(false)

  const weekStart = getCurrentWeekStart()
  const weekDates = getCurrentWeekDates()
  const today = getTodayStr()
  const weekEnd = weekDates['Sun']

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
    setSubmittingLeave(false)
    setShowLeave(false)
    setLeaveForm({ leave_date: '', leave_type: 'planned', notes: '' })
    load()
  }

  const ltc: Record<string, string> = {
    planned: '#ffb400', sick: '#ff8800', emergency: '#ff4444'
  }
  const lsc: Record<string, string> = {
    pending: '#ff8800', acknowledged: '#64c896', rejected: '#ff4444'
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

  function getDayStyle(status: string, isToday_: boolean) {
    const base = {
      padding: '14px 6px', borderRadius: '6px',
      fontFamily: 'inherit', textAlign: 'center' as const,
      transition: 'all 0.15s', border: '1px solid',
      outline: isToday_ ? '2px solid #ffb400' : 'none',
      outlineOffset: '2px'
    }
    switch (status) {
      case 'past': return { ...base, borderColor: 'rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.01)', color: '#333', cursor: 'not-allowed' }
      case 'leave_approved': return { ...base, borderColor: 'rgba(255,68,68,0.4)', background: 'rgba(255,68,68,0.08)', color: '#ff6b6b', cursor: 'not-allowed' }
      case 'leave_pending': return { ...base, borderColor: 'rgba(255,136,0,0.4)', background: 'rgba(255,136,0,0.08)', color: '#ff8800', cursor: 'not-allowed' }
      case 'available': return { ...base, borderColor: 'rgba(100,200,150,0.4)', background: 'rgba(100,200,150,0.08)', color: '#64c896', cursor: 'pointer' }
      default: return { ...base, borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)', color: '#555', cursor: 'pointer' }
    }
  }

  function getDotColor(status: string) {
    switch (status) {
      case 'past': return '#2a2a2a'
      case 'leave_approved': return '#ff6b6b'
      case 'leave_pending': return '#ff8800'
      case 'available': return '#64c896'
      default: return 'rgba(255,255,255,0.1)'
    }
  }

  function getDayLabel(status: string) {
    switch (status) {
      case 'past': return 'DONE'
      case 'leave_approved': return 'LEAVE'
      case 'leave_pending': return 'PENDING'
      default: return ''
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', fontFamily: '"DM Mono", "Courier New", monospace' }}>
      <Navbar />
      <div style={{ padding: '32px 24px', maxWidth: '700px', margin: '0 auto' }}>

        {/* Availability Section */}
        <div style={{ marginBottom: '40px' }}>
          <div style={{ marginBottom: '16px' }}>
            <h1 style={{ color: '#fff', margin: '0 0 4px', fontSize: '18px' }}>This Week's Availability</h1>
            <p style={{ color: '#555', margin: 0, fontSize: '12px' }}>
              Week of {weekStart} — You can update availability from today onwards
            </p>
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
            {[
              { color: '#64c896', label: 'Available' },
              { color: '#555', label: 'Unavailable' },
              { color: '#2a2a2a', label: 'Past Day', border: '1px solid #333' },
              { color: '#ff8800', label: 'Leave Pending' },
              { color: '#ff6b6b', label: 'Leave Approved' },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <div style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  background: item.color,
                  border: (item as any).border || 'none'
                }} />
                <span style={{ color: '#666', fontSize: '10px' }}>{item.label}</span>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ffb400', boxShadow: '0 0 0 2px #ffb400' }} />
              <span style={{ color: '#666', fontSize: '10px' }}>Today</span>
            </div>
          </div>

          {/* Day selector */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '6px', marginBottom: '20px' }}>
            {DAYS.map(day => {
              const status = getDayStatus(day)
              const isTodayDay = isToday(weekDates[day])
              return (
                <button key={day} onClick={() => toggleDay(day)}
                  style={getDayStyle(status, isTodayDay)}>
                  <div style={{ fontSize: '9px', marginBottom: '5px', opacity: 0.7 }}>{day}</div>
                  <div style={{
                    width: '8px', height: '8px', borderRadius: '50%',
                    margin: '0 auto 3px',
                    background: getDotColor(status)
                  }} />
                  <div style={{ fontSize: '7px', letterSpacing: '0.3px', minHeight: '9px' }}>
                    {getDayLabel(status)}
                  </div>
                </button>
              )
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={saveAvailability} disabled={saving} style={{
              padding: '12px 28px', background: '#ffb400', border: 'none',
              borderRadius: '6px', color: '#0a0a0f', fontSize: '12px',
              letterSpacing: '1px', fontWeight: '700', cursor: 'pointer',
              fontFamily: 'inherit', opacity: saving ? 0.6 : 1
            }}>
              {saving ? 'SAVING...' : 'SAVE AVAILABILITY'}
            </button>
            {saved && <span style={{ color: '#64c896', fontSize: '12px' }}>✓ Saved!</span>}
            <span style={{ color: '#555', fontSize: '12px', marginLeft: 'auto' }}>
              {selectedDays.length} day{selectedDays.length !== 1 ? 's' : ''} selected
            </span>
          </div>
        </div>

        {/* Leave Requests */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ color: '#fff', margin: 0, fontSize: '14px', letterSpacing: '1px' }}>LEAVE REQUESTS</h2>
            <button onClick={() => setShowLeave(true)} style={{
              padding: '8px 18px', background: 'transparent',
              border: '1px solid rgba(255,255,255,0.15)', borderRadius: '4px',
              color: '#888', fontSize: '11px', letterSpacing: '1px',
              cursor: 'pointer', fontFamily: 'inherit'
            }}>+ FILE LEAVE</button>
          </div>

          {leaves.length === 0 ? (
            <div style={{ color: '#333', fontSize: '13px', textAlign: 'center', padding: '32px', border: '1px dashed rgba(255,255,255,0.07)', borderRadius: '6px' }}>
              No leave requests filed
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {leaves.map(leave => (
                <div key={leave.id} style={{
                  padding: '14px 18px', borderRadius: '6px',
                  border: `1px solid ${leave.status === 'rejected' ? 'rgba(255,68,68,0.2)' : 'rgba(255,255,255,0.06)'}`,
                  background: leave.status === 'rejected' ? 'rgba(255,68,68,0.04)' : 'rgba(255,255,255,0.02)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: '3px', fontSize: '9px', letterSpacing: '1px', background: `${ltc[leave.leave_type]}15`, color: ltc[leave.leave_type] }}>
                          {leave.leave_type?.toUpperCase()}
                        </span>
                        <span style={{ color: '#ddd', fontSize: '13px' }}>{leave.leave_date}</span>
                        {isPast(leave.leave_date) && leave.status === 'acknowledged' && (
                          <span style={{ padding: '2px 6px', borderRadius: '3px', fontSize: '9px', background: 'rgba(136,136,136,0.15)', color: '#888' }}>
                            COMPLETED
                          </span>
                        )}
                      </div>
                      {leave.notes && (
                        <p style={{ color: '#555', fontSize: '12px', margin: '0 0 4px' }}>{leave.notes}</p>
                      )}
                      {leave.status === 'rejected' && leave.reject_reason && (
                        <div style={{ padding: '6px 10px', background: 'rgba(255,68,68,0.08)', borderRadius: '4px', marginTop: '6px' }}>
                          <p style={{ color: '#ff8888', fontSize: '11px', margin: 0 }}>
                            ✗ Rejected: {leave.reject_reason}
                          </p>
                        </div>
                      )}
                    </div>
                    <span style={{ padding: '3px 10px', borderRadius: '3px', fontSize: '10px', letterSpacing: '1px', background: `${lsc[leave.status]}15`, color: lsc[leave.status], whiteSpace: 'nowrap', marginLeft: '12px' }}>
                      {leave.status?.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Leave Modal */}
      {showLeave && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setShowLeave(false) }}>
          <div style={{ background: '#0d0d14', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', width: '100%', maxWidth: '400px', margin: '24px', padding: '24px', fontFamily: '"DM Mono", "Courier New", monospace' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h2 style={{ color: '#fff', margin: 0, fontSize: '16px' }}>File Leave Request</h2>
              <button onClick={() => setShowLeave(false)} style={{ background: 'none', border: 'none', color: '#555', fontSize: '20px', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ color: '#888', fontSize: '11px', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>
                  LEAVE DATE <span style={{ color: '#555' }}>(This week: {today} to {weekEnd})</span>
                </label>
                <input type="date" value={leaveForm.leave_date}
                  min={today} max={weekEnd}
                  onChange={e => setLeaveForm(p => ({ ...p, leave_date: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', fontSize: '13px', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', colorScheme: 'dark' }} />
              </div>
              <div>
                <label style={{ color: '#888', fontSize: '11px', letterSpacing: '1px', display: 'block', marginBottom: '8px' }}>TYPE</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px' }}>
                  {(['planned', 'sick', 'emergency'] as const).map(t => (
                    <button key={t} onClick={() => setLeaveForm(p => ({ ...p, leave_type: t }))} style={{
                      padding: '9px', borderRadius: '5px', border: '1px solid',
                      borderColor: leaveForm.leave_type === t ? ltc[t] : 'rgba(255,255,255,0.1)',
                      background: leaveForm.leave_type === t ? `${ltc[t]}15` : 'transparent',
                      color: leaveForm.leave_type === t ? ltc[t] : '#555',
                      fontSize: '10px', letterSpacing: '1px', cursor: 'pointer',
                      fontFamily: 'inherit', textTransform: 'uppercase'
                    }}>{t}</button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ color: '#888', fontSize: '11px', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>NOTES (optional)</label>
                <textarea value={leaveForm.notes}
                  onChange={e => setLeaveForm(p => ({ ...p, notes: e.target.value }))}
                  rows={3} placeholder="Reason for leave..."
                  style={{ width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', fontSize: '13px', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'none' }} />
              </div>
              {leaveForm.leave_type !== 'planned' && (
                <div style={{ padding: '10px', background: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.2)', borderRadius: '5px' }}>
                  <p style={{ color: '#ff8888', fontSize: '11px', margin: 0 }}>⚠ Emergency/sick leave will immediately alert editors</p>
                </div>
              )}
              <button onClick={submitLeave} disabled={submittingLeave || !leaveForm.leave_date} style={{
                padding: '13px', background: '#ffb400', border: 'none', borderRadius: '6px',
                color: '#0a0a0f', fontSize: '12px', letterSpacing: '1px', fontWeight: '700',
                cursor: 'pointer', fontFamily: 'inherit',
                opacity: submittingLeave || !leaveForm.leave_date ? 0.5 : 1
              }}>
                {submittingLeave ? 'SUBMITTING...' : 'SUBMIT LEAVE REQUEST'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}