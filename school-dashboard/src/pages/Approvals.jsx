// src/pages/Approvals.jsx
import { useState, useEffect } from 'react'
import { CheckCircle, XCircle, Eye, Clock } from 'lucide-react'
import { PageHeader, Button, EmptyState, Spinner, Modal } from '../components/ui'
import api, { formatNaira, formatDate } from '../lib/api'
import toast from 'react-hot-toast'

export default function Approvals() {
  const [pending, setPending]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [proofModal, setProofModal] = useState(null)   // { paymentId, url }
  const [actionLoading, setActionLoading] = useState(null)  // paymentId being processed

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get('/payments/transfer/pending')
      setPending(res.data.data || [])
    } catch {
      setPending([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleAction = async (paymentId, action, notes = '') => {
    setActionLoading(paymentId)
    try {
      await api.post('/payments/transfer/approve', {
        payment_id: paymentId,
        action,
        notes,
      })
      toast.success(action === 'approved' ? 'Payment approved — SMS sent to parent' : 'Payment rejected')
      setPending(p => p.filter(x => x.id !== paymentId))
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Action failed')
    } finally {
      setActionLoading(null)
    }
  }

  const viewProof = async (paymentId) => {
    try {
      const res = await api.get(`/uploads/payment-proof/${paymentId}/signed-url`)
      setProofModal({ paymentId, url: res.data.signed_url })
    } catch {
      toast.error('Could not load proof file')
    }
  }

  return (
    <div className="animate-in">
      <PageHeader
        title="Pending Approvals"
        subtitle="Bank transfers awaiting confirmation"
        action={
          <Button variant="secondary" onClick={load}>Refresh</Button>
        }
      />

      {!loading && pending.length > 0 && (
        <div style={{
          background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.15)',
          borderRadius: 'var(--radius-lg)', padding: '14px 18px', marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 12, fontSize: 13,
        }}>
          <Clock size={18} style={{ color: 'var(--info)' }} />
          <span style={{ color: 'var(--text-secondary)' }}>
            <strong style={{ color: 'var(--info)' }}>{pending.length}</strong> transfer{pending.length > 1 ? 's' : ''} waiting for your review.
            Approve to confirm payment and send receipt to parent.
          </span>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}><Spinner /></div>
      ) : pending.length === 0 ? (
        <EmptyState icon="✅" title="No pending approvals" description="All bank transfers have been reviewed. Check back later." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {pending.map(p => {
            const isLoading = actionLoading === p.id
            return (
              <div
                key={p.id}
                className="card animate-in"
                style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}
              >
                {/* Student info */}
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Student</div>
                  <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 2 }}>{p.student_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.admission_number}</div>
                </div>

                {/* Payment info */}
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Payment Details</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: 'var(--gold-400)', marginBottom: 4 }}>{formatNaira(p.amount)}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Ref: <code style={{ color: 'var(--text-primary)' }}>{p.reference}</code>
                  </div>
                  {p.narration && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{p.narration}</div>}
                </div>

                {/* Date */}
                <div style={{ minWidth: 120 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Submitted</div>
                  <div style={{ fontSize: 13 }}>{formatDate(p.payment_date)}</div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
                  {p.proof_url && (
                    <Button variant="secondary" size="sm" onClick={() => viewProof(p.id)}>
                      <Eye size={13} /> View Proof
                    </Button>
                  )}
                  <Button
                    variant="danger"
                    size="sm"
                    loading={isLoading}
                    onClick={() => {
                      const reason = prompt('Rejection reason (optional):') ?? ''
                      handleAction(p.id, 'rejected', reason)
                    }}
                  >
                    <XCircle size={13} /> Reject
                  </Button>
                  <Button
                    variant="success"
                    size="sm"
                    loading={isLoading}
                    onClick={() => handleAction(p.id, 'approved')}
                  >
                    <CheckCircle size={13} /> Approve
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Proof viewer modal */}
      {proofModal && (
        <Modal title="Proof of Payment" onClose={() => setProofModal(null)} width={680}>
          <div style={{ textAlign: 'center' }}>
            {proofModal.url.endsWith('.pdf') ? (
              <iframe src={proofModal.url} style={{ width: '100%', height: 500, border: 'none', borderRadius: 8 }} title="Proof PDF" />
            ) : (
              <img
                src={proofModal.url}
                alt="Proof of payment"
                style={{ maxWidth: '100%', maxHeight: 500, borderRadius: 8, objectFit: 'contain' }}
              />
            )}
            <div style={{ marginTop: 16 }}>
              <a href={proofModal.url} target="_blank" rel="noreferrer">
                <Button variant="secondary" size="sm">Open in new tab ↗</Button>
              </a>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
