// src/App.jsx
// Central router. Two zones:
//   - Public:       /login, /pay/:token
//   - Protected:    everything else (requires JWT)

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './lib/auth'
import AppLayout from './components/layout/AppLayout'

import Login     from './pages/Login'
import Dashboard from './pages/Dashboard'
import Students  from './pages/Students'
import Invoices  from './pages/Invoices'
import Payments  from './pages/Payments'
import Debtors   from './pages/Debtors'
import Approvals from './pages/Approvals'
import PayPage   from './pages/PayPage'

// Wraps any route that requires login
function Protected({ children }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
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

          {/* Protected */}
          <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
          <Route path="/students"  element={<Protected><Students /></Protected>} />
          <Route path="/invoices"  element={<Protected><Invoices /></Protected>} />
          <Route path="/payments"  element={<Protected><Payments /></Protected>} />
          <Route path="/debtors"   element={<Protected><Debtors /></Protected>} />
          <Route path="/approvals" element={<Protected><Approvals /></Protected>} />

          {/* Default redirect */}
          <Route path="/"  element={<Navigate to="/dashboard" replace />} />
          <Route path="*"  element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>

      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#1a2a4a',
            color: '#f0f4f8',
            border: '1px solid rgba(255,255,255,0.08)',
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '14px',
          },
          success: { iconTheme: { primary: '#22c55e', secondary: '#0d1526' } },
          error:   { iconTheme: { primary: '#ef4444', secondary: '#0d1526' } },
        }}
      />
    </AuthProvider>
  )
}
