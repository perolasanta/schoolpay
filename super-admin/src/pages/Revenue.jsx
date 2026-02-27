// src/pages/Revenue.jsx
import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { PageHeader, Spinner } from '../components/ui'
import api, { fmt } from '../lib/api'

// Custom tooltip for the chart
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--navy-800)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
      <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color, marginBottom: 2 }}>
          {p.name}: <strong>{fmt(p.value)}</strong>
        </div>
      ))}
    </div>
  )
}

export default function Revenue() {
  const [data, setData]     = useState([])
  const [loading, setLoading] = useState(true)
  const [months, setMonths] = useState(12)

  useEffect(() => {
    setLoading(true)
    api.get(`/platform/revenue?months=${months}`)
      .then(res => {
        // Format month labels for chart
        const formatted = (res.data.data || []).map(d => ({
          ...d,
          month: new Date(d.month + '-01').toLocaleDateString('en-NG', { month: 'short', year: '2-digit' }),
        }))
        setData(formatted)
      })
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [months])

  const totalBilled    = data.reduce((s, d) => s + (d.billed || 0), 0)
  const totalCollected = data.reduce((s, d) => s + (d.collected || 0), 0)
  const collectionRate = totalBilled > 0 ? Math.round(totalCollected / totalBilled * 100) : 0

  return (
    <div className="animate-in">
      <PageHeader
        title="Revenue Analytics"
        subtitle="Monthly billing and collection trends"
        action={
          <select value={months} onChange={e => setMonths(Number(e.target.value))}
            style={{ background: 'var(--navy-800)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', color: 'var(--text-primary)', outline: 'none', cursor: 'pointer', fontSize: 13 }}>
            <option value={6}>Last 6 months</option>
            <option value={12}>Last 12 months</option>
            <option value={24}>Last 24 months</option>
          </select>
        }
      />

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: `Billed (${months}mo)`,    value: fmt(totalBilled),    color: 'var(--text-primary)' },
          { label: `Collected (${months}mo)`, value: fmt(totalCollected), color: 'var(--success)' },
          { label: 'Collection Rate',         value: `${collectionRate}%`, color: collectionRate >= 70 ? 'var(--success)' : 'var(--warning)' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card" style={{ padding: '16px 20px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="card">
        <h3 style={{ fontSize: 15, marginBottom: 24 }}>Monthly Revenue</h3>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
        ) : data.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
            No revenue data yet. Subscriptions will appear here once created.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={data} margin={{ top: 4, right: 4, left: 8, bottom: 4 }} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => v >= 1000 ? `₦${(v/1000).toFixed(0)}K` : `₦${v}`} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} width={64} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-secondary)', paddingTop: 12 }} />
              <Bar dataKey="billed"    name="Billed"    fill="rgba(212,168,67,0.25)" radius={[3,3,0,0]} stroke="rgba(212,168,67,0.5)" strokeWidth={1} />
              <Bar dataKey="collected" name="Collected" fill="var(--gold-500)"        radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Monthly breakdown table */}
      {data.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginTop: 16 }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontSize: 14, fontWeight: 500 }}>Monthly Breakdown</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Month</th><th>Billed</th><th>Collected</th><th>Rate</th></tr>
              </thead>
              <tbody>
                {[...data].reverse().map(d => {
                  const rate = d.billed > 0 ? Math.round(d.collected / d.billed * 100) : 0
                  return (
                    <tr key={d.month}>
                      <td style={{ fontWeight: 500 }}>{d.month}</td>
                      <td>{fmt(d.billed)}</td>
                      <td style={{ color: 'var(--success)' }}>{fmt(d.collected)}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, background: 'var(--navy-800)', borderRadius: 3, height: 5, maxWidth: 80 }}>
                            <div style={{ width: `${rate}%`, height: '100%', background: rate >= 70 ? 'var(--success)' : 'var(--warning)', borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 12, color: rate >= 70 ? 'var(--success)' : 'var(--warning)' }}>{rate}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
