// src/lib/api.js
// Central axios instance. Every API call goes through here.
// Automatically attaches the JWT token from localStorage.
// On 401, clears token and redirects to login.

import axios from 'axios'

const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

let refreshPromise = null

// Attach token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('sp_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Handle auth errors globally
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config || {}
    const status = err.response?.status
    const url = original.url || ''

    // PRIORITY-0: Silent refresh flow before forced logout.
    if (
      status === 401 &&
      !original._retry &&
      !url.includes('/auth/login') &&
      !url.includes('/auth/refresh')
    ) {
      original._retry = true
      const refreshToken = localStorage.getItem('sp_refresh_token')
      if (refreshToken) {
        try {
          if (!refreshPromise) {
            refreshPromise = axios.post('/api/v1/auth/refresh', { refresh_token: refreshToken }, {
              headers: { 'Content-Type': 'application/json' },
            })
          }
          const refreshRes = await refreshPromise
          const refreshed = refreshRes?.data?.data
          if (refreshed?.access_token) {
            localStorage.setItem('sp_token', refreshed.access_token)
            if (refreshed.refresh_token) localStorage.setItem('sp_refresh_token', refreshed.refresh_token)
            if (refreshed.user) localStorage.setItem('sp_user', JSON.stringify(refreshed.user))
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
      localStorage.removeItem('sp_token')
      localStorage.removeItem('sp_refresh_token')
      localStorage.removeItem('sp_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api

// ── Helper: format Naira amounts ──────────────────────────────
export const formatNaira = (amount) => {
  if (amount === null || amount === undefined) return '₦0.00'
  return '₦' + Number(amount).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

// ── Helper: format dates ──────────────────────────────────────
export const formatDate = (dateStr) => {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-NG', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

// ── Helper: payment method label ─────────────────────────────
export const methodLabel = (method) => ({
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  paystack: 'Online (Paystack)',
  pos: 'POS',
  waiver: 'Waiver',
}[method] || method)
