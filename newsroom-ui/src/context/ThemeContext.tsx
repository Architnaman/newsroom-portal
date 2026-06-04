import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

type Theme = 'dark' | 'light'
type FontSize = 'sm' | 'md' | 'lg' | 'xl'
type Background = 'default' | 'blue' | 'purple' | 'green' | 'midnight' | 'ocean' | 'sunset' | 'forest' | 'rose' | 'arctic' | 'golden' | 'candy' | 'aurora' | 'coral' | 'lime' | 'peach'

interface ThemeContextType {
  theme: Theme
  fontSize: FontSize
  background: Background
  toggleTheme: () => void
  setFontSize: (s: FontSize) => void
  setBackground: (b: Background) => void
  t: typeof darkTokens
  bgMain: string
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

export const backgroundPresets: Record<Background, { label: string, value: string, preview: string }> = {
  default:  { label: 'Default',   value: '',                                                                  preview: '#eef4ff' },
  blue:     { label: 'Deep Blue', value: 'linear-gradient(135deg, #0a0f2e 0%, #0d1b3e 50%, #0a0f1a 100%)',   preview: '#0d1b3e' },
  purple:   { label: 'Purple',    value: 'linear-gradient(135deg, #1a0a2e 0%, #2d1b4e 50%, #0a0f1a 100%)',   preview: '#2d1b4e' },
  green:    { label: 'Forest',    value: 'linear-gradient(135deg, #0a1f0a 0%, #0d2e1a 50%, #0a0f1a 100%)',   preview: '#0d2e1a' },
  midnight: { label: 'Midnight',  value: 'linear-gradient(135deg, #000000 0%, #0d0d0d 50%, #111111 100%)',   preview: '#0d0d0d' },
  ocean:    { label: 'Ocean',     value: 'linear-gradient(135deg, #001a2e 0%, #003d5c 50%, #0a1628 100%)',   preview: '#003d5c' },
  sunset:   { label: 'Sunset',    value: 'linear-gradient(135deg, #1a0a00 0%, #2e1a0a 50%, #1a0f0a 100%)',   preview: '#2e1a0a' },
  forest:   { label: 'Emerald',   value: 'linear-gradient(135deg, #001a1a 0%, #003333 50%, #001a2e 100%)',   preview: '#003333' },
  rose:     { label: 'Rose',      value: 'linear-gradient(135deg, #fff0f3 0%, #ffd6e0 50%, #ffb3c6 100%)',   preview: '#ffd6e0' },
  arctic:   { label: 'Arctic',    value: 'linear-gradient(135deg, #e0f7fa 0%, #b2ebf2 50%, #e0f2ff 100%)',   preview: '#b2ebf2' },
  golden:   { label: 'Golden',    value: 'linear-gradient(135deg, #fffde7 0%, #fff3b0 50%, #ffe57a 100%)',   preview: '#fff3b0' },
  candy:    { label: 'Candy',     value: 'linear-gradient(135deg, #fce4ec 0%, #f8bbd0 50%, #e1bee7 100%)',   preview: '#f8bbd0' },
  aurora:   { label: 'Aurora',    value: 'linear-gradient(135deg, #e8f5e9 0%, #b2dfdb 50%, #e3f2fd 100%)',   preview: '#b2dfdb' },
  coral:    { label: 'Coral',     value: 'linear-gradient(135deg, #fff3e0 0%, #ffe0b2 50%, #ffccbc 100%)',   preview: '#ffe0b2' },
  lime:     { label: 'Lime',      value: 'linear-gradient(135deg, #f9fbe7 0%, #dcedc8 50%, #c5e1a5 100%)',   preview: '#dcedc8' },
  peach:    { label: 'Peach',     value: 'linear-gradient(135deg, #fff8f0 0%, #ffe5cc 50%, #ffd4a8 100%)',   preview: '#ffe5cc' },
}

export const fontZoomMap: Record<FontSize, number> = {
  sm: 0.85, md: 1, lg: 1.15, xl: 1.3,
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  fontSize: 'md',
  background: 'default',
  toggleTheme: () => {},
  setFontSize: () => {},
  setBackground: () => {},
  t: lightTokens,
  bgMain: lightTokens.bgPage,
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() =>
    (localStorage.getItem('nr_theme') as Theme) || 'light'
  )
  const [fontSize, setFontSizeState] = useState<FontSize>(() =>
    (localStorage.getItem('nr_fontsize') as FontSize) || 'md'
  )
  const [background, setBackgroundState] = useState<Background>(() =>
    (localStorage.getItem('nr_background') as Background) || 'default'
  )

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('nr_theme', next)
  }

  const setFontSize = (s: FontSize) => {
    setFontSizeState(s)
    localStorage.setItem('nr_fontsize', s)
  }

  const setBackground = (b: Background) => {
    setBackgroundState(b)
    localStorage.setItem('nr_background', b)
  }

  const baseTokens = theme === 'dark' ? darkTokens : lightTokens
  const preset = backgroundPresets[background]
  const bgMain = preset?.value || baseTokens.bgPage

  const t = background !== 'default'
    ? { ...baseTokens, bgPage: 'transparent' }
    : baseTokens

  useEffect(() => {
    document.documentElement.setAttribute('data-fontsize', fontSize)
    document.documentElement.style.setProperty('--bg-page', t.bgPage)
    document.documentElement.style.setProperty('--text-primary', t.textPrimary)
    document.documentElement.style.setProperty('--bg-main', bgMain)

    const appliedBg = background !== 'default' && preset?.value
      ? preset.value
      : baseTokens.bgPage

    document.documentElement.style.background = appliedBg
    document.documentElement.style.backgroundAttachment = 'fixed'
    document.documentElement.style.minHeight = '100%'
    document.body.style.background = appliedBg
    document.body.style.backgroundAttachment = 'fixed'
    document.body.style.minHeight = '100vh'
    document.body.style.color = t.textPrimary
    document.body.style.margin = '0'
    document.body.style.padding = '0'
  }, [theme, fontSize, background, bgMain, t.bgPage, t.textPrimary, preset?.value])

  return (
    <ThemeContext.Provider value={{
      theme, fontSize, background,
      toggleTheme, setFontSize, setBackground,
      t, bgMain
    }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)