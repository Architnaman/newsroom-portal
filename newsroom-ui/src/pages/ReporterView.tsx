import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
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

export default function ReporterView() {
  const { reporterId } = useParams<{ reporterId: string }>()
  const navigate = useNavigate()
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

  const urgencyColor: Record<string, string> = { breaking: '#ff4444', high: '#ff8800', normal: '#ffb400', low: '#64c896' }
  const statusColor: Record<string, string> = { assigned: '#ffb400', in_progress: '#64c896', filed: '#8888ff', published: '#64c896' }
  const ltc: Record<string, string> = { planned: '#ffb400', sick: '#ff8800', emergency: '#ff4444' }

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
      status: 'acknowledged', // EDITOR FILING = AUTO APPROVED
      filed_by_editor: true,
      editor_note: 'Filed by editor on behalf of reporter',
      acknowledged_at: new Date().toISOString()
    })

    // Update availability — remove that day
    const leaveDate = new Date(leaveForm.leave_date + 'T00:00:00Z')
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const dayName = days[leaveDate.getUTCDay()]
    const d = new Date(leaveForm.leave_date + 'T00:00:00')
    const dayOfWeek = d.getDay()
    const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)
    d.setDate(diff)
    const leavWeekStart = d.toISOString().split('T')[0]

    const { data: avail } = await supabase.from('availability').select('*')
      .eq('reporter_id', reporterId).eq('week_start_date', leavWeekStart).maybeSingle()
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

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#555', fontFamily: 'monospace' }}>Loading reporter view...</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', fontFamily: '"DM Mono", "Courier New", monospace' }}>
      <Navbar />

      {/* Impersonation Banner */}
      <div style={{ background: 'rgba(255,180,0,0.08)', borderBottom: '1px solid rgba(255,180,0,0.2)', padding: '10px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ffb400' }} />
          <span style={{ color: '#ffb400', fontSize: '12px', letterSpacing: '1px' }}>
            VIEWING AS: <span style={{ color: '#fff', fontWeight: '700' }}>{reporter?.name?.toUpperCase()}</span>
          </span>
          <span style={{ color: '#555', fontSize: '11px' }}>— Editor View (Read Only + File Leave)</span>
        </div>
        <button onClick={() => navigate('/roster')} style={{
          padding: '6px 16px', background: 'rgba(255,180,0,0.1)',
          border: '1px solid rgba(255,180,0,0.3)', borderRadius: '4px',
          color: '#ffb400', fontSize: '11px', letterSpacing: '1px',
          cursor: 'pointer', fontFamily: 'inherit'
        }}>EXIT VIEW</button>
      </div>

      {/* Success message */}
      {successMsg && (
        <div style={{ background: 'rgba(100,200,150,0.1)', borderBottom: '1px solid rgba(100,200,150,0.2)', padding: '10px 24px' }}>
          <span style={{ color: '#64c896', fontSize: '12px' }}>✓ {successMsg}</span>
        </div>
      )}

      <div style={{ padding: '32px 24px', maxWidth: '900px', margin: '0 auto' }}>

        {/* Reporter Info Card */}
        <div style={{ padding: '20px 24px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,180,0,0.15)', borderRadius: '8px', marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{ color: '#fff', margin: '0 0 4px', fontSize: '20px', fontWeight: '700' }}>{reporter?.name}</h1>
            <p style={{ color: '#555', margin: '0 0 8px', fontSize: '12px' }}>{reporter?.email}</p>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {reporter?.beats?.map((b: string) => (
                <span key={b} style={{ padding: '2px 8px', background: 'rgba(255,180,0,0.08)', border: '1px solid rgba(255,180,0,0.2)', borderRadius: '3px', color: '#ffb400', fontSize: '10px' }}>{b}</span>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: '#ffb400', fontSize: '24px', fontWeight: '700' }}>{active.length}</div>
              <div style={{ color: '#555', fontSize: '10px' }}>ACTIVE</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: '#64c896', fontSize: '24px', fontWeight: '700' }}>{reporter?.complexity_level}</div>
              <div style={{ color: '#555', fontSize: '10px' }}>COMPLEXITY</div>
            </div>
            {/* FILE LEAVE ON BEHALF button */}
            <button onClick={() => setLeaveModal(true)} style={{
              padding: '10px 18px', background: 'rgba(255,136,0,0.1)',
              border: '1px solid rgba(255,136,0,0.3)', borderRadius: '6px',
              color: '#ff8800', fontSize: '11px', letterSpacing: '1px',
              cursor: 'pointer', fontFamily: 'inherit', fontWeight: '600'
            }}>+ FILE LEAVE ON BEHALF</button>
          </div>
        </div>

        {/* This Week Availability */}
        <div style={{ marginBottom: '32px' }}>
          <h2 style={{ color: '#fff', margin: '0 0 16px', fontSize: '13px', letterSpacing: '1px' }}>THIS WEEK AVAILABILITY</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px' }}>
            {DAYS.map(day => {
              const status = getDayStatus(day)
              const isToday_ = weekDates[day] === today
              const holiday = holidays.find(h => h.date === weekDates[day])

              const colors: Record<string, { bg: string, border: string, color: string, label: string }> = {
                available: { bg: 'rgba(100,200,150,0.1)', border: 'rgba(100,200,150,0.4)', color: '#64c896', label: 'AVAIL' },
                unavailable: { bg: 'rgba(255,255,255,0.02)', border: 'rgba(255,255,255,0.08)', color: '#444', label: '' },
                leave_approved: { bg: 'rgba(255,68,68,0.1)', border: 'rgba(255,68,68,0.4)', color: '#ff6b6b', label: 'LEAVE' },
                leave_pending: { bg: 'rgba(255,136,0,0.1)', border: 'rgba(255,136,0,0.4)', color: '#ff8800', label: 'PEND' },
                holiday: { bg: 'rgba(255,50,50,0.15)', border: '#ff3232', color: '#ff4444', label: 'HOL' },
                past: { bg: 'rgba(255,255,255,0.01)', border: 'rgba(255,255,255,0.04)', color: '#333', label: '' },
              }
              const c = colors[status] || colors.unavailable

              return (
                <div key={day} style={{
                  padding: '12px 6px', borderRadius: '6px',
                  background: c.bg, border: `1px solid ${c.border}`,
                  textAlign: 'center',
                  outline: isToday_ ? '2px solid #ffb400' : 'none',
                  outlineOffset: '2px'
                }}>
                  <div style={{ color: '#888', fontSize: '9px', marginBottom: '4px', letterSpacing: '1px' }}>{day}</div>
                  <div style={{ color: c.color, fontSize: '10px', fontWeight: '700' }}>{c.label || (status === 'unavailable' ? '–' : '')}</div>
                  {holiday && <div style={{ color: '#ff6b6b', fontSize: '7px', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{holiday.name}</div>}
                </div>
              )
            })}
          </div>
        </div>

        {/* Active Stories */}
        <div style={{ marginBottom: '32px' }}>
          <h2 style={{ color: '#fff', margin: '0 0 16px', fontSize: '13px', letterSpacing: '1px' }}>
            ACTIVE STORIES — {active.length}
          </h2>
          {active.length === 0 ? (
            <div style={{ color: '#333', fontSize: '13px', textAlign: 'center', padding: '32px', border: '1px dashed rgba(255,255,255,0.07)', borderRadius: '6px' }}>
              No active stories
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {active.map(story => (
                <div key={story.id} style={{ padding: '16px 20px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                        <span style={{ padding: '2px 8px', borderRadius: '3px', fontSize: '9px', background: urgencyColor[story.urgency] + '20', color: urgencyColor[story.urgency] }}>{story.urgency?.toUpperCase()}</span>
                        <span style={{ padding: '2px 8px', borderRadius: '3px', fontSize: '9px', background: statusColor[story.status] + '15', color: statusColor[story.status] }}>{story.status?.replace('_', ' ').toUpperCase()}</span>
                        <span style={{ color: '#444', fontSize: '11px' }}>{story.category}</span>
                      </div>
                      <div style={{ color: '#fff', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>{story.headline}</div>
                      <div style={{ color: '#555', fontSize: '11px' }}>
                        Deadline: <span style={{ color: '#888' }}>{story.deadline}</span>
                        <span style={{ marginLeft: '12px' }}>Complexity: <span style={{ color: '#888' }}>{story.complexity}/5</span></span>
                      </div>
                      {story.reassign_reason && (
                        <div style={{ marginTop: '8px', padding: '8px 12px', background: 'rgba(255,136,0,0.08)', border: '1px solid rgba(255,136,0,0.2)', borderRadius: '4px' }}>
                          <p style={{ color: '#888', fontSize: '10px', margin: '0 0 2px' }}>REASSIGN REASON</p>
                          <p style={{ color: '#ff8800', fontSize: '11px', margin: 0 }}>{story.reassign_reason}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Filed/Published Stories */}
        {filed.length > 0 && (
          <div style={{ marginBottom: '32px' }}>
            <h2 style={{ color: '#fff', margin: '0 0 16px', fontSize: '13px', letterSpacing: '1px' }}>
              FILED / PUBLISHED — {filed.length}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filed.map(story => (
                <div key={story.id} style={{
                  padding: '14px 20px', borderRadius: '6px',
                  border: `1px solid ${story.status === 'published' ? 'rgba(100,200,150,0.2)' : 'rgba(136,136,255,0.2)'}`,
                  background: story.status === 'published' ? 'rgba(100,200,150,0.04)' : 'rgba(136,136,255,0.04)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                  <div>
                    <div style={{ color: '#ddd', fontSize: '14px', fontWeight: '600', marginBottom: '2px' }}>{story.headline}</div>
                    {story.filed_file_name && <div style={{ color: '#8888ff', fontSize: '10px' }}>Filed: {story.filed_file_name}</div>}
                  </div>
                  <span style={{ color: story.status === 'published' ? '#64c896' : '#8888ff', fontSize: '10px', letterSpacing: '1px', marginLeft: '12px' }}>
                    {story.status?.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Leave History */}
        <div style={{ marginBottom: '32px' }}>
          <h2 style={{ color: '#fff', margin: '0 0 16px', fontSize: '13px', letterSpacing: '1px' }}>LEAVE HISTORY</h2>
          {leaves.length === 0 ? (
            <div style={{ color: '#333', fontSize: '12px', textAlign: 'center', padding: '24px', border: '1px dashed rgba(255,255,255,0.07)', borderRadius: '6px' }}>
              No leave requests
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {leaves.map(leave => (
                <div key={leave.id} style={{
                  padding: '12px 16px', borderRadius: '6px',
                  border: `1px solid ${leave.status === 'acknowledged' ? 'rgba(100,200,150,0.2)' : leave.status === 'rejected' ? 'rgba(255,68,68,0.2)' : 'rgba(255,136,0,0.2)'}`,
                  background: 'rgba(255,255,255,0.02)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                      <span style={{ padding: '2px 6px', borderRadius: '3px', fontSize: '9px', background: ltc[leave.leave_type] + '20', color: ltc[leave.leave_type] }}>
                        {leave.leave_type?.toUpperCase()}
                      </span>
                      <span style={{ color: '#ddd', fontSize: '13px' }}>{leave.leave_date}</span>
                      {/* ADDED: Filed by editor badge */}
                      {leave.filed_by_editor && (
                        <span style={{ padding: '2px 6px', borderRadius: '3px', fontSize: '9px', background: 'rgba(255,180,0,0.1)', color: '#ffb400', letterSpacing: '1px' }}>
                          FILED BY EDITOR
                        </span>
                      )}
                    </div>
                    {leave.notes && <p style={{ color: '#555', fontSize: '11px', margin: 0 }}>{leave.notes}</p>}
                    {leave.status === 'rejected' && leave.reject_reason && (
                      <p style={{ color: '#ff8888', fontSize: '11px', margin: '2px 0 0' }}>Rejected: {leave.reject_reason}</p>
                    )}
                  </div>
                  <span style={{
                    padding: '3px 10px', borderRadius: '3px', fontSize: '10px', letterSpacing: '1px',
                    background: leave.status === 'acknowledged' ? 'rgba(100,200,150,0.15)' : leave.status === 'rejected' ? 'rgba(255,68,68,0.15)' : 'rgba(255,136,0,0.15)',
                    color: leave.status === 'acknowledged' ? '#64c896' : leave.status === 'rejected' ? '#ff6b6b' : '#ff8800'
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
          <div style={{ marginBottom: '32px' }}>
            <h2 style={{ color: '#fff', margin: '0 0 16px', fontSize: '13px', letterSpacing: '1px' }}>REPORTER LEAVE FILING REQUESTS</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {filingRequests.map(req => (
                <div key={req.id} style={{
                  padding: '12px 16px', borderRadius: '6px',
                  border: `1px solid ${req.status === 'approved' ? 'rgba(100,200,150,0.2)' : req.status === 'rejected' ? 'rgba(255,68,68,0.2)' : 'rgba(255,180,0,0.2)'}`,
                  background: 'rgba(255,255,255,0.02)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '4px', alignItems: 'center' }}>
                        <span style={{ color: '#ddd', fontSize: '13px', fontWeight: '600' }}>{req.requested_date}</span>
                        <span style={{ padding: '2px 6px', borderRadius: '3px', fontSize: '9px', background: ltc[req.leave_type] + '20', color: ltc[req.leave_type] }}>{req.leave_type?.toUpperCase()}</span>
                      </div>
                      <p style={{ color: '#666', fontSize: '11px', margin: 0 }}>Reason: {req.reason}</p>
                    </div>
                    <span style={{
                      padding: '3px 10px', borderRadius: '3px', fontSize: '10px',
                      background: req.status === 'approved' ? 'rgba(100,200,150,0.15)' : req.status === 'rejected' ? 'rgba(255,68,68,0.15)' : 'rgba(255,136,0,0.15)',
                      color: req.status === 'approved' ? '#64c896' : req.status === 'rejected' ? '#ff6b6b' : '#ff8800'
                    }}>
                      {req.status?.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* File Leave on Behalf Modal */}
      {leaveModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setLeaveModal(false) }}>
          <div style={{ background: '#0d0d14', border: '1px solid rgba(255,136,0,0.3)', borderRadius: '8px', width: '100%', maxWidth: '420px', margin: '24px', padding: '24px', fontFamily: '"DM Mono", "Courier New", monospace' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h2 style={{ color: '#fff', margin: 0, fontSize: '16px' }}>File Leave on Behalf</h2>
              <button onClick={() => setLeaveModal(false)} style={{ background: 'none', border: 'none', color: '#555', fontSize: '20px', cursor: 'pointer' }}>x</button>
            </div>

            <div style={{ padding: '10px 14px', background: 'rgba(255,136,0,0.06)', border: '1px solid rgba(255,136,0,0.15)', borderRadius: '5px', marginBottom: '16px' }}>
              <p style={{ color: '#ff8800', fontSize: '11px', margin: 0 }}>
                Filing leave for <span style={{ color: '#fff', fontWeight: '700' }}>{reporter?.name}</span>. This will be auto-approved and marked as "Filed by Editor".
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ color: '#888', fontSize: '11px', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>LEAVE DATE</label>
                <input type="date" value={leaveForm.leave_date}
                  min={today}
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
                      fontFamily: 'inherit', textTransform: 'uppercase' as const
                    }}>{t}</button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ color: '#888', fontSize: '11px', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>NOTES (optional)</label>
                <textarea value={leaveForm.notes}
                  onChange={e => setLeaveForm(p => ({ ...p, notes: e.target.value }))}
                  rows={3} placeholder="Reason for filing on behalf..."
                  style={{ width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', fontSize: '13px', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'none' }} />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setLeaveModal(false)} style={{ flex: 1, padding: '11px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#666', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}>CANCEL</button>
                <button onClick={fileLeaveOnBehalf} disabled={!leaveForm.leave_date || submitting} style={{
                  flex: 2, padding: '11px', background: leaveForm.leave_date ? 'rgba(255,136,0,0.15)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${leaveForm.leave_date ? 'rgba(255,136,0,0.4)' : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: '6px', color: leaveForm.leave_date ? '#ff8800' : '#444',
                  fontSize: '12px', fontWeight: '700', cursor: leaveForm.leave_date ? 'pointer' : 'not-allowed',
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