// src/components/ui/index.jsx
// All reusable UI primitives in one file.
// Import what you need: import { Button, Input, Modal } from '../components/ui'

import { useEffect } from 'react'
import { X } from 'lucide-react'
import clsx from 'clsx'

// ── Button ────────────────────────────────────────────────────
export function Button({ children, variant = 'primary', size = 'md', loading, className, ...props }) {
  const base = 'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all duration-150 cursor-pointer border-0 outline-none'

  const variants = {
    primary: 'bg-gold text-navy font-semibold hover:brightness-110 active:scale-95',
    secondary: 'bg-navy-800 text-slate-200 border border-white/10 hover:bg-navy-700 active:scale-95',
    danger: 'bg-red-500/15 text-red-400 border border-red-500/20 hover:bg-red-500/25 active:scale-95',
    ghost: 'text-slate-400 hover:text-white hover:bg-white/5 active:scale-95',
    success: 'bg-green-500/15 text-green-400 border border-green-500/20 hover:bg-green-500/25 active:scale-95',
  }

  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-6 py-3 text-base',
  }

  return (
    <button
      className={clsx(base, variants[variant], sizes[size], loading && 'opacity-60 pointer-events-none', className)}
      style={variant === 'primary' ? { background: 'var(--gold-500)', color: 'var(--navy-950)' } : {}}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && <Spinner size={14} />}
      {children}
    </button>
  )
}

// ── Input ─────────────────────────────────────────────────────
export function Input({ label, error, className, ...props }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && (
        <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {label}
        </label>
      )}
      <input
        style={{
          background: 'var(--navy-800)',
          border: `1px solid ${error ? 'var(--danger)' : 'rgba(255,255,255,0.1)'}`,
          borderRadius: 'var(--radius-sm)',
          padding: '10px 14px',
          color: 'var(--text-primary)',
          outline: 'none',
          transition: 'border-color 0.15s',
          width: '100%',
        }}
        onFocus={e => e.target.style.borderColor = 'var(--gold-500)'}
        onBlur={e => e.target.style.borderColor = error ? 'var(--danger)' : 'rgba(255,255,255,0.1)'}
        className={className}
        {...props}
      />
      {error && <span style={{ fontSize: 12, color: 'var(--danger)' }}>{error}</span>}
    </div>
  )
}

// ── Select ────────────────────────────────────────────────────
export function Select({ label, error, children, className, ...props }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && (
        <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {label}
        </label>
      )}
      <select
        style={{
          background: 'var(--navy-800)',
          border: `1px solid ${error ? 'var(--danger)' : 'rgba(255,255,255,0.1)'}`,
          borderRadius: 'var(--radius-sm)',
          padding: '10px 14px',
          color: 'var(--text-primary)',
          outline: 'none',
          width: '100%',
          cursor: 'pointer',
        }}
        className={className}
        {...props}
      >
        {children}
      </select>
      {error && <span style={{ fontSize: 12, color: 'var(--danger)' }}>{error}</span>}
    </div>
  )
}

// ── Spinner ───────────────────────────────────────────────────
export function Spinner({ size = 20, color = 'var(--gold-500)' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.8s linear infinite' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke={color} strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

// ── Modal ─────────────────────────────────────────────────────
export function Modal({ title, children, onClose, width = 480 }) {
  useEffect(() => {
    const handleKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(8,14,26,0.85)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
        paddingBottom: '216px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="animate-in"
        style={{
          background: 'var(--navy-900)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          width: '100%', maxWidth: width,
          boxShadow: 'var(--shadow-lg)',
          display: 'flex', flexDirection: 'column',
          maxHeight: 'calc(100vh - 48px)',
          overflow: 'hidden',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, borderRadius: 4 }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>{children}</div>
      </div>
    </div>
  )
}

// ── EmptyState ────────────────────────────────────────────────
export function EmptyState({ icon, title, description }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
      <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.4 }}>{icon}</div>
      <p style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--text-secondary)', marginBottom: 8 }}>{title}</p>
      {description && <p style={{ fontSize: 13 }}>{description}</p>}
    </div>
  )
}

// ── PageHeader ────────────────────────────────────────────────
export function PageHeader({ title, subtitle, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28, gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 26, fontFamily: 'var(--font-display)', marginBottom: 4 }}>{title}</h1>
        {subtitle && <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{subtitle}</p>}
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  )
}

// ── StatCard ──────────────────────────────────────────────────
export function StatCard({ label, value, sub, icon: Icon, color = 'var(--gold-500)', trend }) {
  return (
    <div className="card animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'relative', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', top: -20, right: -20,
        width: 100, height: 100,
        background: `radial-gradient(circle, ${color}18, transparent 70%)`,
        borderRadius: '50%',
      }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
        {Icon && <div style={{ color, opacity: 0.7 }}><Icon size={18} /></div>}
      </div>
      <div>
        <div style={{ fontSize: 26, fontFamily: 'var(--font-display)', color: 'var(--text-primary)', lineHeight: 1 }}>{value}</div>
        {sub && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>{sub}</div>}
      </div>
      {trend && (
        <div style={{ fontSize: 12, color: trend > 0 ? 'var(--success)' : 'var(--danger)' }}>
          {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}% from last term
        </div>
      )}
    </div>
  )
}
