// super-admin/src/App.jsx
// Platform admin router — role-aware nav filtering.
// platform_admin: full access (Dashboard, Schools, Subscriptions, Revenue, Team)
// platform_support: only Dashboard + Schools

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './lib/auth'
import AppLayout from './components/layout/AppLayout'
import { allowedNav } from './lib/permissions'

import Login         from './pages/Login'
import Dashboard     from './pages/Dashboard'
import Schools       from './pages/Schools'
import Subscriptions from './pages/Subscriptions'
import Revenue       from './pages/Revenue'
import Team          from './pages/Team'

function Protected({ children }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  return <AppLayout>{children}</AppLayout>
}

function RoleGuard({ routeId, children }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  const allowed = allowedNav(user.role)
  if (!allowed.includes(routeId)) return <Navigate to="/dashboard" replace />
  return <AppLayout>{children}</AppLayout>
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login"         element={<Login />} />
          <Route path="/dashboard"     element={<Protected><Dashboard /></Protected>} />
          <Route path="/schools"       element={<RoleGuard routeId="schools"><Schools /></RoleGuard>} />
          <Route path="/subscriptions" element={<RoleGuard routeId="subscriptions"><Subscriptions /></RoleGuard>} />
          <Route path="/revenue"       element={<RoleGuard routeId="revenue"><Revenue /></RoleGuard>} />
          <Route path="/team"          element={<RoleGuard routeId="team"><Team /></RoleGuard>} />
          <Route path="/"  element={<Navigate to="/dashboard" replace />} />
          <Route path="*"  element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>

      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#1a2a4a', color: '#f0f4f8',
            border: '1px solid rgba(255,255,255,0.08)',
            fontFamily: "'DM Sans', sans-serif", fontSize: '14px',
          },
          success: { iconTheme: { primary: '#22c55e', secondary: '#0d1526' } },
          error:   { iconTheme: { primary: '#ef4444', secondary: '#0d1526' } },
        }}
      />
    </AuthProvider>
  )
}
