import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Navbar from '../components/Navbar'
import { useTheme } from '../context/ThemeContext'
import { useDateFormat } from '../context/DateFormatContext'
import { useResponsive } from '../hooks/useResponsive'

function getTodayStr(): string {
  return new Date().toISOString().split('T')[0]
}

function isPast(dateStr: string): boolean {
  return dateStr < getTodayStr()
}

export default function ReporterRoster() {
  const { t } = useTheme()
  const { formatDate, getWeekStart, getWeekDates, weekStartDay } = useDateFormat()
  const navigate = useNavigate()
  const { isMobile, isTablet } = useResponsive()

  const DAYS = weekStartDay === 'sunday'
    ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  const weekStart = getWeekStart()
  const weekDates = getWeekDates()
  const today = getTodayStr()

  const [reporters, setReporters] = useState<any[]>([])
  const [availability, setAvailability] = useState<any[]>([])
  const [assignments, setAssignments] = useState<any[]>([])
  const [leaves, setLeaves] = useState<any[]>([])
  const [holidays, setHolidays] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    const [{ data: r }, { data: a }, { data: ass }, { data: l }, { data: h }] = await Promise.all([
      supabase.from('reporters').select('*').eq('status', 'active').order('name'),
      supabase.from('availability').select('*').eq('week_start_date', weekStart),
      supabase.from('assignments').select('reporter_id').eq('is_active', true),
      supabase.from('leave_requests').select('*').in('status', ['pending', 'acknowledged']),
      supabase.from('holidays').select('*'),
    ])
    setReporters(r || [])
    setAvailability(a || [])
    setAssignments(ass || [])
    setLeaves(l || [])
    setHolidays(h || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const availMap: Record<string, string[]> = {}
  reporters.forEach(r => { availMap[r.id] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] })
  availability.forEach(a => { availMap[a.reporter_id] = a.available_days })

  const countMap: Record<string, number> = {}
  assignments.forEach(a => { countMap[a.reporter_id] = (countMap[a.reporter_id] || 0) + 1 })

  const leaveMap: Record<string, { date: string, status: string }[]> = {}
  leaves.forEach(l => {
    if (!leaveMap[l.reporter_id]) leaveMap[l.reporter_id] = []
    leaveMap[l.reporter_id].push({ date: l.leave_date, status: l.status })
  })

  function isHoliday(dateStr: string): boolean {
    return holidays.some((h: any) => h.date.split('T')[0] === dateStr)
  }

  function getDayStatus(reporterId: string, day: string) {
    const dateForDay = weekDates[day]
    if (!dateForDay) return 'unavailable'
    if (day === 'Sat' || day === 'Sun') return 'unavailable'
    if (isHoliday(dateForDay)) return 'holiday'
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
      width: '32px', height: '32px', borderRadius: '6px',
      margin: '0 auto', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      fontSize: '10px', fontWeight: '700' as const,
      border: '2px solid',
      outline: isToday_ ? `2px solid ${t.accent}` : 'none',
      outlineOffset: '2px',
    }
    switch (status) {
      case 'holiday':      return { ...base, background: t.dangerBg,  borderColor: t.dangerBorder,  color: t.danger,       content: 'H' }
      case 'available':    return { ...base, background: t.successBg, borderColor: t.successBorder, color: t.success,      content: '✓' }
      case 'leave_approved': return { ...base, background: t.dangerBg, borderColor: t.dangerBorder, color: t.danger,       content: 'L' }
      case 'leave_pending':  return { ...base, background: t.warningBg, borderColor: t.warningBorder, color: t.warning,   content: '?' }
      case 'past':         return { ...base, background: t.bgPage,    borderColor: t.borderCard,    color: t.textDisabled, content: '–' }
      default:             return { ...base, background: t.bgInput,   borderColor: t.borderCard,    color: t.textDisabled, content: '' }
    }
  }

  function getDayStatusColor(status: string): string {
    switch (status) {
      case 'available':     return t.success
      case 'holiday':       return t.danger
      case 'leave_approved': return t.danger
      case 'leave_pending': return t.warning
      default:              return t.borderCard
    }
  }

  const thStyle: React.CSSProperties = {
    fontSize: '11px', fontWeight: '600', letterSpacing: '0.5px',
    padding: '0 8px 14px', textAlign: 'left' as const,
    color: t.textMuted, whiteSpace: 'nowrap' as const,
  }

  const tdBase: React.CSSProperties = {
    padding: '14px 16px', background: t.bgCard,
    border: `1px solid ${t.borderCard}`,
    borderLeft: 'none', borderRight: 'none',
    verticalAlign: 'middle',
  }

  const legendItems = [
    { color: t.success,      border: t.successBorder, label: 'Available',      symbol: '✓' },
    { color: t.textDisabled, border: t.borderCard,    label: 'Unavailable',    symbol: '',  dim: false },
    { color: t.textDisabled, border: t.borderCard,    label: 'Past',           symbol: '–', dim: true  },
    { color: t.warning,      border: t.warningBorder, label: 'Leave Pending',  symbol: '?' },
    { color: t.danger,       border: t.dangerBorder,  label: 'Leave Approved', symbol: 'L' },
    { color: t.danger,       border: t.dangerBorder,  label: 'Holiday',        symbol: 'H' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: t.bgPage, fontFamily: '"Inter", "DM Mono", "Courier New", monospace', color: t.textPrimary }}>
      <Navbar />
      <main role="main" style={{
        padding: isMobile ? '16px 12px' : isTablet ? '24px 16px' : '32px 24px',
        maxWidth: isMobile ? '100%' : '1400px',
        margin: '0 auto'
      }}>

        {/* Header */}
        <div style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          justifyContent: 'space-between',
          alignItems: isMobile ? 'flex-start' : 'flex-start',
          marginBottom: isMobile ? '16px' : '28px',
          gap: '16px'
        }}>
          <div>
            <h1 style={{ color: t.textPrimary, margin: '0 0 6px', fontSize: isMobile ? '18px' : '22px', fontWeight: '700' }}>Reporter Roster</h1>
            <p style={{ color: t.textMuted, margin: 0, fontSize: '13px' }}>
              Week of {formatDate(weekStart)} — Today is <span style={{ color: t.accent, fontWeight: '600' }}>{formatDate(today)}</span>
            </p>
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', padding: '10px 14px', background: t.bgCard, borderRadius: '8px', border: `1px solid ${t.borderCard}`, boxShadow: t.shadowCard }}>
            {legendItems.map(item => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <div style={{ width: '18px', height: '18px', borderRadius: '4px', background: `${item.color}15`, border: `2px solid ${item.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', color: item.color, fontWeight: '700', opacity: (item as any).dim ? 0.5 : 1 }}>
                  {item.symbol}
                </div>
                <span style={{ color: t.textMuted, fontSize: isMobile ? '10px' : '11px', fontWeight: '500' }}>{item.label}</span>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <div style={{ width: '18px', height: '18px', borderRadius: '4px', background: t.accentBg, border: `2px solid ${t.accent}`, outline: `2px solid ${t.accent}`, outlineOffset: '1px' }} />
              <span style={{ color: t.textMuted, fontSize: isMobile ? '10px' : '11px', fontWeight: '500' }}>Today</span>
            </div>
          </div>
        </div>

        {loading ? (
          <div style={{ color: t.textMuted, textAlign: 'center', padding: '80px', fontSize: '14px', background: t.bgCard, borderRadius: '10px', border: `1px solid ${t.borderCard}` }}>
            Loading roster...
          </div>
        ) : reporters.length === 0 ? (
          <div style={{ color: t.textDisabled, textAlign: 'center', padding: '80px', border: `1px dashed ${t.borderCard}`, borderRadius: '10px', fontSize: '14px', background: t.bgCard }}>
            No active reporters found
          </div>
        ) : isMobile ? (
          // ── MOBILE: Card layout ──
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {reporters.map(reporter => {
              const active = countMap[reporter.id] || 0
              const capacityPct = (active / reporter.max_stories_per_week) * 100
              const capacityColor = capacityPct >= 100 ? t.danger : capacityPct > 50 ? t.warning : t.success
              return (
                <div key={reporter.id} style={{ background: t.bgCard, border: `1px solid ${t.borderCard}`, borderRadius: '10px', padding: '16px', boxShadow: t.shadowCard }}>
                  {/* Reporter name + action */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                    <div>
                      <div style={{ color: t.textPrimary, fontSize: '15px', fontWeight: '700', marginBottom: '2px' }}>{reporter.name}</div>
                      <div style={{ color: t.textMuted, fontSize: '11px' }}>{reporter.email}</div>
                    </div>
                    <button
                      onClick={() => navigate(`/reporter-view/${reporter.id}`)}
                      style={{ padding: '8px 14px', background: t.accentBg, border: `1px solid ${t.accentBorder}`, borderRadius: '6px', color: t.accent, fontSize: '11px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', minHeight: '44px' }}>
                      VIEW AS
                    </button>
                  </div>

                  {/* Beats */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '12px' }}>
                    {reporter.beats.map((b: string) => (
                      <span key={b} style={{ padding: '3px 8px', background: t.accentBg, border: `1px solid ${t.accentBorder}`, borderRadius: '4px', color: t.accent, fontSize: '10px', fontWeight: '600' }}>{b}</span>
                    ))}
                  </div>

                  {/* Day availability dots */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '12px' }}>
                    {DAYS.map(day => {
                      const status = getDayStatus(reporter.id, day)
                      const isToday_ = weekDates[day] === today
                      const dotColor = getDayStatusColor(status)
                      return (
                        <div key={day} style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '9px', color: isToday_ ? t.accent : t.textMuted, fontWeight: isToday_ ? '700' : '500', marginBottom: '3px' }}>{day}</div>
                          <div style={{ width: '24px', height: '24px', borderRadius: '4px', margin: '0 auto', background: `${dotColor}15`, border: `2px solid ${dotColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', color: dotColor, fontWeight: '700', outline: isToday_ ? `2px solid ${t.accent}` : 'none', outlineOffset: '1px' }}>
                            {status === 'available' ? '✓' : status === 'holiday' ? 'H' : status === 'leave_approved' ? 'L' : status === 'leave_pending' ? '?' : status === 'past' ? '–' : ''}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Capacity */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ height: '6px', background: t.bgPage, borderRadius: '3px', border: `1px solid ${t.borderCard}`, overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: '3px', background: capacityColor, width: `${Math.min(capacityPct, 100)}%` }} />
                      </div>
                    </div>
                    <span style={{ color: capacityColor, fontSize: '12px', fontWeight: '700', whiteSpace: 'nowrap' }}>
                      {active}/{reporter.max_stories_per_week} stories
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          // ── DESKTOP/TABLET: Original table with horizontal scroll ──
          <div style={{ overflowX: 'auto', borderRadius: '10px', boxShadow: t.shadowCard }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 4px', minWidth: '900px' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, textAlign: 'left', paddingLeft: '16px' }}>REPORTER</th>
                  <th style={{ ...thStyle, textAlign: 'left' }}>BEATS</th>
                  {DAYS.map(d => (
                    <th key={d} style={{ ...thStyle, textAlign: 'center', minWidth: '48px', color: weekDates[d] === today ? t.accent : t.textMuted, fontWeight: weekDates[d] === today ? '700' : '600' }}>
                      {d}
                      {weekDates[d] === today && (
                        <div style={{ fontSize: '9px', color: t.accent, marginTop: '2px', fontWeight: '700' }}>TODAY</div>
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
                      <td style={{ ...tdBase, borderRadius: '8px 0 0 8px', borderLeft: `1px solid ${t.borderCard}`, paddingLeft: '16px', minWidth: '160px' }}>
                        <div style={{ color: t.textPrimary, fontSize: '14px', fontWeight: '700', marginBottom: '3px' }}>{reporter.name}</div>
                        <div style={{ color: t.textMuted, fontSize: '11px', fontWeight: '400' }}>{reporter.email}</div>
                      </td>
                      <td style={{ ...tdBase, minWidth: '140px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {reporter.beats.length > 0 ? reporter.beats.map((b: string) => (
                            <span key={b} style={{ padding: '3px 8px', background: t.accentBg, border: `1px solid ${t.accentBorder}`, borderRadius: '4px', color: t.accent, fontSize: '10px', fontWeight: '600' }}>{b}</span>
                          )) : (
                            <span style={{ color: t.textDisabled, fontSize: '12px' }}>No beats</span>
                          )}
                        </div>
                      </td>
                      {DAYS.map(day => {
                        const status = getDayStatus(reporter.id, day)
                        const isToday_ = weekDates[day] === today
                        const cellStyle = getDayCell(status, isToday_)
                        return (
                          <td key={day} style={{ ...tdBase, padding: '8px 4px', textAlign: 'center' }}>
                            <div style={{ width: cellStyle.width, height: cellStyle.height, borderRadius: cellStyle.borderRadius, margin: cellStyle.margin, display: cellStyle.display, alignItems: cellStyle.alignItems, justifyContent: cellStyle.justifyContent, background: cellStyle.background, border: cellStyle.border, color: cellStyle.color, fontSize: cellStyle.fontSize, fontWeight: cellStyle.fontWeight, outline: cellStyle.outline, outlineOffset: cellStyle.outlineOffset }}>
                              {cellStyle.content}
                            </div>
                          </td>
                        )
                      })}
                      <td style={{ ...tdBase, textAlign: 'center', minWidth: '80px' }}>
                        <span style={{ color: active > 0 ? t.accent : t.textDisabled, fontSize: '18px', fontWeight: '800' }}>{active}</span>
                        <span style={{ color: t.textDisabled, fontSize: '12px', fontWeight: '500' }}>/{reporter.max_stories_per_week}</span>
                      </td>
                      <td style={{ ...tdBase, minWidth: '100px', padding: '14px 16px' }}>
                        <div style={{ height: '6px', background: t.bgPage, borderRadius: '3px', border: `1px solid ${t.borderCard}`, overflow: 'hidden' }}>
                          <div style={{ height: '100%', borderRadius: '3px', background: capacityColor, width: `${Math.min(capacityPct, 100)}%`, transition: 'width 0.5s' }} />
                        </div>
                        <div style={{ color: capacityColor, fontSize: '11px', fontWeight: '700', marginTop: '4px', textAlign: 'right' }}>{Math.round(capacityPct)}%</div>
                      </td>
                      <td style={{ ...tdBase, borderRadius: '0 8px 8px 0', borderRight: `1px solid ${t.borderCard}`, textAlign: 'center', padding: '8px 16px' }}>
                        <button
                          onClick={() => navigate(`/reporter-view/${reporter.id}`)}
                          aria-label={`View ${reporter.name}'s dashboard`}
                          style={{ padding: '8px 16px', background: t.accentBg, border: `1px solid ${t.accentBorder}`, borderRadius: '6px', color: t.accent, fontSize: '11px', fontWeight: '700', letterSpacing: '0.5px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'all 0.15s' }}
                          onMouseEnter={e => { e.currentTarget.style.background = t.accent; e.currentTarget.style.color = t.accentText }}
                          onMouseLeave={e => { e.currentTarget.style.background = t.accentBg; e.currentTarget.style.color = t.accent }}>
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