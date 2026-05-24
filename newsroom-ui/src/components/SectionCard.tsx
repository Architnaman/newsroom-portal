import { ReactNode } from "react"
import { useTheme } from "../context/ThemeContext"

interface Props {
  title: string
  isCollapsed: boolean
  onToggle: () => void
  children: ReactNode
  badge?: string | number
  badgeColor?: string
  style?: React.CSSProperties
}

export default function SectionCard({ title, isCollapsed, onToggle, children, badge, badgeColor, style = {} }: Props) {
  const { t } = useTheme()
  const bg = badgeColor ? badgeColor + "20" : t.accentBg
  const bc = badgeColor ? badgeColor + "40" : t.accentBorder
  const fc = badgeColor || t.accent
  return (
    <div style={{ background: t.bgCard, border: "1px solid " + t.borderCard, borderRadius: "10px", boxShadow: t.shadowCard, overflow: "hidden", ...style }}>
      <button
        onClick={onToggle}
        aria-expanded={!isCollapsed}
        style={{ width: "100%", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "transparent", border: "none", borderBottom: isCollapsed ? "none" : "1px solid " + t.borderCard, cursor: "pointer", fontFamily: "inherit", transition: "background 0.15s" }}
        onMouseEnter={e => { e.currentTarget.style.background = t.bgInput }}
        onMouseLeave={e => { e.currentTarget.style.background = "transparent" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ color: t.textPrimary, fontSize: "14px", fontWeight: "700", letterSpacing: "0.5px" }}>{title}</span>
          {badge !== undefined && (
            <span style={{ padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: "700", background: bg, color: fc, border: "1px solid " + bc }}>
              {badge}
            </span>
          )}
        </div>
        <span style={{ color: t.textMuted, fontSize: "18px", transition: "transform 0.2s", transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)", display: "inline-block", lineHeight: "1" }}>
          v
        </span>
      </button>
      {!isCollapsed && <div style={{ padding: "20px" }}>{children}</div>}
    </div>
  )
}
