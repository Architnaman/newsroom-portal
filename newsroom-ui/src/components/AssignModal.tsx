import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

interface Suggestion {
  reporter_id: string; name: string; email: string
  score: number; beat_match: number; availability: number
  headroom: number; active_stories: number
}

interface Props {
  story: { id: string; headline: string; urgency: string }
  onClose: () => void
  onAssigned: () => void
}

export default function AssignModal({ story, onClose, onAssigned }: Props) {
  const { reporterId } = useAuth()
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [allReporters, setAllReporters] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [assigning, setAssigning] = useState<string | null>(null)
  const [fetched, setFetched] = useState(false)
  const [error, setError] = useState('')
  const [overrideModal, setOverrideModal] = useState<any>(null)
  const [overrideReason, setOverrideReason] = useState('')
  const [overrideLoading, setOverrideLoading] = useState(false)
  const [showAllReporters, setShowAllReporters] = useState(false)

  async function fetchSuggestions() {
    setLoading(true); setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/score-reporters`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ story_id: story.id })
      })
      const data = await res.json()
      if (Array.isArray(data)) {
        setSuggestions(data)
        setFetched(true)
      } else {
        setError('No eligible reporters found')
        setFetched(true)
      }

      // Also fetch all active reporters for override option
      const { data: reporters } = await supabase
        .from('reporters')
        .select('id, name, email, beats, complexity_level')
        .eq('status', 'active')
      setAllReporters(reporters || [])

    } catch { setError('Failed to fetch suggestions') }
    setLoading(false)
  }

  async function assign(reporterIdToAssign: string) {
    setAssigning(reporterIdToAssign)
    await supabase.from('assignments').update({ is_active: false }).eq('story_id', story.id).eq('is_active', true)
    await supabase.from('assignments').insert({
      story_id: story.id,
      reporter_id: reporterIdToAssign,
      assigned_by: reporterId,
      is_active: true,
      is_override: false
    })
    await supabase.from('stories').update({ status: 'assigned' }).eq('id', story.id)
    setAssigning(null); onAssigned(); onClose()
  }

  async function overrideAssign() {
    if (!overrideModal || !overrideReason.trim()) return
    setOverrideLoading(true)
    await supabase.from('assignments').update({ is_active: false }).eq('story_id', story.id).eq('is_active', true)
    await supabase.from('assignments').insert({
      story_id: story.id,
      reporter_id: overrideModal.id,
      assigned_by: reporterId,
      is_active: true,
      is_override: true,
      override_reason: overrideReason,
      override_status: 'pending'
    })
    await supabase.from('stories').update({ status: 'assigned' }).eq('id', story.id)
    setOverrideLoading(false)
    setOverrideModal(null)
    setOverrideReason('')
    onAssigned()
    onClose()
  }

  const urgencyColor: Record<string, string> = {
    breaking: '#ff4444', high: '#ff8800', normal: '#ffb400', low: '#64c896'
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, fontFamily: '"DM Mono", "Courier New", monospace'
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: '#0d0d14', border: '1px solid rgba(255,180,0,0.2)',
        borderRadius: '8px', width: '100%', maxWidth: '560px',
        margin: '24px', maxHeight: '85vh', overflow: 'auto'
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <span style={{
                  padding: '2px 8px', borderRadius: '3px', fontSize: '10px', letterSpacing: '1px',
                  background: `${urgencyColor[story.urgency]}20`, color: urgencyColor[story.urgency]
                }}>{story.urgency.toUpperCase()}</span>
              </div>
              <h2 style={{ color: '#fff', margin: 0, fontSize: '16px', fontWeight: '600' }}>{story.headline}</h2>
            </div>
            <button onClick={onClose} style={{
              background: 'none', border: 'none', color: '#555',
              fontSize: '20px', cursor: 'pointer', padding: '0 4px', lineHeight: 1
            }}>x</button>
          </div>
        </div>

        <div style={{ padding: '24px' }}>
          {!fetched ? (
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: '#555', fontSize: '13px', marginBottom: '20px' }}>
                Run the scoring engine to get the best reporter matches
              </p>
              <button onClick={fetchSuggestions} disabled={loading} style={{
                padding: '12px 28px', background: '#ffb400', border: 'none',
                borderRadius: '6px', color: '#0a0a0f', fontSize: '12px',
                letterSpacing: '1px', fontWeight: '700', cursor: 'pointer',
                fontFamily: 'inherit', opacity: loading ? 0.6 : 1
              }}>
                {loading ? 'SCORING...' : 'SCORE REPORTERS'}
              </button>
              {error && <p style={{ color: '#ff6b6b', fontSize: '12px', marginTop: '12px' }}>{error}</p>}
            </div>
          ) : (
            <div>
              {/* Top Matches */}
              <p style={{ color: '#555', fontSize: '11px', letterSpacing: '1px', marginBottom: '16px' }}>
                TOP MATCHES - CLICK TO ASSIGN
              </p>
              {suggestions.length === 0 ? (
                <p style={{ color: '#666', fontSize: '13px', textAlign: 'center', padding: '20px' }}>
                  No eligible reporters available
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                  {suggestions.map((s, i) => (
                    <div key={s.reporter_id} style={{
                      padding: '16px', borderRadius: '6px',
                      border: `1px solid ${i === 0 ? 'rgba(255,180,0,0.3)' : 'rgba(255,255,255,0.07)'}`,
                      background: i === 0 ? 'rgba(255,180,0,0.05)' : 'rgba(255,255,255,0.02)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {i === 0 && <span style={{ color: '#ffb400', fontSize: '10px', letterSpacing: '1px' }}>BEST</span>}
                          <span style={{ color: '#fff', fontSize: '14px', fontWeight: '600' }}>{s.name}</span>
                          <span style={{ color: '#555', fontSize: '12px' }}>{s.active_stories} active</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ color: '#ffb400', fontSize: '18px', fontWeight: '700' }}>
                            {Math.round(s.score * 100)}
                          </span>
                          <button onClick={() => assign(s.reporter_id)} disabled={!!assigning} style={{
                            padding: '8px 18px',
                            background: i === 0 ? '#ffb400' : 'transparent',
                            border: `1px solid ${i === 0 ? '#ffb400' : 'rgba(255,255,255,0.15)'}`,
                            borderRadius: '4px',
                            color: i === 0 ? '#0a0a0f' : '#888',
                            fontSize: '11px', letterSpacing: '1px', cursor: 'pointer',
                            fontFamily: 'inherit', opacity: assigning ? 0.6 : 1
                          }}>
                            {assigning === s.reporter_id ? '...' : 'ASSIGN'}
                          </button>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                        {[
                          { label: 'Beat', value: s.beat_match },
                          { label: 'Avail', value: s.availability },
                          { label: 'Room', value: s.headroom }
                        ].map(m => (
                          <div key={m.label}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                              <span style={{ color: '#555', fontSize: '10px' }}>{m.label}</span>
                              <span style={{ color: '#888', fontSize: '10px' }}>{Math.round(m.value * 100)}%</span>
                            </div>
                            <div style={{ height: '3px', background: 'rgba(255,255,255,0.07)', borderRadius: '2px' }}>
                              <div style={{
                                height: '100%', borderRadius: '2px',
                                background: m.value > 0.7 ? '#64c896' : m.value > 0.4 ? '#ffb400' : '#ff6b6b',
                                width: `${m.value * 100}%`, transition: 'width 0.5s'
                              }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Override Section */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '16px' }}>
                <button
                  onClick={() => setShowAllReporters(!showAllReporters)}
                  style={{
                    width: '100%', padding: '10px',
                    background: 'rgba(255,68,68,0.06)',
                    border: '1px solid rgba(255,68,68,0.2)',
                    borderRadius: '6px', color: '#ff6b6b',
                    fontSize: '11px', letterSpacing: '1px',
                    cursor: 'pointer', fontFamily: 'inherit'
                  }}>
                  {showAllReporters ? 'HIDE' : 'OVERRIDE ASSIGN'} - ASSIGN TO UNAVAILABLE REPORTER
                </button>

                {showAllReporters && (
                  <div style={{ marginTop: '12px' }}>
                    <div style={{ padding: '10px 14px', background: 'rgba(255,68,68,0.06)', border: '1px solid rgba(255,68,68,0.15)', borderRadius: '5px', marginBottom: '12px' }}>
                      <p style={{ color: '#ff8888', fontSize: '11px', margin: 0 }}>
                        Override assign allows you to assign a story to a reporter who is currently unavailable or on leave. The reporter must accept or reject with a valid reason.
                      </p>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {allReporters
                        .filter(r => !suggestions.find(s => s.reporter_id === r.id))
                        .map(r => (
                          <div key={r.id} style={{
                            padding: '12px 16px', borderRadius: '6px',
                            border: '1px solid rgba(255,68,68,0.2)',
                            background: 'rgba(255,68,68,0.03)',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                          }}>
                            <div>
                              <div style={{ color: '#ddd', fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>{r.name}</div>
                              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                {r.beats.map((b: string) => (
                                  <span key={b} style={{ padding: '1px 6px', background: 'rgba(255,180,0,0.08)', borderRadius: '3px', color: '#ffb400', fontSize: '9px' }}>{b}</span>
                                ))}
                              </div>
                            </div>
                            <button
                              onClick={() => setOverrideModal(r)}
                              style={{
                                padding: '7px 14px',
                                background: 'rgba(255,68,68,0.1)',
                                border: '1px solid rgba(255,68,68,0.3)',
                                borderRadius: '4px', color: '#ff6b6b',
                                fontSize: '10px', letterSpacing: '1px',
                                cursor: 'pointer', fontFamily: 'inherit',
                                whiteSpace: 'nowrap', marginLeft: '12px'
                              }}>
                              OVERRIDE
                            </button>
                          </div>
                        ))}
                      {allReporters.filter(r => !suggestions.find(s => s.reporter_id === r.id)).length === 0 && (
                        <p style={{ color: '#555', fontSize: '12px', textAlign: 'center', padding: '12px' }}>
                          All reporters are already in the suggestions list
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Override Reason Modal */}
      {overrideModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000
        }} onClick={e => { if (e.target === e.currentTarget) { setOverrideModal(null); setOverrideReason('') } }}>
          <div style={{
            background: '#0d0d14', border: '1px solid rgba(255,68,68,0.3)',
            borderRadius: '8px', width: '100%', maxWidth: '440px',
            margin: '24px', padding: '24px',
            fontFamily: '"DM Mono", "Courier New", monospace'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <h2 style={{ color: '#fff', margin: 0, fontSize: '16px' }}>Override Assignment</h2>
              <button onClick={() => { setOverrideModal(null); setOverrideReason('') }}
                style={{ background: 'none', border: 'none', color: '#555', fontSize: '20px', cursor: 'pointer' }}>x</button>
            </div>

            <p style={{ color: '#555', fontSize: '12px', margin: '0 0 6px' }}>
              Story: <span style={{ color: '#ddd' }}>{story.headline}</span>
            </p>
            <p style={{ color: '#555', fontSize: '12px', margin: '0 0 16px' }}>
              Assigning to: <span style={{ color: '#ff6b6b' }}>{overrideModal.name}</span>
            </p>

            <div style={{ padding: '10px 14px', background: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.2)', borderRadius: '5px', marginBottom: '16px' }}>
              <p style={{ color: '#ff8800', fontSize: '11px', margin: 0 }}>
                This reporter is currently unavailable or on leave. They will be notified and must accept or reject this assignment with a valid reason.
              </p>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ color: '#888', fontSize: '11px', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>
                REASON FOR OVERRIDE <span style={{ color: '#ff6b6b' }}>*required</span>
              </label>
              <textarea
                value={overrideReason}
                onChange={e => setOverrideReason(e.target.value)}
                rows={3}
                placeholder="e.g. Urgent breaking news, no other reporters available for this beat..."
                style={{
                  width: '100%', padding: '10px 12px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '6px', color: '#fff', fontSize: '13px',
                  outline: 'none', boxSizing: 'border-box',
                  fontFamily: 'inherit', resize: 'none'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => { setOverrideModal(null); setOverrideReason('') }} style={{
                flex: 1, padding: '11px', background: 'transparent',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px',
                color: '#666', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit'
              }}>CANCEL</button>
              <button
                onClick={overrideAssign}
                disabled={!overrideReason.trim() || overrideLoading}
                style={{
                  flex: 1, padding: '11px',
                  background: overrideReason.trim() ? 'rgba(255,68,68,0.15)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${overrideReason.trim() ? 'rgba(255,68,68,0.4)' : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: '6px',
                  color: overrideReason.trim() ? '#ff6b6b' : '#444',
                  fontSize: '12px', fontWeight: '700',
                  cursor: overrideReason.trim() ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit',
                  opacity: overrideLoading ? 0.6 : overrideReason.trim() ? 1 : 0.5
                }}>
                {overrideLoading ? 'ASSIGNING...' : 'CONFIRM OVERRIDE'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}