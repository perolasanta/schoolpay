// src/pages/Payments.jsx
import { useState, useEffect } from 'react'
import { Search, Banknote, Building2, CheckCircle, X, User, GraduationCap } from 'lucide-react'
import { PageHeader, Button, Spinner, EmptyState } from '../components/ui'
import api, { formatNaira, formatDate } from '../lib/api'
import toast from 'react-hot-toast'

export default function Payments() {
  const [search, setSearch]       = useState('')
  const [results, setResults]     = useState([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected]   = useState(null)
  const [mode, setMode]           = useState(null)
  const [success, setSuccess]     = useState(null)

  const doSearch = async (q) => {
    if (!q.trim()) return setResults([])
    setSearching(true)
    try {
      const res = await api.get(`/fees/invoices?search=${encodeURIComponent(q.trim())}&status=unpaid,partial&page_size=20`)
      setResults(res.data.data?.items || res.data.data || [])
    } catch { setResults([]) }
    finally { setSearching(false) }
  }

  useEffect(() => {
    const t = setTimeout(() => doSearch(search), 350)
    return () => clearTimeout(t)
  }, [search])

  const handleSelect = (inv) => { setSelected(inv); setMode(null); setSearch(''); setResults([]) }
  const handlePaymentDone = (receipt) => { setSuccess(receipt); setSelected(null); setMode(null) }

  return (
    <div className="animate-in">
      <PageHeader title="Record Payment" subtitle="Cash and bank transfer payments" />

      {success && (
        <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 'var(--radius-lg)', padding: 20, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16 }}>
          <CheckCircle size={28} style={{ color: 'var(--success)', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: 'var(--success)', marginBottom: 4 }}>Payment Recorded Successfully</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Receipt: <strong style={{ color: 'var(--gold-400)' }}>{success.receipt_number}</strong> — {formatNaira(success.amount)} received
            </div>
          </div>
          <a href={`/api/v1/payments/receipt/${success.id}/pdf`} target="_blank" rel="noreferrer">
            <Button variant="secondary" size="sm">Download Receipt PDF</Button>
          </a>
          <button onClick={() => setSuccess(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={16} /></button>
        </div>
      )}

      {!selected && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, fontWeight: 500 }}>
            Step 1 — Find student invoice
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <input autoFocus placeholder="Student name or admission number (e.g. BEU/2024/005)…"
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', background: 'var(--navy-800)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '11px 36px 11px 38px', color: 'var(--text-primary)', outline: 'none', fontSize: 14, boxSizing: 'border-box' }} />
            {searching && <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }}><Spinner size={16} /></div>}
            {search && !searching && (
              <button onClick={() => { setSearch(''); setResults([]) }}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={15} />
              </button>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
            Only unpaid / partial invoices shown · Search by full name or exact admission number
          </div>
        </div>
      )}

      {!selected && results.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)' }}>
            {results.length} result{results.length !== 1 ? 's' : ''} — click a row to select
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Student</th><th>Adm. No.</th><th>Class</th><th>Total Fee</th><th>Balance Due</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {results.map(inv => {
                  const bal = Number(inv.total_amount) - Number(inv.amount_paid)
                  return (
                    <tr key={inv.id} style={{ cursor: 'pointer' }} onClick={() => handleSelect(inv)}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}>
                      <td style={{ fontWeight: 500 }}>{inv.student_name}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>{inv.admission_number}</td>
                      <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{inv.class_name}{inv.arm ? ` ${inv.arm}` : ''}</td>
                      <td>{formatNaira(inv.total_amount)}</td>
                      <td style={{ color: 'var(--danger)', fontWeight: 700 }}>{formatNaira(bal)}</td>
                      <td><span className={`badge badge-${inv.status}`}>{inv.status}</span></td>
                      <td><Button size="sm" variant="secondary">Select →</Button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!selected && search.trim() && !searching && results.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '28px 24px', marginBottom: 20 }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>🔍</div>
          <div style={{ fontWeight: 500, marginBottom: 6 }}>No unpaid invoices found</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7 }}>
            Try the full admission number exactly as registered (e.g. <code style={{ color: 'var(--gold-400)' }}>BEU/2024/005</code>).<br />
            Fully paid invoices won't appear — check the <strong>Invoices</strong> page for those.
          </div>
        </div>
      )}

      {selected && !mode && <InvoicePanel invoice={selected} onSelectMode={setMode} onClear={() => setSelected(null)} />}
      {selected && mode === 'cash'     && <CashForm     invoice={selected} onDone={handlePaymentDone} onBack={() => setMode(null)} />}
      {selected && mode === 'transfer' && <TransferForm invoice={selected} onDone={handlePaymentDone} onBack={() => setMode(null)} />}

      {!selected && !search && results.length === 0 && !success && (
        <EmptyState icon="💳" title="Search for a student above" description="Enter a student name or admission number to find their outstanding invoice." />
      )}
    </div>
  )
}

function InvoicePanel({ invoice, onSelectMode, onClear }) {
  const balance = Number(invoice.total_amount) - Number(invoice.amount_paid)
  const paidPct = invoice.total_amount > 0 ? Math.min(100, Math.round((Number(invoice.amount_paid) / Number(invoice.total_amount)) * 100)) : 0

  return (
    <div className="card animate-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Step 2 — Recording payment for</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, marginBottom: 6 }}>{invoice.student_name}</div>
          <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><User size={12} /> {invoice.admission_number}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><GraduationCap size={12} /> {invoice.class_name}{invoice.arm ? ` · Arm ${invoice.arm}` : ''}</span>
          </div>
        </div>
        <button onClick={onClear} title="Search for different student" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}><X size={18} /></button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Fee',    value: formatNaira(invoice.total_amount), color: 'var(--text-primary)' },
          { label: 'Already Paid', value: formatNaira(invoice.amount_paid),  color: 'var(--success)' },
          { label: 'Balance Due',  value: formatNaira(balance),              color: balance > 0 ? 'var(--danger)' : 'var(--success)' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: 'var(--navy-800)', borderRadius: 'var(--radius-md)', padding: '14px 16px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, color }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
          <span>Payment progress</span>
          <span style={{ color: 'var(--gold-400)', fontWeight: 600 }}>{paidPct}% paid</span>
        </div>
        <div style={{ background: 'var(--navy-800)', borderRadius: 4, height: 6 }}>
          <div style={{ width: `${paidPct}%`, height: '100%', background: paidPct === 100 ? 'var(--success)' : 'linear-gradient(90deg, var(--gold-600), var(--gold-400))', borderRadius: 4, transition: 'width 0.5s ease' }} />
        </div>
      </div>

      {balance > 0 ? (
        <>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12, fontWeight: 500 }}>Step 3 — How is the parent paying?</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {[
              { m: 'cash',     Icon: Banknote,  color: 'var(--success)', label: 'Cash',         sub: 'Confirmed immediately' },
              { m: 'transfer', Icon: Building2, color: 'var(--info)',    label: 'Bank Transfer', sub: 'Requires bursar approval' },
            ].map(({ m, Icon, color, label, sub }) => (
              <button key={m} onClick={() => onSelectMode(m)}
                style={{ background: 'var(--navy-800)', border: '2px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '20px 16px', cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s', color: 'inherit' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = color; e.currentTarget.style.background = color + '15' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--navy-800)' }}>
                <Icon size={28} style={{ color, marginBottom: 8 }} />
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{sub}</div>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 'var(--radius-md)', padding: 16, textAlign: 'center', color: 'var(--success)', fontWeight: 500 }}>
          ✓ This invoice is fully paid — nothing to record
        </div>
      )}
      <div style={{ marginTop: 14, textAlign: 'right' }}>
        <Button variant="ghost" size="sm" onClick={onClear}>← Search again</Button>
      </div>
    </div>
  )
}

function CashForm({ invoice, onDone, onBack }) {
  const balance = Number(invoice.total_amount) - Number(invoice.amount_paid)
  const [form, setForm] = useState({ amount: balance.toFixed(2), narration: '', collection_point: 'Bursar Office' })
  const [loading, setLoading] = useState(false)
  const f = field => ({ value: form[field], onChange: e => setForm(p => ({ ...p, [field]: e.target.value })) })
  const iStyle = { width: '100%', background: 'var(--navy-800)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', color: 'var(--text-primary)', outline: 'none', fontSize: 14, boxSizing: 'border-box' }
  const lStyle = { fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }

  const handle = async (e) => {
    e.preventDefault()
    if (Number(form.amount) <= 0) return toast.error('Enter a valid amount')
    if (Number(form.amount) > balance + 0.01) return toast.error(`Cannot exceed balance of ${formatNaira(balance)}`)
    setLoading(true)
    try {
      const res = await api.post('/payments/cash', { invoice_id: invoice.id, amount: Number(form.amount), narration: form.narration, collection_point: form.collection_point })
      toast.success('Cash payment recorded!')
      onDone(res.data.data)
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to record payment') }
    finally { setLoading(false) }
  }

  return (
    <div className="card animate-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ background: 'rgba(34,197,94,0.1)', borderRadius: '50%', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Banknote size={20} style={{ color: 'var(--success)' }} />
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 16 }}>Record Cash Payment</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{invoice.student_name} · Balance: <strong style={{ color: 'var(--danger)' }}>{formatNaira(balance)}</strong></div>
        </div>
      </div>
      <form onSubmit={handle} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={{ ...lStyle, fontSize: 13 }}>Amount Received (₦) *</label>
          <input {...f('amount')} type="number" step="0.01" min="1" max={balance} required style={{ ...iStyle, fontSize: 20, fontFamily: 'var(--font-display)' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div><label style={lStyle}>Collection Point</label><input {...f('collection_point')} placeholder="Bursar Office" style={iStyle} /></div>
          <div><label style={lStyle}>Narration (optional)</label><input {...f('narration')} placeholder="e.g. First instalment" style={iStyle} /></div>
        </div>
        <div style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--success)' }}>
          ✓ Confirmed immediately · SMS receipt sent to guardian
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="secondary" type="button" onClick={onBack}>← Back</Button>
          <Button type="submit" loading={loading}>Confirm {formatNaira(Number(form.amount) || 0)} Cash</Button>
        </div>
      </form>
    </div>
  )
}

function TransferForm({ invoice, onDone, onBack }) {
  const balance = Number(invoice.total_amount) - Number(invoice.amount_paid)
  const [form, setForm] = useState({ amount: balance.toFixed(2), reference: '', narration: '', branch: '' })
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const f = field => ({ value: form[field], onChange: e => setForm(p => ({ ...p, [field]: e.target.value })) })
  const iStyle = { width: '100%', background: 'var(--navy-800)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', color: 'var(--text-primary)', outline: 'none', fontSize: 14, boxSizing: 'border-box' }
  const lStyle = { fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }

  const handle = async (e) => {
    e.preventDefault()
    if (!form.reference.trim()) return toast.error('Bank reference is required')
    setLoading(true)
    try {
      const res = await api.post('/payments/transfer', { invoice_id: invoice.id, amount: Number(form.amount), reference: form.reference, narration: form.narration, branch: form.branch })
      const payment = res.data.data
      if (file && payment.id) {
        const fd = new FormData(); fd.append('file', file)
        await api.post(`/uploads/payment-proof-staff/${payment.id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      }
      toast.success('Transfer recorded — awaiting bursar approval')
      onDone(payment)
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to record transfer') }
    finally { setLoading(false) }
  }

  return (
    <div className="card animate-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ background: 'rgba(59,130,246,0.1)', borderRadius: '50%', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Building2 size={20} style={{ color: 'var(--info)' }} />
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 16 }}>Record Bank Transfer</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{invoice.student_name} · Balance: <strong style={{ color: 'var(--danger)' }}>{formatNaira(balance)}</strong></div>
        </div>
      </div>
      <div style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#60a5fa', marginBottom: 20 }}>
        ℹ️ Requires bursar approval before invoice is updated. Parent gets SMS on approval.
      </div>
      <form onSubmit={handle} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div><label style={lStyle}>Amount (₦) *</label><input {...f('amount')} type="number" step="0.01" min="1" required style={iStyle} /></div>
          <div><label style={lStyle}>Bank Reference *</label><input {...f('reference')} placeholder="e.g. GTB/2024/123456" required style={iStyle} /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div><label style={lStyle}>Bank / Branch</label><input {...f('branch')} placeholder="e.g. GTBank Lekki" style={iStyle} /></div>
          <div><label style={lStyle}>Narration (optional)</label><input {...f('narration')} placeholder="Notes" style={iStyle} /></div>
        </div>
        <div>
          <label style={lStyle}>Proof of Transfer (JPG, PNG, PDF)</label>
          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e => setFile(e.target.files[0])} style={{ color: 'var(--text-secondary)', fontSize: 13 }} />
          {file && <div style={{ fontSize: 12, color: 'var(--success)', marginTop: 4 }}>✓ {file.name}</div>}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="secondary" type="button" onClick={onBack}>← Back</Button>
          <Button type="submit" loading={loading}>Submit Transfer</Button>
        </div>
      </form>
    </div>
  )
}
