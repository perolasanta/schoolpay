// src/pages/Subscriptions.jsx
import { useState, useEffect, useCallback } from 'react'
import { CheckCircle } from 'lucide-react'
import { PageHeader, Button, Modal, EmptyState, Spinner, Input } from '../components/ui'
import api, { fmt, fmtDate } from '../lib/api'
import toast from 'react-hot-toast'

export default function Subscriptions() {
  const [subs, setSubs]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [statusFilter, setStatus] = useState('')
  const [markModal, setMarkModal] = useState(null)
  const [markForm, setMarkForm]   = useState({ payment_reference: '', notes: '' })
  const [marking, setMarking]     = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = statusFilter ? `?status_filter=${statusFilter}` : ''
      const res = await api.get(`/platform/subscriptions${params}`)
      setSubs(res.data.data || [])
    } catch { setSubs([]) }
    finally { setLoading(false) }
  }, [statusFilter])

  useEffect(() => { load() }, [load])

  // Read status from URL query param on mount
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('status')
    if (p) setStatus(p)
  }, [])

  const handleMarkPaid = async () => {
    setMarking(true)
    try {
      await api.post(`/platform/subscriptions/${markModal.id}/mark-paid`, markForm)
      toast.success('Marked as paid. School re-activated if suspended.')
      setMarkModal(null)
      setMarkForm({ payment_reference: '', notes: '' })
      load()
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed') }
    finally { setMarking(false) }
  }

  const totalPending  = subs.filter(s => s.status === 'pending').reduce((sum, s) => sum + Number(s.amount_due), 0)
  const totalOverdue  = subs.filter(s => s.status === 'overdue').reduce((sum, s) => sum + Number(s.amount_due), 0)
  const totalCollected = subs.filter(s => s.status === 'paid').reduce((sum, s) => sum + Number(s.amount_due), 0)

  return (
    <div className="animate-in">
      <PageHeader title="Subscriptions" subtitle="Platform invoices — what schools owe you" />

      {/* Summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Collected', value: fmt(totalCollected), color: 'var(--success)' },
          { label: 'Pending',   value: fmt(totalPending),   color: 'var(--warning)' },
          { label: 'Overdue',   value: fmt(totalOverdue),   color: 'var(--danger)' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card" style={{ padding: '14px 18px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>{label}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div style={{ marginBottom: 16 }}>
        <select value={statusFilter} onChange={e => setStatus(e.target.value)}
          style={{ background: 'var(--navy-800)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '9px 14px', color: 'var(--text-primary)', outline: 'none', cursor: 'pointer' }}>
          {['', 'pending', 'paid', 'overdue', 'waived'].map(s => (
            <option key={s} value={s}>{s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All statuses'}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
        ) : subs.length === 0 ? (
          <EmptyState icon="💳" title="No subscriptions found" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>School</th>
                  <th>Term</th>
                  <th>Students</th>
                  <th>Amount Due</th>
                  <th>Due Date</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {subs.map(s => (
                  <tr key={s.id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{s.schools?.name || '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.schools?.email}</div>
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{s.term_label}</td>
                    <td style={{ fontWeight: 600 }}>{s.student_count}</td>
                    <td style={{ fontFamily: 'var(--font-display)', color: 'var(--gold-400)', fontWeight: 600 }}>{fmt(s.amount_due)}</td>
                    <td style={{ fontSize: 12, color: s.status === 'overdue' ? 'var(--danger)' : 'var(--text-muted)' }}>{fmtDate(s.due_date)}</td>
                    <td><span className={`badge badge-${s.status}`}>{s.status}</span></td>
                    <td>
                      {s.status !== 'paid' && s.status !== 'waived' && (
                        <Button size="sm" variant="success" onClick={() => setMarkModal(s)}>
                          <CheckCircle size={12} /> Mark Paid
                        </Button>
                      )}
                      {s.status === 'paid' && (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtDate(s.paid_at)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Mark paid modal */}
      {markModal && (
        <Modal title="Mark Subscription as Paid" onClose={() => setMarkModal(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: 'var(--navy-800)', borderRadius: 'var(--radius-md)', padding: 14, fontSize: 13 }}>
              <div style={{ color: 'var(--text-muted)', marginBottom: 4, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Subscription</div>
              <div style={{ fontWeight: 500, marginBottom: 2 }}>{markModal.schools?.name}</div>
              <div style={{ color: 'var(--text-secondary)' }}>{markModal.term_label}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--gold-400)', marginTop: 6 }}>{fmt(markModal.amount_due)}</div>
            </div>

            {markModal.schools?.subscription_status === 'suspended' && (
              <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8, padding: 12, fontSize: 13, color: 'var(--success)' }}>
                ✓ This school is currently suspended. Marking as paid will automatically re-activate them.
              </div>
            )}

            <Input label="Payment Reference (optional)" placeholder="e.g. GTB/2025/001234" value={markForm.payment_reference} onChange={e => setMarkForm(f => ({ ...f, payment_reference: e.target.value }))} />
            <Input label="Notes (optional)" placeholder="e.g. Paid via bank transfer" value={markForm.notes} onChange={e => setMarkForm(f => ({ ...f, notes: e.target.value }))} />

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => setMarkModal(null)}>Cancel</Button>
              <Button loading={marking} onClick={handleMarkPaid}><CheckCircle size={14} /> Confirm Payment</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
