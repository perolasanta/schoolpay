// src/lib/auth.jsx
import { createContext, useContext, useState, useEffect } from 'react'
import api from './api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [admin, setAdmin]   = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('sp_admin_user')
    const token  = localStorage.getItem('sp_admin_token')
    if (stored && token) setAdmin(JSON.parse(stored))
    setLoading(false)
  }, [])

  const login = async (email, password) => {
    const res = await api.post('/platform/auth/login', { email, password })
    const { access_token, admin_name, admin_email } = res.data
    const userData = { name: admin_name, email: admin_email }
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
    <AuthContext.Provider value={{ admin, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
