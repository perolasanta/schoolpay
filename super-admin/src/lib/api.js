// src/lib/api.js
import axios from 'axios'

const api = axios.create({ baseURL: '/api/v1', headers: { 'Content-Type': 'application/json' } })
let refreshPromise = null

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('sp_admin_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config || {}
    const status = err.response?.status
    const url = original.url || ''

    // PRIORITY-0: Silent refresh flow before forcing sign-out.
    if (
      status === 401 &&
      !original._retry &&
      !url.includes('/platform/auth/login') &&
      !url.includes('/platform/auth/refresh')
    ) {
      original._retry = true
      const refreshToken = localStorage.getItem('sp_admin_refresh_token')
      if (refreshToken) {
        try {
          if (!refreshPromise) {
            refreshPromise = axios.post('/api/v1/platform/auth/refresh', { refresh_token: refreshToken }, {
              headers: { 'Content-Type': 'application/json' },
            })
          }
          const refreshRes = await refreshPromise
          const refreshed = refreshRes?.data
          if (refreshed?.access_token) {
            localStorage.setItem('sp_admin_token', refreshed.access_token)
            if (refreshed.refresh_token) localStorage.setItem('sp_admin_refresh_token', refreshed.refresh_token)
            const userData = {
              full_name: refreshed.admin_name || '',
              email: refreshed.admin_email || '',
              role: refreshed.admin_role || 'platform_admin',
            }
            localStorage.setItem('sp_admin_user', JSON.stringify(userData))
            original.headers = original.headers || {}
            original.headers.Authorization = `Bearer ${refreshed.access_token}`
            return api(original)
          }
        } catch (_refreshErr) {
          // Fall through to hard logout below.
        } finally {
          refreshPromise = null
        }
      }
    }

    if (status === 401) {
      localStorage.removeItem('sp_admin_token')
      localStorage.removeItem('sp_admin_refresh_token')
      localStorage.removeItem('sp_admin_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api

export const fmt = (n) => '₦' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })
export const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
export const fmtShort = (n) => {
  n = Number(n || 0)
  if (n >= 1_000_000) return '₦' + (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return '₦' + (n / 1_000).toFixed(0) + 'K'
  return fmt(n)
}
