import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useTheme } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'
import { useDateFormat } from '../context/DateFormatContext'
import { useResponsive } from '../hooks/useResponsive'

const DATE_FORMATS = [
  { value: 'DD MMM YYYY',  example: '25 May 2026' },
  { value: 'DD/MM/YYYY',   example: '25/05/2026'  },
  { value: 'MM/DD/YYYY',   example: '05/25/2026'  },
  { value: 'YYYY-MM-DD',   example: '2026-05-25'  },
  { value: 'DD-MM-YYYY',   example: '25-05-2026'  },
  { value: 'MMM DD YYYY',  example: 'May 25 2026' },
  { value: 'MMMM DD YYYY', example: 'May 25, 2026'},
]

export default function AdminPortal() {
  const { t } = useTheme()
  const { } = useAuth()
  const { dateFormat, weekStartDay, formatDate } = useDateFormat()
  const { isMobile, isTablet } = useResponsive()

  const [pendingDateFormat, setPendingDateFormat] = useState(dateFormat)
  const [pendingWeekStart, setPendingWeekStart] = useState(weekStartDay)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [reporterCount, setReporterCount] = useState(0)
  const [storyCount, setStoryCount] = useState(0)
  const [leaveCount, setLeaveCount] = useState(0)

  useEffect(() => {
    setPendingDateFormat(dateFormat)
    setPendingWeekStart(weekStartDay)
  }, [dateFormat, weekStartDay])

  useEffect(() => {
    async function loadStats() {
      const [{ count: r }, { count: s }, { count: l }] = await Promise.all([
        supabase.from('reporters').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('stories').select('*', { count: 'exact', head: true }),
        supabase.from('leave_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      ])
      setReporterCount(r || 0)
      setStoryCount(s || 0)
      setLeaveCount(l || 0)
    }
    loadStats()
  }, [])

  async function saveSettings() {
    setSaving(true)
    await Promise.all([
      supabase.from('app_settings').upsert({ key: 'date_format', value: pendingDateFormat, updated_at: new Date().toISOString() }),
      supabase.from('app_settings').upsert({ key: 'week_start_day', value: pendingWeekStart, updated_at: new Date().toISOString() }),
    ])
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const today = new Date().toISOString().split('T')[0]

  const cardStyle: React.CSSProperties = {
    background: t.bgCard, border: `1px solid ${t.borderCard}`,
    borderRadius: '10px', padding: isMobile ? '16px' : '24px',
    boxShadow: t.shadowCard, marginBottom: '20px'
  }

  return (
    <div style={{ minHeight: '100vh', background: t.bgPage, fontFamily: '"Inter", "DM Mono", sans-serif', color: t.textPrimary }}>
      <Navbar />
      <main style={{
        padding: isMobile ? '16px 12px' : isTablet ? '24px 16px' : '32px 24px',
        maxWidth: isMobile ? '100%' : '860px',
        margin: '0 auto'
      }}>

        {/* Header */}
        <div style={{ marginBottom: isMobile ? '20px' : '32px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 14px', background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, borderRadius: '6px', marginBottom: '12px' }}>
            <span style={{ color: t.danger, fontSize: '11px', fontWeight: '700', letterSpacing: '1px' }}>ADMIN PORTAL</span>
          </div>
          <h1 style={{ color: t.textPrimary, margin: '0 0 6px', fontSize: isMobile ? '20px' : '24px', fontWeight: '700' }}>System Settings</h1>
          <p style={{ color: t.textMuted, margin: 0, fontSize: '13px' }}>
            Changes apply instantly across all editor and reporter portals
          </p>
        </div>

        {/* Stats */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : 'repeat(3, 1fr)',
          gap: isMobile ? '8px' : '16px',
          marginBottom: '28px'
        }}>
          {[
            { label: 'Active Reporters', value: reporterCount, color: t.accent, bg: t.accentBg, border: t.accentBorder },
            { label: 'Total Stories', value: storyCount, color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.3)' },
            { label: 'Pending Leaves', value: leaveCount, color: t.warning, bg: t.warningBg, border: t.warningBorder },
          ].map(stat => (
            <div key={stat.label} style={{ padding: isMobile ? '14px 8px' : '20px', background: stat.bg, border: `1px solid ${stat.border}`, borderRadius: '10px', textAlign: 'center', boxShadow: t.shadowCard }}>
              <div style={{ color: stat.color, fontSize: isMobile ? '28px' : '36px', fontWeight: '800', lineHeight: 1, marginBottom: '8px' }}>{stat.value}</div>
              <div style={{ color: t.textMuted, fontSize: isMobile ? '9px' : '12px', fontWeight: '600', letterSpacing: '0.5px' }}>{stat.label.toUpperCase()}</div>
            </div>
          ))}
        </div>

        {/* Live Preview */}
        <div style={{ ...cardStyle, border: `1px solid ${t.accentBorder}`, background: t.accentBg }}>
          <h2 style={{ color: t.accent, margin: '0 0 16px', fontSize: '13px', fontWeight: '700', letterSpacing: '0.5px' }}>
            LIVE PREVIEW
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
            gap: '16px'
          }}>
            <div style={{ padding: isMobile ? '14px' : '16px', background: t.bgCard, borderRadius: '8px', border: `1px solid ${t.borderCard}` }}>
              <p style={{ color: t.textMuted, fontSize: '11px', fontWeight: '600', margin: '0 0 8px', letterSpacing: '0.5px' }}>ALL DATES WILL LOOK LIKE</p>
              <p style={{ color: t.textPrimary, fontSize: isMobile ? '18px' : '20px', fontWeight: '800', margin: '0 0 4px' }}>
                {formatDate(today)}
              </p>
              <p style={{ color: t.textMuted, fontSize: '11px', margin: 0 }}>Applied to deadlines, leave dates, assigned dates everywhere</p>
            </div>
            <div style={{ padding: isMobile ? '14px' : '16px', background: t.bgCard, borderRadius: '8px', border: `1px solid ${t.borderCard}` }}>
              <p style={{ color: t.textMuted, fontSize: '11px', fontWeight: '600', margin: '0 0 8px', letterSpacing: '0.5px' }}>WEEK STARTS ON</p>
              <p style={{ color: t.success, fontSize: isMobile ? '18px' : '20px', fontWeight: '800', margin: '0 0 4px' }}>
                {pendingWeekStart === 'monday' ? 'Monday' : 'Sunday'}
              </p>
              <p style={{ color: t.textMuted, fontSize: '11px', margin: 0 }}>Affects calendar, roster and availability pages</p>
            </div>
          </div>
        </div>

        {/* Date Format */}
        <div style={cardStyle}>
          <h2 style={{ color: t.textPrimary, margin: '0 0 6px', fontSize: isMobile ? '15px' : '16px', fontWeight: '700' }}>Date Format</h2>
          <p style={{ color: t.textMuted, margin: '0 0 20px', fontSize: '13px' }}>
            One format applied to all dates across the entire portal — deadlines, leaves, assignments, calendar
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : isTablet ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
            gap: isMobile ? '8px' : '10px'
          }}>
            {DATE_FORMATS.map(fmt => (
              <button key={fmt.value} onClick={() => setPendingDateFormat(fmt.value)}
                style={{
                  padding: isMobile ? '12px' : '16px',
                  borderRadius: '8px', cursor: 'pointer',
                  fontFamily: 'inherit', textAlign: 'left' as const,
                  border: `2px solid ${pendingDateFormat === fmt.value ? t.accentBorder : t.borderCard}`,
                  background: pendingDateFormat === fmt.value ? t.accentBg : t.bgPage,
                  transition: 'all 0.15s', minHeight: '44px'
                }}>
                <div style={{ color: pendingDateFormat === fmt.value ? t.accent : t.textPrimary, fontSize: isMobile ? '12px' : '14px', fontWeight: '700', marginBottom: '4px' }}>
                  {fmt.value}
                </div>
                <div style={{ color: t.textMuted, fontSize: isMobile ? '11px' : '13px', marginBottom: '4px' }}>
                  e.g. <span style={{ color: pendingDateFormat === fmt.value ? t.accent : t.textSecondary, fontWeight: '600' }}>{fmt.example}</span>
                </div>
                {pendingDateFormat === fmt.value && (
                  <div style={{ color: t.accent, fontSize: '10px', fontWeight: '700', letterSpacing: '0.5px' }}>✓ SELECTED</div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Week Start Day */}
        <div style={cardStyle}>
          <h2 style={{ color: t.textPrimary, margin: '0 0 6px', fontSize: isMobile ? '15px' : '16px', fontWeight: '700' }}>Week Start Day</h2>
          <p style={{ color: t.textMuted, margin: '0 0 20px', fontSize: '13px' }}>
            Affects the calendar view, roster weekly view and availability page
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
            gap: '12px'
          }}>
            {[
              { value: 'monday', label: 'Monday', desc: 'Mon → Sun (most common)', days: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] },
              { value: 'sunday', label: 'Sunday', desc: 'Sun → Sat (US style)',    days: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'] },
            ].map(opt => (
              <button key={opt.value} onClick={() => setPendingWeekStart(opt.value as any)}
                style={{
                  padding: isMobile ? '14px' : '18px 20px',
                  borderRadius: '8px', cursor: 'pointer',
                  fontFamily: 'inherit', textAlign: 'left' as const,
                  border: `2px solid ${pendingWeekStart === opt.value ? t.successBorder : t.borderCard}`,
                  background: pendingWeekStart === opt.value ? t.successBg : t.bgPage,
                  transition: 'all 0.15s', minHeight: '44px'
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ color: pendingWeekStart === opt.value ? t.success : t.textPrimary, fontSize: '16px', fontWeight: '700' }}>
                    {opt.label}
                  </span>
                  {pendingWeekStart === opt.value && (
                    <span style={{ color: t.success, fontSize: '10px', fontWeight: '700' }}>✓ SELECTED</span>
                  )}
                </div>
                <p style={{ color: t.textMuted, fontSize: '12px', margin: '0 0 12px' }}>{opt.desc}</p>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {opt.days.map((d, i) => (
                    <span key={d} style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '600', background: i < 5 ? t.accentBg : t.bgCard, color: i < 5 ? t.accent : t.textMuted, border: `1px solid ${i < 5 ? t.accentBorder : t.borderCard}` }}>{d}</span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Save */}
        <div style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          gap: '12px',
          alignItems: isMobile ? 'stretch' : 'center',
          justifyContent: isMobile ? 'stretch' : 'flex-end'
        }}>
          {saved && (
            <div style={{ padding: '10px 20px', background: t.successBg, border: `1px solid ${t.successBorder}`, borderRadius: '8px' }}>
              <span style={{ color: t.success, fontSize: '13px', fontWeight: '700' }}>✓ Saved! All portals updated instantly.</span>
            </div>
          )}
          <button onClick={saveSettings} disabled={saving}
            style={{ padding: '14px 40px', background: saving ? t.textMuted : t.accent, border: 'none', borderRadius: '8px', color: t.accentText, fontSize: '14px', fontWeight: '700', letterSpacing: '0.5px', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1, transition: 'all 0.15s', minHeight: '48px' }}>
            {saving ? 'SAVING...' : 'SAVE SETTINGS'}
          </button>
        </div>
      </main>
    </div>
  )
}