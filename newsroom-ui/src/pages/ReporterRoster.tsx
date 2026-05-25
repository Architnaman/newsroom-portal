import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Navbar from '../components/Navbar'
import { useTheme } from '../context/ThemeContext'
import { useCollapse } from '../hooks/useCollapse'
import SectionCard from '../components/SectionCard'

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

function getTodayStr(): string {
  return new Date().toISOString().split('T')[0]
}

function isPast(dateStr: string): boolean {
  return dateStr < getTodayStr()
}

export default function ReporterRoster() {
  const { t } = useTheme()
  const navigate = useNavigate()

  const [reporters, setReporters] = useState<any[]>([])
  const [availability, setAvailability] = useState<any[]>([])
  const [assignments, setAssignments] = useState<any[]>([])
  const [leaves, setLeaves] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const weekStart = getCurrentWeekStart()
  const weekDates = getCurrentWeekDates()
  const today = getTodayStr()

async function load() {
  const weekEnd = (() => {
    const d = new Date(weekStart + 'T00:00:00')
    d.setDate(d.getDate() + 6)
    return d.toISOString().split('T')[0]
  })()

  const [
    { data: r },
    { data: a },
    { data: ass },
    { data: l }
  ] = await Promise.all([
    supabase.from('reporters').select('*').eq('status', 'active').order('name'),
    supabase.from('availability').select('*').eq('week_start_date', weekStart),
    // FIXED: only count current week active stories that are not filed/published
    supabase.from('assignments')
      .select('reporter_id, stories!inner(deadline, status)')
      .eq('is_active', true)
      .gte('stories.deadline', weekStart)
      .lte('stories.deadline', weekEnd)
      .not('stories.status', 'in', '("filed","published")'),
    supabase.from('leave_requests').select('*').in('status', ['pending', 'acknowledged'])
  ])

  setReporters(r || [])
  setAvailability(a || [])
  setAssignments(ass || [])
  setLeaves(l || [])
  setLoading(false)
}

  useEffect(() => { load() }, [])

  const availMap: Record<string, string[]> = {}
// FIXED: if no availability row exists for this week, default to Mon-Fri available
reporters.forEach(r => {
  availMap[r.id] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] // default
})
availability.forEach(a => {
  availMap[a.reporter_id] = a.available_days // override with actual if exists
})

  const countMap: Record<string, number> = {}
  assignments.forEach(a => { countMap[a.reporter_id] = (countMap[a.reporter_id] || 0) + 1 })

  const leaveMap: Record<string, { date: string, status: string }[]> = {}
  leaves.forEach(l => {
    if (!leaveMap[l.reporter_id]) leaveMap[l.reporter_id] = []
    leaveMap[l.reporter_id].push({ date: l.leave_date, status: l.status })
  })

  function getDayStatus(reporterId: string, day: string) {
    const dateForDay = weekDates[day]
    // FIXED: weekends always unavailable
    if (day === 'Sat' || day === 'Sun') return 'unavailable'
    const reporterLeaves = leaveMap[reporterId] || []
    const leaveOnDay = reporterLeaves.find(l => l.date === dateForDay)
    if (leaveOnDay?.status === 'acknowledged') return 'leave_approved'
    if (leaveOnDay?.status === 'pending') return 'leave_pending'
    if (isPast(dateForDay)) return 'past'
    const avail = availMap[reporterId] || []
    if (avail.includes(day)) return 'available'
    return 'unavailable'
  }

  function getDayCell(status: string, isToday_: boolean) {
    const base = {
      width: '32px',
      height: '32px',
      borderRadius: '6px',
      margin: '0 auto',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '10px',
      fontWeight: '700' as const,
      border: '2px solid',
      outline: isToday_ ? `2px solid ${t.accent}` : 'none',
      outlineOffset: '2px',
    }
    switch (status) {
      case 'available':
        return { ...base, background: t.successBg, borderColor: t.successBorder, color: t.success, content: '✓' }
      case 'leave_approved':
        return { ...base, background: t.dangerBg, borderColor: t.dangerBorder, color: t.danger, content: 'L' }
      case 'leave_pending':
        return { ...base, background: t.warningBg, borderColor: t.warningBorder, color: t.warning, content: '?' }
      case 'past':
        return { ...base, background: t.bgPage, borderColor: t.borderCard, color: t.textDisabled, content: '–' }
      default:
        return { ...base, background: t.bgInput, borderColor: t.borderCard, color: t.textDisabled, content: '' }
    }
  }

  const thStyle: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: '600',
    letterSpacing: '0.5px',
    padding: '0 8px 14px',
    textAlign: 'left' as const,
    color: t.textMuted,
    whiteSpace: 'nowrap' as const,
  }

  const tdBase: React.CSSProperties = {
    padding: '14px 16px',
    background: t.bgCard,
    border: `1px solid ${t.borderCard}`,
    borderLeft: 'none',
    borderRight: 'none',
    verticalAlign: 'middle',
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: t.bgPage,
      fontFamily: '"Inter", "DM Mono", "Courier New", monospace',
      color: t.textPrimary
    }}>
      <Navbar />
      <main role="main" style={{ padding: '32px 24px', maxWidth: '1400px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1 style={{ color: t.textPrimary, margin: '0 0 6px', fontSize: '22px', fontWeight: '700' }}>
              Reporter Roster
            </h1>
            <p style={{ color: t.textMuted, margin: 0, fontSize: '13px' }}>
              Week of {weekStart} — Today is <span style={{ color: t.accent, fontWeight: '600' }}>{today}</span>
            </p>
          </div>

          {/* Legend */}
          <div style={{
            display: 'flex',
            gap: '12px',
            flexWrap: 'wrap',
            alignItems: 'center',
            padding: '10px 16px',
            background: t.bgCard,
            borderRadius: '8px',
            border: `1px solid ${t.borderCard}`,
            boxShadow: t.shadowCard
          }}>
            {[
              { color: t.success, border: t.successBorder, label: 'Available', symbol: '✓' },
              { color: t.textDisabled, border: t.borderCard, label: 'Unavailable', symbol: '' },
              { color: t.textDisabled, border: t.borderCard, label: 'Past', symbol: '–', dim: true },
              { color: t.warning, border: t.warningBorder, label: 'Leave Pending', symbol: '?' },
              { color: t.danger, border: t.dangerBorder, label: 'Leave Approved', symbol: 'L' },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{
                  width: '20px', height: '20px', borderRadius: '5px',
                  background: `${item.color}15`,
                  border: `2px solid ${item.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '9px', color: item.color, fontWeight: '700',
                  opacity: item.dim ? 0.5 : 1
                }}>
                  {item.symbol}
                </div>
                <span style={{ color: t.textMuted, fontSize: '11px', fontWeight: '500' }}>{item.label}</span>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{
                width: '20px', height: '20px', borderRadius: '5px',
                background: t.accentBg,
                border: `2px solid ${t.accent}`,
                outline: `2px solid ${t.accent}`,
                outlineOffset: '1px'
              }} />
              <span style={{ color: t.textMuted, fontSize: '11px', fontWeight: '500' }}>Today</span>
            </div>
          </div>
        </div>

        {loading ? (
          <div style={{
            color: t.textMuted,
            textAlign: 'center',
            padding: '80px',
            fontSize: '14px',
            background: t.bgCard,
            borderRadius: '10px',
            border: `1px solid ${t.borderCard}`
          }}>
            Loading roster...
          </div>
        ) : reporters.length === 0 ? (
          <div style={{
            color: t.textDisabled,
            textAlign: 'center',
            padding: '80px',
            border: `1px dashed ${t.borderCard}`,
            borderRadius: '10px',
            fontSize: '14px',
            background: t.bgCard
          }}>
            No active reporters found
          </div>
        ) : (
          <div style={{ overflowX: 'auto', borderRadius: '10px', boxShadow: t.shadowCard }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 4px', minWidth: '900px' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, textAlign: 'left', paddingLeft: '16px' }}>REPORTER</th>
                  <th style={{ ...thStyle, textAlign: 'left' }}>BEATS</th>
                  {DAYS.map(d => (
                    <th key={d} style={{
                      ...thStyle,
                      textAlign: 'center',
                      minWidth: '48px',
                      color: weekDates[d] === today ? t.accent : t.textMuted,
                      fontWeight: weekDates[d] === today ? '700' : '600',
                    }}>
                      {d}
                      {weekDates[d] === today && (
                        <div style={{ fontSize: '9px', color: t.accent, marginTop: '2px', fontWeight: '700' }}>
                          TODAY
                        </div>
                      )}
                    </th>
                  ))}
                  <th style={{ ...thStyle, textAlign: 'center' }}>STORIES</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>LOAD</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {reporters.map(reporter => {
                  const active = countMap[reporter.id] || 0
                  const capacityPct = (active / reporter.max_stories_per_week) * 100
                  const capacityColor = capacityPct >= 100 ? t.danger : capacityPct > 50 ? t.warning : t.success

                  return (
                    <tr key={reporter.id}>

                      {/* Reporter Info */}
                      <td style={{
                        ...tdBase,
                        borderRadius: '8px 0 0 8px',
                        borderLeft: `1px solid ${t.borderCard}`,
                        paddingLeft: '16px',
                        minWidth: '160px'
                      }}>
                        <div style={{ color: t.textPrimary, fontSize: '14px', fontWeight: '700', marginBottom: '3px' }}>
                          {reporter.name}
                        </div>
                        <div style={{ color: t.textMuted, fontSize: '11px', fontWeight: '400' }}>
                          {reporter.email}
                        </div>
                      </td>

                      {/* Beats */}
                      <td style={{ ...tdBase, minWidth: '140px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {reporter.beats.length > 0 ? reporter.beats.map((b: string) => (
                            <span key={b} style={{
                              padding: '3px 8px',
                              background: t.accentBg,
                              border: `1px solid ${t.accentBorder}`,
                              borderRadius: '4px',
                              color: t.accent,
                              fontSize: '10px',
                              fontWeight: '600'
                            }}>
                              {b}
                            </span>
                          )) : (
                            <span style={{ color: t.textDisabled, fontSize: '12px' }}>No beats</span>
                          )}
                        </div>
                      </td>

                      {/* Day Cells */}
                      {DAYS.map(day => {
                        const status = getDayStatus(reporter.id, day)
                        const isToday_ = weekDates[day] === today
                        const cellStyle = getDayCell(status, isToday_)
                        return (
                          <td key={day} style={{
                            ...tdBase,
                            padding: '8px 4px',
                            textAlign: 'center',
                          }}>
                            <div style={{
                              width: cellStyle.width,
                              height: cellStyle.height,
                              borderRadius: cellStyle.borderRadius,
                              margin: cellStyle.margin,
                              display: cellStyle.display,
                              alignItems: cellStyle.alignItems,
                              justifyContent: cellStyle.justifyContent,
                              background: cellStyle.background,
                              border: cellStyle.border,
                              color: cellStyle.color,
                              fontSize: cellStyle.fontSize,
                              fontWeight: cellStyle.fontWeight,
                              outline: cellStyle.outline,
                              outlineOffset: cellStyle.outlineOffset,
                            }}>
                              {cellStyle.content}
                            </div>
                          </td>
                        )
                      })}

                      {/* Story Count */}
                      <td style={{ ...tdBase, textAlign: 'center', minWidth: '80px' }}>
                        <span style={{
                          color: active > 0 ? t.accent : t.textDisabled,
                          fontSize: '18px',
                          fontWeight: '800'
                        }}>
                          {active}
                        </span>
                        <span style={{ color: t.textDisabled, fontSize: '12px', fontWeight: '500' }}>
                          /{reporter.max_stories_per_week}
                        </span>
                      </td>

                      {/* Capacity Bar */}
                      <td style={{ ...tdBase, minWidth: '100px', padding: '14px 16px' }}>
                        <div style={{
                          height: '6px',
                          background: t.bgPage,
                          borderRadius: '3px',
                          border: `1px solid ${t.borderCard}`,
                          overflow: 'hidden'
                        }}>
                          <div style={{
                            height: '100%',
                            borderRadius: '3px',
                            background: capacityColor,
                            width: `${Math.min(capacityPct, 100)}%`,
                            transition: 'width 0.5s'
                          }} />
                        </div>
                        <div style={{
                          color: capacityColor,
                          fontSize: '11px',
                          fontWeight: '700',
                          marginTop: '4px',
                          textAlign: 'right'
                        }}>
                          {Math.round(capacityPct)}%
                        </div>
                      </td>

                      {/* VIEW AS button */}
                      <td style={{
                        ...tdBase,
                        borderRadius: '0 8px 8px 0',
                        borderRight: `1px solid ${t.borderCard}`,
                        textAlign: 'center',
                        padding: '8px 16px'
                      }}>
                        <button
                          onClick={() => navigate(`/reporter-view/${reporter.id}`)}
                          aria-label={`View ${reporter.name}'s dashboard`}
                          style={{
                            padding: '8px 16px',
                            background: t.accentBg,
                            border: `1px solid ${t.accentBorder}`,
                            borderRadius: '6px',
                            color: t.accent,
                            fontSize: '11px',
                            fontWeight: '700',
                            letterSpacing: '0.5px',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            whiteSpace: 'nowrap',
                            transition: 'all 0.15s'
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.background = t.accent
                            e.currentTarget.style.color = t.accentText
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = t.accentBg
                            e.currentTarget.style.color = t.accent
                          }}>
                          VIEW AS
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}





