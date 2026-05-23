import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Navbar from '../components/Navbar'
import AssignModal from '../components/AssignModal'
import { useTheme } from '../context/ThemeContext'

export default function EditorDashboard() {
  const { t } = useTheme()
  const [stories, setStories] = useState<any[]>([])
  const [alerts, setAlerts] = useState<any[]>([])
  const [overrideResponses, setOverrideResponses] = useState<any[]>([])
  const [filingRequests, setFilingRequests] = useState<any[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [assignStory, setAssignStory] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [rejectModal, setRejectModal] = useState<{id: string, reporterName: string} | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [overrideDetailModal, setOverrideDetailModal] = useState<any>(null)
  const [filingRejectModal, setFilingRejectModal] = useState<any>(null)
  const [filingRejectNote, setFilingRejectNote] = useState('')
  const [form, setForm] = useState({
    headline: '', category: 'Politics', complexity: 3,
    urgency: 'normal', priority: 3, deadline: '', description: ''
  })

  const BEATS = ['Politics','Economy','Tech','Science','Crime','Local','Sports','Entertainment','Business']
  const urgencyColor: Record<string,string> = { breaking: t.breaking, high: t.warning, normal: t.accent, low: t.success }
  const statusColor: Record<string,string> = { unassigned: t.textMuted, assigned: t.warning, in_progress: t.success, filed: '#a78bfa', published: t.textSecondary }

  function getCurrentWeekStart(): string {
    const d = new Date(); const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); d.setDate(diff)
    return d.toISOString().split('T')[0]
  }

  function getCurrentWeekEnd(): string {
    const d = new Date(); const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? 0 : 7); d.setDate(diff)
    return d.toISOString().split('T')[0]
  }

  async function load() {
    setLoading(true)
    const weekStart = getCurrentWeekStart()
    const weekEnd = getCurrentWeekEnd()

    const { data: storiesData } = await supabase.from('stories').select('*')
      .gte('deadline', weekStart).lte('deadline', weekEnd)
      .order('created_at', { ascending: false })

    const { data: assignments } = await supabase.from('assignments')
      .select('story_id, reporter_id').eq('is_active', true)

    const reporterIdsInAssignments = [...new Set((assignments || []).map((a: any) => a.reporter_id))]
    const { data: assignedReporters } = await supabase.from('reporters').select('id, name')
      .in('id', reporterIdsInAssignments.length > 0 ? reporterIdsInAssignments : ['none'])

    const reporterNameMap: Record<string,string> = {}
    assignedReporters?.forEach((r: any) => { reporterNameMap[r.id] = r.name })
    const assignMap: Record<string,string> = {}
    assignments?.forEach((a: any) => { assignMap[a.story_id] = reporterNameMap[a.reporter_id] })
    setStories((storiesData || []).map(s => ({ ...s, reporter_name: assignMap[s.id] })))

    const { data: leaves } = await supabase.from('leave_requests').select('*')
      .eq('status', 'pending').order('created_at', { ascending: false })
    const leaveReporterIds = [...new Set((leaves || []).map((l: any) => l.reporter_id))]
    const { data: leaveReporters } = await supabase.from('reporters').select('id, name')
      .in('id', leaveReporterIds.length > 0 ? leaveReporterIds : ['none'])
    const leaveReporterMap: Record<string,string> = {}
    leaveReporters?.forEach((r: any) => { leaveReporterMap[r.id] = r.name })
    setAlerts((leaves || []).map((l: any) => ({ ...l, reporter_name: leaveReporterMap[l.reporter_id] })))

    const { data: overrides } = await supabase.from('assignments')
      .select('*, stories(headline, deadline, category)')
      .eq('is_active', true).eq('is_override', true)
      .in('override_status', ['accepted', 'rejected'])
      .not('override_response', 'is', null)
      .order('override_responded_at', { ascending: false })

    if (overrides && overrides.length > 0) {
      const reporterIds = [...new Set(overrides.map((o: any) => o.reporter_id))]
      const { data: reporters } = await supabase.from('reporters').select('id, name').in('id', reporterIds)
      const rMap: Record<string,string> = {}
      reporters?.forEach((r: any) => { rMap[r.id] = r.name })
      setOverrideResponses(overrides.map((o: any) => ({
        ...o, reporter_name: rMap[o.reporter_id],
        story_headline: o.stories?.headline,
        story_deadline: o.stories?.deadline,
        story_category: o.stories?.category
      })))
    } else { setOverrideResponses([]) }

    // FIXED: removed .order('created_at') — column was missing, now added via SQL
    const { data: filingReqs } = await supabase
      .from('leave_filing_requests')
      .select('*, reporters(name)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    setFilingRequests((filingReqs || []).map((r: any) => ({
      ...r, reporter_name: r.reporters?.name
    })))

    setLoading(false)
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    const channel = supabase.channel('dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stories' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assignments' }, load)
      // ADDED: listen to leave_filing_requests changes
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_filing_requests' }, load)
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
      const { data: avail } = await supabase.from('availability').select('*')
        .eq('reporter_id', leave.reporter_id).eq('week_start_date', getCurrentWeekStart()).maybeSingle()
      if (avail) {
        const updatedDays = avail.available_days.filter((d: string) => d !== dayName)
        await supabase.from('availability').update({ available_days: updatedDays }).eq('id', avail.id)
      }
    }
    await supabase.from('leave_requests')
      .update({ status: 'acknowledged', acknowledged_at: new Date().toISOString() }).eq('id', leaveId)
    load()
  }

  async function rejectLeave(leaveId: string) {
    await supabase.from('leave_requests')
      .update({ status: 'rejected', reject_reason: rejectReason }).eq('id', leaveId)
    setRejectModal(null); setRejectReason(''); load()
  }

  async function approveFilingRequest(req: any) {
    await supabase.from('leave_requests').insert({
      reporter_id: req.reporter_id,
      leave_date: req.requested_date,
      leave_type: req.leave_type,
      is_immediate: req.leave_type === 'sick' || req.leave_type === 'emergency',
      notes: req.reason,
      status: 'acknowledged',
      filed_by_editor: true,
      editor_note: 'Filed by editor on behalf of reporter',
      acknowledged_at: new Date().toISOString()
    })
    // Update availability — remove that day
    const leaveDate = new Date(req.requested_date + 'T00:00:00Z')
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
    const dayName = days[leaveDate.getUTCDay()]
    const d = new Date(req.requested_date + 'T00:00:00')
    const dayOfWeek = d.getDay()
    const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)
    d.setDate(diff)
    const weekStartStr = d.toISOString().split('T')[0]
    const { data: avail } = await supabase.from('availability').select('*')
      .eq('reporter_id', req.reporter_id).eq('week_start_date', weekStartStr).maybeSingle()
    if (avail) {
      const updatedDays = avail.available_days.filter((dd: string) => dd !== dayName)
      await supabase.from('availability').update({ available_days: updatedDays }).eq('id', avail.id)
    }
    await supabase.from('leave_filing_requests').update({ status: 'approved' }).eq('id', req.id)
    load()
  }

  async function rejectFilingRequest() {
    if (!filingRejectModal) return
    await supabase.from('leave_filing_requests')
      .update({ status: 'rejected', editor_note: filingRejectNote }).eq('id', filingRejectModal.id)
    setFilingRejectModal(null); setFilingRejectNote(''); load()
  }

  const stats = [
    { label: 'This Week Stories', value: stories.length, color: t.accent },
    { label: 'Unassigned', value: stories.filter(s => s.status === 'unassigned').length, color: t.danger },
    { label: 'In Progress', value: stories.filter(s => s.status === 'in_progress').length, color: t.success },
    { label: 'Leave Alerts', value: alerts.length, color: t.warning },
  ]

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px',
    background: t.bgInput, border: `1px solid ${t.borderInput}`,
    borderRadius: '8px', color: t.textPrimary,
    fontSize: '14px', outline: 'none',
    boxSizing: 'border-box', fontFamily: 'inherit',
  }

  const weekStart = getCurrentWeekStart()
  const weekEnd = getCurrentWeekEnd()

  const cardStyle: React.CSSProperties = {
    background: t.bgCard,
    border: `1px solid ${t.borderCard}`,
    borderRadius: '10px',
    padding: '20px',
    boxShadow: t.shadowCard,
  }

  return (
    <div style={{ minHeight: '100vh', background: t.bgPage, fontFamily: '"Inter", "DM Mono", sans-serif', color: t.textPrimary }}>
      <Navbar />
      <main role="main" style={{ padding: '32px 24px', maxWidth: '1280px', margin: '0 auto' }}>

        {/* Week indicator */}
        <div style={{ marginBottom: '24px', padding: '10px 16px', background: t.accentBg, border: `1px solid ${t.accentBorder}`, borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: t.accent, fontSize: '13px', fontWeight: '600' }}>
            CURRENT WEEK: {weekStart} to {weekEnd}
          </span>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '16px', marginBottom: '28px' }}>
          {stats.map(s => (
            <div key={s.label} style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ color: s.color, fontSize: '36px', fontWeight: '800', lineHeight: 1 }}>{s.value}</div>
              <div style={{ color: t.textSecondary, fontSize: '12px', fontWeight: '600', letterSpacing: '0.5px' }}>{s.label.toUpperCase()}</div>
            </div>
          ))}
        </div>

        {/* FIXED: Filing Requests — now uses realtime subscription so updates instantly */}
        {filingRequests.length > 0 && (
          <div style={{ ...cardStyle, marginBottom: '24px' }}>
            <h2 style={{ color: t.textPrimary, margin: '0 0 16px', fontSize: '14px', fontWeight: '700', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              LEAVE FILING REQUESTS
              <span style={{ padding: '2px 8px', background: t.warningBg, color: t.warning, borderRadius: '10px', fontSize: '11px', border: `1px solid ${t.warningBorder}` }}>
                {filingRequests.length}
              </span>
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filingRequests.map(req => (
                <div key={req.id} style={{
                  padding: '14px 16px', borderRadius: '8px',
                  border: `1px solid ${t.warningBorder}`, background: t.warningBg,
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', flexWrap: 'wrap', gap: '8px'
                }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ color: t.textPrimary, fontSize: '14px', fontWeight: '600' }}>
                        {req.reporter_name}
                      </span>
                      <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '10px', background: t.accentBg, color: t.accent, fontWeight: '600' }}>
                        {req.leave_type?.toUpperCase()}
                      </span>
                      <span style={{ color: t.textSecondary, fontSize: '13px', fontWeight: '500' }}>
                        {req.requested_date}
                      </span>
                    </div>
                    <p style={{ color: t.textMuted, fontSize: '12px', margin: 0 }}>
                      Reason: {req.reason}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => approveFilingRequest(req)} style={{
                      padding: '8px 16px', background: t.successBg,
                      border: `1px solid ${t.successBorder}`, borderRadius: '6px',
                      color: t.success, fontSize: '11px', fontWeight: '600',
                      letterSpacing: '0.5px', cursor: 'pointer', fontFamily: 'inherit'
                    }}>APPROVE & FILE</button>
                    <button onClick={() => setFilingRejectModal(req)} style={{
                      padding: '8px 16px', background: t.dangerBg,
                      border: `1px solid ${t.dangerBorder}`, borderRadius: '6px',
                      color: t.danger, fontSize: '11px', fontWeight: '600',
                      cursor: 'pointer', fontFamily: 'inherit'
                    }}>REJECT</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Override Responses */}
        {overrideResponses.length > 0 && (
          <div style={{ ...cardStyle, marginBottom: '24px' }}>
            <h2 style={{ color: t.textPrimary, margin: '0 0 12px', fontSize: '14px', fontWeight: '700', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              OVERRIDE RESPONSES
              <span style={{ padding: '2px 8px', background: t.dangerBg, color: t.danger, borderRadius: '10px', fontSize: '11px', border: `1px solid ${t.dangerBorder}` }}>
                {overrideResponses.length}
              </span>
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {overrideResponses.map(o => (
                <div key={o.id} style={{
                  padding: '14px 16px', borderRadius: '8px',
                  border: `1px solid ${o.override_status === 'accepted' ? t.successBorder : t.dangerBorder}`,
                  background: o.override_status === 'accepted' ? t.successBg : t.dangerBg,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px'
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                      <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', background: o.override_status === 'accepted' ? t.successBg : t.dangerBg, color: o.override_status === 'accepted' ? t.success : t.danger, border: `1px solid ${o.override_status === 'accepted' ? t.successBorder : t.dangerBorder}` }}>
                        {o.override_status?.toUpperCase()}
                      </span>
                      <span style={{ color: t.textPrimary, fontSize: '13px', fontWeight: '600' }}>{o.reporter_name}</span>
                      <span style={{ color: t.textMuted, fontSize: '12px' }}>{o.story_headline}</span>
                    </div>
                    <div style={{ color: o.override_status === 'accepted' ? t.success : t.danger, fontSize: '12px' }}>
                      "{o.override_response}"
                    </div>
                  </div>
                  <button onClick={() => setOverrideDetailModal(o)} style={{ padding: '7px 14px', background: 'transparent', border: `1px solid ${t.borderCard}`, borderRadius: '6px', color: t.textMuted, fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit' }}>
                    VIEW DETAILS
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '24px' }}>

          {/* Stories */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ color: t.textPrimary, margin: 0, fontSize: '15px', fontWeight: '700', letterSpacing: '0.5px' }}>THIS WEEK STORIES</h2>
              <button onClick={() => setShowCreate(true)} style={{ padding: '9px 20px', background: t.accent, border: 'none', borderRadius: '8px', color: t.accentText, fontSize: '12px', fontWeight: '700', letterSpacing: '0.5px', cursor: 'pointer', fontFamily: 'inherit' }}>
                + NEW STORY
              </button>
            </div>
            {loading ? (
              <div style={{ color: t.textMuted, fontSize: '14px', padding: '40px', textAlign: 'center' }}>Loading...</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {stories.map(story => (
                  <div key={story.id} style={{ padding: '16px', borderRadius: '8px', border: `1px solid ${t.borderCard}`, background: t.bgPage, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                        <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', letterSpacing: '0.5px', background: `${urgencyColor[story.urgency]}20`, color: urgencyColor[story.urgency], border: `1px solid ${urgencyColor[story.urgency]}40` }}>
                          {story.urgency?.toUpperCase()}
                        </span>
                        <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '600', background: `${statusColor[story.status]}20`, color: statusColor[story.status] }}>
                          {story.status?.replace('_',' ').toUpperCase()}
                        </span>
                        <span style={{ color: t.textMuted, fontSize: '12px' }}>{story.category}</span>
                      </div>
                      <div style={{ color: t.textPrimary, fontSize: '14px', fontWeight: '600', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {story.headline}
                      </div>
                      <div style={{ color: t.textMuted, fontSize: '12px' }}>
                        Due {story.deadline}
                        {story.reporter_name && <span style={{ color: t.textSecondary, fontWeight: '500' }}> · {story.reporter_name}</span>}
                      </div>
                    </div>
                    {story.status === 'unassigned' && (
                      <button onClick={() => setAssignStory(story)} style={{ padding: '8px 18px', background: 'transparent', border: `1px solid ${t.accentBorder}`, borderRadius: '6px', color: t.accent, fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit', marginLeft: '16px', whiteSpace: 'nowrap' }}>
                        ASSIGN
                      </button>
                    )}
                  </div>
                ))}
                {stories.length === 0 && (
                  <div style={{ color: t.textDisabled, fontSize: '14px', textAlign: 'center', padding: '40px', border: `1px dashed ${t.borderCard}`, borderRadius: '8px' }}>
                    No stories this week. Create one!
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Leave Alerts */}
          <div style={cardStyle}>
            <h2 style={{ color: t.textPrimary, margin: '0 0 16px', fontSize: '15px', fontWeight: '700', letterSpacing: '0.5px' }}>LEAVE ALERTS</h2>
            {alerts.length === 0 ? (
              <div style={{ color: t.textMuted, fontSize: '13px', padding: '24px', textAlign: 'center', border: `1px solid ${t.borderCard}`, borderRadius: '8px' }}>
                No pending alerts
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {alerts.map(alert => (
                  <div key={alert.id} style={{ padding: '14px', borderRadius: '8px', border: `1px solid ${t.warningBorder}`, background: t.warningBg }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ color: t.textPrimary, fontSize: '14px', fontWeight: '600' }}>{alert.reporter_name}</span>
                      <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', background: t.dangerBg, color: t.danger, border: `1px solid ${t.dangerBorder}` }}>
                        {alert.leave_type?.toUpperCase()}
                      </span>
                    </div>
                    <div style={{ color: t.textSecondary, fontSize: '13px', marginBottom: '4px', fontWeight: '500' }}>{alert.leave_date}</div>
                    {alert.notes && (
                      <div style={{ color: t.textMuted, fontSize: '12px', marginBottom: '10px', fontStyle: 'italic' }}>"{alert.notes}"</div>
                    )}
                    <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                      <button onClick={() => acknowledgeLeave(alert.id)} style={{ flex: 1, padding: '8px', background: t.successBg, border: `1px solid ${t.successBorder}`, borderRadius: '6px', color: t.success, fontSize: '11px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>APPROVE</button>
                      <button onClick={() => setRejectModal({ id: alert.id, reporterName: alert.reporter_name })} style={{ flex: 1, padding: '8px', background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, borderRadius: '6px', color: t.danger, fontSize: '11px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>REJECT</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Create Story Modal */}
      {showCreate && (
        <div role="dialog" aria-modal="true" aria-label="Create new story"
          style={{ position: 'fixed', inset: 0, background: t.overlayBg, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setShowCreate(false) }}>
          <div style={{ background: t.bgCard, border: `1px solid ${t.borderCard}`, borderRadius: '12px', width: '100%', maxWidth: '500px', margin: '24px', padding: '28px', fontFamily: 'inherit', maxHeight: '90vh', overflowY: 'auto', boxShadow: t.shadow }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px', alignItems: 'center' }}>
              <h2 style={{ color: t.textPrimary, margin: 0, fontSize: '18px', fontWeight: '700' }}>New Story</h2>
              <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', color: t.textMuted, fontSize: '22px', cursor: 'pointer', lineHeight: 1 }} aria-label="Close">x</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ color: t.textSecondary, fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '6px' }}>HEADLINE</label>
                <input value={form.headline} onChange={e => setForm(p => ({ ...p, headline: e.target.value }))} placeholder="Story headline..." style={inputStyle} />
              </div>
              <div>
                <label style={{ color: t.textSecondary, fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '6px' }}>DEADLINE <span style={{ color: t.textMuted, fontWeight: '400' }}>({weekStart} to {weekEnd})</span></label>
                <input type="date" value={form.deadline} min={weekStart} max={weekEnd} onChange={e => setForm(p => ({ ...p, deadline: e.target.value }))} style={{ ...inputStyle, colorScheme: 'dark' }} />
              </div>
              <div>
                <label style={{ color: t.textSecondary, fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '6px' }}>DESCRIPTION</label>
                <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Optional details..." rows={3} style={{ ...inputStyle, resize: 'none' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ color: t.textSecondary, fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '6px' }}>CATEGORY</label>
                  <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} style={{ ...inputStyle, background: t.bgCard }}>
                    {BEATS.map(b => <option key={b}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ color: t.textSecondary, fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '6px' }}>URGENCY</label>
                  <select value={form.urgency} onChange={e => setForm(p => ({ ...p, urgency: e.target.value }))} style={{ ...inputStyle, background: t.bgCard }}>
                    {['breaking','high','normal','low'].map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ color: t.textSecondary, fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '6px' }}>COMPLEXITY (1-5)</label>
                  <input type="number" min={1} max={5} value={form.complexity} onChange={e => setForm(p => ({ ...p, complexity: +e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={{ color: t.textSecondary, fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '6px' }}>PRIORITY (1-5)</label>
                  <input type="number" min={1} max={5} value={form.priority} onChange={e => setForm(p => ({ ...p, priority: +e.target.value }))} style={inputStyle} />
                </div>
              </div>
              <button onClick={createStory} style={{ padding: '14px', background: t.accent, border: 'none', borderRadius: '8px', color: t.accentText, fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', marginTop: '4px' }}>
                CREATE STORY
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Leave Modal */}
      {rejectModal && (
        <div role="dialog" aria-modal="true" aria-label="Reject leave request"
          style={{ position: 'fixed', inset: 0, background: t.overlayBg, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) { setRejectModal(null); setRejectReason('') } }}>
          <div style={{ background: t.bgCard, border: `1px solid ${t.dangerBorder}`, borderRadius: '12px', width: '100%', maxWidth: '420px', margin: '24px', padding: '28px', fontFamily: 'inherit', boxShadow: t.shadow }}>
            <h2 style={{ color: t.textPrimary, margin: '0 0 8px', fontSize: '18px', fontWeight: '700' }}>Reject Leave Request</h2>
            <p style={{ color: t.textMuted, fontSize: '13px', margin: '0 0 20px' }}>
              Rejecting leave for <span style={{ color: t.textPrimary, fontWeight: '600' }}>{rejectModal.reporterName}</span>
            </p>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ color: t.textSecondary, fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '6px' }}>REASON FOR REJECTION</label>
              <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3} placeholder="Explain why the leave is rejected..."
                style={{ width: '100%', padding: '10px 14px', background: t.bgInput, border: `1px solid ${t.borderInput}`, borderRadius: '8px', color: t.textPrimary, fontSize: '13px', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'none' }} />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => { setRejectModal(null); setRejectReason('') }} style={{ flex: 1, padding: '12px', background: 'transparent', border: `1px solid ${t.borderCard}`, borderRadius: '8px', color: t.textMuted, fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>CANCEL</button>
              <button onClick={() => rejectLeave(rejectModal.id)} disabled={!rejectReason.trim()} style={{ flex: 1, padding: '12px', background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, borderRadius: '8px', color: t.danger, fontSize: '13px', fontWeight: '700', cursor: rejectReason.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: rejectReason.trim() ? 1 : 0.5 }}>
                CONFIRM REJECT
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Override Detail Modal */}
      {overrideDetailModal && (
        <div role="dialog" aria-modal="true"
          style={{ position: 'fixed', inset: 0, background: t.overlayBg, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setOverrideDetailModal(null) }}>
          <div style={{ background: t.bgCard, border: `1px solid ${overrideDetailModal.override_status === 'accepted' ? t.successBorder : t.dangerBorder}`, borderRadius: '12px', width: '100%', maxWidth: '460px', margin: '24px', padding: '28px', fontFamily: 'inherit', boxShadow: t.shadow }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h2 style={{ color: t.textPrimary, margin: 0, fontSize: '18px', fontWeight: '700' }}>Override Details</h2>
              <button onClick={() => setOverrideDetailModal(null)} style={{ background: 'none', border: 'none', color: t.textMuted, fontSize: '22px', cursor: 'pointer' }} aria-label="Close">x</button>
            </div>
            <span style={{ padding: '4px 12px', borderRadius: '4px', fontSize: '11px', fontWeight: '700', background: overrideDetailModal.override_status === 'accepted' ? t.successBg : t.dangerBg, color: overrideDetailModal.override_status === 'accepted' ? t.success : t.danger, border: `1px solid ${overrideDetailModal.override_status === 'accepted' ? t.successBorder : t.dangerBorder}` }}>
              REPORTER {overrideDetailModal.override_status?.toUpperCase()}
            </span>
            <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ padding: '12px 14px', background: t.bgPage, border: `1px solid ${t.borderCard}`, borderRadius: '8px' }}>
                <p style={{ color: t.textMuted, fontSize: '11px', fontWeight: '600', margin: '0 0 4px' }}>STORY</p>
                <p style={{ color: t.textPrimary, fontSize: '14px', fontWeight: '600', margin: '0 0 2px' }}>{overrideDetailModal.story_headline}</p>
                <p style={{ color: t.textMuted, fontSize: '12px', margin: 0 }}>{overrideDetailModal.story_category} · Due {overrideDetailModal.story_deadline}</p>
              </div>
              <div style={{ padding: '12px 14px', background: t.warningBg, border: `1px solid ${t.warningBorder}`, borderRadius: '8px' }}>
                <p style={{ color: t.textMuted, fontSize: '11px', fontWeight: '600', margin: '0 0 4px' }}>YOUR OVERRIDE REASON</p>
                <p style={{ color: t.warning, fontSize: '13px', margin: 0 }}>{overrideDetailModal.override_reason}</p>
              </div>
              <div style={{ padding: '12px 14px', background: overrideDetailModal.override_status === 'accepted' ? t.successBg : t.dangerBg, border: `1px solid ${overrideDetailModal.override_status === 'accepted' ? t.successBorder : t.dangerBorder}`, borderRadius: '8px' }}>
                <p style={{ color: t.textMuted, fontSize: '11px', fontWeight: '600', margin: '0 0 4px' }}>REPORTER RESPONSE</p>
                <p style={{ color: overrideDetailModal.override_status === 'accepted' ? t.success : t.danger, fontSize: '14px', fontWeight: '700', margin: '0 0 4px' }}>{overrideDetailModal.override_status?.toUpperCase()}</p>
                <p style={{ color: t.textSecondary, fontSize: '13px', margin: 0 }}>"{overrideDetailModal.override_response}"</p>
                {overrideDetailModal.override_responded_at && <p style={{ color: t.textMuted, fontSize: '11px', margin: '6px 0 0' }}>{new Date(overrideDetailModal.override_responded_at).toLocaleString()}</p>}
              </div>
            </div>
            <button onClick={() => setOverrideDetailModal(null)} style={{ width: '100%', padding: '12px', background: 'transparent', border: `1px solid ${t.borderCard}`, borderRadius: '8px', color: t.textMuted, fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', marginTop: '16px' }}>CLOSE</button>
          </div>
        </div>
      )}

      {/* Filing Reject Modal */}
      {filingRejectModal && (
        <div role="dialog" aria-modal="true"
          style={{ position: 'fixed', inset: 0, background: t.overlayBg, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) { setFilingRejectModal(null); setFilingRejectNote('') } }}>
          <div style={{ background: t.bgCard, border: `1px solid ${t.dangerBorder}`, borderRadius: '12px', width: '100%', maxWidth: '420px', margin: '24px', padding: '28px', fontFamily: 'inherit', boxShadow: t.shadow }}>
            <h2 style={{ color: t.textPrimary, margin: '0 0 8px', fontSize: '18px', fontWeight: '700' }}>Reject Filing Request</h2>
            <p style={{ color: t.textMuted, fontSize: '13px', margin: '0 0 16px' }}>
              Rejecting request from <span style={{ color: t.textPrimary, fontWeight: '600' }}>{filingRejectModal.reporter_name}</span> for <span style={{ color: t.textPrimary }}>{filingRejectModal.requested_date}</span>
            </p>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ color: t.textSecondary, fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '6px' }}>REASON (optional)</label>
              <textarea value={filingRejectNote} onChange={e => setFilingRejectNote(e.target.value)} rows={3} placeholder="Why are you rejecting..."
                style={{ width: '100%', padding: '10px 14px', background: t.bgInput, border: `1px solid ${t.borderInput}`, borderRadius: '8px', color: t.textPrimary, fontSize: '13px', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'none' }} />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => { setFilingRejectModal(null); setFilingRejectNote('') }} style={{ flex: 1, padding: '12px', background: 'transparent', border: `1px solid ${t.borderCard}`, borderRadius: '8px', color: t.textMuted, fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>CANCEL</button>
              <button onClick={rejectFilingRequest} style={{ flex: 1, padding: '12px', background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, borderRadius: '8px', color: t.danger, fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>CONFIRM REJECT</button>
            </div>
          </div>
        </div>
      )}

      {assignStory && <AssignModal story={assignStory} onClose={() => setAssignStory(null)} onAssigned={load} />}
    </div>
  )
}