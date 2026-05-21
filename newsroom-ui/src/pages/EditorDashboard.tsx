import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Navbar from '../components/Navbar'
import AssignModal from '../components/AssignModal'

export default function EditorDashboard() {
  const [stories, setStories] = useState<any[]>([])
  const [alerts, setAlerts] = useState<any[]>([])
  const [overrideResponses, setOverrideResponses] = useState<any[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [assignStory, setAssignStory] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [rejectModal, setRejectModal] = useState<{id: string, reporterName: string} | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [overrideDetailModal, setOverrideDetailModal] = useState<any>(null)
  const [form, setForm] = useState({
    headline: '', category: 'Politics', complexity: 3,
    urgency: 'normal', priority: 3, deadline: '', description: ''
  })

  const BEATS = ['Politics','Economy','Tech','Science','Crime','Local','Sports','Entertainment','Business']
  const urgencyColor: Record<string,string> = { breaking:'#ff4444', high:'#ff8800', normal:'#ffb400', low:'#64c896' }
  const statusColor: Record<string,string> = { unassigned:'#555', assigned:'#ffb400', in_progress:'#64c896', filed:'#8888ff', published:'#aaa' }

  function getCurrentWeekStart(): string {
    const d = new Date()
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    d.setDate(diff)
    return d.toISOString().split('T')[0]
  }

  function getCurrentWeekEnd(): string {
    const d = new Date()
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? 0 : 7)
    d.setDate(diff)
    return d.toISOString().split('T')[0]
  }

  async function load() {
    setLoading(true)
    const weekStart = getCurrentWeekStart()
    const weekEnd = getCurrentWeekEnd()

    const { data: storiesData } = await supabase
      .from('stories').select('*')
      .gte('deadline', weekStart)
      .lte('deadline', weekEnd)
      .order('created_at', { ascending: false })

    const { data: assignments } = await supabase
      .from('assignments').select('story_id, reporter_id')
      .eq('is_active', true)

    const reporterIdsInAssignments = [...new Set((assignments || []).map((a: any) => a.reporter_id))]
    const { data: assignedReporters } = await supabase
      .from('reporters').select('id, name')
      .in('id', reporterIdsInAssignments.length > 0 ? reporterIdsInAssignments : ['none'])

    const reporterNameMap: Record<string,string> = {}
    assignedReporters?.forEach((r: any) => { reporterNameMap[r.id] = r.name })

    const assignMap: Record<string,string> = {}
    assignments?.forEach((a: any) => { assignMap[a.story_id] = reporterNameMap[a.reporter_id] })

    setStories((storiesData || []).map(s => ({ ...s, reporter_name: assignMap[s.id] })))

    // Fetch leave requests
    const { data: leaves } = await supabase
      .from('leave_requests').select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    const leaveReporterIds = [...new Set((leaves || []).map((l: any) => l.reporter_id))]
    const { data: leaveReporters } = await supabase
      .from('reporters').select('id, name')
      .in('id', leaveReporterIds.length > 0 ? leaveReporterIds : ['none'])

    const leaveReporterMap: Record<string,string> = {}
    leaveReporters?.forEach((r: any) => { leaveReporterMap[r.id] = r.name })

    setAlerts((leaves || []).map((l: any) => ({
      ...l, reporter_name: leaveReporterMap[l.reporter_id]
    })))

    // Fetch override assignment responses (accepted or rejected by reporter)
    const { data: overrides } = await supabase
      .from('assignments')
      .select('*, stories(headline, deadline, category)')
      .eq('is_active', true)
      .eq('is_override', true)
      .in('override_status', ['accepted', 'rejected'])
      .not('override_response', 'is', null)
      .order('override_responded_at', { ascending: false })

    if (overrides && overrides.length > 0) {
      const reporterIds = [...new Set(overrides.map((o: any) => o.reporter_id))]
      const { data: reporters } = await supabase
        .from('reporters').select('id, name')
        .in('id', reporterIds)
      const rMap: Record<string,string> = {}
      reporters?.forEach((r: any) => { rMap[r.id] = r.name })
      setOverrideResponses(overrides.map((o: any) => ({
        ...o,
        reporter_name: rMap[o.reporter_id],
        story_headline: o.stories?.headline,
        story_deadline: o.stories?.deadline,
        story_category: o.stories?.category
      })))
    } else {
      setOverrideResponses([])
    }

    setLoading(false)
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    const channel = supabase.channel('dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stories' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assignments' }, load)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  useEffect(() => {
    const handler = () => load()
    window.addEventListener('newsroom-refresh', handler)
    return () => window.removeEventListener('newsroom-refresh', handler)
  }, [])

  async function createStory() {
    if (!form.headline || !form.deadline) return
    await supabase.from('stories').insert({ ...form, status: 'unassigned' })
    setShowCreate(false)
    setForm({ headline:'', category:'Politics', complexity:3, urgency:'normal', priority:3, deadline:'', description:'' })
    load()
  }

  async function acknowledgeLeave(leaveId: string) {
    const leave = alerts.find(a => a.id === leaveId)
    if (leave) {
      const leaveDate = new Date(leave.leave_date + 'T00:00:00Z')
      const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
      const dayName = days[leaveDate.getUTCDay()]
      const { data: avail } = await supabase
        .from('availability').select('*')
        .eq('reporter_id', leave.reporter_id)
        .eq('week_start_date', getCurrentWeekStart())
        .maybeSingle()
      if (avail) {
        const updatedDays = avail.available_days.filter((d: string) => d !== dayName)
        await supabase.from('availability').update({ available_days: updatedDays }).eq('id', avail.id)
      }
    }
    await supabase.from('leave_requests')
      .update({ status: 'acknowledged', acknowledged_at: new Date().toISOString() })
      .eq('id', leaveId)
    load()
  }

  async function rejectLeave(leaveId: string) {
    await supabase.from('leave_requests')
      .update({ status: 'rejected', reject_reason: rejectReason })
      .eq('id', leaveId)
    setRejectModal(null)
    setRejectReason('')
    load()
  }

  const stats = [
    { label: 'This Week Stories', value: stories.length, color: '#ffb400' },
    { label: 'Unassigned', value: stories.filter(s => s.status === 'unassigned').length, color: '#ff6b6b' },
    { label: 'In Progress', value: stories.filter(s => s.status === 'in_progress').length, color: '#64c896' },
    { label: 'Leave Alerts', value: alerts.length, color: '#ff8800' },
  ]

  const inputStyle = {
    width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px',
    color: '#fff', fontSize: '13px', outline: 'none',
    boxSizing: 'border-box' as const, fontFamily: 'inherit', colorScheme: 'dark' as const
  }

  const weekStart = getCurrentWeekStart()
  const weekEnd = getCurrentWeekEnd()

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', fontFamily: '"DM Mono", "Courier New", monospace' }}>
      <Navbar />
      <div style={{ padding: '32px 24px', maxWidth: '1200px', margin: '0 auto' }}>

        <div style={{ marginBottom: '24px', padding: '10px 16px', background: 'rgba(255,180,0,0.06)', border: '1px solid rgba(255,180,0,0.15)', borderRadius: '6px', display: 'inline-block' }}>
          <span style={{ color: '#ffb400', fontSize: '11px', letterSpacing: '1px' }}>
            CURRENT WEEK: {weekStart} to {weekEnd}
          </span>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '16px', marginBottom: '32px' }}>
          {stats.map(s => (
            <div key={s.label} style={{ padding: '20px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
              <div style={{ color: s.color, fontSize: '28px', fontWeight: '700', marginBottom: '4px' }}>{s.value}</div>
              <div style={{ color: '#555', fontSize: '11px', letterSpacing: '1px' }}>{s.label.toUpperCase()}</div>
            </div>
          ))}
        </div>

        {/* Override Responses Banner */}
        {overrideResponses.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ color: '#fff', margin: '0 0 12px', fontSize: '13px', letterSpacing: '1px' }}>
              OVERRIDE RESPONSES
              <span style={{ marginLeft: '8px', padding: '2px 8px', background: 'rgba(255,68,68,0.15)', color: '#ff6b6b', borderRadius: '10px', fontSize: '10px' }}>
                {overrideResponses.length}
              </span>
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {overrideResponses.map(o => (
                <div key={o.id} style={{
                  padding: '14px 16px', borderRadius: '6px',
                  border: `1px solid ${o.override_status === 'accepted' ? 'rgba(100,200,150,0.25)' : 'rgba(255,68,68,0.25)'}`,
                  background: o.override_status === 'accepted' ? 'rgba(100,200,150,0.04)' : 'rgba(255,68,68,0.04)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px'
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: '3px', fontSize: '9px', letterSpacing: '1px',
                        background: o.override_status === 'accepted' ? 'rgba(100,200,150,0.15)' : 'rgba(255,68,68,0.15)',
                        color: o.override_status === 'accepted' ? '#64c896' : '#ff6b6b'
                      }}>
                        {o.override_status === 'accepted' ? 'ACCEPTED' : 'REJECTED'}
                      </span>
                      <span style={{ color: '#ddd', fontSize: '12px', fontWeight: '600' }}>{o.reporter_name}</span>
                      <span style={{ color: '#555', fontSize: '11px' }}>{o.story_headline}</span>
                    </div>
                    <div style={{ color: o.override_status === 'accepted' ? '#64c896' : '#ff8888', fontSize: '12px', marginBottom: '2px' }}>
                      Reporter says: "{o.override_response}"
                    </div>
                    <div style={{ color: '#444', fontSize: '10px' }}>
                      Editor reason was: {o.override_reason}
                      {o.override_responded_at && (
                        <span style={{ marginLeft: '8px' }}>
                          · {new Date(o.override_responded_at).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setOverrideDetailModal(o)}
                    style={{
                      padding: '6px 14px', background: 'transparent',
                      border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px',
                      color: '#888', fontSize: '10px', letterSpacing: '1px',
                      cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap'
                    }}>
                    VIEW DETAILS
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '24px' }}>

          {/* Stories */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ color: '#fff', margin: 0, fontSize: '14px', letterSpacing: '1px' }}>THIS WEEK STORIES</h2>
              <button onClick={() => setShowCreate(true)} style={{
                padding: '8px 18px', background: '#ffb400', border: 'none', borderRadius: '4px',
                color: '#0a0a0f', fontSize: '11px', letterSpacing: '1px', fontWeight: '700',
                cursor: 'pointer', fontFamily: 'inherit'
              }}>+ NEW STORY</button>
            </div>

            {loading ? (
              <div style={{ color: '#555', fontSize: '13px', padding: '40px', textAlign: 'center' }}>Loading...</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {stories.map(story => (
                  <div key={story.id} style={{
                    padding: '16px', borderRadius: '6px',
                    border: '1px solid rgba(255,255,255,0.06)',
                    background: 'rgba(255,255,255,0.02)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                        <span style={{ padding: '2px 6px', borderRadius: '3px', fontSize: '9px', letterSpacing: '1px', background: `${urgencyColor[story.urgency]}20`, color: urgencyColor[story.urgency] }}>
                          {story.urgency?.toUpperCase()}
                        </span>
                        <span style={{ padding: '2px 6px', borderRadius: '3px', fontSize: '9px', letterSpacing: '1px', background: `${statusColor[story.status]}20`, color: statusColor[story.status] }}>
                          {story.status?.replace('_',' ').toUpperCase()}
                        </span>
                        <span style={{ color: '#444', fontSize: '11px' }}>{story.category}</span>
                      </div>
                      <div style={{ color: '#ddd', fontSize: '14px', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {story.headline}
                      </div>
                      <div style={{ color: '#555', fontSize: '11px' }}>
                        Due {story.deadline}
                        {story.reporter_name && <span style={{ color: '#888' }}> · {story.reporter_name}</span>}
                      </div>
                    </div>
                    {story.status === 'unassigned' && (
                      <button onClick={() => setAssignStory(story)} style={{
                        padding: '8px 16px', background: 'transparent',
                        border: '1px solid rgba(255,180,0,0.4)', borderRadius: '4px',
                        color: '#ffb400', fontSize: '11px', letterSpacing: '1px',
                        cursor: 'pointer', fontFamily: 'inherit', marginLeft: '16px', whiteSpace: 'nowrap'
                      }}>ASSIGN</button>
                    )}
                  </div>
                ))}
                {stories.length === 0 && (
                  <div style={{ color: '#333', fontSize: '13px', textAlign: 'center', padding: '40px', border: '1px dashed rgba(255,255,255,0.07)', borderRadius: '6px' }}>
                    No stories this week. Create one!
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Leave Alerts */}
          <div>
            <h2 style={{ color: '#fff', margin: '0 0 16px', fontSize: '14px', letterSpacing: '1px' }}>LEAVE ALERTS</h2>
            {alerts.length === 0 ? (
              <div style={{ color: '#555', fontSize: '12px', padding: '24px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px' }}>
                No pending alerts
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {alerts.map(alert => (
                  <div key={alert.id} style={{ padding: '14px', borderRadius: '6px', border: '1px solid rgba(255,136,0,0.2)', background: 'rgba(255,136,0,0.04)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ color: '#ddd', fontSize: '13px', fontWeight: '600' }}>{alert.reporter_name}</span>
                      <span style={{ padding: '2px 6px', borderRadius: '3px', fontSize: '9px', letterSpacing: '1px', background: 'rgba(255,68,68,0.15)', color: '#ff6b6b' }}>
                        {alert.leave_type?.toUpperCase()}
                      </span>
                    </div>
                    <div style={{ color: '#666', fontSize: '11px', marginBottom: '4px' }}>{alert.leave_date}</div>
                    {alert.notes && (
                      <div style={{ color: '#555', fontSize: '11px', marginBottom: '10px', fontStyle: 'italic' }}>
                        "{alert.notes}"
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                      <button onClick={() => acknowledgeLeave(alert.id)} style={{
                        flex: 1, padding: '7px', background: 'rgba(100,200,150,0.1)',
                        border: '1px solid rgba(100,200,150,0.3)', borderRadius: '4px',
                        color: '#64c896', fontSize: '10px', letterSpacing: '1px',
                        cursor: 'pointer', fontFamily: 'inherit'
                      }}>APPROVE</button>
                      <button onClick={() => setRejectModal({ id: alert.id, reporterName: alert.reporter_name })} style={{
                        flex: 1, padding: '7px', background: 'rgba(255,68,68,0.1)',
                        border: '1px solid rgba(255,68,68,0.3)', borderRadius: '4px',
                        color: '#ff6b6b', fontSize: '10px', letterSpacing: '1px',
                        cursor: 'pointer', fontFamily: 'inherit'
                      }}>REJECT</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Story Modal */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setShowCreate(false) }}>
          <div style={{ background: '#0d0d14', border: '1px solid rgba(255,180,0,0.2)', borderRadius: '8px', width: '100%', maxWidth: '480px', margin: '24px', padding: '24px', fontFamily: '"DM Mono", "Courier New", monospace', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h2 style={{ color: '#fff', margin: 0, fontSize: '16px' }}>New Story</h2>
              <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', color: '#555', fontSize: '20px', cursor: 'pointer' }}>x</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ color: '#888', fontSize: '11px', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>HEADLINE</label>
                <input value={form.headline} onChange={e => setForm(p => ({ ...p, headline: e.target.value }))}
                  placeholder="Story headline..." style={inputStyle} />
              </div>
              <div>
                <label style={{ color: '#888', fontSize: '11px', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>
                  DEADLINE <span style={{ color: '#555' }}>(This week: {weekStart} to {weekEnd})</span>
                </label>
                <input type="date" value={form.deadline}
                  min={weekStart} max={weekEnd}
                  onChange={e => setForm(p => ({ ...p, deadline: e.target.value }))}
                  style={{ ...inputStyle, colorScheme: 'dark' }} />
              </div>
              <div>
                <label style={{ color: '#888', fontSize: '11px', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>DESCRIPTION</label>
                <textarea value={form.description}
                  onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="Optional details..." rows={3}
                  style={{ ...inputStyle, resize: 'none' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ color: '#888', fontSize: '11px', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>CATEGORY</label>
                  <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                    style={{ ...inputStyle, background: '#0d0d14' }}>
                    {BEATS.map(b => <option key={b}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ color: '#888', fontSize: '11px', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>URGENCY</label>
                  <select value={form.urgency} onChange={e => setForm(p => ({ ...p, urgency: e.target.value }))}
                    style={{ ...inputStyle, background: '#0d0d14' }}>
                    {['breaking','high','normal','low'].map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ color: '#888', fontSize: '11px', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>COMPLEXITY (1-5)</label>
                  <input type="number" min={1} max={5} value={form.complexity}
                    onChange={e => setForm(p => ({ ...p, complexity: +e.target.value }))}
                    style={inputStyle} />
                </div>
                <div>
                  <label style={{ color: '#888', fontSize: '11px', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>PRIORITY (1-5)</label>
                  <input type="number" min={1} max={5} value={form.priority}
                    onChange={e => setForm(p => ({ ...p, priority: +e.target.value }))}
                    style={inputStyle} />
                </div>
              </div>
              <button onClick={createStory} style={{
                padding: '13px', background: '#ffb400', border: 'none', borderRadius: '6px',
                color: '#0a0a0f', fontSize: '12px', letterSpacing: '1px', fontWeight: '700',
                cursor: 'pointer', fontFamily: 'inherit', marginTop: '4px'
              }}>CREATE STORY</button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Leave Modal */}
      {rejectModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) { setRejectModal(null); setRejectReason('') } }}>
          <div style={{ background: '#0d0d14', border: '1px solid rgba(255,68,68,0.3)', borderRadius: '8px', width: '100%', maxWidth: '400px', margin: '24px', padding: '24px', fontFamily: '"DM Mono", "Courier New", monospace' }}>
            <h2 style={{ color: '#fff', margin: '0 0 8px', fontSize: '16px' }}>Reject Leave Request</h2>
            <p style={{ color: '#555', fontSize: '12px', margin: '0 0 20px' }}>
              Rejecting leave for <span style={{ color: '#ddd' }}>{rejectModal.reporterName}</span>
            </p>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ color: '#888', fontSize: '11px', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>
                REASON FOR REJECTION
              </label>
              <textarea value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                rows={3} placeholder="Explain why the leave is rejected..."
                style={{ width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', fontSize: '13px', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'none' }} />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => { setRejectModal(null); setRejectReason('') }} style={{
                flex: 1, padding: '11px', background: 'transparent',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px',
                color: '#666', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit'
              }}>CANCEL</button>
              <button onClick={() => rejectLeave(rejectModal.id)} disabled={!rejectReason.trim()} style={{
                flex: 1, padding: '11px', background: 'rgba(255,68,68,0.15)',
                border: '1px solid rgba(255,68,68,0.4)', borderRadius: '6px',
                color: '#ff6b6b', fontSize: '12px', fontWeight: '700',
                cursor: rejectReason.trim() ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit', opacity: rejectReason.trim() ? 1 : 0.5
              }}>CONFIRM REJECT</button>
            </div>
          </div>
        </div>
      )}

      {/* Override Detail Modal */}
      {overrideDetailModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setOverrideDetailModal(null) }}>
          <div style={{ background: '#0d0d14', border: `1px solid ${overrideDetailModal.override_status === 'accepted' ? 'rgba(100,200,150,0.3)' : 'rgba(255,68,68,0.3)'}`, borderRadius: '8px', width: '100%', maxWidth: '440px', margin: '24px', padding: '24px', fontFamily: '"DM Mono", "Courier New", monospace' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h2 style={{ color: '#fff', margin: 0, fontSize: '16px' }}>Override Assignment Details</h2>
              <button onClick={() => setOverrideDetailModal(null)} style={{ background: 'none', border: 'none', color: '#555', fontSize: '20px', cursor: 'pointer' }}>x</button>
            </div>

            {/* Status badge */}
            <div style={{ marginBottom: '16px' }}>
              <span style={{
                padding: '4px 12px', borderRadius: '4px', fontSize: '10px', letterSpacing: '1px',
                background: overrideDetailModal.override_status === 'accepted' ? 'rgba(100,200,150,0.15)' : 'rgba(255,68,68,0.15)',
                color: overrideDetailModal.override_status === 'accepted' ? '#64c896' : '#ff6b6b'
              }}>
                REPORTER {overrideDetailModal.override_status === 'accepted' ? 'ACCEPTED' : 'REJECTED'} THE ASSIGNMENT
              </span>
            </div>

            {/* Story info */}
            <div style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px', marginBottom: '12px' }}>
              <p style={{ color: '#888', fontSize: '10px', letterSpacing: '1px', margin: '0 0 4px' }}>STORY</p>
              <p style={{ color: '#ddd', fontSize: '13px', margin: '0 0 4px', fontWeight: '600' }}>{overrideDetailModal.story_headline}</p>
              <p style={{ color: '#555', fontSize: '11px', margin: 0 }}>
                {overrideDetailModal.story_category} · Due {overrideDetailModal.story_deadline}
              </p>
            </div>

            {/* Reporter info */}
            <div style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px', marginBottom: '12px' }}>
              <p style={{ color: '#888', fontSize: '10px', letterSpacing: '1px', margin: '0 0 4px' }}>REPORTER</p>
              <p style={{ color: '#ddd', fontSize: '13px', margin: 0, fontWeight: '600' }}>{overrideDetailModal.reporter_name}</p>
            </div>

            {/* Editor override reason */}
            <div style={{ padding: '12px 14px', background: 'rgba(255,136,0,0.06)', border: '1px solid rgba(255,136,0,0.15)', borderRadius: '6px', marginBottom: '12px' }}>
              <p style={{ color: '#888', fontSize: '10px', letterSpacing: '1px', margin: '0 0 6px' }}>YOUR OVERRIDE REASON</p>
              <p style={{ color: '#ff8800', fontSize: '12px', margin: 0, lineHeight: 1.6 }}>{overrideDetailModal.override_reason}</p>
            </div>

            {/* Reporter response */}
            <div style={{
              padding: '12px 14px',
              background: overrideDetailModal.override_status === 'accepted' ? 'rgba(100,200,150,0.06)' : 'rgba(255,68,68,0.06)',
              border: `1px solid ${overrideDetailModal.override_status === 'accepted' ? 'rgba(100,200,150,0.15)' : 'rgba(255,68,68,0.15)'}`,
              borderRadius: '6px', marginBottom: '16px'
            }}>
              <p style={{ color: '#888', fontSize: '10px', letterSpacing: '1px', margin: '0 0 6px' }}>REPORTER RESPONSE</p>
              <p style={{
                color: overrideDetailModal.override_status === 'accepted' ? '#64c896' : '#ff6b6b',
                fontSize: '13px', margin: '0 0 6px', lineHeight: 1.6, fontWeight: '600'
              }}>
                {overrideDetailModal.override_status === 'accepted' ? 'ACCEPTED' : 'REJECTED'}
              </p>
              <p style={{ color: '#aaa', fontSize: '12px', margin: '0 0 6px', lineHeight: 1.6 }}>
                "{overrideDetailModal.override_response}"
              </p>
              {overrideDetailModal.override_responded_at && (
                <p style={{ color: '#555', fontSize: '10px', margin: 0 }}>
                  {new Date(overrideDetailModal.override_responded_at).toLocaleString()}
                </p>
              )}
            </div>

            <button onClick={() => setOverrideDetailModal(null)} style={{
              width: '100%', padding: '11px', background: 'transparent',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px',
              color: '#555', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit'
            }}>CLOSE</button>
          </div>
        </div>
      )}

      {assignStory && (
        <AssignModal story={assignStory} onClose={() => setAssignStory(null)} onAssigned={load} />
      )}
    </div>
  )
}