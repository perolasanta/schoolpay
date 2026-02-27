// src/pages/Dashboard.jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Users, DollarSign, AlertTriangle, TrendingUp, ArrowRight } from 'lucide-react'
import { StatCard, PageHeader, Spinner } from '../components/ui'
import api, { fmt, fmtShort } from '../lib/api'

export default function Dashboard() {
  const navigate = useNavigate()
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/platform/dashboard')
      .then(res => setData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const s = data?.schools   || {}
  const r = data?.revenue   || {}
  const u = data?.students  || {}

  return (
    <div className="animate-in">
      <PageHeader title="Platform Overview" subtitle="SchoolPay — all schools at a glance" />

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}><Spinner /></div>
      ) : (
        <>
          {/* ── KPI row ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginBottom: 24 }}>
            <StatCard label="Total Schools"    value={s.total || 0}          sub={`${s.active || 0} active · ${s.trial || 0} trial`}   icon={Building2}      color="var(--gold-500)" />
            <StatCard label="Active Students"  value={(u.total_active || 0).toLocaleString()} sub="enrolled this session" icon={Users} color="var(--info)" />
            <StatCard label="Revenue Collected" value={fmtShort(r.total_collected)} sub={`of ${fmtShort(r.total_billed)} billed`} icon={DollarSign} color="var(--success)" />
            <StatCard label="Overdue Subs"      value={r.overdue_count || 0}  sub={`${fmt(r.pending)} pending`}                          icon={AlertTriangle}  color="var(--danger)" />
            <StatCard label="Collection Rate"   value={`${r.collection_rate || 0}%`} sub="subscriptions paid"                           icon={TrendingUp}     color={r.collection_rate >= 70 ? 'var(--success)' : 'var(--warning)'} />
          </div>

          {/* ── School status breakdown ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
            {/* Status donut-style breakdown */}
            <div className="card">
              <h3 style={{ fontSize: 15, marginBottom: 18 }}>Schools by Status</h3>
              {[
                { label: 'Active',    count: s.active    || 0, color: 'var(--success)', pct: s.total ? Math.round((s.active || 0) / s.total * 100) : 0 },
                { label: 'Trial',     count: s.trial     || 0, color: 'var(--info)',    pct: s.total ? Math.round((s.trial || 0) / s.total * 100) : 0 },
                { label: 'Suspended', count: s.suspended || 0, color: 'var(--danger)',  pct: s.total ? Math.round((s.suspended || 0) / s.total * 100) : 0 },
              ].map(({ label, count, color, pct }) => (
                <div key={label} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 13 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                    <span style={{ fontWeight: 600, color }}>{count} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({pct}%)</span></span>
                  </div>
                  <div style={{ background: 'var(--navy-800)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.8s ease' }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Revenue summary */}
            <div className="card">
              <h3 style={{ fontSize: 15, marginBottom: 18 }}>Revenue Summary</h3>
              {[
                { label: 'Total Billed',    value: fmt(r.total_billed),    color: 'var(--text-primary)' },
                { label: 'Collected',       value: fmt(r.total_collected), color: 'var(--success)' },
                { label: 'Pending',         value: fmt(r.pending),         color: 'var(--warning)' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                  <span style={{ fontWeight: 600, color, fontFamily: 'var(--font-display)' }}>{value}</span>
                </div>
              ))}
              <div style={{ marginTop: 14 }}>
                <div style={{ background: 'var(--navy-800)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                  <div style={{ width: `${r.collection_rate || 0}%`, height: '100%', background: 'linear-gradient(90deg, var(--gold-600), var(--gold-400))', borderRadius: 4, transition: 'width 0.8s ease' }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>{r.collection_rate || 0}% collection rate</div>
              </div>
            </div>
          </div>

          {/* ── Quick links ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            {[
              { label: 'View All Schools',        sub: 'Manage + activate/suspend',  to: '/schools',       color: 'var(--gold-500)' },
              { label: 'Overdue Subscriptions',   sub: `${r.overdue_count || 0} schools overdue`, to: '/subscriptions?status=overdue', color: 'var(--danger)' },
              { label: 'Revenue Chart',            sub: 'Monthly collection trend',   to: '/revenue',       color: 'var(--success)' },
              { label: 'Trial Schools',            sub: `${s.trial || 0} on free trial`, to: '/schools?status=trial', color: 'var(--info)' },
            ].map(({ label, sub, to, color }) => (
              <button key={to} onClick={() => navigate(to)} style={{
                background: 'var(--navy-900)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)', padding: '14px 16px', cursor: 'pointer',
                textAlign: 'left', transition: 'all 0.15s', color: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
              }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--navy-800)'; e.currentTarget.style.borderColor = color + '40' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--navy-900)'; e.currentTarget.style.borderColor = 'var(--border)' }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sub}</div>
                </div>
                <ArrowRight size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
