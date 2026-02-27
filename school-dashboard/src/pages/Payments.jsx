// src/pages/Payments.jsx
import { useState, useEffect } from 'react'
import { Search, Banknote, Building2, CheckCircle } from 'lucide-react'
import { PageHeader, Button, Input, Select, Modal, Spinner, EmptyState } from '../components/ui'
import api, { formatNaira, formatDate } from '../lib/api'
import toast from 'react-hot-toast'

export default function Payments() {
  const [search, setSearch]       = useState('')
  const [results, setResults]     = useState([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected]   = useState(null)   // selected invoice
  const [mode, setMode]           = useState(null)    // 'cash' | 'transfer'
  const [success, setSuccess]     = useState(null)    // receipt after payment

  // Search invoices by student name or admission number
  const doSearch = async (q) => {
    if (!q.trim()) return setResults([])
    setSearching(true)
    try {
      const res = await api.get(`/fees/invoices?search=${encodeURIComponent(q)}&status=unpaid,partial&page_size=20`)
      setResults(res.data.data?.items || res.data.data || [])
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => doSearch(search), 400)
    return () => clearTimeout(t)
  }, [search])

  const handlePaymentDone = (receipt) => {
    setSuccess(receipt)
    setSelected(null)
    setMode(null)
    setSearch('')
    setResults([])
  }

  return (
    <div className="animate-in">
      <PageHeader title="Record Payment" subtitle="Cash and bank transfer payments" />

      {success && (
        <div style={{
          background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
          borderRadius: 'var(--radius-lg)', padding: 20, marginBottom: 24,
          display: 'flex', alignItems: 'center', gap: 16,
        }}>
          <CheckCircle size={28} style={{ color: 'var(--success)', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: 'var(--success)', marginBottom: 4 }}>Payment Recorded Successfully</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Receipt: <strong style={{ color: 'var(--gold-400)' }}>{success.receipt_number}</strong> — {formatNaira(success.amount)} received
            </div>
          </div>
          <a
            href={`/api/v1/payments/receipt/${success.id}/pdf`}
            target="_blank"
            rel="noreferrer"
          >
            <Button variant="secondary" size="sm">Download Receipt PDF</Button>
          </a>
          <button onClick={() => setSuccess(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* Search */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, marginBottom: 14 }}>Find Student Invoice</h3>
        <div style={{ position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input
            placeholder="Search by student name or admission number…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', background: 'var(--navy-800)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
              padding: '11px 14px 11px 38px', color: 'var(--text-primary)', outline: 'none', fontSize: 14,
            }}
          />
          {searching && <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }}><Spinner size={16} /></div>}
        </div>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)' }}>
            {results.length} invoice{results.length > 1 ? 's' : ''} found — click to select
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Student</th><th>Class</th><th>Total</th><th>Balance Due</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {results.map(inv => {
                  const balance = Number(inv.total_amount) - Number(inv.amount_paid)
                  return (
                    <tr key={inv.id} style={{ cursor: 'pointer' }} onClick={() => setSelected(inv)}>
                      <td style={{ fontWeight: 500 }}>{inv.student_name || `${inv.first_name} ${inv.last_name}`}</td>
                      <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{inv.class_name}</td>
                      <td>{formatNaira(inv.total_amount)}</td>
                      <td style={{ color: 'var(--danger)', fontWeight: 600 }}>{formatNaira(balance)}</td>
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

      {/* Payment method chooser */}
      {selected && !mode && (
        <div className="card animate-in">
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Recording payment for</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>{selected.student_name || `${selected.first_name} ${selected.last_name}`}</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
              Balance due: <strong style={{ color: 'var(--danger)' }}>{formatNaira(Number(selected.total_amount) - Number(selected.amount_paid))}</strong>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <button
              onClick={() => setMode('cash')}
              style={{
                background: 'var(--navy-800)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)', padding: 20, cursor: 'pointer',
                textAlign: 'center', transition: 'all 0.15s', color: 'inherit',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--success)'; e.currentTarget.style.background = 'rgba(34,197,94,0.05)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--navy-800)' }}
            >
              <Banknote size={28} style={{ color: 'var(--success)', marginBottom: 10 }} />
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Cash</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Immediate confirmation</div>
            </button>
            <button
              onClick={() => setMode('transfer')}
              style={{
                background: 'var(--navy-800)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)', padding: 20, cursor: 'pointer',
                textAlign: 'center', transition: 'all 0.15s', color: 'inherit',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--info)'; e.currentTarget.style.background = 'rgba(59,130,246,0.05)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--navy-800)' }}
            >
              <Building2 size={28} style={{ color: 'var(--info)', marginBottom: 10 }} />
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Bank Transfer</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Requires approval</div>
            </button>
          </div>
          <div style={{ marginTop: 14, textAlign: 'right' }}>
            <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>← Back to search</Button>
          </div>
        </div>
      )}

      {/* Cash form */}
      {selected && mode === 'cash' && (
        <CashForm
          invoice={selected}
          onDone={handlePaymentDone}
          onBack={() => setMode(null)}
        />
      )}

      {/* Bank transfer form */}
      {selected && mode === 'transfer' && (
        <TransferForm
          invoice={selected}
          onDone={handlePaymentDone}
          onBack={() => setMode(null)}
        />
      )}

      {!selected && results.length === 0 && !search && (
        <EmptyState icon="💳" title="Search for a student above" description="Enter a student name or admission number to find their invoice." />
      )}
    </div>
  )
}

// ── Cash Payment Form ──────────────────────────────────────────
function CashForm({ invoice, onDone, onBack }) {
  const balance = Number(invoice.total_amount) - Number(invoice.amount_paid)
  const [form, setForm]     = useState({ amount: balance.toFixed(2), narration: '', collection_point: 'Bursar Office' })
  const [loading, setLoading] = useState(false)

  const handle = async (e) => {
    e.preventDefault()
    if (Number(form.amount) <= 0) return toast.error('Enter a valid amount')
    if (Number(form.amount) > balance + 0.01) return toast.error(`Amount cannot exceed balance of ${formatNaira(balance)}`)
    setLoading(true)
    try {
      const res = await api.post('/payments/cash', {
        invoice_id: invoice.id,
        amount: Number(form.amount),
        narration: form.narration,
        collection_point: form.collection_point,
      })
      toast.success('Cash payment recorded!')
      onDone(res.data.data)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to record payment')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card animate-in">
      <h3 style={{ fontSize: 16, marginBottom: 6 }}>Record Cash Payment</h3>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
        {invoice.student_name || `${invoice.first_name} ${invoice.last_name}`} — Balance: <strong style={{ color: 'var(--danger)' }}>{formatNaira(balance)}</strong>
      </div>
      <form onSubmit={handle} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Input label="Amount Received (₦)" type="number" step="0.01" min="1" max={balance} value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required />
        <Input label="Collection Point" value={form.collection_point} onChange={e => setForm(f => ({ ...f, collection_point: e.target.value }))} placeholder="Bursar Office" />
        <Input label="Narration (optional)" value={form.narration} onChange={e => setForm(f => ({ ...f, narration: e.target.value }))} placeholder="e.g. First instalment" />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="secondary" type="button" onClick={onBack}>← Back</Button>
          <Button type="submit" loading={loading}>Confirm Cash Payment</Button>
        </div>
      </form>
    </div>
  )
}

// ── Bank Transfer Form ─────────────────────────────────────────
function TransferForm({ invoice, onDone, onBack }) {
  const balance = Number(invoice.total_amount) - Number(invoice.amount_paid)
  const [form, setForm]     = useState({ amount: balance.toFixed(2), reference: '', narration: '', branch: '' })
  const [file, setFile]     = useState(null)
  const [loading, setLoading] = useState(false)

  const handle = async (e) => {
    e.preventDefault()
    if (!form.reference.trim()) return toast.error('Bank reference is required')
    setLoading(true)
    try {
      // Step 1: record the transfer
      const res = await api.post('/payments/transfer', {
        invoice_id: invoice.id,
        amount: Number(form.amount),
        reference: form.reference,
        narration: form.narration,
        branch: form.branch,
      })
      const payment = res.data.data

      // Step 2: upload proof if provided
      if (file && payment.id) {
        const formData = new FormData()
        formData.append('file', file)
        await api.post(
          `/uploads/payment-proof-staff/${payment.id}`,
          formData,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        )
      }

      toast.success('Transfer recorded — awaiting bursar approval')
      onDone(payment)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to record transfer')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card animate-in">
      <h3 style={{ fontSize: 16, marginBottom: 6 }}>Record Bank Transfer</h3>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
        {invoice.student_name || `${invoice.first_name} ${invoice.last_name}`} — Balance: <strong style={{ color: 'var(--danger)' }}>{formatNaira(balance)}</strong>
      </div>
      <div style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 8, padding: 12, fontSize: 13, color: '#60a5fa', marginBottom: 20 }}>
        ℹ️ Transfer payments require approval before the invoice is updated.
      </div>
      <form onSubmit={handle} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Input label="Amount (₦)" type="number" step="0.01" min="1" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required />
          <Input label="Bank Reference *" value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} placeholder="e.g. GTB/2024/123456" required />
        </div>
        <Input label="Branch / Bank Name" value={form.branch} onChange={e => setForm(f => ({ ...f, branch: e.target.value }))} placeholder="e.g. GTBank Lekki" />
        <Input label="Narration (optional)" value={form.narration} onChange={e => setForm(f => ({ ...f, narration: e.target.value }))} placeholder="Notes about this transfer" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Proof of Transfer (optional)
          </label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={e => setFile(e.target.files[0])}
            style={{ color: 'var(--text-secondary)', fontSize: 13 }}
          />
          {file && <span style={{ fontSize: 12, color: 'var(--success)' }}>✓ {file.name}</span>}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="secondary" type="button" onClick={onBack}>← Back</Button>
          <Button type="submit" loading={loading}>Submit Transfer</Button>
        </div>
      </form>
    </div>
  )
}
