// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './lib/auth'
import AdminLayout from './components/layout/AdminLayout'
import Login        from './pages/Login'
import Dashboard    from './pages/Dashboard'
import Schools      from './pages/Schools'
import Subscriptions from './pages/Subscriptions'
import Revenue      from './pages/Revenue'

function Protected({ children }) {
  const { admin, loading } = useAuth()
  if (loading) return null
  if (!admin) return <Navigate to="/login" replace />
  return <AdminLayout>{children}</AdminLayout>
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login"         element={<Login />} />
          <Route path="/dashboard"     element={<Protected><Dashboard /></Protected>} />
          <Route path="/schools"       element={<Protected><Schools /></Protected>} />
          <Route path="/subscriptions" element={<Protected><Subscriptions /></Protected>} />
          <Route path="/revenue"       element={<Protected><Revenue /></Protected>} />
          <Route path="*"              element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>

      <Toaster position="top-right" toastOptions={{
        style: { background: '#1a2a4a', color: '#f0f4f8', border: '1px solid rgba(255,255,255,0.08)', fontFamily: "'DM Sans', sans-serif", fontSize: '14px' },
        success: { iconTheme: { primary: '#22c55e', secondary: '#0d1526' } },
        error:   { iconTheme: { primary: '#ef4444', secondary: '#0d1526' } },
      }} />
    </AuthProvider>
  )
}
