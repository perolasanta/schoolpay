// src/pages/Login.jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { Button, Input } from '../components/ui'
import toast from 'react-hot-toast'

export default function Login() {
  const { login } = useAuth()
  const navigate  = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)

  const handle = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await login(form.email, form.password)
      navigate('/dashboard')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Invalid credentials')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--navy-950)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Background glows */}
      <div style={{ position: 'absolute', top: -200, right: -200, width: 600, height: 600, background: 'radial-gradient(circle, rgba(212,168,67,0.05), transparent 60%)', borderRadius: '50%', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: -200, left: -200, width: 500, height: 500, background: 'radial-gradient(circle, rgba(26,42,74,0.8), transparent 60%)', borderRadius: '50%', pointerEvents: 'none' }} />

      <div className="animate-in" style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 1 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            width: 56, height: 56, margin: '0 auto 18px',
            background: 'linear-gradient(135deg, var(--gold-500), var(--gold-400))',
            borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'var(--glow-gold)',
          }}>
            <ShieldCheck size={26} style={{ color: 'var(--navy-950)' }} />
          </div>
          <h1 style={{ fontSize: 28, marginBottom: 6, letterSpacing: '-0.02em' }}>Super Admin</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Platform control panel — restricted access</p>
        </div>

        {/* Card */}
        <div style={{ background: 'var(--navy-900)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: 32, boxShadow: 'var(--shadow-lg)' }}>
          <form onSubmit={handle} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <Input label="Admin Email" type="email" placeholder="you@schoolpay.ng" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required autoComplete="email" />
            <Input label="Password" type="password" placeholder="••••••••" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required autoComplete="current-password" />
            <Button type="submit" size="lg" loading={loading} style={{ width: '100%', marginTop: 4 }}>
              Access Platform
            </Button>
          </form>
        </div>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 11, color: 'var(--text-muted)' }}>
          This panel is only accessible to SchoolPay platform staff.
        </p>
      </div>
    </div>
  )
}
