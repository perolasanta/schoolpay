// src/pages/PayPage.jsx
// PUBLIC PAGE — No login required.
// Parent opens: pay.schoolpay.ng/pay/{token}
// This is what the SMS link points to.

import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle, Upload, CreditCard, Building2, Download } from 'lucide-react'
import { Button, Input, Spinner } from '../components/ui'
import axios from 'axios'
import toast from 'react-hot-toast'

// Public API — no auth token
const pubApi = axios.create({ baseURL: '/api/v1' })

const formatNaira = (n) => '₦' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })

export default function PayPage() {
  const { token } = useParams()
  const [invoice, setInvoice] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [mode, setMode]       = useState(null)     // 'paystack' | 'transfer'
  const [paid, setPaid]       = useState(false)
  const [receipt, setReceipt] = useState(null)

  useEffect(() => {
    pubApi.get(`/pay/${token}`)
      .then(res => setInvoice(res.data))
      .catch(() => setError('This payment link is invalid or has expired.'))
      .finally(() => setLoading(false))
  }, [token])

  // Poll for payment confirmation after Paystack callback
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('ref')
    if (!ref) return
    const poll = async () => {
      try {
        const res = await pubApi.get(`/pay/${token}/status?reference=${ref}`)
        if (res.data.payment?.status === 'success') {
          setPaid(true)
          setReceipt(res.data.payment)
        }
      } catch {}
    }
    poll()
    const interval = setInterval(poll, 3000)
    setTimeout(() => clearInterval(interval), 30000)
    return () => clearInterval(interval)
  }, [token])

  if (loading) return (
    <PageShell>
      <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}><Spinner /></div>
    </PageShell>
  )

  if (error) return (
    <PageShell>
      <div style={{ textAlign: 'center', padding: 48 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: 8 }}>Invalid Link</h2>
        <p style={{ color: 'var(--text-secondary)' }}>{error}</p>
      </div>
    </PageShell>
  )

  if (paid) return (
    <PageShell invoice={invoice}>
      <SuccessScreen invoice={invoice} receipt={receipt} token={token} />
    </PageShell>
  )

  if (invoice?.status === 'paid') return (
    <PageShell invoice={invoice}>
      <SuccessScreen invoice={invoice} token={token} alreadyPaid />
    </PageShell>
  )

  return (
    <PageShell invoice={invoice}>
      {/* Invoice details */}
      <InvoiceCard invoice={invoice} />

      {/* Payment method selection */}
      {!mode && invoice?.can_pay_online && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 20 }}>
          <MethodCard
            icon={<CreditCard size={28} style={{ color: 'var(--success)' }} />}
            title="Pay Online"
            sub="Card, bank, USSD via Paystack"
            onClick={() => setMode('paystack')}
            color="var(--success)"
          />
          <MethodCard
            icon={<Building2 size={28} style={{ color: 'var(--info)' }} />}
            title="Bank Transfer"
            sub="Already transferred? Submit proof"
            onClick={() => setMode('transfer')}
            color="var(--info)"
          />
        </div>
      )}

      {mode === 'paystack' && (
        <PaystackForm invoice={invoice} token={token} onPaid={() => setPaid(true)} onBack={() => setMode(null)} />
      )}
      {mode === 'transfer' && (
        <TransferForm invoice={invoice} token={token} onBack={() => setMode(null)} />
      )}
    </PageShell>
  )
}

// ── Page shell ────────────────────────────────────────────────
function PageShell({ children, invoice }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--navy-950)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center',
      padding: '32px 16px 64px',
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{
          width: 44, height: 44,
          background: 'linear-gradient(135deg, var(--gold-500), var(--gold-400))',
          borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20,
          color: 'var(--navy-950)', margin: '0 auto 12px',
          boxShadow: 'var(--glow-gold)',
        }}>S</div>
        {invoice?.school_name && (
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--text-primary)' }}>
            {invoice.school_name}
          </div>
        )}
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Powered by SchoolPay</div>
      </div>

      {/* Content card */}
      <div style={{
        width: '100%', maxWidth: 480,
        background: 'var(--navy-900)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-xl)',
        boxShadow: 'var(--shadow-lg)',
        overflow: 'hidden',
      }}>
        {children}
      </div>
    </div>
  )
}

// ── Invoice card ──────────────────────────────────────────────
function InvoiceCard({ invoice }) {
  if (!invoice) return null
  const balance = Number(invoice.balance || 0)
  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Payment for</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, marginBottom: 4 }}>{invoice.student_name}</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{invoice.term_name} — {invoice.session_name}</div>
      </div>

      {/* Line items */}
      {invoice.line_items?.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Fee Breakdown</div>
          {invoice.line_items.map(item => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              <span style={{ color: 'var(--text-secondary)' }}>{item.name}</span>
              <span>{formatNaira(item.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Totals */}
      <div style={{ background: 'var(--navy-800)', borderRadius: 'var(--radius-md)', padding: 16, marginTop: 16 }}>
        {Number(invoice.amount_paid) > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
            <span style={{ color: 'var(--text-muted)' }}>Previously paid</span>
            <span style={{ color: 'var(--success)' }}>{formatNaira(invoice.amount_paid)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 600 }}>Amount Due</span>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--gold-400)' }}>{formatNaira(balance)}</span>
        </div>
      </div>
    </div>
  )
}

// ── Method card ───────────────────────────────────────────────
function MethodCard({ icon, title, sub, onClick, color }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'var(--navy-800)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)', padding: '20px 16px',
        cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s', color: 'inherit',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = color + '60'; e.currentTarget.style.background = color + '08' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--navy-800)' }}
    >
      <div style={{ marginBottom: 10 }}>{icon}</div>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{sub}</div>
    </button>
  )
}

// ── Paystack form ─────────────────────────────────────────────
function PaystackForm({ invoice, token, onPaid, onBack }) {
  const [email, setEmail]   = useState('')
  const [loading, setLoading] = useState(false)

  const handle = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await pubApi.post(`/pay/${token}/paystack`, { email })
      window.location.href = res.data.authorization_url
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not initiate payment. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: 24, borderTop: '1px solid var(--border)' }}>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, marginBottom: 6 }}>Online Payment</h3>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
        You will be redirected to Paystack to complete your payment securely.
      </p>
      <form onSubmit={handle} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Input
          label="Your Email Address"
          type="email"
          placeholder="parent@email.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          🔒 Your payment is secured by Paystack. We do not store your card details.
        </div>
        <Button type="submit" size="lg" loading={loading} style={{ width: '100%' }}>
          Proceed to Pay {formatNaira(invoice?.balance)}
        </Button>
        <Button variant="ghost" type="button" onClick={onBack} style={{ width: '100%' }}>← Back</Button>
      </form>
    </div>
  )
}

// ── Transfer form (public) ────────────────────────────────────
function TransferForm({ invoice, token, onBack }) {
  const [paymentId, setPaymentId] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [form, setForm] = useState({ amount: Number(invoice?.balance || 0).toFixed(2), reference: '', narration: '' })
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!form.reference.trim()) return toast.error('Bank reference is required')
    setLoading(true)
    try {
      const res = await pubApi.post('/payments/transfer', {
        invoice_id: invoice.invoice_id,
        amount: Number(form.amount),
        reference: form.reference,
        narration: form.narration,
      })
      const pid = res.data.data?.id
      setPaymentId(pid)

      if (file && pid) {
        const fd = new FormData()
        fd.append('file', file)
        await pubApi.post(`/uploads/payment-proof/${pid}?payment_token=${token}`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      }
      setSubmitted(true)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Submission failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) return (
    <div style={{ padding: 24, borderTop: '1px solid var(--border)', textAlign: 'center' }}>
      <CheckCircle size={48} style={{ color: 'var(--success)', margin: '0 auto 16px' }} />
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, marginBottom: 8 }}>Transfer Submitted</h3>
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        Your payment details have been submitted. The school bursar will review and confirm your payment shortly.
        You will receive an SMS confirmation when approved.
      </p>
    </div>
  )

  return (
    <div style={{ padding: 24, borderTop: '1px solid var(--border)' }}>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, marginBottom: 6 }}>Record Bank Transfer</h3>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
        Already transferred to the school account? Submit your details for confirmation.
      </p>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Input label="Amount Transferred (₦)" type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required />
        <Input label="Bank Transaction Reference *" value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} placeholder="From your bank app or teller receipt" required />
        <Input label="Narration (optional)" value={form.narration} onChange={e => setForm(f => ({ ...f, narration: e.target.value }))} placeholder="e.g. First term fees" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Upload Proof (screenshot / receipt)
          </label>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'var(--navy-800)', border: '2px dashed var(--border)',
            borderRadius: 'var(--radius-md)', padding: '16px 14px',
            cursor: 'pointer', transition: 'border-color 0.15s',
          }}>
            <Upload size={18} style={{ color: 'var(--text-muted)' }} />
            <span style={{ fontSize: 13, color: file ? 'var(--success)' : 'var(--text-muted)' }}>
              {file ? `✓ ${file.name}` : 'Tap to upload screenshot or PDF'}
            </span>
            <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e => setFile(e.target.files[0])} style={{ display: 'none' }} />
          </label>
        </div>
        <Button type="submit" size="lg" loading={loading} style={{ width: '100%' }}>Submit Transfer Details</Button>
        <Button variant="ghost" type="button" onClick={onBack} style={{ width: '100%' }}>← Back</Button>
      </form>
    </div>
  )
}

// ── Success screen ────────────────────────────────────────────
function SuccessScreen({ invoice, receipt, token, alreadyPaid }) {
  return (
    <div style={{ padding: 32, textAlign: 'center' }}>
      <div style={{
        width: 72, height: 72,
        background: 'rgba(34,197,94,0.12)',
        border: '2px solid rgba(34,197,94,0.3)',
        borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 20px',
      }}>
        <CheckCircle size={36} style={{ color: 'var(--success)' }} />
      </div>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, marginBottom: 8 }}>
        {alreadyPaid ? 'Already Paid' : 'Payment Confirmed!'}
      </h2>
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.7 }}>
        {alreadyPaid
          ? `Fees for ${invoice?.student_name} have already been fully paid for this term.`
          : `Thank you! Payment of ${formatNaira(receipt?.amount)} has been received for ${invoice?.student_name}.`
        }
      </p>
      {receipt?.receipt_number && (
        <div style={{ background: 'var(--navy-800)', borderRadius: 'var(--radius-md)', padding: 14, marginBottom: 20, fontSize: 13 }}>
          Receipt: <strong style={{ color: 'var(--gold-400)', fontFamily: 'monospace' }}>{receipt.receipt_number}</strong>
        </div>
      )}
      <a href={`/api/v1/pay/${token}/receipt`} target="_blank" rel="noreferrer">
        <Button variant="secondary" style={{ width: '100%' }}>
          <Download size={15} /> Download PDF Receipt
        </Button>
      </a>
    </div>
  )
}
