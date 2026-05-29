import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useTheme } from '../context/ThemeContext'
import { useDateFormat } from '../context/DateFormatContext'
import Navbar from '../components/Navbar'

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY

interface StoryReporterAssignment {
  storyId: string
  storyHeadline: string
  mentionedName: string
  foundInDB: boolean
  reporter?: any
  issues: string[]
  suggestions: any[]
  finalReporter?: any
  isOverride: boolean
  overrideReason?: string
  status: 'pending' | 'accepted' | 'override_pending'
}

export default function AIReportGenerator() {
  const { t } = useTheme()
  const { formatDate } = useDateFormat()

  const [transcript, setTranscript] = useState('')
  const [stories, setStories] = useState<any[]>([])
  const [reporters, setReporters] = useState<any[]>([])
  const [assignments, setAssignments] = useState<any[]>([])
  const [availability, setAvailability] = useState<any[]>([])
  const [leaves, setLeaves] = useState<any[]>([])
  const [holidays, setHolidays] = useState<any[]>([])
  const [selectedStories, setSelectedStories] = useState<string[]>([])
  const [step, setStep] = useState<'input' | 'validating' | 'reporter_selection' | 'report_preview' | 'approved'>('input')
  const [storyAssignments, setStoryAssignments] = useState<StoryReporterAssignment[]>([])
  const [generating, setGenerating] = useState(false)
  const [report, setReport] = useState<any>(null)
  const [editingSection, setEditingSection] = useState<string | null>(null)
  const [editedStoryNotes, setEditedStoryNotes] = useState('')
  const [editedAssignmentNotes, setEditedAssignmentNotes] = useState('')
  const [editedRosteringNotes, setEditedRosteringNotes] = useState('')
  const [approving, setApproving] = useState(false)
  const [savedReports, setSavedReports] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState<'generate' | 'reports'>('generate')
  const [liveConfidence, setLiveConfidence] = useState<number>(0)
  const [confidenceDetails, setConfidenceDetails] = useState<any[]>([])
  const [showOtherReporters, setShowOtherReporters] = useState<string | null>(null)
  const [overrideReasonMap, setOverrideReasonMap] = useState<Record<string, string>>({})
  const [overridePickingFor, setOverridePickingFor] = useState<string | null>(null)
  const [overridePickingReporter, setOverridePickingReporter] = useState<any>(null)
  const [showScoreModal, setShowScoreModal] = useState(false)
  const [scoredReporters, setScoredReporters] = useState<any[]>([])
  const [assignStoryId, setAssignStoryId] = useState<string>('')
  const [assigningReporter, setAssigningReporter] = useState<string | null>(null)
  const [showOverrideList, setShowOverrideList] = useState(false)
  const [postOverrideModal, setPostOverrideModal] = useState<any>(null)
  const [postOverrideReason, setPostOverrideReason] = useState('')
  const [postOverrideLoading, setPostOverrideLoading] = useState(false)
  const [viewReportModal, setViewReportModal] = useState<any>(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [{ data: s }, { data: r }, { data: a }, { data: av }, { data: l }, { data: h }, { data: reports }] = await Promise.all([
      supabase.from('stories').select('*').order('created_at', { ascending: false }),
      supabase.from('reporters').select('*').eq('status', 'active'),
      supabase.from('assignments').select('*, stories(*), reporters(*)').eq('is_active', true),
      supabase.from('availability').select('*'),
      supabase.from('leave_requests').select('*').in('status', ['pending', 'acknowledged']),
      supabase.from('holidays').select('*'),
      supabase.from('ai_reports').select('*').order('created_at', { ascending: false })
    ])
    setStories(s || [])
    setReporters(r || [])
    setAssignments(a || [])
    setAvailability(av || [])
    setLeaves(l || [])
    setHolidays(h || [])
    setSavedReports(reports || [])
  }

  function toggleStory(storyId: string) {
    setSelectedStories(prev => prev.includes(storyId) ? prev.filter(id => id !== storyId) : [...prev, storyId])
  }

  function scoreReporter(reporter: any, storyCategories: string[]): { score: number, issues: string[] } {
    const today = new Date().toISOString().split('T')[0]
    const avail = availability.find(a => a.reporter_id === reporter.id)
    const reporterLeaves = leaves.filter(l => l.reporter_id === reporter.id)
    const isOnLeave = reporterLeaves.some(l => l.leave_date === today && l.status === 'acknowledged')
    const hasPendingLeave = reporterLeaves.some(l => l.status === 'pending')
    const availDays = avail?.available_days || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
    const activeCount = assignments.filter(a => a.reporter_id === reporter.id).length
    const atCapacity = activeCount >= reporter.max_stories_per_week
    const beatMatch = storyCategories.some(cat => reporter.beats?.includes(cat))
    const issues: string[] = []
    let score = 0
    if (!isOnLeave) score += 30; else issues.push('❌ On approved leave today')
    if (availDays.length > 0) score += 25; else issues.push('❌ No availability set this week')
    if (!atCapacity) score += 25; else issues.push(`❌ At full capacity (${activeCount}/${reporter.max_stories_per_week})`)
    if (beatMatch) score += 20; else if (storyCategories.length > 0) issues.push(`⚠️ Beats (${reporter.beats?.join(', ')}) don't match story category`)
    if (hasPendingLeave) issues.push('⚠️ Has pending leave request')
    return { score, issues }
  }

  function getTop3Suggestions(excludeId: string | null, storyCategories: string[]): any[] {
    return reporters
      .filter(r => r.id !== excludeId)
      .map(r => ({ ...r, ...scoreReporter(r, storyCategories) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
  }

  // ── KEY FIX: Extract reporter per story with better prompt ──
  async function extractReporterPerStory(storyHeadlines: string[]): Promise<Record<string, string>> {
    const knownReporterNames = reporters.map(r => r.name).join(', ')

    const userMessage = [
      'Read this newsroom meeting transcript carefully.',
      '',
      'Known reporters in the system: ' + knownReporterNames,
      '',
      'For each story below, find which reporter name is mentioned in connection with that story (for assignment, coverage, or discussion):',
      '',
      ...storyHeadlines.map((h, i) => `Story ${i + 1}: "${h}"`),
      '',
      'Return ONLY a JSON object. Keys must be the exact story headlines. Values must be the reporter name found, or empty string if none found.',
      'Example output: {"Story headline 1": "Priya Mehta", "Story headline 2": "Ravi Iyer"}',
      '',
      'TRANSCRIPT:',
      transcript
    ].join('\n')

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_API_KEY },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'You are a newsroom assistant that extracts reporter assignments from meeting transcripts. Return only valid JSON with no markdown formatting.'
          },
          { role: 'user', content: userMessage }
        ],
        temperature: 0,
        max_tokens: 500
      })
    })

    const data = await response.json()
    const raw = data.choices?.[0]?.message?.content || '{}'
    console.log('AI extraction response:', raw)

    try {
      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      const parsed = JSON.parse(cleaned)
      console.log('Parsed reporter per story:', parsed)
      return parsed
    } catch (e) {
      console.error('Parse error:', e)
      // Fallback: try to find any reporter name in transcript for each story
      const fallback: Record<string, string> = {}
      for (const headline of storyHeadlines) {
        for (const reporter of reporters) {
          const firstName = reporter.name.split(' ')[0].toLowerCase()
          if (transcript.toLowerCase().includes(firstName)) {
            fallback[headline] = reporter.name
            break
          }
        }
        if (!fallback[headline]) fallback[headline] = ''
      }
      console.log('Fallback result:', fallback)
      return fallback
    }
  }

  async function handleGenerate() {
    if (!transcript.trim() || selectedStories.length === 0) {
      alert('Please select at least one story and paste a transcript')
      return
    }
    setStep('validating')
    setGenerating(true)

    try {
      const storyHeadlines = selectedStories.map(id => stories.find(s => s.id === id)?.headline).filter(Boolean) as string[]
      const reporterPerStory = await extractReporterPerStory(storyHeadlines)
      const newAssignments: StoryReporterAssignment[] = []

      for (const storyId of selectedStories) {
        const story = stories.find(s => s.id === storyId)
        if (!story) continue

        let mentionedName = reporterPerStory[story.headline] || ''

        // Fallback: partial headline key match
        if (!mentionedName) {
          const matchedKey = Object.keys(reporterPerStory).find(k =>
            k.toLowerCase().includes(story.headline.toLowerCase().slice(0, 15)) ||
            story.headline.toLowerCase().includes(k.toLowerCase().slice(0, 15))
          )
          if (matchedKey) mentionedName = reporterPerStory[matchedKey]
        }

        console.log(`Story: "${story.headline}" → Reporter extracted: "${mentionedName}"`)

        if (!mentionedName) {
          const suggestions = getTop3Suggestions(null, [story.category])
          newAssignments.push({
            storyId, storyHeadline: story.headline,
            mentionedName: '(not mentioned)',
            foundInDB: false,
            issues: ['⚠️ No reporter mentioned in transcript for this story'],
            suggestions, isOverride: false, status: 'pending'
          })
          continue
        }

        // Find reporter in DB - improved matching
        const foundReporter = reporters.find(r => {
          const rName = r.name.toLowerCase()
          const mName = mentionedName.toLowerCase()
          return rName === mName ||
            rName.includes(mName) ||
            mName.includes(rName) ||
            rName.split(' ')[0] === mName.split(' ')[0]
        })

        if (!foundReporter) {
          const suggestions = getTop3Suggestions(null, [story.category])
          newAssignments.push({
            storyId, storyHeadline: story.headline,
            mentionedName, foundInDB: false,
            issues: [`❌ "${mentionedName}" does not exist in the system — cannot assign to unknown reporter`],
            suggestions, isOverride: false, status: 'pending'
          })
        } else {
          const { score, issues } = scoreReporter(foundReporter, [story.category])
          const isBest = score >= 80 && issues.filter(i => i.startsWith('❌')).length === 0
          const suggestions = isBest ? [] : getTop3Suggestions(foundReporter.id, [story.category])
          newAssignments.push({
            storyId, storyHeadline: story.headline,
            mentionedName, foundInDB: true,
            reporter: foundReporter, issues, suggestions, isOverride: false,
            finalReporter: isBest ? foundReporter : undefined,
            status: isBest ? 'accepted' : 'pending'
          })
        }
      }

      setStoryAssignments(newAssignments)
      setGenerating(false)
      setStep('reporter_selection')
    } catch (err: any) {
      alert('Error: ' + err.message)
      setGenerating(false)
      setStep('input')
    }
  }

  function selectReporterForStory(storyId: string, reporter: any, isOverride = false, reason = '') {
    setStoryAssignments(prev => prev.map(sa =>
      sa.storyId === storyId
        ? { ...sa, finalReporter: reporter, isOverride, overrideReason: reason, status: isOverride ? 'override_pending' : 'accepted' }
        : sa
    ))
  }

  function allStoriesDecided(): boolean {
    return storyAssignments.every(sa => sa.finalReporter)
  }

  async function generateFinalReport() {
    setGenerating(true)
    const today = new Date().toISOString().split('T')[0]
    const selectedStoriesData = selectedStories.map(id => stories.find(s => s.id === id)).filter(Boolean)
    const assignmentSummary = storyAssignments.map(sa => ({
      story: sa.storyHeadline, reporter: sa.finalReporter?.name,
      beats: sa.finalReporter?.beats, is_override: sa.isOverride, override_reason: sa.overrideReason
    }))
    const reporterDetails = storyAssignments.map(sa => {
      const r = sa.finalReporter
      if (!r) return null
      const avail = availability.find(a => a.reporter_id === r.id)
      const activeStories = assignments.filter(a => a.reporter_id === r.id).length
      return { name: r.name, beats: r.beats, active_stories: activeStories, max_stories: r.max_stories_per_week, available_days: avail?.available_days || ['Mon','Tue','Wed','Thu','Fri'] }
    }).filter(Boolean)

    const systemPrompt = `You are Ambient Scribe — AI report generator for a Newsroom.
Generate a professional structured report based on the transcript and CONFIRMED reporter assignments.
CONFIRMED ASSIGNMENTS: ${JSON.stringify(assignmentSummary)}
REPORTER DETAILS: ${JSON.stringify(reporterDetails)}
STORIES: ${JSON.stringify(selectedStoriesData)}
TODAY: ${today}
Generate EXACTLY this JSON:
{
  "story_notes": "Comprehensive notes about ALL selected stories — cover each story headline, category, urgency, deadline, key facts from transcript.",
  "assignment_notes": "For each story, note the CONFIRMED assigned reporter, their beat suitability, workload, and assignment rationale. If override, note the reason.",
  "rostering_notes": "For each assigned reporter: availability days, capacity utilization, scheduling considerations. Flag any override assignments."
}
CRITICAL: Use ONLY confirmed reporter names. Return ONLY valid JSON. No markdown.`

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_API_KEY },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: `Transcript:\n\n${transcript}` }],
        temperature: 0.2, max_tokens: 2000
      })
    })

    const data = await response.json()
    const rawText = data.choices?.[0]?.message?.content || ''
    let parsed: any = null
    try {
      const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      parsed = JSON.parse(cleaned)
    } catch {
      const match = rawText.match(/\{[\s\S]*\}/)
      if (match) { try { parsed = JSON.parse(match[0]) } catch {} }
    }
    if (!parsed) { alert('Failed to generate report'); setGenerating(false); return }

    const { score, details } = calculateConfidence(parsed.story_notes, parsed.assignment_notes, parsed.rostering_notes)

    const { data: savedReport, error } = await supabase.from('ai_reports').insert({
      story_ids: selectedStories, transcript,
      story_notes: parsed.story_notes, assignment_notes: parsed.assignment_notes, rostering_notes: parsed.rostering_notes,
      confidence_score: score, confidence_details: details, reporter_validation: storyAssignments, status: 'draft'
    }).select().single()

    if (error) { alert('Error saving report: ' + error.message); setGenerating(false); return }

    setReport(savedReport)
    setEditedStoryNotes(savedReport.story_notes)
    setEditedAssignmentNotes(savedReport.assignment_notes)
    setEditedRosteringNotes(savedReport.rostering_notes)
    setLiveConfidence(score)
    setConfidenceDetails(details)
    setStep('report_preview')
    setGenerating(false)
    loadData()
  }

  function calculateConfidence(storyNotes: string, assignNotes: string, rosterNotes: string): { score: number, details: any[] } {
    const details: any[] = []
    let total = 0, weight = 0
    storyAssignments.forEach(sa => {
      if (!sa.finalReporter) return
      const r = sa.finalReporter
      const today = new Date().toISOString().split('T')[0]
      const avail = availability.find(a => a.reporter_id === r.id)
      const rLeaves = leaves.filter(l => l.reporter_id === r.id)
      const isOnLeave = rLeaves.some(l => l.leave_date === today && l.status === 'acknowledged')
      const hasAvail = !!(avail?.available_days?.length) || true
      const activeCount = assignments.filter(a => a.reporter_id === r.id).length
      const atCapacity = activeCount >= r.max_stories_per_week
      const story = stories.find(s => s.id === sa.storyId)
      const beatMatch = story ? r.beats?.includes(story.category) : false
      const mentionedInReport = assignNotes?.toLowerCase().includes(r.name.toLowerCase())
      let score = 0
      const checks: string[] = []
      if (!isOnLeave) { score += 25; checks.push('✅ Not on leave') } else checks.push('❌ On leave')
      if (hasAvail) { score += 20; checks.push('✅ Available') } else checks.push('❌ No availability')
      if (!atCapacity) { score += 20; checks.push(`✅ Capacity OK (${activeCount}/${r.max_stories_per_week})`) } else checks.push('❌ At capacity')
      if (beatMatch) { score += 20; checks.push('✅ Beat match') } else checks.push('⚠️ No beat match')
      if (mentionedInReport) { score += 15; checks.push('✅ Mentioned in report') } else checks.push('⚠️ Not in report')
      if (sa.isOverride) checks.push('⚠️ Override assignment')
      details.push({ type: 'reporter', name: `${r.name} → ${sa.storyHeadline}`, score, checks, color: score >= 75 ? t.success : score >= 50 ? t.warning : t.danger })
      total += score; weight += 100
    })
    const tScore = Math.min(100, Math.round(transcript.length / 10))
    details.push({ type: 'transcript', name: 'Transcript Quality', score: tScore, checks: [transcript.length >= 200 ? '✅ Detailed transcript' : '⚠️ Short transcript'], color: tScore >= 75 ? t.success : tScore >= 50 ? t.warning : t.danger })
    total += tScore; weight += 100
    return { score: weight > 0 ? Math.min(Math.round(total / (weight / 100)), 100) : 0, details }
  }

  useEffect(() => {
    if (!report) return
    const { score, details } = calculateConfidence(editedStoryNotes, editedAssignmentNotes, editedRosteringNotes)
    setLiveConfidence(score)
    setConfidenceDetails(details)
  }, [editedStoryNotes, editedAssignmentNotes, editedRosteringNotes])

  async function saveEdits() {
    if (!report) return
    const { score, details } = calculateConfidence(editedStoryNotes, editedAssignmentNotes, editedRosteringNotes)
    await supabase.from('ai_reports').update({
      story_notes: editedStoryNotes, assignment_notes: editedAssignmentNotes, rostering_notes: editedRosteringNotes,
      confidence_score: score, confidence_details: details,
      editor_modifications: 'Modified by editor on ' + new Date().toLocaleString(),
      updated_at: new Date().toISOString()
    }).eq('id', report.id)
    setReport({ ...report, story_notes: editedStoryNotes, assignment_notes: editedAssignmentNotes, rostering_notes: editedRosteringNotes, confidence_score: score })
    setEditingSection(null)
    loadData()
  }

  async function approveAndAssign() {
    if (!report) return
    setApproving(true)
    await supabase.from('ai_reports').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', report.id)
    for (const sa of storyAssignments) {
      if (!sa.finalReporter) continue
      await supabase.from('assignments').update({ is_active: false }).eq('story_id', sa.storyId).eq('is_active', true)
      await supabase.from('assignments').insert({
        story_id: sa.storyId, reporter_id: sa.finalReporter.id, is_active: true,
        is_override: sa.isOverride, override_reason: sa.isOverride ? sa.overrideReason : null,
        override_status: sa.isOverride ? 'pending' : null
      })
      await supabase.from('stories').update({ status: 'assigned' }).eq('id', sa.storyId)
    }
    setReport({ ...report, status: 'approved' })
    setStep('approved')
    window.dispatchEvent(new Event('newsroom-refresh'))
    loadData()
    setApproving(false)
  }

  async function runScoringEngine(storyId: string) {
    setAssignStoryId(storyId)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/score-reporters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ story_id: storyId })
      })
      const data = await res.json()
      setScoredReporters(Array.isArray(data) ? data : [])
      setShowScoreModal(true)
      setShowOverrideList(false)
    } catch (err: any) { alert('Scoring engine error: ' + err.message) }
  }

  async function assignFromScore(reporterId: string) {
    if (!assignStoryId) return
    setAssigningReporter(reporterId)
    await supabase.from('assignments').update({ is_active: false }).eq('story_id', assignStoryId).eq('is_active', true)
    await supabase.from('assignments').insert({ story_id: assignStoryId, reporter_id: reporterId, is_active: true, is_override: false })
    await supabase.from('stories').update({ status: 'assigned' }).eq('id', assignStoryId)
    setAssigningReporter(null); setShowScoreModal(false)
    window.dispatchEvent(new Event('newsroom-refresh')); loadData()
  }

  async function postOverrideAssign() {
    if (!postOverrideModal || !postOverrideReason.trim() || !assignStoryId) return
    setPostOverrideLoading(true)
    await supabase.from('assignments').update({ is_active: false }).eq('story_id', assignStoryId).eq('is_active', true)
    await supabase.from('assignments').insert({ story_id: assignStoryId, reporter_id: postOverrideModal.id, is_active: true, is_override: true, override_reason: postOverrideReason, override_status: 'pending' })
    await supabase.from('stories').update({ status: 'assigned' }).eq('id', assignStoryId)
    setPostOverrideLoading(false); setPostOverrideModal(null); setPostOverrideReason('')
    setShowScoreModal(false); setShowOverrideList(false)
    window.dispatchEvent(new Event('newsroom-refresh')); loadData()
    alert('Override assigned! Reporter will be notified.')
  }

  function getConfidenceColor(score: number) {
    if (score >= 75) return t.success
    if (score >= 50) return t.warning
    return t.danger
  }

  const cardStyle: React.CSSProperties = { background: t.bgCard, border: `1px solid ${t.borderCard}`, borderRadius: '10px', padding: '24px', boxShadow: t.shadowCard, marginBottom: '20px' }
  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', background: t.bgInput, border: `1px solid ${t.borderInput}`, borderRadius: '8px', color: t.textPrimary, fontSize: '13px', outline: 'none', boxSizing: 'border-box' as const, fontFamily: 'inherit' }

  return (
    <div style={{ minHeight: '100vh', background: t.bgPage, fontFamily: '"Inter", "DM Mono", sans-serif', color: t.textPrimary }}>
      <Navbar />
      <main style={{ padding: '32px 24px', maxWidth: '1000px', margin: '0 auto' }}>

        <div style={{ marginBottom: '28px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 14px', background: t.accentBg, border: `1px solid ${t.accentBorder}`, borderRadius: '6px', marginBottom: '10px' }}>
            <span style={{ color: t.accent, fontSize: '11px', fontWeight: '700', letterSpacing: '1px' }}>AMBIENT SCRIBE</span>
          </div>
          <h1 style={{ color: t.textPrimary, margin: '0 0 6px', fontSize: '24px', fontWeight: '700' }}>Ambient Scribe</h1>
          <p style={{ color: t.textMuted, margin: 0, fontSize: '13px' }}>Select stories, paste transcript → AI validates reporters → generate & approve report</p>
        </div>

        <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', padding: '4px', background: t.bgInput, borderRadius: '10px', border: `1px solid ${t.borderCard}`, width: 'fit-content' }}>
          {[{ key: 'generate', label: '⚡ Generate Report' }, { key: 'reports', label: `📋 Saved Reports (${savedReports.length})` }].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key as any)}
              style={{ padding: '8px 20px', borderRadius: '7px', border: 'none', background: activeTab === tab.key ? t.accent : 'transparent', color: activeTab === tab.key ? t.accentText : t.textMuted, fontSize: '13px', fontWeight: activeTab === tab.key ? '700' : '400', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}>
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'generate' && (
          <>
            {(step === 'input' || step === 'validating') && (
              <div style={cardStyle}>
                <h2 style={{ color: t.textPrimary, margin: '0 0 20px', fontSize: '16px', fontWeight: '700' }}>Step 1 — Select Stories & Paste Transcript</h2>
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ color: t.textSecondary, fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '8px' }}>SELECT STORIES <span style={{ color: t.danger }}>*required</span></label>
                  {stories.length === 0 ? (
                    <p style={{ color: t.textMuted, fontSize: '13px' }}>No stories in database yet</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '220px', overflowY: 'auto', padding: '4px' }}>
                      {stories.filter(s => s.status === 'unassigned' || s.status === 'assigned').map(s => {
                        const isSelected = selectedStories.includes(s.id)
                        const assignment = assignments.find(a => a.story_id === s.id)
                        const assignedReporter = assignment ? reporters.find(r => r.id === assignment.reporter_id) : null
                        return (
                          <div key={s.id} onClick={() => toggleStory(s.id)}
                            style={{ padding: '12px 16px', borderRadius: '8px', border: `2px solid ${isSelected ? t.accentBorder : t.borderCard}`, background: isSelected ? t.accentBg : t.bgPage, cursor: 'pointer', transition: 'all 0.15s', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                <span style={{ color: isSelected ? t.accent : t.textPrimary, fontSize: '13px', fontWeight: '600' }}>{s.headline}</span>
                                <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '600', background: `${t.accent}15`, color: t.accent, border: `1px solid ${t.accentBorder}` }}>{s.category}</span>
                                <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '600', background: t.bgInput, color: t.textMuted, border: `1px solid ${t.borderCard}` }}>{s.status}</span>
                              </div>
                              <p style={{ color: t.textMuted, fontSize: '11px', margin: 0 }}>Due: {formatDate(s.deadline)} {assignedReporter ? `| Currently: ${assignedReporter.name}` : '| Unassigned'}</p>
                            </div>
                            {isSelected && <span style={{ color: t.accent, fontSize: '20px', fontWeight: '700' }}>✓</span>}
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {selectedStories.length > 0 && <p style={{ color: t.accent, fontSize: '12px', fontWeight: '600', margin: '8px 0 0' }}>{selectedStories.length} stor{selectedStories.length > 1 ? 'ies' : 'y'} selected</p>}
                </div>
                <div>
                  <label style={{ color: t.textSecondary, fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '6px' }}>DISCUSSION TRANSCRIPT <span style={{ color: t.danger }}>*required</span></label>
                  <textarea value={transcript} onChange={e => setTranscript(e.target.value)} rows={8}
                    placeholder="Paste the editor-reporter meeting transcript here. The system will extract reporter names per story and validate them..."
                    style={{ ...inputStyle, resize: 'vertical' as const, lineHeight: 1.6 }} />
                  <p style={{ color: t.textMuted, fontSize: '11px', margin: '6px 0 0' }}>{transcript.length} characters</p>
                </div>
                <button onClick={handleGenerate} disabled={generating || transcript.trim().length < 10 || selectedStories.length === 0}
                  style={{ marginTop: '20px', padding: '14px 32px', background: generating || transcript.trim().length < 10 || selectedStories.length === 0 ? t.textMuted : t.accent, border: 'none', borderRadius: '8px', color: t.accentText, fontSize: '14px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', opacity: generating ? 0.7 : 1 }}>
                  {generating ? '🔍 Extracting & Validating Reporters...' : '⚡ GENERATE REPORT'}
                </button>
              </div>
            )}

            {step === 'reporter_selection' && (
              <div>
                <div style={{ ...cardStyle, border: `1px solid ${t.accentBorder}`, background: t.accentBg }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h2 style={{ color: t.accent, margin: '0 0 4px', fontSize: '16px', fontWeight: '700' }}>Step 2 — Confirm Reporter Assignments</h2>
                      <p style={{ color: t.textMuted, fontSize: '13px', margin: 0 }}>Review extracted reporters for each story. Accept, change, or override.</p>
                    </div>
                    <button onClick={() => setStep('input')} style={{ padding: '8px 16px', background: 'transparent', border: `1px solid ${t.borderCard}`, borderRadius: '6px', color: t.textMuted, fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}>← Back</button>
                  </div>
                </div>

                {storyAssignments.map((sa, idx) => {
                  const story = stories.find(s => s.id === sa.storyId)
                  const isDecided = !!sa.finalReporter
                  const isBestMatch = sa.foundInDB && sa.issues.filter(i => i.startsWith('❌')).length === 0 && sa.issues.length === 0

                  return (
                    <div key={sa.storyId} style={{ ...cardStyle, border: `1px solid ${isDecided ? t.successBorder : t.dangerBorder}`, background: isDecided ? `${t.success}06` : `${t.danger}06` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                            <span style={{ padding: '3px 10px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', background: `${t.accent}15`, color: t.accent, border: `1px solid ${t.accentBorder}` }}>STORY {idx + 1}</span>
                            <span style={{ color: t.textPrimary, fontSize: '15px', fontWeight: '700' }}>{sa.storyHeadline}</span>
                          </div>
                          <p style={{ color: t.textMuted, fontSize: '12px', margin: 0 }}>Category: {story?.category} | Due: {formatDate(story?.deadline)}</p>
                        </div>
                        {isDecided && (
                          <span style={{ padding: '4px 12px', borderRadius: '6px', background: t.successBg, border: `1px solid ${t.successBorder}`, color: t.success, fontSize: '11px', fontWeight: '700' }}>
                            ✓ {sa.finalReporter?.name} {sa.isOverride ? '(OVERRIDE)' : ''}
                          </span>
                        )}
                      </div>

                      <div style={{ padding: '14px', borderRadius: '8px', border: `1px solid ${sa.foundInDB ? t.accentBorder : t.dangerBorder}`, background: sa.foundInDB ? t.accentBg : t.dangerBg, marginBottom: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                          <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', background: sa.foundInDB ? `${t.accent}20` : `${t.danger}20`, color: sa.foundInDB ? t.accent : t.danger, border: `1px solid ${sa.foundInDB ? t.accentBorder : t.dangerBorder}` }}>
                            {sa.foundInDB ? 'FOUND IN DB' : 'NOT IN DB'}
                          </span>
                          <span style={{ color: t.textPrimary, fontSize: '13px', fontWeight: '600' }}>
                            Mentioned: "{sa.mentionedName}"
                            {sa.reporter && sa.reporter.name !== sa.mentionedName && <span style={{ color: t.textMuted, fontWeight: '400' }}> → matched to {sa.reporter.name}</span>}
                          </span>
                        </div>
                        {sa.issues.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '8px' }}>
                            {sa.issues.map((issue, ii) => <p key={ii} style={{ color: issue.startsWith('❌') ? t.danger : t.warning, fontSize: '12px', margin: 0, fontWeight: '500' }}>{issue}</p>)}
                          </div>
                        )}
                        {isBestMatch && !isDecided && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                            <p style={{ color: t.success, fontSize: '12px', fontWeight: '700', margin: 0 }}>✅ {sa.reporter?.name} is the BEST match! (Beats: {sa.reporter?.beats?.join(', ')})</p>
                            <button onClick={() => selectReporterForStory(sa.storyId, sa.reporter)}
                              style={{ padding: '8px 20px', background: t.success, border: 'none', borderRadius: '6px', color: '#fff', fontSize: '12px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', marginLeft: '12px' }}>
                              CONFIRM ✓
                            </button>
                          </div>
                        )}
                      </div>

                      {sa.suggestions.length > 0 && !isDecided && (
                        <div style={{ marginBottom: '14px' }}>
                          <p style={{ color: t.textSecondary, fontSize: '11px', fontWeight: '700', margin: '0 0 8px', letterSpacing: '0.5px' }}>SYSTEM SUGGESTIONS — Ranked by beats + availability + headroom:</p>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {sa.suggestions.map((sug, si) => {
                              const sugAvail = availability.find(a => a.reporter_id === sug.id)
                              const sugActive = assignments.filter(a => a.reporter_id === sug.id).length
                              return (
                                <div key={sug.id} style={{ padding: '12px 14px', borderRadius: '8px', border: `1px solid ${si === 0 ? t.accentBorder : t.borderCard}`, background: si === 0 ? t.accentBg : t.bgPage, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                      {si === 0 && <span style={{ padding: '2px 6px', borderRadius: '3px', fontSize: '9px', fontWeight: '700', background: t.accentBg, color: t.accent, border: `1px solid ${t.accentBorder}` }}>BEST MATCH</span>}
                                      <span style={{ color: si === 0 ? t.accent : t.textPrimary, fontSize: '13px', fontWeight: '700' }}>{sug.name}</span>
                                      <span style={{ color: t.textMuted, fontSize: '11px' }}>Score: {sug.score}%</span>
                                    </div>
                                    <p style={{ color: t.textMuted, fontSize: '11px', margin: 0 }}>Beats: {sug.beats?.join(', ')} | Load: {sugActive}/{sug.max_stories_per_week} | Avail: {sugAvail?.available_days?.join(', ') || 'Mon-Fri'}</p>
                                  </div>
                                  <button onClick={() => selectReporterForStory(sa.storyId, sug)}
                                    style={{ padding: '8px 16px', background: si === 0 ? t.accent : t.accentBg, border: `1px solid ${t.accentBorder}`, borderRadius: '6px', color: si === 0 ? t.accentText : t.accent, fontSize: '11px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', marginLeft: '12px', whiteSpace: 'nowrap' }}>
                                    USE {sug.name}
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {sa.foundInDB && sa.reporter && sa.issues.length > 0 && !isDecided && (
                        <button onClick={() => selectReporterForStory(sa.storyId, sa.reporter)}
                          style={{ marginBottom: '10px', padding: '8px 16px', background: 'transparent', border: `1px solid ${t.warningBorder}`, borderRadius: '6px', color: t.warning, fontSize: '11px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                          Continue with {sa.reporter.name} anyway (ignore issues)
                        </button>
                      )}

                      {!isDecided && (
                        <div>
                          {showOtherReporters !== sa.storyId ? (
                            <button onClick={() => setShowOtherReporters(sa.storyId)}
                              style={{ padding: '8px 16px', background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, borderRadius: '6px', color: t.danger, fontSize: '11px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                              ⚠️ Choose a different reporter (override)
                            </button>
                          ) : (
                            <div style={{ padding: '14px', borderRadius: '8px', border: `1px solid ${t.dangerBorder}`, background: t.dangerBg }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                <p style={{ color: t.danger, fontSize: '12px', fontWeight: '700', margin: 0 }}>SELECT ANY REPORTER (requires reason)</p>
                                <button onClick={() => setShowOtherReporters(null)} style={{ background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer', fontSize: '18px' }}>x</button>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto', marginBottom: '10px' }}>
                                {reporters.map(r => {
                                  const rAvail = availability.find(a => a.reporter_id === r.id)
                                  const rActive = assignments.filter(a => a.reporter_id === r.id).length
                                  const today = new Date().toISOString().split('T')[0]
                                  const rOnLeave = leaves.some(l => l.reporter_id === r.id && l.leave_date === today && l.status === 'acknowledged')
                                  const isSug = sa.suggestions.find(s => s.id === r.id)
                                  return (
                                    <div key={r.id}
                                      onClick={() => { setOverridePickingFor(sa.storyId); setOverridePickingReporter(r) }}
                                      style={{ padding: '10px 12px', borderRadius: '6px', border: `1px solid ${overridePickingReporter?.id === r.id && overridePickingFor === sa.storyId ? t.dangerBorder : t.borderCard}`, background: overridePickingReporter?.id === r.id && overridePickingFor === sa.storyId ? t.dangerBg : t.bgCard, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                                          <span style={{ color: t.textPrimary, fontSize: '13px', fontWeight: '600' }}>{r.name}</span>
                                          {isSug && <span style={{ padding: '1px 5px', borderRadius: '3px', fontSize: '9px', fontWeight: '700', background: t.accentBg, color: t.accent }}>SUGGESTED</span>}
                                          {rOnLeave && <span style={{ padding: '1px 5px', borderRadius: '3px', fontSize: '9px', fontWeight: '700', background: t.dangerBg, color: t.danger }}>ON LEAVE</span>}
                                        </div>
                                        <p style={{ color: t.textMuted, fontSize: '11px', margin: 0 }}>{r.beats?.join(', ')} | {rActive}/{r.max_stories_per_week} | {rAvail?.available_days?.join(', ') || 'Mon-Fri'}</p>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                              {overridePickingReporter && overridePickingFor === sa.storyId && (
                                <div>
                                  <p style={{ color: t.danger, fontSize: '12px', fontWeight: '600', margin: '0 0 6px' }}>Selected: {overridePickingReporter.name} — provide reason:</p>
                                  <textarea value={overrideReasonMap[sa.storyId] || ''} onChange={e => setOverrideReasonMap(prev => ({ ...prev, [sa.storyId]: e.target.value }))}
                                    rows={2} placeholder="Reason for override assignment..."
                                    style={{ ...inputStyle, resize: 'none' as const, marginBottom: '8px' }} />
                                  <button onClick={() => {
                                    const reason = overrideReasonMap[sa.storyId]
                                    if (!reason?.trim()) { alert('Please provide a reason'); return }
                                    selectReporterForStory(sa.storyId, overridePickingReporter, true, reason)
                                    setShowOtherReporters(null); setOverridePickingReporter(null); setOverridePickingFor(null)
                                  }} disabled={!overrideReasonMap[sa.storyId]?.trim()}
                                    style={{ padding: '8px 20px', background: overrideReasonMap[sa.storyId]?.trim() ? t.danger : t.textMuted, border: 'none', borderRadius: '6px', color: '#fff', fontSize: '12px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                                    CONFIRM OVERRIDE
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {isDecided && (
                        <button onClick={() => setStoryAssignments(prev => prev.map(s => s.storyId === sa.storyId ? { ...s, finalReporter: undefined, isOverride: false, status: 'pending' } : s))}
                          style={{ padding: '6px 14px', background: 'transparent', border: `1px solid ${t.borderCard}`, borderRadius: '6px', color: t.textMuted, fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit' }}>
                          Change
                        </button>
                      )}
                    </div>
                  )
                })}

                {allStoriesDecided() && (
                  <div style={{ ...cardStyle, border: `1px solid ${t.successBorder}`, background: t.successBg }}>
                    <h3 style={{ color: t.success, margin: '0 0 8px', fontSize: '14px', fontWeight: '700' }}>✓ All reporters confirmed! Ready to generate report.</h3>
                    <div style={{ marginBottom: '14px' }}>
                      {storyAssignments.map(sa => (
                        <div key={sa.storyId} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${t.borderCard}` }}>
                          <span style={{ color: t.textPrimary, fontSize: '13px' }}>{sa.storyHeadline}</span>
                          <span style={{ color: sa.isOverride ? t.warning : t.success, fontSize: '13px', fontWeight: '600' }}>→ {sa.finalReporter?.name} {sa.isOverride ? '⚠️ Override' : '✓'}</span>
                        </div>
                      ))}
                    </div>
                    <button onClick={generateFinalReport} disabled={generating}
                      style={{ padding: '14px 32px', background: generating ? t.textMuted : t.accent, border: 'none', borderRadius: '8px', color: t.accentText, fontSize: '14px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', opacity: generating ? 0.7 : 1 }}>
                      {generating ? '⏳ Generating Final Report...' : '⚡ GENERATE FINAL REPORT'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {(step === 'report_preview' || step === 'approved') && report && (
              <>
                <div style={{ ...cardStyle, border: `2px solid ${getConfidenceColor(liveConfidence)}40`, background: `${getConfidenceColor(liveConfidence)}06` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                    <div>
                      <h2 style={{ color: t.textPrimary, margin: '0 0 4px', fontSize: '16px', fontWeight: '700' }}>
                        DB Confidence Score
                        <span style={{ marginLeft: '10px', padding: '3px 10px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', background: t.accentBg, color: t.accent, border: `1px solid ${t.accentBorder}` }}>LIVE</span>
                      </h2>
                      <p style={{ color: t.textMuted, fontSize: '12px', margin: 0 }}>Based on confirmed reporters vs actual DB records</p>
                    </div>
                    <div style={{ textAlign: 'right' as const }}>
                      <div style={{ fontSize: '52px', fontWeight: '800', color: getConfidenceColor(liveConfidence), lineHeight: 1 }}>{liveConfidence}%</div>
                      {step === 'approved' && <span style={{ padding: '4px 12px', borderRadius: '6px', background: t.successBg, border: `1px solid ${t.successBorder}`, color: t.success, fontSize: '11px', fontWeight: '700' }}>✓ APPROVED</span>}
                    </div>
                  </div>
                  <div style={{ height: '10px', background: t.bgPage, borderRadius: '5px', marginBottom: '16px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: '5px', background: getConfidenceColor(liveConfidence), width: `${liveConfidence}%`, transition: 'width 0.5s' }} />
                  </div>
                  {confidenceDetails.map((d, i) => (
                    <div key={i} style={{ padding: '10px 14px', borderRadius: '6px', border: `1px solid ${d.color}30`, background: `${d.color}08`, marginBottom: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ padding: '2px 6px', borderRadius: '3px', fontSize: '9px', fontWeight: '700', background: `${d.color}20`, color: d.color, border: `1px solid ${d.color}40` }}>{d.type.toUpperCase()}</span>
                          <span style={{ color: t.textPrimary, fontSize: '12px', fontWeight: '600' }}>{d.name}</span>
                        </div>
                        <span style={{ color: d.color, fontSize: '18px', fontWeight: '800' }}>{d.score}%</span>
                      </div>
                      {d.checks.map((c: string, ci: number) => <p key={ci} style={{ color: t.textMuted, fontSize: '11px', margin: '2px 0 0' }}>{c}</p>)}
                    </div>
                  ))}
                </div>

                <div style={cardStyle}>
                  <h2 style={{ color: t.textPrimary, margin: '0 0 14px', fontSize: '16px', fontWeight: '700' }}>Step 3 — Confirmed Assignments</h2>
                  {storyAssignments.map(sa => (
                    <div key={sa.storyId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: '8px', border: `1px solid ${sa.isOverride ? t.warningBorder : t.successBorder}`, background: sa.isOverride ? t.warningBg : t.successBg, marginBottom: '8px' }}>
                      <div>
                        <p style={{ color: t.textPrimary, fontSize: '13px', fontWeight: '600', margin: '0 0 2px' }}>{sa.storyHeadline}</p>
                        <p style={{ color: t.textMuted, fontSize: '11px', margin: 0 }}>{sa.isOverride ? `⚠️ Override → ${sa.finalReporter?.name} | Reason: ${sa.overrideReason}` : `✓ Assigned → ${sa.finalReporter?.name}`}</p>
                      </div>
                      <span style={{ padding: '4px 10px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', background: sa.isOverride ? t.warningBg : t.successBg, color: sa.isOverride ? t.warning : t.success, border: `1px solid ${sa.isOverride ? t.warningBorder : t.successBorder}` }}>
                        {sa.isOverride ? 'OVERRIDE' : 'NORMAL'}
                      </span>
                    </div>
                  ))}
                </div>

                <div style={cardStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h2 style={{ color: t.textPrimary, margin: 0, fontSize: '16px', fontWeight: '700' }}>Step 4 — Review & Edit Report</h2>
                    {editingSection && (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => setEditingSection(null)} style={{ padding: '8px 16px', background: 'transparent', border: `1px solid ${t.borderCard}`, borderRadius: '6px', color: t.textMuted, fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}>CANCEL</button>
                        <button onClick={saveEdits} style={{ padding: '8px 16px', background: t.accent, border: 'none', borderRadius: '6px', color: t.accentText, fontSize: '12px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>SAVE</button>
                      </div>
                    )}
                  </div>
                  {[
                    { key: 'story', label: '📝 Notes about the Story', content: editedStoryNotes, setter: setEditedStoryNotes, color: t.accent, border: t.accentBorder, bg: t.accentBg },
                    { key: 'assignment', label: '👤 Notes about Assignment to Reporter', content: editedAssignmentNotes, setter: setEditedAssignmentNotes, color: '#a78bfa', border: 'rgba(167,139,250,0.3)', bg: 'rgba(167,139,250,0.08)' },
                    { key: 'rostering', label: '📅 Notes about Reporter Rostering', content: editedRosteringNotes, setter: setEditedRosteringNotes, color: t.success, border: t.successBorder, bg: t.successBg },
                  ].map(section => (
                    <div key={section.key} style={{ marginBottom: '16px', padding: '18px', borderRadius: '8px', border: `1px solid ${section.border}`, background: section.bg }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <h3 style={{ color: section.color, margin: 0, fontSize: '13px', fontWeight: '700' }}>{section.label}</h3>
                        {step === 'report_preview' && (
                          <button onClick={() => setEditingSection(editingSection === section.key ? null : section.key)}
                            style={{ padding: '5px 12px', background: 'transparent', border: `1px solid ${section.border}`, borderRadius: '5px', color: section.color, fontSize: '11px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                            {editingSection === section.key ? 'CANCEL' : '✏️ EDIT'}
                          </button>
                        )}
                      </div>
                      {editingSection === section.key ? (
                        <textarea value={section.content} onChange={e => section.setter(e.target.value)} rows={5} style={{ ...inputStyle, resize: 'vertical' as const, lineHeight: 1.6 }} />
                      ) : (
                        <p style={{ color: t.textPrimary, fontSize: '13px', margin: 0, lineHeight: 1.8 }}>{section.content}</p>
                      )}
                    </div>
                  ))}
                </div>

                {step === 'report_preview' && (
                  <div style={{ ...cardStyle, border: `1px solid ${t.successBorder}`, background: t.successBg }}>
                    <h2 style={{ color: t.success, margin: '0 0 8px', fontSize: '16px', fontWeight: '700' }}>Step 5 — Approve & Assign</h2>
                    <p style={{ color: t.textMuted, fontSize: '13px', margin: '0 0 16px' }}>Approving will assign all stories, make report visible to ALL reporters, and notify override reporters.</p>
                    <button onClick={approveAndAssign} disabled={approving}
                      style={{ padding: '14px 40px', background: approving ? t.textMuted : t.success, border: 'none', borderRadius: '8px', color: '#fff', fontSize: '14px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', opacity: approving ? 0.7 : 1 }}>
                      {approving ? '⏳ APPROVING & ASSIGNING...' : '✓ APPROVE & ASSIGN TO ALL REPORTERS'}
                    </button>
                  </div>
                )}

                {step === 'approved' && (
                  <div style={{ ...cardStyle, border: `1px solid ${t.successBorder}`, background: t.successBg }}>
                    <p style={{ color: t.success, fontSize: '14px', fontWeight: '700', margin: '0 0 12px' }}>✓ Report Approved — Stories Assigned — Visible to All Reporters</p>
                    <p style={{ color: t.textMuted, fontSize: '13px', margin: '0 0 16px' }}>Override reporters have been notified. You can re-run scoring engine per story.</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {selectedStories.map(storyId => {
                        const story = stories.find(s => s.id === storyId)
                        if (!story) return null
                        return (
                          <div key={storyId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: t.bgCard, borderRadius: '8px', border: `1px solid ${t.borderCard}` }}>
                            <p style={{ color: t.textPrimary, fontSize: '13px', fontWeight: '600', margin: 0 }}>{story.headline}</p>
                            <button onClick={() => runScoringEngine(storyId)} style={{ padding: '8px 16px', background: t.accentBg, border: `1px solid ${t.accentBorder}`, borderRadius: '6px', color: t.accent, fontSize: '11px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>⚡ RE-SCORE & REASSIGN</button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {activeTab === 'reports' && (
          <div>
            {savedReports.length === 0 ? (
              <div style={{ color: t.textDisabled, fontSize: '14px', textAlign: 'center', padding: '60px', border: `1px dashed ${t.borderCard}`, borderRadius: '10px', background: t.bgCard }}>No reports generated yet</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {savedReports.map(r => (
                  <div key={r.id} style={{ ...cardStyle, marginBottom: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                          <span style={{ padding: '3px 10px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', background: r.status === 'approved' ? t.successBg : t.warningBg, color: r.status === 'approved' ? t.success : t.warning, border: `1px solid ${r.status === 'approved' ? t.successBorder : t.warningBorder}` }}>{r.status?.toUpperCase()}</span>
                          <span style={{ color: t.textMuted, fontSize: '12px' }}>{r.story_ids?.length > 0 ? `${r.story_ids.length} stor${r.story_ids.length > 1 ? 'ies' : 'y'} linked` : 'No stories linked'}</span>
                        </div>
                        <p style={{ color: t.textMuted, fontSize: '12px', margin: 0 }}>Generated: {formatDate(r.created_at?.split('T')[0])}{r.approved_at && ` | Approved: ${formatDate(r.approved_at?.split('T')[0])}`}</p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ fontSize: '28px', fontWeight: '800', color: getConfidenceColor(r.confidence_score) }}>{r.confidence_score}%</div>
                        <button onClick={() => setViewReportModal(r)}
                          style={{ padding: '8px 16px', background: t.accentBg, border: `1px solid ${t.accentBorder}`, borderRadius: '6px', color: t.accent, fontSize: '11px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                          READ REPORT
                        </button>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                      {[{ label: '📝 Story Notes', content: r.story_notes, color: t.accent }, { label: '👤 Assignment Notes', content: r.assignment_notes, color: '#a78bfa' }, { label: '📅 Rostering Notes', content: r.rostering_notes, color: t.success }].map(s => (
                        <div key={s.label} style={{ padding: '12px', background: t.bgPage, borderRadius: '8px', border: `1px solid ${t.borderCard}` }}>
                          <p style={{ color: s.color, fontSize: '10px', fontWeight: '700', margin: '0 0 6px' }}>{s.label}</p>
                          <p style={{ color: t.textMuted, fontSize: '11px', margin: 0, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const }}>{s.content}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {showScoreModal && (
        <div style={{ position: 'fixed', inset: 0, background: t.overlayBg, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) { setShowScoreModal(false); setShowOverrideList(false) } }}>
          <div style={{ background: t.bgCard, border: `1px solid ${t.accentBorder}`, borderRadius: '12px', width: '100%', maxWidth: '560px', margin: '24px', padding: '28px', boxShadow: t.shadow, maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ color: t.textPrimary, margin: 0, fontSize: '18px', fontWeight: '700' }}>⚡ Score & Reassign Reporter</h2>
              <button onClick={() => { setShowScoreModal(false); setShowOverrideList(false) }} style={{ background: 'none', border: 'none', color: t.textMuted, fontSize: '22px', cursor: 'pointer' }}>x</button>
            </div>
            {scoredReporters.length === 0 ? (
              <div style={{ color: t.textMuted, textAlign: 'center', padding: '32px', border: `1px dashed ${t.borderCard}`, borderRadius: '8px' }}>No eligible reporters found</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {scoredReporters.map((s, i) => (
                  <div key={s.reporter_id} style={{ padding: '16px', borderRadius: '8px', border: `2px solid ${i === 0 ? t.accentBorder : t.borderCard}`, background: i === 0 ? t.accentBg : t.bgPage }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {i === 0 && <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', background: t.accentBg, color: t.accent, border: `1px solid ${t.accentBorder}` }}>BEST</span>}
                        <span style={{ color: t.textPrimary, fontSize: '14px', fontWeight: '700' }}>{s.name}</span>
                        <span style={{ color: t.textMuted, fontSize: '11px', padding: '2px 6px', background: t.bgInput, borderRadius: '4px', border: `1px solid ${t.borderCard}` }}>{s.active_stories} active</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: t.accent, fontSize: '20px', fontWeight: '800' }}>{Math.round(s.score * 100)}</span>
                        <button onClick={() => assignFromScore(s.reporter_id)} disabled={!!assigningReporter}
                          style={{ padding: '8px 16px', background: i === 0 ? t.accent : 'transparent', border: `2px solid ${i === 0 ? t.accent : t.borderCard}`, borderRadius: '6px', color: i === 0 ? t.accentText : t.textSecondary, fontSize: '12px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', opacity: assigningReporter ? 0.6 : 1 }}>
                          {assigningReporter === s.reporter_id ? '...' : 'ASSIGN'}
                        </button>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                      {[{ label: 'Beat Match', value: s.beat_match }, { label: 'Availability', value: s.availability }, { label: 'Headroom', value: s.headroom }].map(m => (
                        <div key={m.label}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <span style={{ color: t.textMuted, fontSize: '11px' }}>{m.label}</span>
                            <span style={{ color: m.value > 0.7 ? t.success : m.value > 0.4 ? t.warning : t.danger, fontSize: '11px', fontWeight: '700' }}>{Math.round(m.value * 100)}%</span>
                          </div>
                          <div style={{ height: '4px', background: t.bgPage, borderRadius: '2px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', background: m.value > 0.7 ? t.success : m.value > 0.4 ? t.warning : t.danger, width: `${m.value * 100}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: `1px solid ${t.borderCard}` }}>
              {!showOverrideList ? (
                <button onClick={() => setShowOverrideList(true)}
                  style={{ width: '100%', padding: '10px', background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, borderRadius: '8px', color: t.danger, fontSize: '12px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                  ⚠️ OVERRIDE — Assign to a different reporter
                </button>
              ) : (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <p style={{ color: t.danger, fontSize: '12px', fontWeight: '700', margin: 0 }}>SELECT ANY REPORTER TO OVERRIDE ASSIGN</p>
                    <button onClick={() => setShowOverrideList(false)} style={{ background: 'none', border: 'none', color: t.textMuted, fontSize: '18px', cursor: 'pointer' }}>x</button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
                    {reporters.map(r => {
                      const rAvail = availability.find(a => a.reporter_id === r.id)
                      const rActive = assignments.filter(a => a.reporter_id === r.id).length
                      const today = new Date().toISOString().split('T')[0]
                      const rOnLeave = leaves.some(l => l.reporter_id === r.id && l.leave_date === today && l.status === 'acknowledged')
                      const isSuggested = scoredReporters.find(s => s.reporter_id === r.id)
                      return (
                        <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: '6px', border: `1px solid ${t.dangerBorder}`, background: t.dangerBg }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                              <span style={{ color: t.textPrimary, fontSize: '13px', fontWeight: '600' }}>{r.name}</span>
                              {isSuggested && <span style={{ padding: '1px 5px', borderRadius: '3px', fontSize: '9px', fontWeight: '700', background: t.accentBg, color: t.accent }}>SUGGESTED</span>}
                              {rOnLeave && <span style={{ padding: '1px 5px', borderRadius: '3px', fontSize: '9px', fontWeight: '700', background: t.dangerBg, color: t.danger, border: `1px solid ${t.dangerBorder}` }}>ON LEAVE</span>}
                            </div>
                            <p style={{ color: t.textMuted, fontSize: '11px', margin: 0 }}>{r.beats?.join(', ')} | {rActive}/{r.max_stories_per_week} | {rAvail?.available_days?.join(', ') || 'Mon-Fri'}</p>
                          </div>
                          <button onClick={() => { setPostOverrideModal(r); setShowOverrideList(false) }}
                            style={{ padding: '6px 12px', background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, borderRadius: '6px', color: t.danger, fontSize: '11px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', marginLeft: '10px' }}>
                            OVERRIDE
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {postOverrideModal && (
        <div style={{ position: 'fixed', inset: 0, background: t.overlayBg, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}
          onClick={e => { if (e.target === e.currentTarget) { setPostOverrideModal(null); setPostOverrideReason('') } }}>
          <div style={{ background: t.bgCard, border: `1px solid ${t.dangerBorder}`, borderRadius: '12px', width: '100%', maxWidth: '460px', margin: '24px', padding: '28px', fontFamily: 'inherit', boxShadow: t.shadow }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', alignItems: 'center' }}>
              <h2 style={{ color: t.textPrimary, margin: 0, fontSize: '18px', fontWeight: '700' }}>Override Assignment</h2>
              <button onClick={() => { setPostOverrideModal(null); setPostOverrideReason('') }} style={{ background: 'none', border: 'none', color: t.textMuted, fontSize: '22px', cursor: 'pointer' }}>x</button>
            </div>
            <p style={{ color: t.textMuted, fontSize: '13px', margin: '0 0 16px' }}>Assigning to: <span style={{ color: t.danger, fontWeight: '700' }}>{postOverrideModal?.name}</span></p>
            <div style={{ padding: '12px', background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, borderRadius: '8px', marginBottom: '16px' }}>
              <p style={{ color: t.danger, fontSize: '12px', margin: 0 }}>⚠️ Reporter will be notified and must accept or reject with a reason.</p>
            </div>
            <label style={{ color: t.textSecondary, fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '6px' }}>REASON FOR OVERRIDE <span style={{ color: t.danger }}>*required</span></label>
            <textarea value={postOverrideReason} onChange={e => setPostOverrideReason(e.target.value)} rows={3}
              placeholder="e.g. Urgent breaking news, best beat match despite unavailability..."
              style={{ ...inputStyle, resize: 'none' as const, marginBottom: '16px' }} />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => { setPostOverrideModal(null); setPostOverrideReason('') }}
                style={{ flex: 1, padding: '12px', background: 'transparent', border: `1px solid ${t.borderCard}`, borderRadius: '8px', color: t.textMuted, fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>CANCEL</button>
              <button onClick={postOverrideAssign} disabled={!postOverrideReason.trim() || postOverrideLoading}
                style={{ flex: 1, padding: '12px', background: postOverrideReason.trim() ? t.dangerBg : t.bgInput, border: `1px solid ${postOverrideReason.trim() ? t.dangerBorder : t.borderCard}`, borderRadius: '8px', color: postOverrideReason.trim() ? t.danger : t.textDisabled, fontSize: '13px', fontWeight: '700', cursor: postOverrideReason.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: postOverrideLoading ? 0.6 : 1 }}>
                {postOverrideLoading ? 'ASSIGNING...' : 'CONFIRM OVERRIDE'}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewReportModal && (
        <div style={{ position: 'fixed', inset: 0, background: t.overlayBg, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }}
          onClick={e => { if (e.target === e.currentTarget) setViewReportModal(null) }}>
          <div style={{ background: t.bgCard, border: `1px solid ${t.accentBorder}`, borderRadius: '14px', width: '100%', maxWidth: '700px', margin: '24px', padding: '28px', boxShadow: t.shadow, maxHeight: '88vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <div style={{ display: 'inline-flex', padding: '5px 12px', background: t.accentBg, border: `1px solid ${t.accentBorder}`, borderRadius: '6px', marginBottom: '8px' }}>
                  <span style={{ color: t.accent, fontSize: '10px', fontWeight: '700', letterSpacing: '1px' }}>AMBIENT SCRIBE REPORT</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ padding: '3px 10px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', background: viewReportModal.status === 'approved' ? t.successBg : t.warningBg, color: viewReportModal.status === 'approved' ? t.success : t.warning, border: `1px solid ${viewReportModal.status === 'approved' ? t.successBorder : t.warningBorder}` }}>
                    {viewReportModal.status?.toUpperCase()}
                  </span>
                  <span style={{ color: t.textMuted, fontSize: '12px' }}>Generated: {formatDate(viewReportModal.created_at?.split('T')[0])}</span>
                  {viewReportModal.approved_at && <span style={{ color: t.textMuted, fontSize: '12px' }}>| Approved: {formatDate(viewReportModal.approved_at?.split('T')[0])}</span>}
                  <span style={{ fontSize: '18px', fontWeight: '800', color: getConfidenceColor(viewReportModal.confidence_score) }}>{viewReportModal.confidence_score}%</span>
                </div>
              </div>
              <button onClick={() => setViewReportModal(null)} style={{ background: 'none', border: 'none', color: t.textMuted, fontSize: '22px', cursor: 'pointer' }}>x</button>
            </div>
            {viewReportModal.story_ids?.length > 0 && (
              <div style={{ marginBottom: '16px', padding: '12px 16px', background: t.bgPage, borderRadius: '8px', border: `1px solid ${t.borderCard}` }}>
                <p style={{ color: t.textSecondary, fontSize: '11px', fontWeight: '700', margin: '0 0 8px', letterSpacing: '0.5px' }}>LINKED STORIES</p>
                {viewReportModal.story_ids.map((id: string) => {
                  const story = stories.find((s: any) => s.id === id)
                  return story ? <p key={id} style={{ color: t.textPrimary, fontSize: '12px', margin: '0 0 4px' }}>• {story.headline} <span style={{ color: t.textMuted }}>({story.category} — Due {formatDate(story.deadline)})</span></p> : null
                })}
              </div>
            )}
            {[
              { label: '📝 Notes about the Story', content: viewReportModal.story_notes, color: t.accent, border: t.accentBorder, bg: t.accentBg },
              { label: '👤 Notes about Assignment to Reporter', content: viewReportModal.assignment_notes, color: '#a78bfa', border: 'rgba(167,139,250,0.3)', bg: 'rgba(167,139,250,0.08)' },
              { label: '📅 Notes about Reporter Rostering', content: viewReportModal.rostering_notes, color: t.success, border: t.successBorder, bg: t.successBg },
            ].map(section => (
              <div key={section.label} style={{ marginBottom: '16px', padding: '18px', borderRadius: '8px', border: `1px solid ${section.border}`, background: section.bg }}>
                <h3 style={{ color: section.color, margin: '0 0 10px', fontSize: '13px', fontWeight: '700' }}>{section.label}</h3>
                <p style={{ color: t.textPrimary, fontSize: '13px', margin: 0, lineHeight: 1.8 }}>{section.content || 'No content available'}</p>
              </div>
            ))}
            <button onClick={() => setViewReportModal(null)}
              style={{ width: '100%', padding: '13px', background: t.accent, border: 'none', borderRadius: '8px', color: t.accentText, fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
              CLOSE
            </button>
          </div>
        </div>
      )}
    </div>
  )
}