// src/pages/PayPage.jsx
// PUBLIC PAGE — No login required.
// Parent opens: schoolpay.ng/pay/{token}

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import {
  CheckCircle, XCircle, Upload, CreditCard,
  Building2, Download, Loader, Clock,
} from 'lucide-react'
import { Button, Input, Spinner } from '../components/ui'
import axios from 'axios'
import toast from 'react-hot-toast'

const pubApi = axios.create({ baseURL: '/api/v1' })
const formatNaira = (n) => '₦' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────
export default function PayPage() {
  const { token } = useParams()
  const [invoice, setInvoice]   = useState(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [mode, setMode]         = useState(null)   // 'paystack' | 'transfer'
  const [screen, setScreen]     = useState('main') // 'main' | 'processing' | 'success' | 'failed'
  const [receipt, setReceipt]   = useState(null)
  const pollRef = useRef(null)

  // Load invoice on mount
  useEffect(() => {
    pubApi.get(`/pay/${token}`)
      .then(res => setInvoice(res.data))
      .catch(() => setError('This payment link is invalid or has expired.'))
      .finally(() => setLoading(false))
  }, [token])

  // On mount — detect if Paystack just redirected back (has ?reference= or ?trxref=)
  useEffect(() => {
    const params  = new URLSearchParams(window.location.search)
    const ref     = params.get('reference') || params.get('trxref') || params.get('ref')
    if (!ref) return

    // Clean the URL so refreshing doesn't re-trigger
    window.history.replaceState({}, '', window.location.pathname)

    setScreen('processing')
    startPolling(ref)
  }, [token])

  // Cleanup on unmount
  useEffect(() => () => clearPolling(), [])

  const clearPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  const startPolling = (ref) => {
    clearPolling()
    let attempts = 0
    const maxAttempts = 20  // 60 seconds total

    const check = async () => {
      attempts++
      try {
        const res = await pubApi.get(`/pay/${token}/status?reference=${ref}`)
        const { payment, invoice_status } = res.data

        if (payment?.status === 'success' || invoice_status === 'paid') {
          clearPolling()
          setReceipt(payment)
          setScreen('success')
          // Refresh invoice data
          pubApi.get(`/pay/${token}`).then(r => setInvoice(r.data)).catch(() => {})
          return
        }
        if (attempts >= maxAttempts) {
          clearPolling()
          setScreen('failed')
        }
      } catch {
        if (attempts >= maxAttempts) {
          clearPolling()
          setScreen('failed')
        }
      }
    }

    check() // immediate first check
    pollRef.current = setInterval(check, 3000)
  }

  // ── Render states ──
  if (loading) return (
    <Shell>
      <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}>
        <Spinner />
      </div>
    </Shell>
  )

  if (error) return (
    <Shell>
      <div style={{ padding: 40, textAlign: 'center' }}>
        <XCircle size={52} style={{ color: 'var(--danger)', margin: '0 auto 16px', display: 'block' }} />
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, marginBottom: 10 }}>Invalid Link</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.7 }}>{error}</p>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 12 }}>
          Contact the school to get a new payment link.
        </p>
      </div>
    </Shell>
  )

  if (screen === 'processing') return (
    <Shell invoice={invoice}>
      <ProcessingScreen token={token} onSuccess={(pay) => { setReceipt(pay); setScreen('success') }} onFailed={() => setScreen('failed')} />
    </Shell>
  )

  if (screen === 'success') return (
    <Shell invoice={invoice}>
      <SuccessScreen invoice={invoice} receipt={receipt} token={token} />
    </Shell>
  )

  if (screen === 'failed') return (
    <Shell invoice={invoice}>
      <FailedScreen token={token} onRetry={() => { setScreen('main'); setMode(null) }} />
    </Shell>
  )

  if (invoice?.status === 'paid') return (
    <Shell invoice={invoice}>
      <AlreadyPaidScreen invoice={invoice} token={token} />
    </Shell>
  )

  return (
    <Shell invoice={invoice}>
      <InvoiceCard invoice={invoice} />

      {!mode && invoice?.can_pay_online && (
        <div style={{ padding: '0 24px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <MethodCard
            icon={<CreditCard size={26} style={{ color: '#22c55e' }} />}
            title="Pay Online"
            sub="Card, USSD, bank via Paystack"
            color="#22c55e"
            onClick={() => setMode('paystack')}
          />
          <MethodCard
            icon={<Building2 size={26} style={{ color: '#60a5fa' }} />}
            title="Bank Transfer"
            sub="Already transferred? Submit proof"
            color="#60a5fa"
            onClick={() => setMode('transfer')}
          />
        </div>
      )}

      {!invoice?.can_pay_online && invoice?.status !== 'paid' && (
        <div style={{ padding: '0 24px 24px' }}>
          <div style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 10, padding: 16, fontSize: 14, color: '#93c5fd', textAlign: 'center' }}>
            Online payment is not available for this invoice.<br />
            <span style={{ fontSize: 13, opacity: 0.8 }}>Please contact the school for assistance.</span>
          </div>
        </div>
      )}

      {mode === 'paystack' && (
        <PaystackForm invoice={invoice} token={token} onBack={() => setMode(null)} />
      )}
      {mode === 'transfer' && (
        <TransferForm invoice={invoice} token={token} onBack={() => setMode(null)} />
      )}
    </Shell>
  )
}

// ─────────────────────────────────────────────────────────────
// PAGE SHELL
// ─────────────────────────────────────────────────────────────
function Shell({ children, invoice }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #080e1a 0%, #0d1b2e 60%, #0a1520 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '32px 16px 80px',
    }}>
      {/* Logo + school name */}
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{
          width: 48, height: 48,
          background: 'linear-gradient(135deg, #d4a843, #f0c060)',
          borderRadius: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'Georgia, serif', fontWeight: 700, fontSize: 22,
          color: '#0d1526', margin: '0 auto 12px',
          boxShadow: '0 0 24px rgba(212,168,67,0.35)',
        }}>S</div>
        {invoice?.school_name && (
          <div style={{ fontSize: 18, fontWeight: 600, color: '#f0f4f8', letterSpacing: '-0.02em' }}>
            {invoice.school_name}
          </div>
        )}
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 3, letterSpacing: '0.05em' }}>
          POWERED BY SCHOOLPAY
        </div>
      </div>

      {/* Card */}
      <div style={{
        width: '100%', maxWidth: 480,
        background: 'rgba(15,25,45,0.95)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 20,
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        overflow: 'hidden',
      }}>
        {children}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// INVOICE SUMMARY CARD
// ─────────────────────────────────────────────────────────────
function InvoiceCard({ invoice }) {
  if (!invoice) return null
  const balance = Number(invoice.balance || 0)
  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
          Fee Payment for
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#f0f4f8', marginBottom: 4 }}>
          {invoice.student_name}
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
          {invoice.term_name} · {invoice.session_name}
        </div>
      </div>

      {invoice.line_items?.length > 0 && (
        <div style={{ marginBottom: 16, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 16 }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
            Fee Breakdown
          </div>
          {invoice.line_items.map(item => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 13 }}>
              <span style={{ color: 'rgba(255,255,255,0.55)' }}>{item.name}</span>
              <span style={{ color: 'rgba(255,255,255,0.8)' }}>{formatNaira(item.amount)}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 16, marginTop: 8 }}>
        {Number(invoice.amount_paid) > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ color: 'rgba(255,255,255,0.4)' }}>Previously paid</span>
            <span style={{ color: '#22c55e' }}>{formatNaira(invoice.amount_paid)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 600, color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>Balance Due</span>
          <span style={{ fontSize: 28, fontWeight: 700, color: '#d4a843', letterSpacing: '-0.02em' }}>
            {formatNaira(balance)}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// METHOD CARD
// ─────────────────────────────────────────────────────────────
function MethodCard({ icon, title, sub, color, onClick }) {
  return (
    <button onClick={onClick}
      style={{
        background: 'rgba(255,255,255,0.03)', border: `1px solid rgba(255,255,255,0.08)`,
        borderRadius: 12, padding: '18px 14px', cursor: 'pointer',
        textAlign: 'center', transition: 'all 0.15s', color: 'inherit',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = color + '50'; e.currentTarget.style.background = color + '10' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
    >
      {icon}
      <div style={{ fontWeight: 600, fontSize: 14, color: '#f0f4f8' }}>{title}</div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 1.4 }}>{sub}</div>
    </button>
  )
}

// ─────────────────────────────────────────────────────────────
// PAYSTACK FORM
// ─────────────────────────────────────────────────────────────
function PaystackForm({ invoice, token, onBack }) {
  const balance = Number(invoice?.balance || 0)
  const [email, setEmail]   = useState('')
  const [amount, setAmount] = useState(balance.toFixed(2))
  const [loading, setLoading] = useState(false)
  const iStyle = { width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '12px 14px', color: '#f0f4f8', fontSize: 14, outline: 'none', boxSizing: 'border-box' }
  const lStyle = { fontSize: 12, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }

  const handle = async (e) => {
    e.preventDefault()
    const amt = Math.min(Number(amount), balance)
    if (amt <= 0 || isNaN(amt)) return toast.error('Enter a valid amount')
    if (!email.trim()) return toast.error('Email address is required')
    setLoading(true)
    try {
      const res = await pubApi.post(`/pay/${token}/paystack`, { email, amount: amt })
      window.location.href = res.data.authorization_url
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not initiate payment. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: '20px 24px 28px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6, color: '#f0f4f8' }}>Online Payment</h3>
      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 20, lineHeight: 1.6 }}>
        You will be redirected to Paystack to complete payment securely.
      </p>
      <form onSubmit={handle} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={lStyle}>Amount to Pay (₦)</label>
          <input type="number" step="0.01" min="1" max={balance}
            value={amount} onChange={e => setAmount(e.target.value)}
            style={{ ...iStyle, fontSize: 22, fontWeight: 700 }} />
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 5 }}>
            Full balance: {formatNaira(balance)} · You can pay less for a part payment
          </div>
        </div>
        <div>
          <label style={lStyle}>Your Email Address</label>
          <input type="email" placeholder="parent@email.com" value={email}
            onChange={e => setEmail(e.target.value)} required style={iStyle} />
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 5 }}>
            🔒 Paystack will send your transaction receipt here
          </div>
        </div>
        <button type="submit" disabled={loading}
          style={{
            background: loading ? 'rgba(212,168,67,0.5)' : 'linear-gradient(135deg, #d4a843, #f0c060)',
            color: '#0d1526', border: 'none', borderRadius: 10,
            padding: '14px 20px', fontSize: 15, fontWeight: 700,
            cursor: loading ? 'default' : 'pointer', width: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'all 0.15s',
          }}>
          {loading ? <><Loader size={16} className="spin" /> Redirecting…</> : `Pay ${formatNaira(Number(amount) || 0)} Securely`}
        </button>
        <button type="button" onClick={onBack}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 13, padding: 4 }}>
          ← Back to payment options
        </button>
      </form>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// TRANSFER FORM
// ─────────────────────────────────────────────────────────────
function TransferForm({ invoice, token, onBack }) {
  const [submitted, setSubmitted] = useState(false)
  const [form, setForm] = useState({ amount: Number(invoice?.balance || 0).toFixed(2), reference: '', narration: '' })
  const [file, setFile]   = useState(null)
  const [loading, setLoading] = useState(false)
  const iStyle = { width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '11px 14px', color: '#f0f4f8', fontSize: 14, outline: 'none', boxSizing: 'border-box' }
  const lStyle = { fontSize: 12, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }
  const f = field => ({ value: form[field], onChange: e => setForm(p => ({ ...p, [field]: e.target.value })) })

  const submit = async (e) => {
    e.preventDefault()
    if (!form.reference.trim()) return toast.error('Bank reference is required')
    setLoading(true)
    try {
      const res = await pubApi.post(`/pay/${token}/transfer`, {
        amount:    Number(form.amount),
        reference: form.reference,
        narration: form.narration,
      })
      const pid = res.data.payment_id
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
    } finally { setLoading(false) }
  }

  if (submitted) return (
    <div style={{ padding: '32px 24px', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ width: 72, height: 72, background: 'rgba(96,165,250,0.12)', border: '2px solid rgba(96,165,250,0.3)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
        <Clock size={32} style={{ color: '#60a5fa' }} />
      </div>
      <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 10, color: '#f0f4f8' }}>Transfer Submitted</h3>
      <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7 }}>
        Your payment details have been submitted.<br />
        The school bursar will review and confirm shortly.<br />
        <strong style={{ color: '#60a5fa' }}>You will receive an SMS when approved.</strong>
      </p>
    </div>
  )

  return (
    <div style={{ padding: '20px 24px 28px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6, color: '#f0f4f8' }}>Bank Transfer Details</h3>
      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 20, lineHeight: 1.6 }}>
        Already transferred to the school account? Submit your reference for confirmation.
      </p>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={lStyle}>Amount Transferred (₦)</label>
          <input type="number" step="0.01" {...f('amount')} required style={{ ...iStyle, fontSize: 20, fontWeight: 700 }} />
        </div>
        <div>
          <label style={lStyle}>Bank Transaction Reference *</label>
          <input placeholder="From your bank app or teller receipt" {...f('reference')} required style={iStyle} />
        </div>
        <div>
          <label style={lStyle}>Narration (optional)</label>
          <input placeholder="e.g. First term fees" {...f('narration')} style={iStyle} />
        </div>
        <div>
          <label style={lStyle}>Upload Proof (screenshot / receipt)</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.03)', border: `2px dashed ${file ? 'rgba(34,197,94,0.5)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 8, padding: '14px', cursor: 'pointer', transition: 'border-color 0.15s' }}>
            <Upload size={18} style={{ color: file ? '#22c55e' : 'rgba(255,255,255,0.3)', flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: file ? '#22c55e' : 'rgba(255,255,255,0.4)' }}>
              {file ? `✓ ${file.name}` : 'Tap to upload screenshot or PDF'}
            </span>
            <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e => setFile(e.target.files[0])} style={{ display: 'none' }} />
          </label>
        </div>
        <button type="submit" disabled={loading}
          style={{ background: loading ? 'rgba(96,165,250,0.4)' : 'linear-gradient(135deg, #3b82f6, #60a5fa)', color: '#fff', border: 'none', borderRadius: 10, padding: '14px 20px', fontSize: 15, fontWeight: 700, cursor: loading ? 'default' : 'pointer', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {loading ? <><Loader size={16} /> Submitting…</> : 'Submit Transfer Details'}
        </button>
        <button type="button" onClick={onBack} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 13, padding: 4 }}>
          ← Back to payment options
        </button>
      </form>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// PROCESSING SCREEN (shown immediately after Paystack redirect)
// ─────────────────────────────────────────────────────────────
function ProcessingScreen({ token, onSuccess, onFailed }) {
  const [dots, setDots] = useState('.')
  const pollRef = useRef(null)

  useEffect(() => {
    // Animate dots
    const dotInterval = setInterval(() => setDots(d => d.length >= 3 ? '.' : d + '.'), 600)

    // Poll for confirmation
    let attempts = 0
    const params = new URLSearchParams(window.location.search)
    const ref = params.get('reference') || params.get('trxref')

    if (ref) {
      const check = async () => {
        attempts++
        try {
          const res = await pubApi.get(`/pay/${token}/status?reference=${ref}`)
          if (res.data.payment?.status === 'success') {
            clearInterval(dotInterval)
            clearInterval(pollRef.current)
            onSuccess(res.data.payment)
            return
          }
        } catch {}
        if (attempts >= 20) {
          clearInterval(dotInterval)
          clearInterval(pollRef.current)
          onFailed()
        }
      }
      check()
      pollRef.current = setInterval(check, 3000)
    } else {
      // No reference — just show processing briefly then check invoice status
      setTimeout(async () => {
        try {
          const res = await pubApi.get(`/pay/${token}/status`)
          if (res.data.is_paid) { onSuccess(null); return }
        } catch {}
        onFailed()
      }, 4000)
    }

    return () => {
      clearInterval(dotInterval)
      clearInterval(pollRef.current)
    }
  }, [])

  return (
    <div style={{ padding: '48px 32px', textAlign: 'center' }}>
      <div style={{ position: 'relative', width: 80, height: 80, margin: '0 auto 24px' }}>
        <div style={{ position: 'absolute', inset: 0, border: '3px solid rgba(212,168,67,0.15)', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', inset: 0, border: '3px solid transparent', borderTopColor: '#d4a843', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CreditCard size={28} style={{ color: '#d4a843' }} />
        </div>
      </div>
      <h3 style={{ fontSize: 20, fontWeight: 700, color: '#f0f4f8', marginBottom: 10 }}>
        Confirming Payment{dots}
      </h3>
      <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', lineHeight: 1.7 }}>
        Please wait while we confirm your payment.<br />
        <strong style={{ color: 'rgba(255,255,255,0.6)' }}>Do not close this page.</strong>
      </p>
      <div style={{ marginTop: 24, fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>
        This usually takes less than 10 seconds
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// SUCCESS SCREEN
// ─────────────────────────────────────────────────────────────
function SuccessScreen({ invoice, receipt, token }) {
  return (
    <div style={{ padding: '40px 28px 36px', textAlign: 'center' }}>
      {/* Animated checkmark */}
      <div style={{ position: 'relative', width: 88, height: 88, margin: '0 auto 24px' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(34,197,94,0.1)', border: '2px solid rgba(34,197,94,0.3)', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CheckCircle size={44} style={{ color: '#22c55e' }} />
        </div>
      </div>

      <h2 style={{ fontSize: 26, fontWeight: 700, color: '#f0f4f8', marginBottom: 8 }}>
        Payment Confirmed!
      </h2>
      <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginBottom: 24, lineHeight: 1.7 }}>
        {receipt?.amount
          ? `${formatNaira(receipt.amount)} received for ${invoice?.student_name}.`
          : `Fees for ${invoice?.student_name} have been received.`
        }<br />
        An SMS receipt has been sent to the registered phone number.
      </p>

      {/* Receipt details card */}
      {(receipt?.receipt_number || invoice?.student_name) && (
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '16px 20px', marginBottom: 24, textAlign: 'left' }}>
          {receipt?.receipt_number && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: 14 }}>
              <span style={{ color: 'rgba(255,255,255,0.4)' }}>Receipt No.</span>
              <strong style={{ color: '#d4a843', fontFamily: 'monospace' }}>{receipt.receipt_number}</strong>
            </div>
          )}
          {invoice?.student_name && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: 14 }}>
              <span style={{ color: 'rgba(255,255,255,0.4)' }}>Student</span>
              <span style={{ color: '#f0f4f8' }}>{invoice.student_name}</span>
            </div>
          )}
          {invoice?.term_name && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
              <span style={{ color: 'rgba(255,255,255,0.4)' }}>Term</span>
              <span style={{ color: '#f0f4f8' }}>{invoice.term_name} · {invoice.session_name}</span>
            </div>
          )}
        </div>
      )}

      <a href={`/api/v1/pay/${token}/receipt`} target="_blank" rel="noreferrer" style={{ display: 'block', textDecoration: 'none', marginBottom: 12 }}>
        <button style={{ width: '100%', background: 'linear-gradient(135deg, #d4a843, #f0c060)', color: '#0d1526', border: 'none', borderRadius: 10, padding: '13px 20px', fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Download size={16} /> Download PDF Receipt
        </button>
      </a>
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>
        You can bookmark this page to download your receipt later
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// ALREADY PAID SCREEN
// ─────────────────────────────────────────────────────────────
function AlreadyPaidScreen({ invoice, token }) {
  return (
    <div style={{ padding: '40px 28px', textAlign: 'center' }}>
      <div style={{ width: 80, height: 80, background: 'rgba(34,197,94,0.08)', border: '2px solid rgba(34,197,94,0.2)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
        <CheckCircle size={40} style={{ color: '#22c55e' }} />
      </div>
      <h2 style={{ fontSize: 24, fontWeight: 700, color: '#f0f4f8', marginBottom: 8 }}>Already Paid</h2>
      <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginBottom: 24, lineHeight: 1.7 }}>
        Fees for <strong style={{ color: '#f0f4f8' }}>{invoice?.student_name}</strong> have been fully paid for {invoice?.term_name}.
      </p>
      <a href={`/api/v1/pay/${token}/receipt`} target="_blank" rel="noreferrer" style={{ display: 'block', textDecoration: 'none' }}>
        <button style={{ width: '100%', background: 'rgba(255,255,255,0.06)', color: '#f0f4f8', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '12px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Download size={15} /> Download Receipt
        </button>
      </a>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// FAILED SCREEN
// ─────────────────────────────────────────────────────────────
function FailedScreen({ token, onRetry }) {
  return (
    <div style={{ padding: '40px 28px', textAlign: 'center' }}>
      <div style={{ width: 80, height: 80, background: 'rgba(239,68,68,0.08)', border: '2px solid rgba(239,68,68,0.2)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
        <XCircle size={40} style={{ color: '#ef4444' }} />
      </div>
      <h2 style={{ fontSize: 24, fontWeight: 700, color: '#f0f4f8', marginBottom: 8 }}>Payment Not Confirmed</h2>
      <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginBottom: 24, lineHeight: 1.7 }}>
        We could not confirm your payment automatically.<br />
        If money was deducted from your account, please contact the school with your bank reference — it will be confirmed manually.
      </p>
      <button onClick={onRetry}
        style={{ background: 'rgba(255,255,255,0.06)', color: '#f0f4f8', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '12px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', width: '100%', marginBottom: 12 }}>
        Try Again
      </button>
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>
        Or use the Bank Transfer option to submit your proof manually
      </p>
    </div>
  )
}
