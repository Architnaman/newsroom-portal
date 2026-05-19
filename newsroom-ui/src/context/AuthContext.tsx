import { createContext, useContext, useEffect, useState, ReactNode } from "react"
import { supabase } from "../lib/supabase"

type Role = "editor" | "reporter"

interface AuthContextType {
  user: any; role: Role | null
  reporterId: string | null; loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null, role: null, reporterId: null, loading: true, signOut: async () => {}
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any>(null)
  const [role, setRole] = useState<Role | null>(null)
  const [reporterId, setReporterId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function fetchProfile(userId: string) {
    try {
      const { data } = await supabase.from("profiles").select("role, reporter_id").eq("id", userId).single()
      if (data) { setRole(data.role as Role); setReporterId(data.reporter_id) }
      else setRole("reporter")
    } catch { setRole("reporter") }
    finally { setLoading(false) }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else { setRole(null); setReporterId(null); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null); setRole(null); setReporterId(null)
  }

  return (
    <AuthContext.Provider value={{ user, role, reporterId, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)