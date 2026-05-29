import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme, backgroundPresets } from '../context/ThemeContext'
import { supabase } from '../lib/supabase'

interface NavItem { label: string; path: string }

export default function Navbar() {
  const { role, userName, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { theme, fontSize, background, toggleTheme, setFontSize, setBackground, t } = useTheme()

  const [showSettings, setShowSettings] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [guideUrl, setGuideUrl] = useState<string | null>(null)
  const [guideLoading, setGuideLoading] = useState(false)
  const [pendingBg, setPendingBg] = useState<string>(background)
  const [pendingTheme, setPendingTheme] = useState<string>(theme)
  const [pendingFontSize, setPendingFontSize] = useState<any>(fontSize)
  const [saved, setSaved] = useState(false)

  const fontSizes = ['sm', 'md', 'lg', 'xl'] as const
  const fontLabels: Record<string, string> = { sm: 'A-', md: 'A', lg: 'A+', xl: 'A++' }
  const fontSizePx: Record<string, string> = { sm: '10px', md: '11px', lg: '13px', xl: '15px' }

  useEffect(() => {
    if (showSettings) {
      setPendingBg(background)
      setPendingTheme(theme)
      setPendingFontSize(fontSize)
      setSaved(false)
    }
  }, [showSettings])

  function applyBackgroundGlobally(bgKey: string, themeMode: string) {
    const preset = backgroundPresets[bgKey as keyof typeof backgroundPresets]
    const bgValue = preset?.value
    const defaultBg = themeMode === 'dark' ? '#0a0f1a' : '#eef4ff'
    const finalBg = bgValue || defaultBg
    document.documentElement.style.setProperty('--bg-main', finalBg)
  }

  useEffect(() => {
    const savedBg = localStorage.getItem('nr_background') || 'default'
    const savedTheme = localStorage.getItem('nr_theme') || 'light'
    applyBackgroundGlobally(savedBg, savedTheme)
  }, [])

  function handleSave() {
    setBackground(pendingBg as any)
    localStorage.setItem('nr_background', pendingBg)
    applyBackgroundGlobally(pendingBg, pendingTheme)
    setFontSize(pendingFontSize)
    localStorage.setItem('nr_fontsize', pendingFontSize)
    if (pendingTheme !== theme) {
      toggleTheme()
      localStorage.setItem('nr_theme', pendingTheme)
    }
    setSaved(true)
    setTimeout(() => { setSaved(false); setShowSettings(false) }, 1500)
  }

  async function openGuide() {
    setGuideLoading(true)
    const fileName = role === 'editor' ? 'editor_guide.pdf' : 'reporter_guide.pdf'
    const { data } = supabase.storage.from('story-files').getPublicUrl(fileName)
    setGuideUrl(data.publicUrl)
    setGuideLoading(false)
    setShowGuide(true)
  }

  const editorNav: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard' },
  { label: 'Kanban', path: '/kanban' },
  { label: 'Roster', path: '/roster' },
  { label: 'Calendar', path: '/calendar' },
  { label: 'Ambient Scribe', path: '/ai-report' },  // ADD THIS
]
  const reporterNav: NavItem[] = [
    { label: 'My Stories', path: '/queue' },
    { label: 'Availability', path: '/availability' },
    { label: 'Calendar', path: '/calendar' },
  ]
  const adminNav: NavItem[] = [
    { label: 'Settings', path: '/admin' },
  ]
  const nav = role === 'editor' ? editorNav : role === 'admin' ? adminNav : reporterNav

  return (
    <>
      <nav
        role="navigation"
        aria-label="Main navigation"
        style={{
          background: t.bgNavbar,
          borderBottom: `1px solid ${t.borderNavbar}`,
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '60px',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          fontFamily: '"Inter", "DM Mono", "Courier New", monospace',
          boxShadow: t.shadowCard,
        }}>

        {/* Left: Brand + Nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: t.accent }} />
            <span style={{ color: t.accent, fontSize: '13px', letterSpacing: '2px', fontWeight: '700' }}>
              NEWSROOM
            </span>
          </div>
          <div style={{ display: 'flex', gap: '4px' }} role="menubar">
            {nav.map(item => {
              const isActive = location.pathname === item.path
              return (
                <button
                  key={item.path}
                  role="menuitem"
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => navigate(item.path)}
                  style={{
                    padding: '7px 14px', borderRadius: '6px',
                    border: isActive ? `1px solid ${t.accentBorder}` : '1px solid transparent',
                    background: isActive ? t.accentBg : 'transparent',
                    color: isActive ? t.accent : t.textMuted,
                    fontSize: '12px', letterSpacing: '0.5px',
                    fontWeight: isActive ? '600' : '400',
                    cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'all 0.15s', outline: 'none',
                  }}>
                  {item.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Right: Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>

          {/* Font size controls */}
          <div role="group" aria-label="Font size controls"
            style={{ display: 'flex', gap: '2px', padding: '3px', background: t.bgInput, borderRadius: '8px', border: `1px solid ${t.borderCard}` }}>
            {fontSizes.map(s => (
              <button key={s} aria-label={`Font size ${s}`} aria-pressed={fontSize === s}
                onClick={() => setFontSize(s)}
                style={{
                  padding: '5px 9px', borderRadius: '5px', border: 'none',
                  background: fontSize === s ? t.accent : 'transparent',
                  color: fontSize === s ? t.accentText : t.textMuted,
                  fontSize: fontSizePx[s], fontWeight: fontSize === s ? '700' : '500',
                  cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                  lineHeight: 1, minWidth: '28px', textAlign: 'center' as const,
                }}>
                {fontLabels[s]}
              </button>
            ))}
          </div>

          {/* Theme toggle */}
          <button
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            onClick={toggleTheme}
            style={{
              padding: '7px 12px', borderRadius: '8px',
              border: `1px solid ${t.borderCard}`,
              background: t.bgInput, color: t.textSecondary,
              fontSize: '14px', cursor: 'pointer',
              fontFamily: 'inherit', transition: 'all 0.15s',
            }}>
            {theme === 'dark' ? '☀' : '☾'}
          </button>

          {/* Appearance */}
          <button
            aria-label="Customize appearance"
            onClick={() => setShowSettings(true)}
            title="Customize background"
            style={{
              padding: '7px 12px', borderRadius: '8px',
              border: `1px solid ${t.borderCard}`,
              background: t.bgInput, color: t.textSecondary,
              fontSize: '14px', cursor: 'pointer',
              fontFamily: 'inherit', transition: 'all 0.15s',
            }}>
            🎨
          </button>

          {/* User Guide — opens PDF */}
          <button
            aria-label="User guide"
            onClick={openGuide}
            title="User guide PDF"
            style={{
              padding: '7px 12px', borderRadius: '8px',
              border: `1px solid ${t.borderCard}`,
              background: guideLoading ? t.accentBg : t.bgInput,
              color: guideLoading ? t.accent : t.textSecondary,
              fontSize: '14px', cursor: guideLoading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', transition: 'all 0.15s',
            }}>
            {guideLoading ? '⏳' : '❓'}
          </button>

          {/* User name + role badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '4px 12px', borderRadius: '6px',
            background: role === 'editor' ? t.accentBg : t.successBg,
            border: `1px solid ${role === 'editor' ? t.accentBorder : t.successBorder}`,
          }}>
            <div style={{
              width: '26px', height: '26px', borderRadius: '50%',
              background: role === 'editor' ? t.accent : t.success,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '11px', fontWeight: '700', color: t.accentText, flexShrink: 0
            }}>
              {userName ? userName.charAt(0).toUpperCase() : '?'}
            </div>
            <div>
              <div style={{ color: role === 'editor' ? t.accent : t.success, fontSize: '12px', fontWeight: '700', lineHeight: 1 }}>
                {userName || 'User'}
              </div>
              <div style={{ color: t.textMuted, fontSize: '9px', fontWeight: '600', letterSpacing: '0.5px', lineHeight: 1, marginTop: '2px' }}>
                {role?.toUpperCase()}
              </div>
            </div>
          </div>

          {/* Logout */}
          <button
            aria-label="Sign out"
            onClick={signOut}
            style={{
              padding: '7px 14px', borderRadius: '6px',
              border: `1px solid ${t.borderCard}`,
              background: 'transparent', color: t.textMuted,
              fontSize: '12px', letterSpacing: '0.5px',
              cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = t.dangerBg
              e.currentTarget.style.color = t.danger
              e.currentTarget.style.borderColor = t.dangerBorder
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = t.textMuted
              e.currentTarget.style.borderColor = t.borderCard
            }}>
            LOGOUT
          </button>
        </div>
      </nav>

      {/* Appearance Settings Modal */}
      {showSettings && (
        <div
          role="dialog" aria-modal="true" aria-label="Appearance settings"
          style={{ position: 'fixed', inset: 0, background: t.overlayBg, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9998, fontFamily: 'inherit' }}
          onClick={e => { if (e.target === e.currentTarget) setShowSettings(false) }}>
          <div style={{ background: t.bgCard, border: `1px solid ${t.borderCard}`, borderRadius: '14px', width: '100%', maxWidth: '500px', margin: '24px', padding: '28px', boxShadow: t.shadow }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <h2 style={{ color: t.textPrimary, margin: '0 0 4px', fontSize: '18px', fontWeight: '700' }}>Appearance</h2>
                <p style={{ color: t.textMuted, margin: 0, fontSize: '13px' }}>Choose your preferences and click Save</p>
              </div>
              <button onClick={() => setShowSettings(false)} style={{ background: 'none', border: 'none', color: t.textMuted, fontSize: '22px', cursor: 'pointer' }}>x</button>
            </div>

            {/* Background picker */}
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ color: t.textSecondary, fontSize: '12px', fontWeight: '700', letterSpacing: '0.5px', margin: '0 0 12px' }}>BACKGROUND</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                {(Object.entries(backgroundPresets) as any[]).map(([key, preset]) => (
                  <button key={key} onClick={() => setPendingBg(key)} title={preset.label}
                    style={{ padding: '0', borderRadius: '10px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', outline: pendingBg === key ? `3px solid ${t.accent}` : `2px solid ${t.borderCard}`, outlineOffset: '2px', overflow: 'hidden', transition: 'all 0.15s' }}>
                    <div style={{ height: '52px', background: preset.value || preset.preview, borderRadius: '8px 8px 0 0' }} />
                    <div style={{ padding: '6px 8px', background: t.bgPage, borderRadius: '0 0 8px 8px', border: `1px solid ${pendingBg === key ? t.accentBorder : t.borderCard}`, borderTop: 'none' }}>
                      <div style={{ color: pendingBg === key ? t.accent : t.textMuted, fontSize: '10px', fontWeight: pendingBg === key ? '700' : '500', textAlign: 'center' as const }}>{preset.label}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Mode toggle */}
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ color: t.textSecondary, fontSize: '12px', fontWeight: '700', letterSpacing: '0.5px', margin: '0 0 12px' }}>MODE</h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                {(['light', 'dark'] as const).map(m => (
                  <button key={m} onClick={() => setPendingTheme(m)}
                    style={{ flex: 1, padding: '12px', borderRadius: '8px', border: `2px solid ${pendingTheme === m ? t.accentBorder : t.borderCard}`, background: pendingTheme === m ? t.accentBg : 'transparent', color: pendingTheme === m ? t.accent : t.textMuted, fontSize: '13px', fontWeight: pendingTheme === m ? '700' : '400', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    {m === 'dark' ? '🌙 Dark' : '☀️ Light'}
                  </button>
                ))}
              </div>
            </div>

            {/* Font size */}
            <div style={{ marginBottom: '28px' }}>
              <h3 style={{ color: t.textSecondary, fontSize: '12px', fontWeight: '700', letterSpacing: '0.5px', margin: '0 0 12px' }}>FONT SIZE</h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                {(['sm', 'md', 'lg', 'xl'] as const).map(s => (
                  <button key={s} onClick={() => setPendingFontSize(s)}
                    style={{ flex: 1, padding: '10px', borderRadius: '8px', border: `2px solid ${pendingFontSize === s ? t.accentBorder : t.borderCard}`, background: pendingFontSize === s ? t.accentBg : 'transparent', color: pendingFontSize === s ? t.accent : t.textMuted, fontSize: s === 'sm' ? '11px' : s === 'md' ? '13px' : s === 'lg' ? '15px' : '17px', fontWeight: pendingFontSize === s ? '700' : '400', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}>
                    {fontLabels[s]}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={handleSave}
              style={{ width: '100%', padding: '14px', background: saved ? t.success : t.accent, border: 'none', borderRadius: '8px', color: saved ? '#fff' : t.accentText, fontSize: '14px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s', letterSpacing: '0.5px' }}>
              {saved ? '✓ SAVED!' : 'SAVE CHANGES'}
            </button>
          </div>
        </div>
      )}

      {/* PDF Guide Modal */}
      {showGuide && guideUrl && (
        <div
          role="dialog" aria-modal="true" aria-label="User guide PDF"
          style={{ position: 'fixed', inset: 0, background: t.overlayBg, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9998, fontFamily: 'inherit' }}
          onClick={e => { if (e.target === e.currentTarget) setShowGuide(false) }}>
          <div style={{ background: t.bgCard, border: `1px solid ${t.borderCard}`, borderRadius: '14px', width: '100%', maxWidth: '800px', height: '88vh', margin: '24px', padding: '20px', boxShadow: t.shadow, display: 'flex', flexDirection: 'column' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ padding: '6px 14px', borderRadius: '6px', background: role === 'editor' ? t.accentBg : t.successBg, border: `1px solid ${role === 'editor' ? t.accentBorder : t.successBorder}` }}>
                  <span style={{ color: role === 'editor' ? t.accent : t.success, fontSize: '12px', fontWeight: '700' }}>
                    {role === 'editor' ? '✏️ EDITOR GUIDE' : '📰 REPORTER GUIDE'}
                  </span>
                </div>
                <a href={guideUrl} target="_blank" rel="noopener noreferrer"
                  style={{ padding: '6px 14px', borderRadius: '6px', background: t.accentBg, border: `1px solid ${t.accentBorder}`, color: t.accent, fontSize: '12px', fontWeight: '700', textDecoration: 'none' }}>
                  ⬇ DOWNLOAD PDF
                </a>
              </div>
              <button onClick={() => setShowGuide(false)}
                style={{ background: 'none', border: 'none', color: t.textMuted, fontSize: '22px', cursor: 'pointer' }}>
                x
              </button>
            </div>

            {/* PDF Viewer */}
            <iframe
              src={guideUrl}
              style={{ flex: 1, border: 'none', borderRadius: '8px', width: '100%' }}
              title={role === 'editor' ? 'Editor Guide' : 'Reporter Guide'}
            />
          </div>
        </div>
      )}
    </>
  )
}