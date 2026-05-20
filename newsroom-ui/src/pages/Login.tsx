import { useState } from "react"
import { supabase } from "../lib/supabase"

export default function Login() {
  const [isLogin, setIsLogin] = useState(true)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState("reporter")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleAuth = async (e) => {
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
    } catch (err) {
      setError(err.message || "Something went wrong")
    }
    setLoading(false)
  }

  const inputStyle = {
    width: "100%", padding: "12px 16px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "6px", color: "#fff",
    fontSize: "14px", outline: "none",
    boxSizing: "border-box", fontFamily: "inherit",
    colorScheme: "dark"
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "DM Mono, Courier New, monospace" }}>
      <div style={{ width: "100%", maxWidth: "480px", margin: "24px", padding: "40px", border: "1px solid rgba(255,180,0,0.2)", borderRadius: "8px", background: "#0d0d14" }}>

        <h1 style={{ color: "#ffb400", fontSize: "32px", fontWeight: "700", textAlign: "center", marginBottom: "8px", letterSpacing: "2px" }}>
          NEWSROOM OS
        </h1>

        <h2 style={{ color: "#fff", fontSize: "20px", fontWeight: "600", textAlign: "center", marginBottom: "6px" }}>
          {isLogin ? "Sign In" : "Create Account"}
        </h2>

        <p style={{ color: "#555", fontSize: "13px", textAlign: "center", marginBottom: "32px" }}>
          Join the newsroom team
        </p>

        <form onSubmit={handleAuth}>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

            {!isLogin && (
              <div>
                <label style={{ color: "#888", fontSize: "11px", letterSpacing: "1px", display: "block", marginBottom: "6px" }}>FULL NAME</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} style={inputStyle} placeholder="Your full name" required />
              </div>
            )}

            <div>
              <label style={{ color: "#888", fontSize: "11px", letterSpacing: "1px", display: "block", marginBottom: "6px" }}>EMAIL</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} placeholder="your@email.com" required />
            </div>

            <div>
              <label style={{ color: "#888", fontSize: "11px", letterSpacing: "1px", display: "block", marginBottom: "6px" }}>PASSWORD</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} placeholder="••••••••" required />
            </div>

            {!isLogin && (
              <div>
                <label style={{ color: "#888", fontSize: "11px", letterSpacing: "1px", display: "block", marginBottom: "8px" }}>ROLE</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button type="button" onClick={() => setRole("reporter")}
                    style={{ flex: 1, padding: "10px", border: "1px solid", borderColor: role === "reporter" ? "#ffb400" : "rgba(255,255,255,0.1)", borderRadius: "5px", background: role === "reporter" ? "rgba(255,180,0,0.15)" : "transparent", color: role === "reporter" ? "#ffb400" : "#555", fontSize: "11px", letterSpacing: "1px", cursor: "pointer", fontFamily: "inherit" }}>
                    REPORTER
                  </button>
                  <button type="button" onClick={() => setRole("editor")}
                    style={{ flex: 1, padding: "10px", border: "1px solid", borderColor: role === "editor" ? "#ffb400" : "rgba(255,255,255,0.1)", borderRadius: "5px", background: role === "editor" ? "rgba(255,180,0,0.15)" : "transparent", color: role === "editor" ? "#ffb400" : "#555", fontSize: "11px", letterSpacing: "1px", cursor: "pointer", fontFamily: "inherit" }}>
                    EDITOR
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div style={{ padding: "12px", background: "rgba(255,68,68,0.1)", border: "1px solid rgba(255,68,68,0.3)", borderRadius: "5px", color: "#ff6b6b", fontSize: "12px" }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              style={{ width: "100%", padding: "13px", background: "#ffb400", border: "none", borderRadius: "6px", color: "#0a0a0f", fontSize: "12px", letterSpacing: "1px", fontWeight: "700", cursor: "pointer", fontFamily: "inherit", opacity: loading ? 0.6 : 1, marginTop: "8px" }}>
              {loading ? "PLEASE WAIT..." : isLogin ? "SIGN IN" : "CREATE ACCOUNT"}
            </button>
          </div>
        </form>

        <div style={{ textAlign: "center", marginTop: "24px" }}>
          <button onClick={() => { setIsLogin(!isLogin); setError("") }}
            style={{ background: "none", border: "none", color: "#ffb400", fontSize: "12px", cursor: "pointer", fontFamily: "inherit" }}>
            {isLogin ? "Need an account? Create one" : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  )
}