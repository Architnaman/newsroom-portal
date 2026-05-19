import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Navbar from '../components/Navbar'

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
  const [reporters, setReporters] = useState<any[]>([])
  const [availability, setAvailability] = useState<any[]>([])
  const [assignments, setAssignments] = useState<any[]>([])
  const [leaves, setLeaves] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const weekStart = getCurrentWeekStart()
  const weekDates = getCurrentWeekDates()
  const today = getTodayStr()

  async function load() {
    const [
      { data: r },
      { data: a },
      { data: ass },
      { data: l }
    ] = await Promise.all([
      supabase.from('reporters').select('*').eq('status', 'active').order('name'),
      supabase.from('availability').select('*').eq('week_start_date', weekStart),
      supabase.from('assignments').select('reporter_id').eq('is_active', true),
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
  availability.forEach(a => { availMap[a.reporter_id] = a.available_days })

  const countMap: Record<string, number> = {}
  assignments.forEach(a => { countMap[a.reporter_id] = (countMap[a.reporter_id] || 0) + 1 })

  // Build leave map: reporterId -> [dates with leave]
  const leaveMap: Record<string, { date: string, status: string }[]> = {}
  leaves.forEach(l => {
    if (!leaveMap[l.reporter_id]) leaveMap[l.reporter_id] = []
    leaveMap[l.reporter_id].push({ date: l.leave_date, status: l.status })
  })

  function getDayStatus(reporterId: string, day: string) {
    const dateForDay = weekDates[day]

    // Check leave
    const reporterLeaves = leaveMap[reporterId] || []
    const leaveOnDay = reporterLeaves.find(l => l.date === dateForDay)

    if (leaveOnDay?.status === 'acknowledged') return 'leave_approved'
    if (leaveOnDay?.status === 'pending') return 'leave_pending'

    // Check if past
    if (isPast(dateForDay)) return 'past'

    // Check availability
    const avail = availMap[reporterId] || []
    if (avail.includes(day)) return 'available'

    return 'unavailable'
  }

  function getDayCell(status: string, isToday_: boolean) {
    const base = {
      width: '28px', height: '28px', borderRadius: '50%',
      margin: '0 auto', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      border: isToday_ ? '2px solid #ffb400' : '1px solid transparent',
      fontSize: '8px', letterSpacing: '0.3px', fontWeight: '600'
    }

    switch (status) {
      case 'available':
        return {
          ...base,
          background: 'rgba(100,200,150,0.15)',
          borderColor: isToday_ ? '#ffb400' : 'rgba(100,200,150,0.4)',
          color: '#64c896',
          content: '✓'
        }
      case 'leave_approved':
        return {
          ...base,
          background: 'rgba(255,68,68,0.15)',
          borderColor: isToday_ ? '#ffb400' : 'rgba(255,68,68,0.4)',
          color: '#ff6b6b',
          content: 'L'
        }
      case 'leave_pending':
        return {
          ...base,
          background: 'rgba(255,136,0,0.15)',
          borderColor: isToday_ ? '#ffb400' : 'rgba(255,136,0,0.4)',
          color: '#ff8800',
          content: '?'
        }
      case 'past':
        return {
          ...base,
          background: 'rgba(255,255,255,0.02)',
          borderColor: 'rgba(255,255,255,0.04)',
          color: '#333',
          content: '–'
        }
      default:
        return {
          ...base,
          background: 'rgba(255,255,255,0.04)',
          borderColor: 'rgba(255,255,255,0.08)',
          color: '#444',
          content: ''
        }
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', fontFamily: '"DM Mono", "Courier New", monospace' }}>
      <Navbar />
      <div style={{ padding: '32px 24px', maxWidth: '1200px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{ color: '#fff', margin: '0 0 4px', fontSize: '18px' }}>Reporter Roster</h1>
            <p style={{ color: '#555', margin: 0, fontSize: '12px' }}>
              Week of {weekStart} — Today is {today}
            </p>
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            {[
              { color: '#64c896', label: 'Available', symbol: '✓' },
              { color: '#333', label: 'Unavailable', symbol: '' },
              { color: '#333', label: 'Past', symbol: '–', dim: true },
              { color: '#ff8800', label: 'Leave Pending', symbol: '?' },
              { color: '#ff6b6b', label: 'Leave Approved', symbol: 'L' },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <div style={{
                  width: '18px', height: '18px', borderRadius: '50%',
                  background: `${item.color}20`,
                  border: `1px solid ${item.color}60`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '8px', color: item.color, fontWeight: '600',
                  opacity: item.dim ? 0.5 : 1
                }}>{item.symbol}</div>
                <span style={{ color: '#555', fontSize: '10px' }}>{item.label}</span>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <div style={{
                width: '18px', height: '18px', borderRadius: '50%',
                background: 'rgba(255,180,0,0.1)',
                border: '2px solid #ffb400',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}/>
              <span style={{ color: '#555', fontSize: '10px' }}>Today</span>
            </div>
          </div>
        </div>

        {loading ? (
          <div style={{ color: '#555', textAlign: 'center', padding: '60px' }}>Loading roster...</div>
        ) : reporters.length === 0 ? (
          <div style={{ color: '#333', textAlign: 'center', padding: '60px', border: '1px dashed rgba(255,255,255,0.07)', borderRadius: '6px' }}>
            No active reporters found
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 6px' }}>
              <thead>
                <tr>
                  <th style={{ color: '#555', fontSize: '10px', letterSpacing: '1px', textAlign: 'left', padding: '0 12px 12px', fontWeight: 400 }}>REPORTER</th>
                  <th style={{ color: '#555', fontSize: '10px', letterSpacing: '1px', textAlign: 'left', padding: '0 12px 12px', fontWeight: 400 }}>BEATS</th>
                  {DAYS.map(d => (
                    <th key={d} style={{
                      color: weekDates[d] === today ? '#ffb400' : '#555',
                      fontSize: '10px', letterSpacing: '1px',
                      padding: '0 4px 12px', fontWeight: weekDates[d] === today ? 700 : 400,
                      textAlign: 'center', minWidth: '40px'
                    }}>
                      {d}
                      {weekDates[d] === today && (
                        <div style={{ fontSize: '8px', color: '#ffb400', marginTop: '2px' }}>TODAY</div>
                      )}
                    </th>
                  ))}
                  <th style={{ color: '#555', fontSize: '10px', letterSpacing: '1px', padding: '0 12px 12px', fontWeight: 400, textAlign: 'center' }}>STORIES</th>
                  <th style={{ color: '#555', fontSize: '10px', letterSpacing: '1px', padding: '0 12px 12px', fontWeight: 400, textAlign: 'center' }}>LOAD</th>
                </tr>
              </thead>
              <tbody>
                {reporters.map(reporter => {
                  const active = countMap[reporter.id] || 0
                  const capacityPct = (active / reporter.max_stories_per_week) * 100

                  return (
                    <tr key={reporter.id}>
                      {/* Reporter Info */}
                      <td style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px 0 0 6px', border: '1px solid rgba(255,255,255,0.06)', borderRight: 'none' }}>
                        <div style={{ color: '#ddd', fontSize: '13px', fontWeight: '600', marginBottom: '2px' }}>{reporter.name}</div>
                        <div style={{ color: '#444', fontSize: '10px' }}>{reporter.email}</div>
                      </td>

                      {/* Beats */}
                      <td style={{ padding: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderLeft: 'none', borderRight: 'none' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                          {reporter.beats.length > 0 ? reporter.beats.map((b: string) => (
                            <span key={b} style={{ padding: '2px 6px', background: 'rgba(255,180,0,0.08)', border: '1px solid rgba(255,180,0,0.2)', borderRadius: '3px', color: '#ffb400', fontSize: '9px' }}>
                              {b}
                            </span>
                          )) : (
                            <span style={{ color: '#444', fontSize: '11px' }}>No beats</span>
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
                            padding: '4px', background: 'rgba(255,255,255,0.02)',
                            border: '1px solid rgba(255,255,255,0.06)',
                            borderLeft: 'none', borderRight: 'none',
                            textAlign: 'center'
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
                              letterSpacing: cellStyle.letterSpacing
                            }}>
                              {cellStyle.content}
                            </div>
                          </td>
                        )
                      })}

                      {/* Story Count */}
                      <td style={{ padding: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderLeft: 'none', borderRight: 'none', textAlign: 'center' }}>
                        <span style={{ color: active > 0 ? '#ffb400' : '#555', fontSize: '16px', fontWeight: '700' }}>{active}</span>
                        <span style={{ color: '#333', fontSize: '10px' }}>/{reporter.max_stories_per_week}</span>
                      </td>

                      {/* Capacity Bar */}
                      <td style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: '0 6px 6px 0', border: '1px solid rgba(255,255,255,0.06)', borderLeft: 'none', minWidth: '80px' }}>
                        <div style={{ height: '4px', background: 'rgba(255,255,255,0.07)', borderRadius: '2px' }}>
                          <div style={{
                            height: '100%', borderRadius: '2px',
                            background: capacityPct >= 100 ? '#ff6b6b' : capacityPct > 50 ? '#ffb400' : '#64c896',
                            width: `${Math.min(capacityPct, 100)}%`,
                            transition: 'width 0.5s'
                          }} />
                        </div>
                        <div style={{ color: '#444', fontSize: '9px', marginTop: '4px', textAlign: 'right' }}>
                          {Math.round(capacityPct)}%
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}