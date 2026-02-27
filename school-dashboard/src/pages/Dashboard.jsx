// src/pages/Dashboard.jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { DollarSign, Users, AlertCircle, Clock, TrendingUp, ArrowRight } from 'lucide-react'
import { StatCard, Button, PageHeader } from '../components/ui'
import api, { formatNaira, formatDate, methodLabel } from '../lib/api'
import toast from 'react-hot-toast'

export default function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats]         = useState(null)
  const [recent, setRecent]       = useState([])
  const [loading, setLoading]     = useState(true)

  // Load dashboard data — uses the v_student_fee_status view via internal endpoint
  useEffect(() => {
    const load = async () => {
      try {
        // Get active term invoices summary
        const [invoicesRes, paymentsRes] = await Promise.all([
          api.get('/fees/invoices/summary'),
          api.get('/payments/recent?limit=8'),
        ])
        setStats(invoicesRes.data.data)
        setRecent(paymentsRes.data.data || [])
      } catch (err) {
        // If summary endpoint isn't ready yet, show placeholder stats
        setStats({
          total_invoiced: 0, total_collected: 0, total_outstanding: 0,
          paid_count: 0, partial_count: 0, unpaid_count: 0,
          collection_rate: 0, term_name: 'Current Term',
        })
        setRecent([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const collectionRate = stats ? Math.round(stats.collection_rate || 0) : 0

  return (
    <div className="animate-in">
      <PageHeader
        title="Dashboard"
        subtitle={stats?.term_name ? `${stats.term_name} overview` : 'Current term overview'}
        action={
          <Button onClick={() => navigate('/payments')}>
            Record Payment
          </Button>
        }
      />

      {/* ── Stat Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 28 }}>
        <StatCard
          label="Total Collected"
          value={loading ? '—' : formatNaira(stats?.total_collected)}
          sub={`of ${formatNaira(stats?.total_invoiced)} invoiced`}
          icon={DollarSign}
          color="var(--gold-500)"
        />
        <StatCard
          label="Outstanding"
          value={loading ? '—' : formatNaira(stats?.total_outstanding)}
          sub={`${stats?.unpaid_count + stats?.partial_count || 0} students`}
          icon={AlertCircle}
          color="var(--danger)"
        />
        <StatCard
          label="Fully Paid"
          value={loading ? '—' : (stats?.paid_count || 0)}
          sub="students cleared"
          icon={Users}
          color="var(--success)"
        />
        <StatCard
          label="Collection Rate"
          value={loading ? '—' : `${collectionRate}%`}
          sub="this term"
          icon={TrendingUp}
          color={collectionRate >= 70 ? 'var(--success)' : 'var(--warning)'}
        />
      </div>

      {/* ── Collection Progress Bar ── */}
      {!loading && stats && (
        <div className="card" style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>Fee Collection Progress</span>
            <span style={{ fontSize: 13, color: 'var(--gold-400)', fontWeight: 600 }}>{collectionRate}%</span>
          </div>
          <div style={{ background: 'var(--navy-800)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
            <div style={{
              width: `${Math.min(collectionRate, 100)}%`,
              height: '100%',
              background: 'linear-gradient(90deg, var(--gold-600), var(--gold-400))',
              borderRadius: 4,
              transition: 'width 0.8s ease',
            }} />
          </div>
          <div style={{ display: 'flex', gap: 24, marginTop: 14 }}>
            {[
              { label: 'Paid', count: stats.paid_count, color: 'var(--success)' },
              { label: 'Partial', count: stats.partial_count, color: 'var(--warning)' },
              { label: 'Unpaid', count: stats.unpaid_count, color: 'var(--danger)' },
            ].map(({ label, count, color }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}: </span>
                <span style={{ fontSize: 12, fontWeight: 600, color }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Quick Actions ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 28 }}>
        {[
          { label: 'View Debtors', sub: 'See who owes fees', to: '/debtors', color: 'var(--danger)' },
          { label: 'Pending Approvals', sub: 'Review bank transfers', to: '/approvals', color: 'var(--info)' },
          { label: 'Generate Invoices', sub: 'Bill students for term', to: '/invoices', color: 'var(--gold-500)' },
          { label: 'Student List', sub: 'View all students', to: '/students', color: 'var(--success)' },
        ].map(({ label, sub, to, color }) => (
          <button
            key={to}
            onClick={() => navigate(to)}
            style={{
              background: 'var(--navy-900)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '16px',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.15s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              color: 'inherit',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--navy-800)'; e.currentTarget.style.borderColor = color + '40' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--navy-900)'; e.currentTarget.style.borderColor = 'var(--border)' }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 3 }}>{label}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{sub}</div>
            </div>
            <ArrowRight size={16} style={{ color: 'var(--text-muted)' }} />
          </button>
        ))}
      </div>

      {/* ── Recent Payments ── */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ fontSize: 16 }}>Recent Payments</h3>
          <button onClick={() => navigate('/payments')} style={{ background: 'none', border: 'none', color: 'var(--gold-400)', fontSize: 13, cursor: 'pointer' }}>
            View all →
          </button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 44, borderRadius: 8 }} />
            ))}
          </div>
        ) : recent.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center', padding: '24px 0' }}>
            No payments recorded yet this term.
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Receipt</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {recent.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 500 }}>{p.student_name || '—'}</td>
                    <td style={{ color: 'var(--gold-400)', fontWeight: 600 }}>{formatNaira(p.amount)}</td>
                    <td><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{methodLabel(p.payment_method)}</span></td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>{p.receipt_number || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatDate(p.payment_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
