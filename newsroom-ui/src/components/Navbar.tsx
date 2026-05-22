import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

interface NavItem { label: string; path: string }

export default function Navbar() {
  const { role, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const editorNav: NavItem[] = [
    { label: 'Dashboard', path: '/dashboard' },
    { label: 'Kanban', path: '/kanban' },
    { label: 'Roster', path: '/roster' },
    { label: 'Calendar', path: '/calendar' }, // ADDED
  ]
  const reporterNav: NavItem[] = [
    { label: 'My Stories', path: '/queue' },
    { label: 'Availability', path: '/availability' },
    { label: 'Calendar', path: '/calendar' }, // ADDED
  ]

  const nav = role === 'editor' ? editorNav : reporterNav

  return (
    <nav style={{
      background: '#0d0d14', borderBottom: '1px solid rgba(255,180,0,0.12)',
      padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      height: '56px', position: 'sticky', top: 0, zIndex: 100,
      fontFamily: '"DM Mono", "Courier New", monospace'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ffb400' }} />
          <span style={{ color: '#ffb400', fontSize: '12px', letterSpacing: '2px', fontWeight: '700' }}>NEWSROOM</span>
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {nav.map(item => (
            <button key={item.path} onClick={() => navigate(item.path)} style={{
              padding: '6px 14px', borderRadius: '4px', border: 'none',
              background: location.pathname === item.path ? 'rgba(255,180,0,0.12)' : 'transparent',
              color: location.pathname === item.path ? '#ffb400' : '#666',
              fontSize: '11px', letterSpacing: '1px', cursor: 'pointer',
              fontFamily: 'inherit', textTransform: 'uppercase', transition: 'all 0.15s'
            }}>
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{
          padding: '3px 10px', borderRadius: '3px',
          background: role === 'editor' ? 'rgba(255,180,0,0.12)' : 'rgba(100,200,150,0.12)',
          color: role === 'editor' ? '#ffb400' : '#64c896',
          fontSize: '10px', letterSpacing: '1.5px'
        }}>{role?.toUpperCase()}</span>
        <button onClick={signOut} style={{
          padding: '6px 14px', borderRadius: '4px',
          border: '1px solid rgba(255,255,255,0.1)',
          background: 'transparent', color: '#555', fontSize: '11px',
          letterSpacing: '1px', cursor: 'pointer', fontFamily: 'inherit'
        }}>LOGOUT</button>
      </div>
    </nav>
  )
}