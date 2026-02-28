// src/lib/auth.jsx
// React Context for authentication state.
// Wrap the whole app in <AuthProvider> so any component can call useAuth().

import { createContext, useContext, useState, useEffect } from 'react'
import api from './api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]     = useState(null)
  const [loading, setLoading] = useState(true)

  // On app load, restore session from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('sp_user')
    const token  = localStorage.getItem('sp_token')
    if (stored && token) {
      setUser(JSON.parse(stored))
    }
    setLoading(false)
  }, [])

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password })
    const { access_token, refresh_token, user: userData } = res.data.data
    localStorage.setItem('sp_token', access_token)
    // PRIORITY-0: Persist refresh token for silent renewal.
    if (refresh_token) localStorage.setItem('sp_refresh_token', refresh_token)
    localStorage.setItem('sp_user', JSON.stringify(userData))
    setUser(userData)
    return userData
  }

  const logout = () => {
    localStorage.removeItem('sp_token')
    localStorage.removeItem('sp_refresh_token')
    localStorage.removeItem('sp_user')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
