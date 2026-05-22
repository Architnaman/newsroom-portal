import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

type Theme = 'dark' | 'light'
type FontSize = 'sm' | 'md' | 'lg' | 'xl'

interface ThemeContextType {
  theme: Theme
  fontSize: FontSize
  toggleTheme: () => void
  setFontSize: (s: FontSize) => void
  t: typeof darkTokens
}

const darkTokens = {
  bgPage: '#0a0f1a',
  bgCard: '#0f1623',
  bgCardHover: '#131e2e',
  bgInput: 'rgba(255,255,255,0.06)',
  bgNavbar: '#0b1220',
  borderCard: 'rgba(100,160,255,0.15)',
  borderInput: 'rgba(100,160,255,0.2)',
  borderNavbar: 'rgba(100,160,255,0.15)',
  textPrimary: '#e8f0fe',
  textSecondary: '#94afd4',
  textMuted: '#5a7a9f',
  textDisabled: '#3a5070',
  accent: '#4da6ff',
  accentHover: '#6bb8ff',
  accentText: '#0a0f1a',
  accentBg: 'rgba(77,166,255,0.12)',
  accentBorder: 'rgba(77,166,255,0.35)',
  success: '#3dd68c',
  successBg: 'rgba(61,214,140,0.1)',
  successBorder: 'rgba(61,214,140,0.3)',
  warning: '#ffb74d',
  warningBg: 'rgba(255,183,77,0.1)',
  warningBorder: 'rgba(255,183,77,0.3)',
  danger: '#ff6b6b',
  dangerBg: 'rgba(255,107,107,0.1)',
  dangerBorder: 'rgba(255,107,107,0.3)',
  info: '#4da6ff',
  infoBg: 'rgba(77,166,255,0.1)',
  infoBorder: 'rgba(77,166,255,0.3)',
  breaking: '#ff5252',
  high: '#ff9800',
  normal: '#ffb74d',
  low: '#3dd68c',
  shadow: '0 4px 24px rgba(0,0,0,0.4)',
  shadowCard: '0 2px 12px rgba(0,0,0,0.3)',
  overlayBg: 'rgba(0,0,0,0.75)',
  scrollbarThumb: 'rgba(77,166,255,0.2)',
}

const lightTokens = {
  bgPage: '#eef4ff',
  bgCard: '#ffffff',
  bgCardHover: '#f5f9ff',
  bgInput: 'rgba(0,0,0,0.04)',
  bgNavbar: '#ffffff',
  borderCard: 'rgba(59,130,246,0.2)',
  borderInput: 'rgba(59,130,246,0.3)',
  borderNavbar: 'rgba(59,130,246,0.15)',
  textPrimary: '#0f172a',
  textSecondary: '#334e7a',
  textMuted: '#5a7a9f',
  textDisabled: '#94aabf',
  accent: '#1d6fd8',
  accentHover: '#1558b0',
  accentText: '#ffffff',
  accentBg: 'rgba(29,111,216,0.1)',
  accentBorder: 'rgba(29,111,216,0.3)',
  success: '#16a34a',
  successBg: 'rgba(22,163,74,0.08)',
  successBorder: 'rgba(22,163,74,0.25)',
  warning: '#d97706',
  warningBg: 'rgba(217,119,6,0.08)',
  warningBorder: 'rgba(217,119,6,0.25)',
  danger: '#dc2626',
  dangerBg: 'rgba(220,38,38,0.08)',
  dangerBorder: 'rgba(220,38,38,0.25)',
  info: '#1d6fd8',
  infoBg: 'rgba(29,111,216,0.08)',
  infoBorder: 'rgba(29,111,216,0.25)',
  breaking: '#dc2626',
  high: '#d97706',
  normal: '#1d6fd8',
  low: '#16a34a',
  shadow: '0 4px 24px rgba(0,0,0,0.08)',
  shadowCard: '0 2px 8px rgba(0,0,0,0.06)',
  overlayBg: 'rgba(0,0,0,0.5)',
  scrollbarThumb: 'rgba(29,111,216,0.2)',
}

// MODIFIED: zoom map instead of fontSize map
export const fontZoomMap: Record<FontSize, number> = {
  sm: 0.85,
  md: 1,
  lg: 1.15,
  xl: 1.3,
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  fontSize: 'md',
  toggleTheme: () => {},
  setFontSize: () => {},
  t: darkTokens,
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('nr_theme') as Theme) || 'dark'
  })
  const [fontSize, setFontSizeState] = useState<FontSize>(() => {
    return (localStorage.getItem('nr_fontsize') as FontSize) || 'md'
  })

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('nr_theme', next)
  }

  const setFontSize = (s: FontSize) => {
    setFontSizeState(s)
    localStorage.setItem('nr_fontsize', s)
  }

  const t = theme === 'dark' ? darkTokens : lightTokens

  // MODIFIED: Use data attribute for font size — zoom applied in App.tsx wrapper
  useEffect(() => {
    document.documentElement.setAttribute('data-fontsize', fontSize)
    document.documentElement.style.setProperty('--bg-page', t.bgPage)
    document.documentElement.style.setProperty('--text-primary', t.textPrimary)
    document.body.style.background = t.bgPage
    document.body.style.color = t.textPrimary
  }, [theme, fontSize])

  return (
    <ThemeContext.Provider value={{ theme, fontSize, toggleTheme, setFontSize, t }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)