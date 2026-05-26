import { useState } from "react"
import { supabase } from "../lib/supabase"
import { useTheme } from "../context/ThemeContext"

export default function Login() {
  const { t, theme, toggleTheme } = useTheme()
  const [isLogin, setIsLogin] = useState(true)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState("reporter")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleAuth = async (e: any) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) setError(error.message)
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) { setError(error.message); setLoading(false); return }
        if (data.user) {
          const { error: reporterError } = await supabase.from("reporters").insert([{
            id: data.user.id, name: name || email.split("@")[0],
            email: email, beats: ["General"], max_stories_per_week: 4, status: "active"
          }]).select()
          if (reporterError) { setError(reporterError.message); setLoading(false); return }
          setIsLogin(true)
        }
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong")
    }
    setLoading(false)
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "13px 16px",
    background: t.bgInput,
    border: `1px solid ${t.borderInput}`,
    borderRadius: "8px",
    color: t.textPrimary,
    fontSize: "14px",
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
    transition: "border-color 0.15s",
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: t.bgPage,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: '"Inter", "DM Mono", "Courier New", monospace',
      padding: "24px",
    }}>
      {/* Theme toggle top right */}
      <button
        aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        onClick={toggleTheme}
        style={{
          position: 'fixed', top: '16px', right: '16px',
          padding: '8px 14px', borderRadius: '8px',
          border: `1px solid ${t.borderCard}`,
          background: t.bgCard, color: t.textSecondary,
          fontSize: '16px', cursor: 'pointer',
          fontFamily: 'inherit',
        }}>
        {theme === 'dark' ? '☀' : '☾'}
      </button>

      <div style={{
        width: "100%",
        maxWidth: "460px",
        padding: "48px 40px",
        border: `1px solid ${t.borderCard}`,
        borderRadius: "12px",
        background: t.bgCard,
        boxShadow: t.shadow,
      }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '8px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: t.accent }} />
            <h1 style={{ color: t.accent, fontSize: "28px", fontWeight: "800", margin: 0, letterSpacing: "3px" }}>
              NEWSROOM OS
            </h1>
          </div>
          <h2 style={{ color: t.textPrimary, fontSize: "18px", fontWeight: "600", margin: "0 0 4px" }}>
            {isLogin ? "Welcome back" : "Create your account"}
          </h2>
          <p style={{ color: t.textMuted, fontSize: "13px", margin: 0 }}>
            {isLogin ? "Sign in to your newsroom portal" : "Join the newsroom team"}
          </p>
        </div>

        <form onSubmit={handleAuth} noValidate>
          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>

            {!isLogin && (
              <div>
                <label
                  htmlFor="name"
                  style={{ color: t.textSecondary, fontSize: "12px", fontWeight: "600", letterSpacing: "0.5px", display: "block", marginBottom: "6px" }}>
                  FULL NAME
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  style={inputStyle}
                  placeholder="Your full name"
                  required
                  aria-required="true"
                  onFocus={e => e.target.style.borderColor = t.accent}
                  onBlur={e => e.target.style.borderColor = t.borderInput}
                />
              </div>
            )}

            <div>
              <label
                htmlFor="email"
                style={{ color: t.textSecondary, fontSize: "12px", fontWeight: "600", letterSpacing: "0.5px", display: "block", marginBottom: "6px" }}>
                EMAIL ADDRESS
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={inputStyle}
                placeholder="your@email.com"
                required
                aria-required="true"
                autoComplete="email"
                onFocus={e => e.target.style.borderColor = t.accent}
                onBlur={e => e.target.style.borderColor = t.borderInput}
              />
            </div>

            <div>
              <label
                htmlFor="password"
                style={{ color: t.textSecondary, fontSize: "12px", fontWeight: "600", letterSpacing: "0.5px", display: "block", marginBottom: "6px" }}>
                PASSWORD
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={inputStyle}
                placeholder="Enter your password"
                required
                aria-required="true"
                autoComplete={isLogin ? "current-password" : "new-password"}
                onFocus={e => e.target.style.borderColor = t.accent}
                onBlur={e => e.target.style.borderColor = t.borderInput}
              />
            </div>

            {!isLogin && (
              <div>
                <label
                  style={{ color: t.textSecondary, fontSize: "12px", fontWeight: "600", letterSpacing: "0.5px", display: "block", marginBottom: "8px" }}>
                  ROLE
                </label>
                <div style={{ display: "flex", gap: "8px" }} role="group" aria-label="Select role">
                  {['reporter', 'editor'].map(r => (
                    <button
                      key={r}
                      type="button"
                      aria-pressed={role === r}
                      onClick={() => setRole(r)}
                      style={{
                        flex: 1, padding: "11px",
                        border: `2px solid ${role === r ? t.accent : t.borderInput}`,
                        borderRadius: "8px",
                        background: role === r ? t.accentBg : 'transparent',
                        color: role === r ? t.accent : t.textMuted,
                        fontSize: "12px", letterSpacing: "1px", fontWeight: role === r ? '700' : '400',
                        cursor: "pointer", fontFamily: "inherit",
                        transition: 'all 0.15s',
                      }}>
                      {r.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div
                role="alert"
                aria-live="polite"
                style={{
                  padding: "12px 16px",
                  background: t.dangerBg,
                  border: `1px solid ${t.dangerBorder}`,
                  borderRadius: "8px",
                  color: t.danger,
                  fontSize: "13px",
                  fontWeight: "500",
                }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              style={{
                width: "100%", padding: "14px",
                background: loading ? t.textMuted : t.accent,
                border: "none", borderRadius: "8px",
                color: t.accentText,
                fontSize: "13px", letterSpacing: "1px", fontWeight: "700",
                cursor: loading ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                transition: 'all 0.15s',
                marginTop: "4px",
              }}>
              {loading ? "PLEASE WAIT..." : isLogin ? "SIGN IN" : "CREATE ACCOUNT"}
            </button>
          </div>
        </form>

        <div style={{ textAlign: "center", marginTop: "24px", paddingTop: "20px", borderTop: `1px solid ${t.borderCard}` }}>
          <button
            onClick={() => { setIsLogin(!isLogin); setError("") }}
            style={{
              background: "none", border: "none",
              color: t.accent, fontSize: "13px",
              cursor: "pointer", fontFamily: "inherit",
              fontWeight: "500", textDecoration: "underline",
              textUnderlineOffset: "3px",
            }}>
            {isLogin ? "Need an account? Create one" : "Already have an account? Sign in"}
          </button>
        </div>

        {/* WCAG info note */}
        <p style={{ color: t.textDisabled, fontSize: "11px", textAlign: "center", marginTop: "16px", lineHeight: 1.5 }}>
          This portal meets WCAG 2.1 AA accessibility standards.
          Use Tab to navigate, Enter to activate.
        </p>
      </div>
    </div>
  )
}



