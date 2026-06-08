import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useResponsive } from '../hooks/useResponsive'

interface Suggestion {
  reporter_id: string; name: string; email: string
  score: number; beat_match: number; availability: number
  headroom: number; active_stories: number
}

interface Props {
  story: { id: string; headline: string; urgency: string; deadline?: string }
  onClose: () => void
  onAssigned: () => void
}

export default function AssignModal({ story, onClose, onAssigned }: Props) {
  const { reporterId } = useAuth()
  const { t } = useTheme()
  const { isMobile, isTablet } = useResponsive()

  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [allReporters, setAllReporters] = useState<any[]>([])
  const [holidays, setHolidays] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [assigning, setAssigning] = useState<string | null>(null)
  const [fetched, setFetched] = useState(false)
  const [error, setError] = useState('')
  const [overrideModal, setOverrideModal] = useState<any>(null)
  const [overrideReason, setOverrideReason] = useState('')
  const [overrideLoading, setOverrideLoading] = useState(false)
  const [showAllReporters, setShowAllReporters] = useState(false)

  const urgencyColor: Record<string, string> = {
    breaking: t.breaking, high: t.warning, normal: t.accent, low: t.success
  }

  useEffect(() => {
    supabase.from('holidays').select('*').then(({ data }) => {
      setHolidays(data || [])
    })
  }, [])

  const deadlineIsHoliday = story.deadline
    ? holidays.some((h: any) => h.date.split('T')[0] === story.deadline)
    : false

  const holidayName = deadlineIsHoliday
    ? holidays.find((h: any) => h.date.split('T')[0] === story.deadline)?.name
    : ''

  async function fetchSuggestions() {
    setLoading(true); setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/score-reporters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ story_id: story.id })
      })
      const data = await res.json()
      if (Array.isArray(data)) {
        setSuggestions(data); setFetched(true)
      } else {
        setError('No eligible reporters found'); setFetched(true)
      }
      const { data: reporters } = await supabase.from('reporters').select('id, name, email, beats, complexity_level').eq('status', 'active')
      setAllReporters(reporters || [])
    } catch { setError('Failed to fetch suggestions') }
    setLoading(false)
  }

  async function assign(reporterIdToAssign: string) {
    setAssigning(reporterIdToAssign)
    await supabase.from('assignments').update({ is_active: false }).eq('story_id', story.id).eq('is_active', true)
    await supabase.from('assignments').insert({
      story_id: story.id, reporter_id: reporterIdToAssign,
      assigned_by: reporterId, is_active: true, is_override: false
    })
    await supabase.from('stories').update({ status: 'assigned' }).eq('id', story.id)
    setAssigning(null); onAssigned(); onClose()
  }

  async function overrideAssign() {
    if (!overrideModal || !overrideReason.trim()) return
    setOverrideLoading(true)
    await supabase.from('assignments').update({ is_active: false }).eq('story_id', story.id).eq('is_active', true)
    await supabase.from('assignments').insert({
      story_id: story.id, reporter_id: overrideModal.id,
      assigned_by: reporterId, is_active: true, is_override: true,
      override_reason: overrideReason, override_status: 'pending'
    })
    await supabase.from('stories').update({ status: 'assigned' }).eq('id', story.id)
    setOverrideLoading(false); setOverrideModal(null); setOverrideReason('')
    onAssigned(); onClose()
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px',
    background: t.bgInput, border: `1px solid ${t.borderInput}`,
    borderRadius: '8px', color: t.textPrimary,
    fontSize: isMobile ? '16px' : '13px',
    outline: 'none', boxSizing: 'border-box',
    fontFamily: 'inherit', resize: 'none' as const,
  }

  const getScoreBarColor = (value: number) =>
    value > 0.7 ? t.success : value > 0.4 ? t.warning : t.danger

  return (
    <div role="dialog" aria-modal="true" aria-label="Assign reporter to story"
      style={{ position: 'fixed', inset: 0, background: t.overlayBg, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', zIndex: 1000, fontFamily: '"Inter", "DM Mono", "Courier New", monospace' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>

      <div style={{ background: t.bgCard, border: `1px solid ${t.accentBorder}`, borderRadius: isMobile ? '14px 14px 0 0' : '12px', width: '100%', maxWidth: isMobile ? '100%' : '580px', margin: isMobile ? '0' : '24px', maxHeight: isMobile ? '90vh' : '88vh', overflow: 'auto', boxShadow: t.shadow }}>

        {/* Header */}
        <div style={{ padding: isMobile ? '16px' : '20px 24px', borderBottom: `1px solid ${t.borderCard}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
              <span style={{ padding: '3px 10px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', letterSpacing: '0.5px', background: `${urgencyColor[story.urgency]}20`, color: urgencyColor[story.urgency], border: `1px solid ${urgencyColor[story.urgency]}40` }}>
                {story.urgency.toUpperCase()}
              </span>
              {deadlineIsHoliday && (
                <span style={{ padding: '3px 10px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', background: t.dangerBg, color: t.danger, border: `1px solid ${t.dangerBorder}` }}>
                  ⚠ DEADLINE ON {holidayName?.toUpperCase()}
                </span>
              )}
            </div>
            <h2 style={{ color: t.textPrimary, margin: 0, fontSize: isMobile ? '15px' : '17px', fontWeight: '700', lineHeight: 1.3 }}>
              {story.headline}
            </h2>
          </div>
          <button onClick={onClose} aria-label="Close"
            style={{ background: 'none', border: 'none', color: t.textMuted, fontSize: '22px', cursor: 'pointer', padding: '0 4px', lineHeight: 1, marginLeft: '12px', minWidth: '44px', minHeight: '44px' }}>
            x
          </button>
        </div>

        <div style={{ padding: isMobile ? '16px' : '24px' }}>

          {/* Holiday Banner */}
          {deadlineIsHoliday && (
            <div style={{ padding: '14px 16px', background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, borderRadius: '8px', marginBottom: '20px' }}>
              <p style={{ color: t.danger, fontSize: '13px', fontWeight: '700', margin: '0 0 4px' }}>⚠ Public Holiday — Override Required</p>
              <p style={{ color: t.textMuted, fontSize: '12px', margin: 0, lineHeight: 1.5 }}>
                The story deadline falls on <strong>{holidayName}</strong> (public holiday). All assignments will use the override workflow. The reporter must accept or reject.
              </p>
            </div>
          )}

          {!fetched ? (
            <div style={{ textAlign: 'center', padding: isMobile ? '16px 0' : '20px 0' }}>
              <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: t.accentBg, border: `2px solid ${t.accentBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: '24px' }}>⚡</div>
              <p style={{ color: t.textSecondary, fontSize: '14px', marginBottom: '20px', lineHeight: 1.5 }}>
                Run the scoring engine to get the best reporter matches based on beat, availability, and workload.
              </p>
              <button onClick={fetchSuggestions} disabled={loading}
                style={{ padding: '13px 32px', background: loading ? t.textMuted : t.accent, border: 'none', borderRadius: '8px', color: t.accentText, fontSize: '13px', fontWeight: '700', letterSpacing: '0.5px', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: loading ? 0.7 : 1, transition: 'all 0.15s', minHeight: '48px', width: isMobile ? '100%' : 'auto' }}>
                {loading ? 'SCORING...' : 'SCORE REPORTERS'}
              </button>
              {error && (
                <p style={{ color: t.danger, fontSize: '13px', marginTop: '14px', padding: '10px 16px', background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, borderRadius: '8px' }}>{error}</p>
              )}
            </div>
          ) : (
            <div>

              {/* Normal suggestions */}
              {!deadlineIsHoliday && (
                <>
                  <p style={{ color: t.textMuted, fontSize: '11px', fontWeight: '700', letterSpacing: '1px', marginBottom: '16px' }}>
                    TOP MATCHES — CLICK TO ASSIGN
                  </p>
                  {suggestions.length === 0 ? (
                    <div style={{ color: t.textMuted, fontSize: '14px', textAlign: 'center', padding: '32px', border: `1px dashed ${t.borderCard}`, borderRadius: '8px', background: t.bgPage }}>
                      No eligible reporters available
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                      {suggestions.map((s, i) => (
                        <div key={s.reporter_id} style={{ padding: isMobile ? '14px' : '16px', borderRadius: '8px', border: `2px solid ${i === 0 ? t.accentBorder : t.borderCard}`, background: i === 0 ? t.accentBg : t.bgPage, transition: 'all 0.15s' }}>

                          {/* Reporter header — stack on mobile */}
                          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: '12px', gap: isMobile ? '10px' : '0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                              {i === 0 && (
                                <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', background: t.accentBg, color: t.accent, border: `1px solid ${t.accentBorder}` }}>BEST</span>
                              )}
                              <span style={{ color: t.textPrimary, fontSize: isMobile ? '14px' : '15px', fontWeight: '700' }}>{s.name}</span>
                              <span style={{ color: t.textMuted, fontSize: '12px', padding: '2px 8px', background: t.bgInput, borderRadius: '4px', border: `1px solid ${t.borderCard}` }}>{s.active_stories} active</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: isMobile ? '100%' : 'auto', justifyContent: isMobile ? 'space-between' : 'flex-end' }}>
                              <span style={{ color: t.accent, fontSize: '22px', fontWeight: '800', minWidth: '40px', textAlign: 'right' as const }}>
                                {Math.round(s.score * 100)}
                              </span>
                              <button onClick={() => assign(s.reporter_id)} disabled={!!assigning}
                                style={{ padding: '9px 20px', background: i === 0 ? t.accent : 'transparent', border: `2px solid ${i === 0 ? t.accent : t.borderCard}`, borderRadius: '6px', color: i === 0 ? t.accentText : t.textSecondary, fontSize: '12px', fontWeight: '700', letterSpacing: '0.5px', cursor: 'pointer', fontFamily: 'inherit', opacity: assigning ? 0.6 : 1, transition: 'all 0.15s', flex: isMobile ? 1 : 'none', minHeight: '44px' }}>
                                {assigning === s.reporter_id ? '...' : 'ASSIGN'}
                              </button>
                            </div>
                          </div>

                          {/* Score bars — 1 col on mobile, 3 col on desktop */}
                          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: isMobile ? '8px' : '10px' }}>
                            {[
                              { label: 'Beat Match', value: s.beat_match },
                              { label: 'Availability', value: s.availability },
                              { label: 'Headroom', value: s.headroom }
                            ].map(m => (
                              <div key={m.label}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                  <span style={{ color: t.textMuted, fontSize: '11px', fontWeight: '500' }}>{m.label}</span>
                                  <span style={{ color: getScoreBarColor(m.value), fontSize: '11px', fontWeight: '700' }}>{Math.round(m.value * 100)}%</span>
                                </div>
                                <div style={{ height: '5px', background: t.bgPage, borderRadius: '3px', border: `1px solid ${t.borderCard}`, overflow: 'hidden' }}>
                                  <div style={{ height: '100%', borderRadius: '3px', background: getScoreBarColor(m.value), width: `${m.value * 100}%`, transition: 'width 0.5s' }} />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Override Section */}
              <div style={{ borderTop: deadlineIsHoliday ? 'none' : `1px solid ${t.borderCard}`, paddingTop: deadlineIsHoliday ? '0' : '16px' }}>
                {deadlineIsHoliday ? (
                  <div>
                    <p style={{ color: t.danger, fontSize: '11px', fontWeight: '700', letterSpacing: '1px', marginBottom: '14px' }}>
                      SELECT REPORTER — ALL ASSIGNMENTS REQUIRE OVERRIDE ON HOLIDAY
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {allReporters.map(r => (
                        <div key={r.id} style={{ padding: isMobile ? '12px' : '14px 16px', borderRadius: '8px', border: `1px solid ${t.dangerBorder}`, background: t.bgPage, display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', gap: isMobile ? '10px' : '0' }}>
                          <div>
                            <div style={{ color: t.textPrimary, fontSize: '14px', fontWeight: '700', marginBottom: '6px' }}>{r.name}</div>
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                              {r.beats.map((b: string) => (
                                <span key={b} style={{ padding: '2px 8px', background: t.accentBg, border: `1px solid ${t.accentBorder}`, borderRadius: '4px', color: t.accent, fontSize: '10px', fontWeight: '600' }}>{b}</span>
                              ))}
                            </div>
                          </div>
                          <button onClick={() => setOverrideModal(r)}
                            style={{ padding: '8px 16px', background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, borderRadius: '6px', color: t.danger, fontSize: '11px', fontWeight: '700', letterSpacing: '0.5px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', marginLeft: isMobile ? '0' : '12px', width: isMobile ? '100%' : 'auto', minHeight: '44px' }}>
                            OVERRIDE
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    <button onClick={() => setShowAllReporters(!showAllReporters)}
                      style={{ width: '100%', padding: '11px', background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, borderRadius: '8px', color: t.danger, fontSize: '12px', fontWeight: '700', letterSpacing: '0.5px', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', minHeight: '44px' }}>
                      {showAllReporters ? 'HIDE' : 'OVERRIDE ASSIGN'} — ASSIGN TO UNAVAILABLE REPORTER
                    </button>
                    {showAllReporters && (
                      <div style={{ marginTop: '14px' }}>
                        <div style={{ padding: '12px 16px', background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, borderRadius: '8px', marginBottom: '12px' }}>
                          <p style={{ color: t.danger, fontSize: '12px', fontWeight: '500', margin: 0, lineHeight: 1.5 }}>
                            Override assign allows you to assign a story to a reporter who is currently unavailable or on leave. The reporter must accept or reject with a valid reason.
                          </p>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {allReporters.filter(r => !suggestions.find(s => s.reporter_id === r.id)).map(r => (
                            <div key={r.id} style={{ padding: isMobile ? '12px' : '14px 16px', borderRadius: '8px', border: `1px solid ${t.dangerBorder}`, background: t.bgPage, display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', gap: isMobile ? '10px' : '0' }}>
                              <div>
                                <div style={{ color: t.textPrimary, fontSize: '14px', fontWeight: '700', marginBottom: '6px' }}>{r.name}</div>
                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                  {r.beats.map((b: string) => (
                                    <span key={b} style={{ padding: '2px 8px', background: t.accentBg, border: `1px solid ${t.accentBorder}`, borderRadius: '4px', color: t.accent, fontSize: '10px', fontWeight: '600' }}>{b}</span>
                                  ))}
                                </div>
                              </div>
                              <button onClick={() => setOverrideModal(r)}
                                style={{ padding: '8px 16px', background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, borderRadius: '6px', color: t.danger, fontSize: '11px', fontWeight: '700', letterSpacing: '0.5px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', marginLeft: isMobile ? '0' : '12px', width: isMobile ? '100%' : 'auto', minHeight: '44px' }}>
                                OVERRIDE
                              </button>
                            </div>
                          ))}
                          {allReporters.filter(r => !suggestions.find(s => s.reporter_id === r.id)).length === 0 && (
                            <p style={{ color: t.textMuted, fontSize: '13px', textAlign: 'center', padding: '16px', background: t.bgPage, borderRadius: '8px', border: `1px solid ${t.borderCard}` }}>
                              All reporters are already in the suggestions list
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Override Reason Modal */}
      {overrideModal && (
        <div role="dialog" aria-modal="true" aria-label="Override assignment reason"
          style={{ position: 'fixed', inset: 0, background: t.overlayBg, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', zIndex: 2000 }}
          onClick={e => { if (e.target === e.currentTarget) { setOverrideModal(null); setOverrideReason('') } }}>
          <div style={{ background: t.bgCard, border: `1px solid ${t.dangerBorder}`, borderRadius: isMobile ? '14px 14px 0 0' : '12px', width: '100%', maxWidth: isMobile ? '100%' : '460px', margin: isMobile ? '0' : '24px', padding: isMobile ? '20px 16px' : '28px', fontFamily: 'inherit', boxShadow: t.shadow }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'center' }}>
              <h2 style={{ color: t.textPrimary, margin: 0, fontSize: isMobile ? '16px' : '18px', fontWeight: '700' }}>Override Assignment</h2>
              <button onClick={() => { setOverrideModal(null); setOverrideReason('') }}
                style={{ background: 'none', border: 'none', color: t.textMuted, fontSize: '22px', cursor: 'pointer', minWidth: '44px', minHeight: '44px' }}>x</button>
            </div>

            <p style={{ color: t.textMuted, fontSize: '13px', margin: '0 0 4px' }}>
              Story: <span style={{ color: t.textPrimary, fontWeight: '600' }}>{story.headline}</span>
            </p>
            <p style={{ color: t.textMuted, fontSize: '13px', margin: '0 0 16px' }}>
              Assigning to: <span style={{ color: t.danger, fontWeight: '600' }}>{overrideModal.name}</span>
            </p>

            {deadlineIsHoliday && (
              <div style={{ padding: '10px 14px', background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, borderRadius: '8px', marginBottom: '12px' }}>
                <p style={{ color: t.danger, fontSize: '12px', fontWeight: '700', margin: '0 0 2px' }}>⚠ Public Holiday: {holidayName}</p>
                <p style={{ color: t.textMuted, fontSize: '12px', margin: 0 }}>Deadline falls on a public holiday. Reporter will be notified.</p>
              </div>
            )}

            <div style={{ padding: '12px 16px', background: t.warningBg, border: `1px solid ${t.warningBorder}`, borderRadius: '8px', marginBottom: '16px' }}>
              <p style={{ color: t.warning, fontSize: '12px', fontWeight: '500', margin: 0, lineHeight: 1.5 }}>
                {deadlineIsHoliday
                  ? 'This assignment is on a public holiday. Reporter must accept or reject with a valid reason.'
                  : 'This reporter is currently unavailable or on leave. They will be notified and must accept or reject this assignment with a valid reason.'}
              </p>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ color: t.textSecondary, fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '6px' }}>
                REASON FOR OVERRIDE <span style={{ color: t.danger }}>*required</span>
              </label>
              <textarea value={overrideReason} onChange={e => setOverrideReason(e.target.value)} rows={3}
                placeholder={deadlineIsHoliday ? 'e.g. Breaking news requires coverage on this holiday...' : 'e.g. Urgent breaking news, no other reporters available for this beat...'}
                style={inputStyle} />
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => { setOverrideModal(null); setOverrideReason('') }}
                style={{ flex: 1, padding: '12px', background: 'transparent', border: `1px solid ${t.borderCard}`, borderRadius: '8px', color: t.textMuted, fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', minHeight: '48px' }}>
                CANCEL
              </button>
              <button onClick={overrideAssign} disabled={!overrideReason.trim() || overrideLoading}
                style={{ flex: 1, padding: '12px', background: overrideReason.trim() ? t.dangerBg : t.bgInput, border: `1px solid ${overrideReason.trim() ? t.dangerBorder : t.borderCard}`, borderRadius: '8px', color: overrideReason.trim() ? t.danger : t.textDisabled, fontSize: '13px', fontWeight: '700', cursor: overrideReason.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: overrideLoading ? 0.6 : overrideReason.trim() ? 1 : 0.5, minHeight: '48px' }}>
                {overrideLoading ? 'ASSIGNING...' : 'CONFIRM OVERRIDE'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}