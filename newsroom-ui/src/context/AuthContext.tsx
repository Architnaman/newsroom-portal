import { createContext, useContext, useEffect, useState, ReactNode } from "react"
import { supabase } from "../lib/supabase"

type Role = "editor" | "reporter"

interface AuthContextType {
  user: any
  role: Role | null
  reporterId: string | null
  userName: string | null  // ADDED
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null, role: null, reporterId: null,
  userName: null, loading: true, signOut: async () => {}
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any>(null)
  const [role, setRole] = useState<Role | null>(null)
  const [reporterId, setReporterId] = useState<string | null>(null)
  const [userName, setUserName] = useState<string | null>(null) // ADDED
  const [loading, setLoading] = useState(true)

  async function fetchProfile(userId: string, userEmail?: string) {
    try {
      const { data } = await supabase
        .from("profiles").select("role, reporter_id").eq("id", userId).single()
      if (data) {
        setRole(data.role as Role)
        setReporterId(data.reporter_id)
      } else {
        setRole("reporter")
      }

      // ADDED: fetch reporter name
      const { data: reporter } = await supabase
        .from("reporters").select("name").eq("id", userId).maybeSingle()
      if (reporter?.name) {
        setUserName(reporter.name)
      } else {
        // fallback to email prefix
        setUserName(userEmail?.split('@')[0] || 'User')
      }
    } catch {
      setRole("reporter")
      setUserName(userEmail?.split('@')[0] || 'User')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id, session.user.email)
      else setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id, session.user.email)
      else {
        setRole(null); setReporterId(null)
        setUserName(null); setLoading(false)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null); setRole(null)
    setReporterId(null); setUserName(null)
  }

  return (
    <AuthContext.Provider value={{ user, role, reporterId, userName, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)