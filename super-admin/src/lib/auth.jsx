// src/lib/auth.jsx
import { createContext, useContext, useState, useEffect } from 'react'
import api from './api'

const AuthContext = createContext(null)
const normalizeRole = (role) => {
  const r = String(role || '').toLowerCase().trim()
  if (['platform_admin', 'admin', 'super_admin', 'owner', 'platform_owner'].includes(r)) return 'platform_admin'
  if (['platform_support', 'support', 'support_staff'].includes(r)) return 'platform_support'
  return 'platform_admin'
}

export function AuthProvider({ children }) {
  const [admin, setAdmin]   = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('sp_admin_user')
    const token  = localStorage.getItem('sp_admin_token')
    if (stored && token) {
      try {
        const parsed = JSON.parse(stored)
        const migrated = {
          full_name: parsed.full_name || parsed.name || '',
          email: parsed.email || '',
          role: normalizeRole(parsed.role),
        }
        setAdmin(migrated)
        localStorage.setItem('sp_admin_user', JSON.stringify(migrated))
      } catch {
        localStorage.removeItem('sp_admin_user')
      }
    }
    setLoading(false)
  }, [])

  const login = async (email, password) => {
    const res = await api.post('/platform/auth/login', { email, password })
    const { access_token, admin_name, admin_email, admin_role } = res.data
    const userData = {
      full_name: admin_name,
      email: admin_email,
      role: normalizeRole(admin_role),
    }
    localStorage.setItem('sp_admin_token', access_token)
    localStorage.setItem('sp_admin_user', JSON.stringify(userData))
    setAdmin(userData)
    return userData
  }

  const logout = () => {
    localStorage.removeItem('sp_admin_token')
    localStorage.removeItem('sp_admin_user')
    setAdmin(null)
  }

  return (
    <AuthContext.Provider value={{ admin, user: admin, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
