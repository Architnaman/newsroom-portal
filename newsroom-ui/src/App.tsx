import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider, useTheme, fontZoomMap } from './context/ThemeContext'
import { DateFormatProvider } from './context/DateFormatContext'
import Login from './pages/Login'
import EditorDashboard from './pages/EditorDashboard'
import KanbanBoard from './pages/KanbanBoard'
import ReporterQueue from './pages/ReporterQueue'
import AvailabilityPage from './pages/AvailabilityPage'
import ReporterRoster from './pages/ReporterRoster'
import CalendarPage from './pages/CalendarPage'
import ReporterView from './pages/ReporterView'
import AdminPortal from './pages/AdminPortal'
import Chatbot from './components/Chatbot'

function ProtectedRoute({ children, requiredRole }: {
  children: React.ReactNode
  requiredRole?: string | string[]
}) {
  const { user, role, loading } = useAuth()
  const { t, bgMain } = useTheme()

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main, #eef4ff)' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: t.accent, margin: '0 auto 14px', animation: 'pulse 1s infinite' }} />
        <p style={{ color: t.textMuted, fontFamily: 'monospace', fontSize: '13px' }}>Loading...</p>
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
    </div>
  )

  if (!user) return <Navigate to="/login" replace />

  if (requiredRole) {
    const allowed = Array.isArray(requiredRole) ? requiredRole : [requiredRole]
    if (!allowed.includes(role!)) {
      if (role === 'admin') return <Navigate to="/admin" replace />
      return <Navigate to={role === 'editor' ? '/dashboard' : '/queue'} replace />
    }
  }

  return <>{children}</>
}

function AppRoutes() {
  const { user, role } = useAuth()
  const { fontSize } = useTheme()

  function getHome() {
    if (role === 'admin') return '/admin'
    if (role === 'editor') return '/dashboard'
    return '/queue'
  }

  return (
    <div style={{ zoom: fontZoomMap[fontSize], minHeight: '100vh', background: 'var(--bg-main, #eef4ff)' }}>
      <Routes>
        <Route path="/login" element={
          user ? <Navigate to={getHome()} replace /> : <Login />
        } />
        {/* ADMIN */}
        <Route path="/admin" element={
          <ProtectedRoute requiredRole="admin">
            <AdminPortal />
          </ProtectedRoute>
        } />
        {/* EDITOR */}
        <Route path="/dashboard" element={
          <ProtectedRoute requiredRole="editor">
            <EditorDashboard />
          </ProtectedRoute>
        } />
        <Route path="/kanban" element={
          <ProtectedRoute requiredRole="editor">
            <KanbanBoard />
          </ProtectedRoute>
        } />
        <Route path="/roster" element={
          <ProtectedRoute requiredRole="editor">
            <ReporterRoster />
          </ProtectedRoute>
        } />
        <Route path="/reporter-view/:reporterId" element={
          <ProtectedRoute requiredRole="editor">
            <ReporterView />
          </ProtectedRoute>
        } />
        {/* REPORTER */}
        <Route path="/queue" element={
          <ProtectedRoute requiredRole="reporter">
            <ReporterQueue />
          </ProtectedRoute>
        } />
        <Route path="/availability" element={
          <ProtectedRoute requiredRole="reporter">
            <AvailabilityPage />
          </ProtectedRoute>
        } />
        {/* SHARED */}
        <Route path="/calendar" element={
          <ProtectedRoute>
            <CalendarPage />
          </ProtectedRoute>
        } />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      {user && role !== 'admin' && <Chatbot />}
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <DateFormatProvider>
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AuthProvider>
      </DateFormatProvider>
    </ThemeProvider>
  )
}