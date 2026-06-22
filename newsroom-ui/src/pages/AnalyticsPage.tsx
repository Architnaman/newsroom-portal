import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Navbar from '../components/Navbar'
import { useTheme } from '../context/ThemeContext'
import { useDateFormat } from '../context/DateFormatContext'
import { useCollapse } from '../hooks/useCollapse'
import SectionCard from '../components/SectionCard'
import { useResponsive } from '../hooks/useResponsive'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'

type RangeKey = '7d' | '30d' | '90d' | 'all'

export default function AnalyticsPage() {
  const { t } = useTheme()
  const { formatDate } = useDateFormat()
  const { toggle, isCollapsed } = useCollapse('analytics', [
    'overview', 'volume', 'leaderboard', 'deadlines', 'overrides'
  ])
  const { isMobile, isTablet } = useResponsive()

  const [range, setRange] = useState<RangeKey>('30d')
  const [loading, setLoading] = useState(true)
  const [stories, setStories] = useState<any[]>([])
  const [assignments, setAssignments] = useState<any[]>([])
  const [reporters, setReporters] = useState<any[]>([])
  const [leaves, setLeaves] = useState<any[]>([])

  function getRangeStart(): string | null {
    if (range === 'all') return null
    const days = range === '7d' ? 7 : range === '30d' ? 30 : 90
    const d = new Date()
    d.setDate(d.getDate() - days)
    return d.toISOString().split('T')[0]
  }

  async function load() {
    setLoading(true)
    const rangeStart = getRangeStart()

    let storyQuery = supabase.from('stories').select('*').order('created_at', { ascending: true })
    if (rangeStart) storyQuery = storyQuery.gte('created_at', rangeStart)
    const { data: storyData } = await storyQuery

    const { data: assignmentData } = await supabase
      .from('assignments')
      .select('*')
      .order('assigned_at', { ascending: true })

    const { data: reporterData } = await supabase.from('reporters').select('*')

    let leaveQuery = supabase.from('leave_requests').select('*').order('created_at', { ascending: true })
    if (rangeStart) leaveQuery = leaveQuery.gte('created_at', rangeStart)
    const { data: leaveData } = await leaveQuery

    setStories(storyData || [])
    setAssignments(assignmentData || [])
    setReporters(reporterData || [])
    setLeaves(leaveData || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [range])

  // ── METRIC 1: Story volume & status trends over time (by week) ──
  function getWeekKey(dateStr: string): string {
    const d = new Date(dateStr)
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(d)
    monday.setDate(diff)
    return monday.toISOString().split('T')[0]
  }

  function buildVolumeTrend() {
    const buckets: Record<string, { week: string; created: number; published: number; assigned: number }> = {}
    stories.forEach(s => {
      const wk = getWeekKey(s.created_at)
      if (!buckets[wk]) buckets[wk] = { week: wk, created: 0, published: 0, assigned: 0 }
      buckets[wk].created += 1
      if (s.status === 'published') buckets[wk].published += 1
      if (s.status === 'assigned' || s.status === 'in_progress' || s.status === 'filed') buckets[wk].assigned += 1
    })
    return Object.values(buckets).sort((a, b) => a.week.localeCompare(b.week))
      .map(b => ({ ...b, weekLabel: formatDate(b.week) }))
  }

  // ── METRIC 2: Category breakdown ──
  function buildCategoryBreakdown() {
    const counts: Record<string, number> = {}
    stories.forEach(s => { counts[s.category] = (counts[s.category] || 0) + 1 })
    return Object.entries(counts).map(([name, value]) => ({ name, value }))
  }

  // ── METRIC 3: Reporter activity leaderboard ──
  function buildLeaderboard() {
    return reporters.map(r => {
      const reporterAssignments = assignments.filter(a => a.reporter_id === r.id)
      const active = reporterAssignments.filter(a => a.is_active).length
      const overrides = reporterAssignments.filter(a => a.is_override).length
      const overrideAccepted = reporterAssignments.filter(a => a.is_override && a.override_status === 'accepted').length
      const overrideRejected = reporterAssignments.filter(a => a.is_override && a.override_status === 'rejected').length
      return {
        name: r.name,
        total: reporterAssignments.length,
        active,
        overrides,
        overrideAccepted,
        overrideRejected,
        capacity: r.max_stories_per_week || 0,
      }
    }).sort((a, b) => b.total - a.total)
  }

  // ── METRIC 4: Deadline performance (on-time vs late) ──
  function buildDeadlinePerformance() {
    const filedOrPublished = stories.filter(s => s.status === 'filed' || s.status === 'published')
    let onTime = 0
    let late = 0
    filedOrPublished.forEach(s => {
      const filedDate = s.filed_at ? s.filed_at.split('T')[0] : null
      if (filedDate && s.deadline) {
        if (filedDate <= s.deadline) onTime += 1
        else late += 1
      }
    })
    const stillOpen = stories.filter(s =>
      s.status === 'assigned' || s.status === 'in_progress' || s.status === 'unassigned'
    ).length
    return { onTime, late, stillOpen, total: onTime + late }
  }

  // ── METRIC 5: Override & leave patterns ──
  function buildOverrideStats() {
    const total = assignments.length
    const overrides = assignments.filter(a => a.is_override).length
    const normal = total - overrides
    return { overrides, normal, total, pct: total > 0 ? Math.round((overrides / total) * 100) : 0 }
  }

  function buildLeaveStats() {
    const pending = leaves.filter(l => l.status === 'pending').length
    const acknowledged = leaves.filter(l => l.status === 'acknowledged').length
    const rejected = leaves.filter(l => l.status === 'rejected').length
    const byType: Record<string, number> = {}
    leaves.forEach(l => { byType[l.leave_type] = (byType[l.leave_type] || 0) + 1 })
    return { pending, acknowledged, rejected, total: leaves.length, byType }
  }

  const volumeTrend = buildVolumeTrend()
  const categoryBreakdown = buildCategoryBreakdown()
  const leaderboard = buildLeaderboard()
  const deadlinePerf = buildDeadlinePerformance()
  const overrideStats = buildOverrideStats()
  const leaveStats = buildLeaveStats()

  const PIE_COLORS = [t.accent, t.success, t.warning, t.danger, '#a78bfa', '#38bdf8', '#fb923c', '#f472b6']

  const cardStyle: React.CSSProperties = {
    background: t.bgCard, border: `1px solid ${t.borderCard}`,
    borderRadius: '10px', padding: isMobile ? '12px' : '16px',
    boxShadow: t.shadowCard,
  }

  const statBoxStyle: React.CSSProperties = {
    padding: isMobile ? '14px' : '20px', borderRadius: '10px',
    background: t.bgPage, border: `1px solid ${t.borderCard}`,
    display: 'flex', flexDirection: 'column', gap: '8px',
  }

  const chartHeight = isMobile ? 220 : isTablet ? 260 : 300

  const rangeOptions: { key: RangeKey; label: string }[] = [
    { key: '7d', label: '7 DAYS' },
    { key: '30d', label: '30 DAYS' },
    { key: '90d', label: '90 DAYS' },
    { key: 'all', label: 'ALL TIME' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: t.bgPage, fontFamily: '"Inter", "DM Mono", "Courier New", monospace', color: t.textPrimary }}>
      <Navbar />
      <main role="main" style={{
        padding: isMobile ? '16px 12px' : isTablet ? '24px 16px' : '32px 24px',
        maxWidth: isMobile ? '100%' : '1280px',
        margin: '0 auto'
      }}>

        {/* Header */}
        <div style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          justifyContent: 'space-between',
          alignItems: isMobile ? 'flex-start' : 'center',
          marginBottom: isMobile ? '16px' : '24px',
          gap: '12px'
        }}>
          <div>
            <h1 style={{ color: t.textPrimary, margin: '0 0 6px', fontSize: isMobile ? '18px' : '22px', fontWeight: '700' }}>Analytics</h1>
            <p style={{ color: t.textMuted, margin: 0, fontSize: '13px' }}>Story workflow trends, reporter activity and deadline performance</p>
          </div>

          {/* Range selector */}
          <div style={{ display: 'flex', gap: '4px', padding: '4px', background: t.bgInput, borderRadius: '8px', border: `1px solid ${t.borderCard}`, width: isMobile ? '100%' : 'auto' }}>
            {rangeOptions.map(opt => (
              <button key={opt.key} onClick={() => setRange(opt.key)}
                style={{
                  flex: isMobile ? 1 : 'none',
                  padding: isMobile ? '8px 10px' : '8px 16px',
                  borderRadius: '6px', border: 'none',
                  background: range === opt.key ? t.accent : 'transparent',
                  color: range === opt.key ? t.accentText : t.textMuted,
                  fontSize: isMobile ? '10px' : '11px',
                  fontWeight: range === opt.key ? '700' : '500',
                  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                  minHeight: '36px',
                }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ color: t.textMuted, textAlign: 'center', padding: '60px', fontSize: '14px' }}>Loading analytics...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '12px' : '20px' }}>

            {/* OVERVIEW STAT CARDS */}
            <SectionCard title="OVERVIEW" isCollapsed={isCollapsed('overview')} onToggle={() => toggle('overview')}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : isTablet ? 'repeat(3, 1fr)' : 'repeat(5, 1fr)',
                gap: isMobile ? '10px' : '14px'
              }}>
                {[
                  { label: 'Total Stories', value: stories.length, color: t.accent },
                  { label: 'Published', value: stories.filter(s => s.status === 'published').length, color: t.success },
                  { label: 'Unassigned', value: stories.filter(s => s.status === 'unassigned').length, color: t.danger },
                  { label: 'Overrides', value: overrideStats.overrides, color: t.warning },
                  { label: 'Leave Requests', value: leaveStats.total, color: '#a78bfa' },
                ].map(stat => (
                  <div key={stat.label} style={statBoxStyle}>
                    <div style={{ color: stat.color, fontSize: isMobile ? '24px' : '32px', fontWeight: '800', lineHeight: 1 }}>{stat.value}</div>
                    <div style={{ color: t.textSecondary, fontSize: isMobile ? '9px' : '11px', fontWeight: '600', letterSpacing: '0.5px' }}>{stat.label.toUpperCase()}</div>
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* STORY VOLUME TREND + CATEGORY BREAKDOWN */}
            <SectionCard title="STORY VOLUME & STATUS TRENDS" isCollapsed={isCollapsed('volume')} onToggle={() => toggle('volume')}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile || isTablet ? '1fr' : '1.4fr 1fr',
                gap: '16px'
              }}>
                <div style={cardStyle}>
                  <p style={{ color: t.textSecondary, fontSize: '12px', fontWeight: '700', margin: '0 0 12px', letterSpacing: '0.5px' }}>STORIES PER WEEK</p>
                  {volumeTrend.length === 0 ? (
                    <div style={{ color: t.textDisabled, fontSize: '13px', textAlign: 'center', padding: '40px' }}>No data in this range</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={chartHeight}>
                      <LineChart data={volumeTrend} margin={{ top: 5, right: isMobile ? 5 : 20, left: isMobile ? -20 : 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={t.borderCard} />
                        <XAxis dataKey="weekLabel" stroke={t.textMuted} fontSize={isMobile ? 9 : 11} />
                        <YAxis stroke={t.textMuted} fontSize={isMobile ? 9 : 11} allowDecimals={false} />
                        <Tooltip contentStyle={{ background: t.bgCard, border: `1px solid ${t.borderCard}`, borderRadius: '8px', fontSize: '12px' }} />
                        <Legend wrapperStyle={{ fontSize: isMobile ? '10px' : '12px' }} />
                        <Line type="monotone" dataKey="created" name="Created" stroke={t.accent} strokeWidth={2} dot={{ r: 3 }} />
                        <Line type="monotone" dataKey="published" name="Published" stroke={t.success} strokeWidth={2} dot={{ r: 3 }} />
                        <Line type="monotone" dataKey="assigned" name="In Progress" stroke={t.warning} strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>

                <div style={cardStyle}>
                  <p style={{ color: t.textSecondary, fontSize: '12px', fontWeight: '700', margin: '0 0 12px', letterSpacing: '0.5px' }}>BY CATEGORY</p>
                  {categoryBreakdown.length === 0 ? (
                    <div style={{ color: t.textDisabled, fontSize: '13px', textAlign: 'center', padding: '40px' }}>No data in this range</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={chartHeight}>
                      <PieChart>
                        <Pie data={categoryBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%"
                          outerRadius={isMobile ? 60 : 90} label={!isMobile ? ({ name, value }) => `${name}: ${value}` : false}>
                          {categoryBreakdown.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={{ background: t.bgCard, border: `1px solid ${t.borderCard}`, borderRadius: '8px', fontSize: '12px' }} />
                        <Legend wrapperStyle={{ fontSize: isMobile ? '10px' : '12px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </SectionCard>

            {/* REPORTER LEADERBOARD */}
            <SectionCard title="REPORTER ACTIVITY LEADERBOARD" isCollapsed={isCollapsed('leaderboard')} onToggle={() => toggle('leaderboard')} badge={leaderboard.length} badgeColor={t.accent}>
              {leaderboard.length === 0 ? (
                <div style={{ color: t.textDisabled, fontSize: '13px', textAlign: 'center', padding: '32px', border: `1px dashed ${t.borderCard}`, borderRadius: '8px' }}>No reporters found</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {leaderboard.map((r, i) => (
                    <div key={r.name} style={{
                      padding: isMobile ? '12px' : '14px 18px', borderRadius: '8px',
                      border: `1px solid ${i === 0 ? t.accentBorder : t.borderCard}`,
                      background: i === 0 ? t.accentBg : t.bgPage,
                      display: 'flex', flexDirection: isMobile ? 'column' : 'row',
                      justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center',
                      gap: isMobile ? '10px' : '0'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        {i === 0 && <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', background: t.accentBg, color: t.accent, border: `1px solid ${t.accentBorder}` }}>TOP</span>}
                        <span style={{ color: t.textPrimary, fontSize: '14px', fontWeight: '700' }}>{r.name}</span>
                        <span style={{ color: t.textMuted, fontSize: '12px' }}>{r.active}/{r.capacity} active</span>
                      </div>
                      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                        <div style={{ textAlign: isMobile ? 'left' : 'right' as const }}>
                          <div style={{ color: t.accent, fontSize: '18px', fontWeight: '800', lineHeight: 1 }}>{r.total}</div>
                          <div style={{ color: t.textMuted, fontSize: '10px', fontWeight: '600' }}>TOTAL ASSIGNED</div>
                        </div>
                        {r.overrides > 0 && (
                          <div style={{ textAlign: isMobile ? 'left' : 'right' as const }}>
                            <div style={{ color: t.warning, fontSize: '18px', fontWeight: '800', lineHeight: 1 }}>{r.overrides}</div>
                            <div style={{ color: t.textMuted, fontSize: '10px', fontWeight: '600' }}>OVERRIDES</div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            {/* DEADLINE PERFORMANCE + OVERRIDE/LEAVE PATTERNS */}
            <SectionCard title="DEADLINE PERFORMANCE & PATTERNS" isCollapsed={isCollapsed('deadlines')} onToggle={() => toggle('deadlines')}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile || isTablet ? '1fr' : '1fr 1fr',
                gap: '16px'
              }}>
                <div style={cardStyle}>
                  <p style={{ color: t.textSecondary, fontSize: '12px', fontWeight: '700', margin: '0 0 12px', letterSpacing: '0.5px' }}>ON-TIME VS LATE FILING</p>
                  {deadlinePerf.total === 0 ? (
                    <div style={{ color: t.textDisabled, fontSize: '13px', textAlign: 'center', padding: '32px' }}>No filed stories in this range yet</div>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={chartHeight}>
                        <BarChart data={[
                          { name: 'On Time', value: deadlinePerf.onTime, fill: t.success },
                          { name: 'Late', value: deadlinePerf.late, fill: t.danger },
                        ]} margin={{ top: 5, right: isMobile ? 5 : 20, left: isMobile ? -20 : 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={t.borderCard} />
                          <XAxis dataKey="name" stroke={t.textMuted} fontSize={isMobile ? 10 : 12} />
                          <YAxis stroke={t.textMuted} fontSize={isMobile ? 9 : 11} allowDecimals={false} />
                          <Tooltip contentStyle={{ background: t.bgCard, border: `1px solid ${t.borderCard}`, borderRadius: '8px', fontSize: '12px' }} />
                          <Bar dataKey="value" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                      <p style={{ color: t.textMuted, fontSize: '12px', margin: '8px 0 0', textAlign: 'center' }}>
                        <span style={{ color: t.success, fontWeight: '700' }}>{deadlinePerf.total > 0 ? Math.round((deadlinePerf.onTime / deadlinePerf.total) * 100) : 0}%</span> on-time rate · {deadlinePerf.stillOpen} stories still open
                      </p>
                    </>
                  )}
                </div>

                <div style={cardStyle}>
                  <p style={{ color: t.textSecondary, fontSize: '12px', fontWeight: '700', margin: '0 0 12px', letterSpacing: '0.5px' }}>ASSIGNMENT TYPE</p>
                  {overrideStats.total === 0 ? (
                    <div style={{ color: t.textDisabled, fontSize: '13px', textAlign: 'center', padding: '32px' }}>No assignments yet</div>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={chartHeight}>
                        <PieChart>
                          <Pie data={[
                            { name: 'Normal', value: overrideStats.normal },
                            { name: 'Override', value: overrideStats.overrides },
                          ]} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={isMobile ? 60 : 90}
                            label={!isMobile ? ({ name, value }) => `${name}: ${value}` : false}>
                            <Cell fill={t.accent} />
                            <Cell fill={t.danger} />
                          </Pie>
                          <Tooltip contentStyle={{ background: t.bgCard, border: `1px solid ${t.borderCard}`, borderRadius: '8px', fontSize: '12px' }} />
                          <Legend wrapperStyle={{ fontSize: isMobile ? '10px' : '12px' }} />
                        </PieChart>
                      </ResponsiveContainer>
                      <p style={{ color: t.textMuted, fontSize: '12px', margin: '8px 0 0', textAlign: 'center' }}>
                        <span style={{ color: t.danger, fontWeight: '700' }}>{overrideStats.pct}%</span> of assignments are overrides
                      </p>
                    </>
                  )}
                </div>
              </div>
            </SectionCard>

            {/* LEAVE PATTERNS */}
            <SectionCard title="LEAVE REQUEST PATTERNS" isCollapsed={isCollapsed('overrides')} onToggle={() => toggle('overrides')}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
                gap: isMobile ? '10px' : '14px',
                marginBottom: '16px'
              }}>
                {[
                  { label: 'Total Requests', value: leaveStats.total, color: t.accent },
                  { label: 'Pending', value: leaveStats.pending, color: t.warning },
                  { label: 'Approved', value: leaveStats.acknowledged, color: t.success },
                  { label: 'Rejected', value: leaveStats.rejected, color: t.danger },
                ].map(stat => (
                  <div key={stat.label} style={statBoxStyle}>
                    <div style={{ color: stat.color, fontSize: isMobile ? '22px' : '28px', fontWeight: '800', lineHeight: 1 }}>{stat.value}</div>
                    <div style={{ color: t.textSecondary, fontSize: isMobile ? '9px' : '11px', fontWeight: '600', letterSpacing: '0.5px' }}>{stat.label.toUpperCase()}</div>
                  </div>
                ))}
              </div>
              {Object.keys(leaveStats.byType).length > 0 && (
                <div style={cardStyle}>
                  <p style={{ color: t.textSecondary, fontSize: '12px', fontWeight: '700', margin: '0 0 12px', letterSpacing: '0.5px' }}>BY LEAVE TYPE</p>
                  <ResponsiveContainer width="100%" height={chartHeight}>
                    <BarChart data={Object.entries(leaveStats.byType).map(([name, value]) => ({ name, value }))}
                      margin={{ top: 5, right: isMobile ? 5 : 20, left: isMobile ? -20 : 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={t.borderCard} />
                      <XAxis dataKey="name" stroke={t.textMuted} fontSize={isMobile ? 10 : 12} />
                      <YAxis stroke={t.textMuted} fontSize={isMobile ? 9 : 11} allowDecimals={false} />
                      <Tooltip contentStyle={{ background: t.bgCard, border: `1px solid ${t.borderCard}`, borderRadius: '8px', fontSize: '12px' }} />
                      <Bar dataKey="value" fill={t.accent} radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </SectionCard>

          </div>
        )}
      </main>
    </div>
  )
}