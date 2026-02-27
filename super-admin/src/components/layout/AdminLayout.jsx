// src/components/layout/AdminLayout.jsx
import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Building2, CreditCard, TrendingUp, LogOut, ShieldCheck } from 'lucide-react'
import { useAuth } from '../../lib/auth'

const NAV = [
  { to: '/dashboard',     icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/schools',       icon: Building2,       label: 'All Schools' },
  { to: '/subscriptions', icon: CreditCard,      label: 'Subscriptions' },
  { to: '/revenue',       icon: TrendingUp,      label: 'Revenue' },
]

export default function AdminLayout({ children }) {
  const { admin, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
      <aside style={{
        width: 232, flexShrink: 0,
        background: 'var(--navy-900)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Brand */}
        <div style={{ padding: '24px 20px 18px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34,
              background: 'linear-gradient(135deg, var(--gold-500), var(--gold-400))',
              borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: 'var(--navy-950)',
            }}>S</div>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600 }}>SchoolPay</div>
              <div style={{ fontSize: 10, color: 'var(--gold-500)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: -1 }}>Super Admin</div>
            </div>
          </div>
        </div>

        {/* Platform badge */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'rgba(212,168,67,0.06)', border: '1px solid var(--border-accent)', borderRadius: 'var(--radius-sm)' }}>
            <ShieldCheck size={13} style={{ color: 'var(--gold-500)' }} />
            <span style={{ fontSize: 11, color: 'var(--gold-400)', fontWeight: 500 }}>Platform Control Panel</span>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto' }}>
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 'var(--radius-sm)', marginBottom: 2,
              color: isActive ? 'var(--gold-400)' : 'var(--text-secondary)',
              background: isActive ? 'rgba(212,168,67,0.08)' : 'transparent',
              fontWeight: isActive ? 500 : 400, fontSize: 14, textDecoration: 'none',
              borderLeft: isActive ? '2px solid var(--gold-500)' : '2px solid transparent',
              transition: 'all 0.15s',
            })}>
              <Icon size={15} />{label}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)' }}>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{admin?.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{admin?.email}</div>
          </div>
          <button onClick={() => { logout(); navigate('/login') }}
            style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, padding: 0, transition: 'color 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--danger)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
            <LogOut size={14} /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 56, background: 'var(--navy-900)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 28px', flexShrink: 0 }}>
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Logged in as <span style={{ color: 'var(--gold-400)' }}>{admin?.email}</span>
          </div>
        </header>
        <main style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
