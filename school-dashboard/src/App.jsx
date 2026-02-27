// src/App.jsx
// Central router with role-based route guards.
// RoleGuard prevents a teacher from navigating to /approvals even via URL bar.

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './lib/auth'
import AppLayout from './components/layout/AppLayout'
import { can, allowedNav } from './lib/permissions'

import Login     from './pages/Login'
import Dashboard from './pages/Dashboard'
import Students  from './pages/Students'
import Invoices  from './pages/Invoices'
import Payments  from './pages/Payments'
import Debtors   from './pages/Debtors'
import Approvals from './pages/Approvals'
import Users     from './pages/Users'
import PayPage   from './pages/PayPage'

// Requires login
function Protected({ children }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  return <AppLayout>{children}</AppLayout>
}

// Requires login + specific nav permission
// routeId must match an id in allowedNav()
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
          {/* Public */}
          <Route path="/login"      element={<Login />} />
          <Route path="/pay/:token" element={<PayPage />} />

          {/* Protected — all logged-in users */}
          <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />

          {/* Role-guarded routes */}
          <Route path="/students"  element={<RoleGuard routeId="students"><Students /></RoleGuard>} />
          <Route path="/invoices"  element={<RoleGuard routeId="invoices"><Invoices /></RoleGuard>} />
          <Route path="/payments"  element={<RoleGuard routeId="payments"><Payments /></RoleGuard>} />
          <Route path="/debtors"   element={<RoleGuard routeId="debtors"><Debtors /></RoleGuard>} />
          <Route path="/approvals" element={<RoleGuard routeId="approvals"><Approvals /></RoleGuard>} />
          <Route path="/users"     element={<RoleGuard routeId="users"><Users /></RoleGuard>} />

          {/* Default */}
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
