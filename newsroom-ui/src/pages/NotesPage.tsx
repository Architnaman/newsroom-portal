import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'
import { useTheme } from '../context/ThemeContext'
import { useResponsive } from '../hooks/useResponsive'
import { useDateFormat } from '../context/DateFormatContext'

export default function NotesPage() {
  const { t } = useTheme()
  const { reporterId, role } = useAuth()
  const { isMobile } = useResponsive()
  const { formatDate } = useDateFormat()

  const [stories, setStories] = useState<any[]>([])
  const [selectedStory, setSelectedStory] = useState<any>(null)
  const [notes, setNotes] = useState<any[]>([])
  const [reporters, setReporters] = useState<Record<string, string>>({})
  const [newNote, setNewNote] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  async function loadStories() {
    const { data } = await supabase
      .from('stories')
      .select('*')
      .in('status', ['assigned', 'in_progress'])
      .order('created_at', { ascending: false })
    setStories(data || [])
    setLoading(false)
  }

  async function loadReporters() {
    const { data } = await supabase.from('reporters').select('id, name')
    const map: Record<string, string> = {}
    ;(data || []).forEach((r: any) => { map[r.id] = r.name })
    setReporters(map)
  }

  async function loadNotes(storyId: string) {
    const { data } = await supabase
      .from('reporter_notes')
      .select('*')
      .eq('story_id', storyId)
      .order('created_at', { ascending: false })
    setNotes(data || [])
  }

  useEffect(() => { loadStories(); loadReporters() }, [])
  useEffect(() => { if (selectedStory) loadNotes(selectedStory.id) }, [selectedStory])

  async function submitNote() {
    if (!newNote.trim() || !selectedStory || !reporterId) return
    setSaving(true)
    await supabase.from('reporter_notes').insert({
      story_id: selectedStory.id,
      reporter_id: reporterId,
      note_text: newNote.trim()
    })
    setNewNote('')
    await loadNotes(selectedStory.id)
    setSaving(false)
  }

  async function saveEdit(id: string) {
    if (!editText.trim()) return
    await supabase.from('reporter_notes')
      .update({ note_text: editText.trim(), updated_at: new Date().toISOString() })
      .eq('id', id)
    setEditingId(null)
    setEditText('')
    if (selectedStory) await loadNotes(selectedStory.id)
  }

  async function deleteNote(id: string) {
    await supabase.from('reporter_notes').delete().eq('id', id)
    if (selectedStory) await loadNotes(selectedStory.id)
  }

  const urgencyColor: Record<string, string> = {
    breaking: t.breaking, high: t.warning, normal: t.accent, low: t.success
  }

  const filteredStories = stories.filter(s =>
    s.headline?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.category?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div style={{ minHeight: '100vh', background: t.bgPage, fontFamily: '"Inter", "DM Mono", "Courier New", monospace', color: t.textPrimary }}>
      <Navbar />
      <div style={{ display: 'flex', height: 'calc(100vh - 64px)', maxWidth: '1400px', margin: '0 auto', gap: '0' }}>

        {/* ── STORY LIST SIDEBAR ── */}
        <div style={{ width: isMobile ? '100%' : '340px', flexShrink: 0, borderRight: `1px solid ${t.borderCard}`, background: t.bgCard, display: 'flex', flexDirection: 'column', overflow: 'hidden', display: selectedStory && isMobile ? 'none' : 'flex' }}>
          <div style={{ padding: '16px', borderBottom: `1px solid ${t.borderCard}` }}>
            <h1 style={{ margin: '0 0 4px', fontSize: '18px', fontWeight: '700', color: t.textPrimary }}>Reporter Notes</h1>
            <p style={{ margin: '0 0 12px', fontSize: '12px', color: t.textMuted }}>Active stories — select to view and add notes</p>
            <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search stories..."
              style={{ width: '100%', padding: '8px 12px', background: t.bgInput, border: `1px solid ${t.borderInput}`, borderRadius: '6px', color: t.textPrimary, fontSize: '13px', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            {loading ? (
              <p style={{ color: t.textMuted, textAlign: 'center', padding: '40px 16px', fontSize: '13px' }}>Loading stories...</p>
            ) : filteredStories.length === 0 ? (
              <p style={{ color: t.textDisabled, textAlign: 'center', padding: '40px 16px', fontSize: '13px' }}>No active stories found</p>
            ) : filteredStories.map(story => (
              <div key={story.id} onClick={() => setSelectedStory(story)}
                style={{ padding: '12px', borderRadius: '8px', cursor: 'pointer', marginBottom: '4px', background: selectedStory?.id === story.id ? t.accentBg : 'transparent', border: selectedStory?.id === story.id ? `1px solid ${t.accentBorder}` : '1px solid transparent', transition: 'all 0.15s' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', flexWrap: 'wrap' }}>
                  <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: '700', background: `${urgencyColor[story.urgency]}20`, color: urgencyColor[story.urgency], border: `1px solid ${urgencyColor[story.urgency]}40` }}>{story.urgency?.toUpperCase()}</span>
                  <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: '600', background: t.bgPage, color: t.textMuted, border: `1px solid ${t.borderCard}` }}>{story.status?.replace('_', ' ').toUpperCase()}</span>
                </div>
                <p style={{ margin: '0 0 4px', fontSize: '13px', fontWeight: '600', color: selectedStory?.id === story.id ? t.accent : t.textPrimary, lineHeight: 1.3 }}>{story.headline}</p>
                <p style={{ margin: 0, fontSize: '11px', color: t.textMuted }}>{story.category} · Due {formatDate(story.deadline)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── NOTES PANEL ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, display: !selectedStory && isMobile ? 'none' : 'flex' }}>
          {!selectedStory ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px', color: t.textDisabled }}>
              <div style={{ fontSize: '48px' }}>📝</div>
              <p style={{ fontSize: '14px', margin: 0 }}>Select a story to view and add notes</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${t.borderCard}`, background: t.bgCard, display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                {isMobile && (
                  <button onClick={() => setSelectedStory(null)} style={{ background: 'none', border: 'none', color: t.textSecondary, fontSize: '20px', cursor: 'pointer', padding: '0', marginTop: '2px' }}>‹</button>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                    <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: '700', background: `${urgencyColor[selectedStory.urgency]}20`, color: urgencyColor[selectedStory.urgency], border: `1px solid ${urgencyColor[selectedStory.urgency]}40` }}>{selectedStory.urgency?.toUpperCase()}</span>
                    <span style={{ color: t.textMuted, fontSize: '11px' }}>{selectedStory.category}</span>
                    <span style={{ color: t.textMuted, fontSize: '11px' }}>· Due {formatDate(selectedStory.deadline)}</span>
                  </div>
                  <h2 style={{ margin: 0, fontSize: isMobile ? '14px' : '16px', fontWeight: '700', color: t.textPrimary, lineHeight: 1.3 }}>{selectedStory.headline}</h2>
                </div>
                <div style={{ padding: '4px 10px', background: t.accentBg, border: `1px solid ${t.accentBorder}`, borderRadius: '6px', flexShrink: 0 }}>
                  <span style={{ color: t.accent, fontSize: '11px', fontWeight: '700' }}>{notes.length} NOTE{notes.length !== 1 ? 'S' : ''}</span>
                </div>
              </div>

              {/* Notes list */}
              <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '12px' : '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {notes.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '48px 20px', color: t.textDisabled }}>
                    <div style={{ fontSize: '36px', marginBottom: '10px' }}>📝</div>
                    <p style={{ fontSize: '13px', margin: 0 }}>No notes yet — be the first to add one</p>
                  </div>
                ) : notes.map(note => {
                  const isOwn = note.reporter_id === reporterId
                  const authorName = reporters[note.reporter_id] || 'Unknown'
                  const edited = note.updated_at && note.updated_at !== note.created_at
                  return (
                    <div key={note.id} style={{ padding: '14px 16px', borderRadius: '10px', border: `1px solid ${isOwn ? t.accentBorder : t.borderCard}`, background: isOwn ? t.accentBg : t.bgCard }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: isOwn ? t.accent : t.bgInput, border: `1px solid ${isOwn ? t.accentBorder : t.borderCard}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', color: isOwn ? t.accentText : t.textSecondary, flexShrink: 0 }}>
                            {authorName.charAt(0)}
                          </div>
                          <div>
                            <p style={{ margin: 0, fontSize: '12px', fontWeight: '700', color: isOwn ? t.accent : t.textPrimary }}>{authorName} {isOwn && <span style={{ fontWeight: '400', color: t.textMuted }}>(you)</span>}</p>
                            <p style={{ margin: 0, fontSize: '10px', color: t.textMuted }}>
                              {new Date(note.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                              {edited && ' · edited'}
                            </p>
                          </div>
                        </div>
                        {isOwn && editingId !== note.id && (
                          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                            <button onClick={() => { setEditingId(note.id); setEditText(note.note_text) }}
                              style={{ padding: '4px 10px', background: t.accentBg, border: `1px solid ${t.accentBorder}`, borderRadius: '5px', color: t.accent, fontSize: '10px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                              ✏️ EDIT
                            </button>
                            <button onClick={() => deleteNote(note.id)}
                              style={{ padding: '4px 10px', background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, borderRadius: '5px', color: t.danger, fontSize: '10px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                              🗑️
                            </button>
                          </div>
                        )}
                      </div>
                      {editingId === note.id ? (
                        <div>
                          <textarea value={editText} onChange={e => setEditText(e.target.value)} rows={3}
                            style={{ width: '100%', padding: '10px 12px', background: t.bgInput, border: `1px solid ${t.borderInput}`, borderRadius: '8px', color: t.textPrimary, fontSize: '13px', outline: 'none', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
                          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                            <button onClick={() => saveEdit(note.id)}
                              style={{ padding: '7px 16px', background: t.success, border: 'none', borderRadius: '6px', color: '#fff', fontSize: '11px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                              SAVE
                            </button>
                            <button onClick={() => { setEditingId(null); setEditText('') }}
                              style={{ padding: '7px 16px', background: 'transparent', border: `1px solid ${t.borderCard}`, borderRadius: '6px', color: t.textMuted, fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit' }}>
                              CANCEL
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p style={{ margin: 0, fontSize: '13px', color: t.textPrimary, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{note.note_text}</p>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Add note input */}
              <div style={{ padding: isMobile ? '12px' : '16px 20px', borderTop: `1px solid ${t.borderCard}`, background: t.bgCard }}>
                <p style={{ margin: '0 0 8px', fontSize: '11px', fontWeight: '700', color: t.textMuted, letterSpacing: '0.5px' }}>ADD YOUR NOTE</p>
                <textarea value={newNote} onChange={e => setNewNote(e.target.value)}
                  placeholder={`Share your notes on "${selectedStory.headline}"...`}
                  rows={3}
                  onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); submitNote() } }}
                  style={{ width: '100%', padding: '10px 14px', background: t.bgInput, border: `1px solid ${t.borderInput}`, borderRadius: '8px', color: t.textPrimary, fontSize: isMobile ? '16px' : '13px', outline: 'none', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', marginBottom: '8px' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p style={{ margin: 0, fontSize: '11px', color: t.textDisabled }}>Ctrl + Enter to submit</p>
                  <button onClick={submitNote} disabled={!newNote.trim() || saving}
                    style={{ padding: '9px 20px', background: newNote.trim() ? t.accent : t.bgInput, border: 'none', borderRadius: '8px', color: newNote.trim() ? t.accentText : t.textDisabled, fontSize: '12px', fontWeight: '700', cursor: newNote.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: saving ? 0.6 : 1, minHeight: '36px' }}>
                    {saving ? 'SAVING...' : 'SUBMIT NOTE'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}