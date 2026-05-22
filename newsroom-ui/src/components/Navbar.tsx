import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'

interface NavItem { label: string; path: string }

export default function Navbar() {
  const { role, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { theme, fontSize, toggleTheme, setFontSize, t } = useTheme()

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

  // MODIFIED: Font size labels with visual size difference
  const fontSizes = ['sm', 'md', 'lg', 'xl'] as const
  const fontLabels: Record<string, string> = { sm: 'A-', md: 'A', lg: 'A+', xl: 'A++' }
  const fontSizePx: Record<string, string> = { sm: '10px', md: '11px', lg: '13px', xl: '15px' }

  return (
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
                  padding: '7px 16px',
                  borderRadius: '6px',
                  border: isActive ? `1px solid ${t.accentBorder}` : '1px solid transparent',
                  background: isActive ? t.accentBg : 'transparent',
                  color: isActive ? t.accent : t.textMuted,
                  fontSize: '12px',
                  letterSpacing: '0.5px',
                  fontWeight: isActive ? '600' : '400',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'all 0.15s',
                  outline: 'none',
                }}
                onFocus={e => e.currentTarget.style.boxShadow = `0 0 0 2px ${t.accent}`}
                onBlur={e => e.currentTarget.style.boxShadow = 'none'}
                onMouseEnter={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = t.accentBg
                    e.currentTarget.style.color = t.accent
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = t.textMuted
                  }
                }}>
                {item.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Right: Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>

        {/* MODIFIED: Font size controls with visual size labels */}
        <div
          role="group"
          aria-label="Font size controls"
          style={{
            display: 'flex',
            gap: '2px',
            padding: '3px',
            background: t.bgInput,
            borderRadius: '8px',
            border: `1px solid ${t.borderCard}`
          }}>
          {fontSizes.map(s => (
            <button
              key={s}
              aria-label={`Set font size to ${s}`}
              aria-pressed={fontSize === s}
              onClick={() => setFontSize(s)}
              title={`Font size: ${s.toUpperCase()}`}
              style={{
                padding: '5px 9px',
                borderRadius: '5px',
                border: 'none',
                background: fontSize === s ? t.accent : 'transparent',
                color: fontSize === s ? t.accentText : t.textMuted,
                // MODIFIED: Each button shows at its own font size so you can see the difference
                fontSize: fontSizePx[s],
                fontWeight: fontSize === s ? '700' : '500',
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.15s',
                lineHeight: 1,
                minWidth: '28px',
                textAlign: 'center' as const,
              }}>
              {fontLabels[s]}
            </button>
          ))}
        </div>

        {/* Theme toggle */}
        <button
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          aria-pressed={theme === 'light'}
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          style={{
            padding: '7px 12px',
            borderRadius: '8px',
            border: `1px solid ${t.borderCard}`,
            background: t.bgInput,
            color: t.textSecondary,
            fontSize: '14px',
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'all 0.15s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = t.accentBg
            e.currentTarget.style.borderColor = t.accentBorder
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = t.bgInput
            e.currentTarget.style.borderColor = t.borderCard
          }}>
          {theme === 'dark' ? '☀' : '☾'}
        </button>

        {/* Role badge */}
        <span
          aria-label={`Logged in as ${role}`}
          style={{
            padding: '4px 12px',
            borderRadius: '4px',
            background: role === 'editor' ? t.accentBg : t.successBg,
            color: role === 'editor' ? t.accent : t.success,
            border: `1px solid ${role === 'editor' ? t.accentBorder : t.successBorder}`,
            fontSize: '11px',
            letterSpacing: '1px',
            fontWeight: '600',
          }}>
          {role?.toUpperCase()}
        </span>

        {/* Logout */}
        <button
          aria-label="Sign out"
          onClick={signOut}
          style={{
            padding: '7px 16px',
            borderRadius: '6px',
            border: `1px solid ${t.borderCard}`,
            background: 'transparent',
            color: t.textMuted,
            fontSize: '12px',
            letterSpacing: '0.5px',
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'all 0.15s',
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
  )
}