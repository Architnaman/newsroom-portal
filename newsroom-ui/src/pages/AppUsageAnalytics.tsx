import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Navbar from '../components/Navbar'
import { useTheme } from '../context/ThemeContext'
import { useCollapse } from '../hooks/useCollapse'
import SectionCard from '../components/SectionCard'
import { useResponsive } from '../hooks/useResponsive'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell
} from 'recharts'

type RangeKey = '7d' | '30d' | '90d' | 'all'

const PAGE_LABELS: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/kanban': 'Kanban',
  '/roster': 'Roster',
  '/calendar': 'Calendar',
  '/chat': 'Chat',
  '/ai-report': 'Ambient Scribe',
  '/analytics': 'Analytics',
  '/queue': 'My Stories',
  '/availability': 'Availability',
  '/admin': 'Admin Settings',
}

function labelFor(path: string): string {
  return PAGE_LABELS[path] || path
}

export default function AppUsageAnalytics() {
  const { t } = useTheme()
  const { toggle, isCollapsed } = useCollapse('app-usage', [
    'overview', 'popularity', 'funnel', 'activity'
  ])
  const { isMobile, isTablet } = useResponsive()

  const [range, setRange] = useState<RangeKey>('30d')
  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState<any[]>([])
  const [fromPage, setFromPage] = useState('/dashboard')
  const [toPage, setToPage] = useState('/kanban')

  function getRangeStart(): string | null {
    if (range === 'all') return null
    const days = range === '7d' ? 7 : range === '30d' ? 30 : 90
    const d = new Date()
    d.setDate(d.getDate() - days)
    return d.toISOString()
  }

  async function load() {
    setLoading(true)
    const rangeStart = getRangeStart()
    let query = supabase.from('page_events').select('*').order('created_at', { ascending: true })
    if (rangeStart) query = query.gte('created_at', rangeStart)
    const { data, error } = await query
    if (error) console.error('Failed to load page_events:', error)
    setEvents(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [range])

  const pageViewEvents = events.filter(e => e.event_type === 'page_view')
  const allPaths = Array.from(new Set(pageViewEvents.map(e => e.page_path))).sort()

  // ── METRIC 1: Page popularity ──
  function buildPagePopularity() {
    const counts: Record<string, number> = {}
    pageViewEvents.forEach(e => { counts[e.page_path] = (counts[e.page_path] || 0) + 1 })
    return Object.entries(counts)
      .map(([path, value]) => ({ path, label: labelFor(path), value }))
      .sort((a, b) => b.value - a.value)
  }

  // ── METRIC 2: Drop-off funnel between two chosen pages ──
  function buildFunnel(from: string, to: string) {
    const bySession: Record<string, any[]> = {}
    pageViewEvents.forEach(e => {
      if (!bySession[e.session_id]) bySession[e.session_id] = []
      bySession[e.session_id].push(e)
    })
    let reachedFrom = 0
    let alsoReachedTo = 0
    Object.values(bySession).forEach(sessionEvents => {
      const sorted = [...sessionEvents].sort((a, b) => a.created_at.localeCompare(b.created_at))
      const fromIdx = sorted.findIndex(e => e.page_path === from)
      if (fromIdx === -1) return
      reachedFrom += 1
      const reachedToAfter = sorted.slice(fromIdx + 1).some(e => e.page_path === to)
      if (reachedToAfter) alsoReachedTo += 1
    })
    const dropOff = reachedFrom - alsoReachedTo
    const conversionPct = reachedFrom > 0 ? Math.round((alsoReachedTo / reachedFrom) * 100) : 0
    return { reachedFrom, alsoReachedTo, dropOff, conversionPct }
  }

  // ── METRIC 3: Per-user activity log ──
  function buildUserActivity() {
    const byUser: Record<string, { user_id: string; role: string; reporter_id: string | null; total: number; lastSeen: string; pages: Set<string> }> = {}
    events.forEach(e => {
      if (!byUser[e.user_id]) {
        byUser[e.user_id] = { user_id: e.user_id, role: e.role, reporter_id: e.reporter_id, total: 0, lastSeen: e.created_at, pages: new Set() }
      }
      byUser[e.user_id].total += 1
      if (e.page_path) byUser[e.user_id].pages.add(e.page_path)
      if (e.created_at > byUser[e.user_id].lastSeen) byUser[e.user_id].lastSeen = e.created_at
    })
    return Object.values(byUser)
      .map(u => ({ ...u, pageCount: u.pages.size }))
      .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))
  }

  const pagePopularity = buildPagePopularity()
  const funnel = buildFunnel(fromPage, toPage)
  const userActivity = buildUserActivity()

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
  const selectStyle: React.CSSProperties = {
    padding: '10px 14px', background: t.bgInput, border: `1px solid ${t.borderInput}`,
    borderRadius: '8px', color: t.textPrimary, fontSize: isMobile ? '16px' : '13px',
    outline: 'none', fontFamily: 'inherit', cursor: 'pointer', minHeight: '44px',
  }

  const chartHeight = isMobile ? 220 : isTablet ? 260 : 300
  const rangeOptions: { key: RangeKey; label: string }[] = [
    { key: '7d', label: '7 DAYS' }, { key: '30d', label: '30 DAYS' },
    { key: '90d', label: '90 DAYS' }, { key: 'all', label: 'ALL TIME' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: t.bgPage, fontFamily: '"Inter", "DM Mono", "Courier New", monospace', color: t.textPrimary }}>
      <Navbar />
      <main role="main" style={{
        padding: isMobile ? '16px 12px' : isTablet ? '24px 16px' : '32px 24px',
        maxWidth: isMobile ? '100%' : '1280px', margin: '0 auto'
      }}>

        <div style={{
          display: 'flex', flexDirection: isMobile ? 'column' : 'row',
          justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center',
          marginBottom: isMobile ? '16px' : '24px', gap: '12px'
        }}>
          <div>
            <h1 style={{ color: t.textPrimary, margin: '0 0 6px', fontSize: isMobile ? '18px' : '22px', fontWeight: '700' }}>App Usage</h1>
            <p style={{ color: t.textMuted, margin: 0, fontSize: '13px' }}>Page visits, navigation patterns and drop-off across the app</p>
          </div>
          <div style={{ display: 'flex', gap: '4px', padding: '4px', background: t.bgInput, borderRadius: '8px', border: `1px solid ${t.borderCard}`, width: isMobile ? '100%' : 'auto' }}>
            {rangeOptions.map(opt => (
              <button key={opt.key} onClick={() => setRange(opt.key)}
                style={{
                  flex: isMobile ? 1 : 'none', padding: isMobile ? '8px 10px' : '8px 16px',
                  borderRadius: '6px', border: 'none',
                  background: range === opt.key ? t.accent : 'transparent',
                  color: range === opt.key ? t.accentText : t.textMuted,
                  fontSize: isMobile ? '10px' : '11px', fontWeight: range === opt.key ? '700' : '500',
                  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', minHeight: '36px',
                }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ color: t.textMuted, textAlign: 'center', padding: '60px', fontSize: '14px' }}>Loading usage data...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '12px' : '20px' }}>

            {/* OVERVIEW */}
            <SectionCard title="OVERVIEW" isCollapsed={isCollapsed('overview')} onToggle={() => toggle('overview')}>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: isMobile ? '10px' : '14px' }}>
                {[
                  { label: 'Total Page Views', value: pageViewEvents.length, color: t.accent },
                  { label: 'Unique Sessions', value: new Set(events.map(e => e.session_id)).size, color: t.success },
                  { label: 'Unique Users', value: userActivity.length, color: t.warning },
                  { label: 'Total Actions Logged', value: events.filter(e => e.event_type === 'action').length, color: '#a78bfa' },
                ].map(stat => (
                  <div key={stat.label} style={statBoxStyle}>
                    <div style={{ color: stat.color, fontSize: isMobile ? '24px' : '32px', fontWeight: '800', lineHeight: 1 }}>{stat.value}</div>
                    <div style={{ color: t.textSecondary, fontSize: isMobile ? '9px' : '11px', fontWeight: '600', letterSpacing: '0.5px' }}>{stat.label.toUpperCase()}</div>
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* PAGE POPULARITY */}
            <SectionCard title="PAGE POPULARITY" isCollapsed={isCollapsed('popularity')} onToggle={() => toggle('popularity')} badge={pagePopularity.length} badgeColor={t.accent}>
              {pagePopularity.length === 0 ? (
                <div style={{ color: t.textDisabled, fontSize: '13px', textAlign: 'center', padding: '40px', border: `1px dashed ${t.borderCard}`, borderRadius: '8px' }}>No page views in this range</div>
              ) : (
                <div style={cardStyle}>
                  <ResponsiveContainer width="100%" height={chartHeight}>
                    <BarChart data={pagePopularity} layout="vertical" margin={{ top: 5, right: isMobile ? 10 : 30, left: isMobile ? 10 : 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={t.borderCard} />
                      <XAxis type="number" stroke={t.textMuted} fontSize={isMobile ? 9 : 11} allowDecimals={false} />
                      <YAxis type="category" dataKey="label" stroke={t.textMuted} fontSize={isMobile ? 9 : 11} width={isMobile ? 70 : 110} />
                      <Tooltip contentStyle={{ background: t.bgCard, border: `1px solid ${t.borderCard}`, borderRadius: '8px', fontSize: '12px' }} />
                      <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                        {pagePopularity.map((_, i) => <Cell key={i} fill={i === 0 ? t.accent : t.accent + '90'} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </SectionCard>

            {/* FUNNEL */}
            <SectionCard title="DROP-OFF FUNNEL" isCollapsed={isCollapsed('funnel')} onToggle={() => toggle('funnel')}>
              <div style={cardStyle}>
                <p style={{ color: t.textMuted, fontSize: '12px', margin: '0 0 14px', lineHeight: 1.5 }}>
                  Of all sessions that visited the first page, what percentage also visited the second page afterward?
                </p>
                <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '10px', marginBottom: '20px', alignItems: isMobile ? 'stretch' : 'center' }}>
                  <select value={fromPage} onChange={e => setFromPage(e.target.value)} style={selectStyle}>
                    {allPaths.map(p => <option key={p} value={p}>{labelFor(p)}</option>)}
                  </select>
                  <span style={{ color: t.textMuted, fontSize: '13px', textAlign: 'center' }}>→</span>
                  <select value={toPage} onChange={e => setToPage(e.target.value)} style={selectStyle}>
                    {allPaths.map(p => <option key={p} value={p}>{labelFor(p)}</option>)}
                  </select>
                </div>

                {funnel.reachedFrom === 0 ? (
                  <div style={{ color: t.textDisabled, fontSize: '13px', textAlign: 'center', padding: '24px' }}>No sessions visited "{labelFor(fromPage)}" in this range</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: isMobile ? '10px' : '14px' }}>
                    <div style={statBoxStyle}>
                      <div style={{ color: t.accent, fontSize: isMobile ? '22px' : '28px', fontWeight: '800', lineHeight: 1 }}>{funnel.reachedFrom}</div>
                      <div style={{ color: t.textSecondary, fontSize: '11px', fontWeight: '600' }}>VISITED {labelFor(fromPage).toUpperCase()}</div>
                    </div>
                    <div style={statBoxStyle}>
                      <div style={{ color: t.success, fontSize: isMobile ? '22px' : '28px', fontWeight: '800', lineHeight: 1 }}>{funnel.alsoReachedTo}</div>
                      <div style={{ color: t.textSecondary, fontSize: '11px', fontWeight: '600' }}>ALSO REACHED {labelFor(toPage).toUpperCase()}</div>
                    </div>
                    <div style={{ ...statBoxStyle, border: `1px solid ${funnel.conversionPct < 50 ? t.dangerBorder : t.successBorder}` }}>
                      <div style={{ color: funnel.conversionPct < 50 ? t.danger : t.success, fontSize: isMobile ? '22px' : '28px', fontWeight: '800', lineHeight: 1 }}>{funnel.conversionPct}%</div>
                      <div style={{ color: t.textSecondary, fontSize: '11px', fontWeight: '600' }}>CONVERSION · {funnel.dropOff} DROPPED OFF</div>
                    </div>
                  </div>
                )}
              </div>
            </SectionCard>

            {/* PER-USER ACTIVITY LOG */}
            <SectionCard title="PER-USER ACTIVITY LOG" isCollapsed={isCollapsed('activity')} onToggle={() => toggle('activity')} badge={userActivity.length} badgeColor={t.accent}>
              {userActivity.length === 0 ? (
                <div style={{ color: t.textDisabled, fontSize: '13px', textAlign: 'center', padding: '32px', border: `1px dashed ${t.borderCard}`, borderRadius: '8px' }}>No activity in this range</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {userActivity.map(u => (
                    <div key={u.user_id} style={{
                      padding: isMobile ? '12px' : '14px 18px', borderRadius: '8px', border: `1px solid ${t.borderCard}`, background: t.bgPage,
                      display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between',
                      alignItems: isMobile ? 'flex-start' : 'center', gap: isMobile ? '8px' : '0'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <span style={{ padding: '3px 10px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', background: t.accentBg, color: t.accent, border: `1px solid ${t.accentBorder}` }}>{u.role?.toUpperCase()}</span>
                        <span style={{ color: t.textPrimary, fontSize: '13px', fontWeight: '600', wordBreak: 'break-all' }}>{u.user_id.slice(0, 8)}...</span>
                        <span style={{ color: t.textMuted, fontSize: '12px' }}>{u.pageCount} page{u.pageCount !== 1 ? 's' : ''} visited</span>
                      </div>
                      <div style={{ display: 'flex', gap: '14px' }}>
                        <div style={{ textAlign: isMobile ? 'left' : 'right' as const }}>
                          <div style={{ color: t.accent, fontSize: '16px', fontWeight: '800', lineHeight: 1 }}>{u.total}</div>
                          <div style={{ color: t.textMuted, fontSize: '10px', fontWeight: '600' }}>EVENTS</div>
                        </div>
                        <div style={{ textAlign: isMobile ? 'left' : 'right' as const }}>
                          <div style={{ color: t.textSecondary, fontSize: '12px', fontWeight: '600' }}>{new Date(u.lastSeen).toLocaleString()}</div>
                          <div style={{ color: t.textMuted, fontSize: '10px', fontWeight: '600' }}>LAST SEEN</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

          </div>
        )}
      </main>
    </div>
  )
}