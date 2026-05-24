import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme, backgroundPresets } from '../context/ThemeContext'

interface NavItem { label: string; path: string }

export default function Navbar() {
  const { role, userName, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { theme, fontSize, background, toggleTheme, setFontSize, setBackground, t } = useTheme()

  const [showSettings, setShowSettings] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [pendingBg, setPendingBg] = useState<string>(background)
  const [pendingTheme, setPendingTheme] = useState<string>(theme)
  const [pendingFontSize, setPendingFontSize] = useState<any>(fontSize)
  const [saved, setSaved] = useState(false)

  const fontSizes = ['sm', 'md', 'lg', 'xl'] as const
  const fontLabels: Record<string, string> = { sm: 'A-', md: 'A', lg: 'A+', xl: 'A++' }
  const fontSizePx: Record<string, string> = { sm: '10px', md: '11px', lg: '13px', xl: '15px' }

  // Sync pending when modal opens
  useEffect(() => {
    if (showSettings) {
      setPendingBg(background)
      setPendingTheme(theme)
      setPendingFontSize(fontSize)
      setSaved(false)
    }
  }, [showSettings])

  // FIXED: apply background by updating CSS variable directly on documentElement
  // CSS variable is referenced by App.tsx zoom wrapper via var(--bg-main)
  function applyBackgroundGlobally(bgKey: string, themeMode: string) {
    const preset = backgroundPresets[bgKey as keyof typeof backgroundPresets]
    const bgValue = preset?.value
    const defaultBg = themeMode === 'dark' ? '#0a0f1a' : '#eef4ff'
    const finalBg = bgValue || defaultBg

    // FIXED: update CSS variable on root element
    // App.tsx uses var(--bg-main) so this instantly updates the background
    document.documentElement.style.setProperty('--bg-main', finalBg)

    console.log('Background applied:', bgKey, '->', finalBg)
  }

  // Apply saved background on every mount/page load
  useEffect(() => {
    const savedBg = localStorage.getItem('nr_background') || 'default'
    const savedTheme = localStorage.getItem('nr_theme') || 'light'
    applyBackgroundGlobally(savedBg, savedTheme)
  }, [])

  function handleSave() {
    console.log('Saving settings:', { pendingBg, pendingTheme, pendingFontSize })

    // 1. Apply and save background
    setBackground(pendingBg as any)
    localStorage.setItem('nr_background', pendingBg)
    applyBackgroundGlobally(pendingBg, pendingTheme)

    // 2. Apply and save font size
    setFontSize(pendingFontSize)
    localStorage.setItem('nr_fontsize', pendingFontSize)

    // 3. Apply theme if changed
    if (pendingTheme !== theme) {
      toggleTheme()
      localStorage.setItem('nr_theme', pendingTheme)
    }

    setSaved(true)
    setTimeout(() => {
      setSaved(false)
      setShowSettings(false)
    }, 1500)
  }

  const editorNav: NavItem[] = [
    { label: 'Dashboard', path: '/dashboard' },
    { label: 'Kanban', path: '/kanban' },
    { label: 'Roster', path: '/roster' },
    { label: 'Calendar', path: '/calendar' },
  ]
  const reporterNav: NavItem[] = [
    { label: 'My Stories', path: '/queue' },
    { label: 'Availability', path: '/availability' },
    { label: 'Calendar', path: '/calendar' },
  ]

  const nav = role === 'editor' ? editorNav : reporterNav

  const editorGuide = [
    { icon: '📝', title: 'Create a Story', desc: 'Go to Dashboard → click "+ NEW STORY". Fill in headline, deadline, category and urgency.' },
    { icon: '👤', title: 'Assign to Reporter', desc: 'Click ASSIGN on any unassigned story. Run SCORE REPORTERS to get the best match, or use OVERRIDE ASSIGN for unavailable reporters.' },
    { icon: '📋', title: 'Track Progress', desc: 'Use the Kanban board to see stories move from Assigned → In Progress → Filed → Published.' },
    { icon: '✅', title: 'Review Filed Stories', desc: 'On Kanban, click VIEW AND REVIEW on filed stories. Approve, publish with feedback, or reassign.' },
    { icon: '🗓️', title: 'Manage Leaves', desc: 'Approve or reject leave requests from Dashboard. View reporter availability on the Roster page.' },
    { icon: '👁️', title: 'View as Reporter', desc: 'On Roster, click VIEW AS to see any reporter\'s full dashboard and file leave on their behalf.' },
    { icon: '📅', title: 'Calendar View', desc: 'Select any reporter from the dropdown to see their story deadlines, leaves and availability.' },
    { icon: '🤖', title: 'AI Assistant', desc: 'Click the AI button (bottom right) to create stories, assign reporters and approve leaves using natural language.' },
  ]

  const reporterGuide = [
    { icon: '📰', title: 'View Your Stories', desc: 'Go to My Stories to see all your active assignments.' },
    { icon: '▶️', title: 'Start Working', desc: 'Click START WORKING on an assigned story to mark it as In Progress.' },
    { icon: '📤', title: 'File Your Report', desc: 'When done, click FILE REPORT to upload your Word document (.doc or .docx).' },
    { icon: '⚡', title: 'Override Assignments', desc: 'If you receive an override assignment, you must ACCEPT or REJECT it with a valid reason.' },
    { icon: '🗓️', title: 'Set Availability', desc: 'Go to Availability page to toggle which days you\'re available this week.' },
    { icon: '🏖️', title: 'File Leave', desc: 'On Availability page, click + FILE LEAVE to request a day off.' },
    { icon: '📅', title: 'Calendar', desc: 'Your calendar shows story deadlines, approved leaves and holidays.' },
    { icon: '🤖', title: 'AI Assistant', desc: 'Click the AI button (bottom right) to perform actions using natural language.' },
  ]

  const guide = role === 'editor' ? editorGuide : reporterGuide

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

          {/* Settings / background picker */}
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

          {/* User guide */}
          <button
            aria-label="User guide"
            onClick={() => setShowGuide(true)}
            title="User guide"
            style={{
              padding: '7px 12px', borderRadius: '8px',
              border: `1px solid ${t.borderCard}`,
              background: t.bgInput, color: t.textSecondary,
              fontSize: '14px', cursor: 'pointer',
              fontFamily: 'inherit', transition: 'all 0.15s',
            }}>
            ❓
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
          style={{
            position: 'fixed', inset: 0, background: t.overlayBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9998, fontFamily: 'inherit'
          }}
          onClick={e => { if (e.target === e.currentTarget) setShowSettings(false) }}>
          <div style={{
            background: t.bgCard, border: `1px solid ${t.borderCard}`,
            borderRadius: '14px', width: '100%', maxWidth: '500px',
            margin: '24px', padding: '28px', boxShadow: t.shadow
          }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <h2 style={{ color: t.textPrimary, margin: '0 0 4px', fontSize: '18px', fontWeight: '700' }}>
                  Appearance
                </h2>
                <p style={{ color: t.textMuted, margin: 0, fontSize: '13px' }}>
                  Choose your preferences and click Save
                </p>
              </div>
              <button onClick={() => setShowSettings(false)}
                style={{ background: 'none', border: 'none', color: t.textMuted, fontSize: '22px', cursor: 'pointer' }}>
                x
              </button>
            </div>

            {/* Background picker */}
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ color: t.textSecondary, fontSize: '12px', fontWeight: '700', letterSpacing: '0.5px', margin: '0 0 12px' }}>
                BACKGROUND
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                {(Object.entries(backgroundPresets) as any[]).map(([key, preset]) => (
                  <button
                    key={key}
                    onClick={() => setPendingBg(key)}
                    title={preset.label}
                    style={{
                      padding: '0', borderRadius: '10px', border: 'none',
                      cursor: 'pointer', fontFamily: 'inherit',
                      outline: pendingBg === key ? `3px solid ${t.accent}` : `2px solid ${t.borderCard}`,
                      outlineOffset: '2px', overflow: 'hidden', transition: 'all 0.15s'
                    }}>
                    {/* Preview swatch */}
                    <div style={{
                      height: '52px',
                      background: preset.value || preset.preview,
                      borderRadius: '8px 8px 0 0',
                    }} />
                    <div style={{
                      padding: '6px 8px', background: t.bgPage,
                      borderRadius: '0 0 8px 8px',
                      border: `1px solid ${pendingBg === key ? t.accentBorder : t.borderCard}`,
                      borderTop: 'none'
                    }}>
                      <div style={{
                        color: pendingBg === key ? t.accent : t.textMuted,
                        fontSize: '10px', fontWeight: pendingBg === key ? '700' : '500',
                        textAlign: 'center' as const
                      }}>
                        {preset.label}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Mode toggle */}
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ color: t.textSecondary, fontSize: '12px', fontWeight: '700', letterSpacing: '0.5px', margin: '0 0 12px' }}>
                MODE
              </h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                {(['light', 'dark'] as const).map(m => (
                  <button key={m} onClick={() => setPendingTheme(m)}
                    style={{
                      flex: 1, padding: '12px', borderRadius: '8px',
                      border: `2px solid ${pendingTheme === m ? t.accentBorder : t.borderCard}`,
                      background: pendingTheme === m ? t.accentBg : 'transparent',
                      color: pendingTheme === m ? t.accent : t.textMuted,
                      fontSize: '13px', fontWeight: pendingTheme === m ? '700' : '400',
                      cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                    }}>
                    {m === 'dark' ? '🌙 Dark' : '☀️ Light'}
                  </button>
                ))}
              </div>
            </div>

            {/* Font size */}
            <div style={{ marginBottom: '28px' }}>
              <h3 style={{ color: t.textSecondary, fontSize: '12px', fontWeight: '700', letterSpacing: '0.5px', margin: '0 0 12px' }}>
                FONT SIZE
              </h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                {(['sm', 'md', 'lg', 'xl'] as const).map(s => (
                  <button key={s} onClick={() => setPendingFontSize(s)}
                    style={{
                      flex: 1, padding: '10px', borderRadius: '8px',
                      border: `2px solid ${pendingFontSize === s ? t.accentBorder : t.borderCard}`,
                      background: pendingFontSize === s ? t.accentBg : 'transparent',
                      color: pendingFontSize === s ? t.accent : t.textMuted,
                      fontSize: s === 'sm' ? '11px' : s === 'md' ? '13px' : s === 'lg' ? '15px' : '17px',
                      fontWeight: pendingFontSize === s ? '700' : '400',
                      cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s'
                    }}>
                    {fontLabels[s]}
                  </button>
                ))}
              </div>
            </div>

            {/* SAVE BUTTON */}
            <button
              onClick={handleSave}
              style={{
                width: '100%', padding: '14px',
                background: saved ? t.success : t.accent,
                border: 'none', borderRadius: '8px',
                color: saved ? '#fff' : t.accentText,
                fontSize: '14px', fontWeight: '700',
                cursor: 'pointer', fontFamily: 'inherit',
                transition: 'all 0.2s', letterSpacing: '0.5px'
              }}>
              {saved ? '✓ SAVED!' : 'SAVE CHANGES'}
            </button>
          </div>
        </div>
      )}

      {/* User Guide Modal */}
      {showGuide && (
        <div
          role="dialog" aria-modal="true" aria-label="User guide"
          style={{
            position: 'fixed', inset: 0, background: t.overlayBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9998, fontFamily: 'inherit'
          }}
          onClick={e => { if (e.target === e.currentTarget) setShowGuide(false) }}>
          <div style={{
            background: t.bgCard, border: `1px solid ${t.borderCard}`,
            borderRadius: '14px', width: '100%', maxWidth: '560px',
            margin: '24px', padding: '28px', boxShadow: t.shadow,
            maxHeight: '88vh', overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div>
                <h2 style={{ color: t.textPrimary, margin: '0 0 4px', fontSize: '20px', fontWeight: '700' }}>
                  {role === 'editor' ? 'Editor Guide' : 'Reporter Guide'}
                </h2>
                <p style={{ color: t.textMuted, margin: 0, fontSize: '13px' }}>
                  Welcome, <span style={{ color: t.accent, fontWeight: '600' }}>{userName}</span>! Here's how to use your portal.
                </p>
              </div>
              <button onClick={() => setShowGuide(false)}
                style={{ background: 'none', border: 'none', color: t.textMuted, fontSize: '22px', cursor: 'pointer' }}>
                x
              </button>
            </div>

            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              padding: '6px 14px', borderRadius: '6px', marginBottom: '24px',
              background: role === 'editor' ? t.accentBg : t.successBg,
              border: `1px solid ${role === 'editor' ? t.accentBorder : t.successBorder}`
            }}>
              <span style={{ fontSize: '16px' }}>{role === 'editor' ? '✏️' : '📰'}</span>
              <span style={{ color: role === 'editor' ? t.accent : t.success, fontSize: '13px', fontWeight: '700' }}>
                {role === 'editor' ? 'EDITOR' : 'REPORTER'} PORTAL
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
              {guide.map((step, i) => (
                <div key={i} style={{
                  display: 'flex', gap: '14px', alignItems: 'flex-start',
                  padding: '14px 16px', borderRadius: '10px',
                  background: t.bgPage, border: `1px solid ${t.borderCard}`
                }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '8px',
                    background: t.accentBg, border: `1px solid ${t.accentBorder}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '18px', flexShrink: 0
                  }}>
                    {step.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{
                        width: '20px', height: '20px', borderRadius: '50%',
                        background: t.accent, color: t.accentText,
                        fontSize: '10px', fontWeight: '700',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        {i + 1}
                      </span>
                      <span style={{ color: t.textPrimary, fontSize: '14px', fontWeight: '700' }}>
                        {step.title}
                      </span>
                    </div>
                    <p style={{ color: t.textMuted, fontSize: '13px', margin: 0, lineHeight: 1.6 }}>
                      {step.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div style={{
              padding: '16px', background: t.accentBg,
              border: `1px solid ${t.accentBorder}`,
              borderRadius: '10px', marginBottom: '16px'
            }}>
              <p style={{ color: t.accent, fontSize: '12px', fontWeight: '700', margin: '0 0 8px', letterSpacing: '0.5px' }}>
                QUICK TIPS
              </p>
              {role === 'editor' ? (
                <ul style={{ color: t.textSecondary, fontSize: '12px', margin: 0, paddingLeft: '16px', lineHeight: 2 }}>
                  <li>Use the <strong>AI chatbot</strong> (bottom right) to perform actions with natural language</li>
                  <li>The <strong>Kanban board</strong> gives a visual overview of all stories</li>
                  <li>Click <strong>VIEW AS</strong> on the Roster to see any reporter's full dashboard</li>
                  <li>Stories with <strong>red urgency</strong> are breaking news — assign immediately</li>
                </ul>
              ) : (
                <ul style={{ color: t.textSecondary, fontSize: '12px', margin: 0, paddingLeft: '16px', lineHeight: 2 }}>
                  <li>Always <strong>save availability</strong> at the start of each week</li>
                  <li>File your report as a <strong>Word document</strong> (.doc or .docx)</li>
                  <li>Check your <strong>calendar</strong> daily for upcoming deadlines</li>
                  <li>Respond to <strong>override assignments</strong> as soon as possible</li>
                </ul>
              )}
            </div>

            <button
              onClick={() => setShowGuide(false)}
              style={{
                width: '100%', padding: '13px',
                background: t.accent, border: 'none',
                borderRadius: '8px', color: t.accentText,
                fontSize: '13px', fontWeight: '700',
                cursor: 'pointer', fontFamily: 'inherit'
              }}>
              GOT IT — LET'S GO!
            </button>
          </div>
        </div>
      )}
    </>
  )
}