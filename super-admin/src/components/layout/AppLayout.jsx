// super-admin/src/components/layout/AppLayout.jsx
// Platform nav filtered by platform role.
// platform_admin sees: Dashboard, Schools, Subscriptions, Revenue, Team
// platform_support sees: Dashboard, Schools only

import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Building2, CreditCard,
  TrendingUp, Users, LogOut, ShieldCheck,
} from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { allowedNav, roleInfo } from '../../lib/permissions'

const ALL_NAV = [
  { id: 'dashboard',     to: '/dashboard',     icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'schools',       to: '/schools',       icon: Building2,       label: 'Schools' },
  { id: 'subscriptions', to: '/subscriptions', icon: CreditCard,      label: 'Subscriptions' },
  { id: 'revenue',       to: '/revenue',       icon: TrendingUp,      label: 'Revenue' },
  { id: 'team',          to: '/team',          icon: Users,           label: 'Platform Team' },
]

export default function AppLayout({ children }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const handleLogout = () => { logout(); navigate('/login') }

  const allowed = allowedNav(user?.role)
  const visibleNav = ALL_NAV.filter(item => allowed.includes(item.id))
  const info = roleInfo(user?.role)

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <aside style={{
        width: 240,
        background: 'var(--navy-900)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34,
              background: 'linear-gradient(135deg, var(--gold-500), var(--gold-400))',
              borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16,
              color: 'var(--navy-950)',
            }}>S</div>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600 }}>SchoolPay</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: -2 }}>Platform Admin</div>
            </div>
          </div>
        </div>

        {/* Role badge */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: `${info.color}15`,
            border: `1px solid ${info.color}30`,
            color: info.color,
            borderRadius: 20, padding: '3px 10px',
            fontSize: 11, fontWeight: 500,
          }}>
            <ShieldCheck size={10} />
            {info.label}
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto' }}>
          {visibleNav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 'var(--radius-sm)', marginBottom: 2,
                color: isActive ? 'var(--gold-400)' : 'var(--text-secondary)',
                background: isActive ? 'rgba(212,168,67,0.08)' : 'transparent',
                fontWeight: isActive ? 500 : 400, fontSize: 14,
                transition: 'all 0.15s', textDecoration: 'none',
                borderLeft: isActive ? '2px solid var(--gold-500)' : '2px solid transparent',
              })}
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User + logout */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)' }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{user?.full_name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{user?.email}</div>
          </div>
          <button
            onClick={handleLogout}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, padding: 0, transition: 'color 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--danger)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
          >
            <LogOut size={15} /> Sign Out
          </button>
        </div>
      </aside>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{
          height: 60, background: 'var(--navy-900)', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', padding: '0 24px', flexShrink: 0,
        }}>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
            <div style={{
              width: 30, height: 30, background: 'linear-gradient(135deg, var(--navy-600), var(--navy-700))',
              borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 600, color: 'var(--gold-400)', border: '1px solid var(--border-accent)',
            }}>
              {user?.full_name?.[0]?.toUpperCase()}
            </div>
            {user?.full_name}
          </div>
        </header>
        <main style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
