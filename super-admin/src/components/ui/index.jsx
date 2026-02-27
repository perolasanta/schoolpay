// src/components/ui/index.jsx
import { useEffect } from 'react'
import { X } from 'lucide-react'

export function Button({ children, variant = 'primary', size = 'md', loading, ...props }) {
  const base = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'var(--font-body)', fontWeight: 500, borderRadius: 'var(--radius-sm)', cursor: 'pointer', border: 'none', outline: 'none', transition: 'all 0.15s', opacity: loading ? 0.6 : 1, pointerEvents: loading ? 'none' : 'auto' }
  const sizes = { sm: { padding: '6px 12px', fontSize: 12 }, md: { padding: '9px 16px', fontSize: 14 }, lg: { padding: '12px 22px', fontSize: 15 } }
  const variants = {
    primary:   { background: 'var(--gold-500)', color: 'var(--navy-950)' },
    secondary: { background: 'var(--navy-800)', color: 'var(--text-primary)', border: '1px solid rgba(255,255,255,0.1)' },
    danger:    { background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' },
    success:   { background: 'rgba(34,197,94,0.12)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.2)' },
    ghost:     { background: 'transparent', color: 'var(--text-muted)' },
  }
  return (
    <button style={{ ...base, ...sizes[size], ...variants[variant] }} disabled={loading || props.disabled} {...props}>
      {loading && <Spinner size={13} />}{children}
    </button>
  )
}

export function Input({ label, error, ...props }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</label>}
      <input style={{ background: 'var(--navy-800)', border: `1px solid ${error ? 'var(--danger)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 'var(--radius-sm)', padding: '10px 14px', color: 'var(--text-primary)', outline: 'none', width: '100%', fontSize: 14 }}
        onFocus={e => e.target.style.borderColor = 'var(--gold-500)'}
        onBlur={e => e.target.style.borderColor = error ? 'var(--danger)' : 'rgba(255,255,255,0.1)'}
        {...props} />
      {error && <span style={{ fontSize: 12, color: 'var(--danger)' }}>{error}</span>}
    </div>
  )
}

export function Spinner({ size = 20, color = 'var(--gold-500)' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke={color} strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function Modal({ title, children, onClose, width = 480 }) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(8,14,26,0.85)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} className="animate-in" style={{ background: 'var(--navy-900)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: width, boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 17 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={17} /></button>
        </div>
        <div style={{ padding: 24 }}>{children}</div>
      </div>
    </div>
  )
}

export function StatCard({ label, value, sub, icon: Icon, color = 'var(--gold-500)' }) {
  return (
    <div className="card animate-in" style={{ position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: -20, right: -20, width: 90, height: 90, background: `radial-gradient(circle, ${color}18, transparent 70%)`, borderRadius: '50%' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
        {Icon && <Icon size={16} style={{ color, opacity: 0.7 }} />}
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--text-primary)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>{sub}</div>}
    </div>
  )
}

export function EmptyState({ icon, title, description }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
      <div style={{ fontSize: 40, marginBottom: 14, opacity: 0.4 }}>{icon}</div>
      <p style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--text-secondary)', marginBottom: 6 }}>{title}</p>
      {description && <p style={{ fontSize: 13 }}>{description}</p>}
    </div>
  )
}

export function PageHeader({ title, subtitle, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28, gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 26, marginBottom: 4 }}>{title}</h1>
        {subtitle && <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{subtitle}</p>}
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  )
}
