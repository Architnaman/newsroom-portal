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
  const [loading, setLoading] = useState(false)
  const [assigning, setAssigning] = useState<string | null>(null)
  const [fetched, setFetched] = useState(false)
  const [error, setError] = useState('')

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
      if (Array.isArray(data)) { setSuggestions(data); setFetched(true) }
      else setError('No eligible reporters found')
    } catch { setError('Failed to fetch suggestions') }
    setLoading(false)
  }

  async function assign(reporterIdToAssign: string) {
    setAssigning(reporterIdToAssign)
    await supabase.from('assignments').update({ is_active: false }).eq('story_id', story.id).eq('is_active', true)
    await supabase.from('assignments').insert({
      story_id: story.id, reporter_id: reporterIdToAssign,
      assigned_by: reporterId, is_active: true
    })
    await supabase.from('stories').update({ status: 'assigned' }).eq('id', story.id)
    setAssigning(null); onAssigned(); onClose()
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
        margin: '24px', maxHeight: '80vh', overflow: 'auto'
      }}>
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
            }}>×</button>
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
              <p style={{ color: '#555', fontSize: '11px', letterSpacing: '1px', marginBottom: '16px' }}>
                TOP MATCHES — CLICK TO ASSIGN
              </p>
              {suggestions.length === 0 ? (
                <p style={{ color: '#666', fontSize: '13px', textAlign: 'center', padding: '20px' }}>
                  No eligible reporters available
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {suggestions.map((s, i) => (
                    <div key={s.reporter_id} style={{
                      padding: '16px', borderRadius: '6px',
                      border: `1px solid ${i === 0 ? 'rgba(255,180,0,0.3)' : 'rgba(255,255,255,0.07)'}`,
                      background: i === 0 ? 'rgba(255,180,0,0.05)' : 'rgba(255,255,255,0.02)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {i === 0 && <span style={{ color: '#ffb400', fontSize: '10px', letterSpacing: '1px' }}>★ BEST</span>}
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
                              }}/>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}