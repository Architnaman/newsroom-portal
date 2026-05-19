import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './pages/Login'
import EditorDashboard from './pages/EditorDashboard'
import KanbanBoard from './pages/KanbanBoard'
import ReporterQueue from './pages/ReporterQueue'
import AvailabilityPage from './pages/AvailabilityPage'
import ReporterRoster from './pages/ReporterRoster'

function ProtectedRoute({ children, requiredRole }: { children: React.ReactNode, requiredRole?: string }) {
  const { user, role, loading } = useAuth()
  if (loading) return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#0a0a0f'}}>
      <div style={{textAlign:'center'}}>
        <div style={{width:'8px',height:'8px',borderRadius:'50%',background:'#ffb400',margin:'0 auto 12px',animation:'pulse 1s infinite'}}/>
        <p style={{color:'#555',fontFamily:'monospace',fontSize:'12px'}}>Loading...</p>
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  if (requiredRole && role !== requiredRole) return <Navigate to={role === 'editor' ? '/dashboard' : '/queue'} replace />
  return <>{children}</>
}

function AppRoutes() {
  const { user, role } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={role === 'editor' ? '/dashboard' : '/queue'} replace /> : <Login />} />
      <Route path="/dashboard" element={<ProtectedRoute requiredRole="editor"><EditorDashboard /></ProtectedRoute>} />
      <Route path="/kanban" element={<ProtectedRoute requiredRole="editor"><KanbanBoard /></ProtectedRoute>} />
      <Route path="/roster" element={<ProtectedRoute requiredRole="editor"><ReporterRoster /></ProtectedRoute>} />
      <Route path="/queue" element={<ProtectedRoute requiredRole="reporter"><ReporterQueue /></ProtectedRoute>} />
      <Route path="/availability" element={<ProtectedRoute requiredRole="reporter"><AvailabilityPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}