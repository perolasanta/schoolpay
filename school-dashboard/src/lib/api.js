// src/lib/api.js
// Central axios instance. Every API call goes through here.
// Automatically attaches the JWT token from localStorage.
// On 401, clears token and redirects to login.

import axios from 'axios'

const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

// Attach token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('sp_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Handle auth errors globally
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('sp_token')
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
