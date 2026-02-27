// src/pages/Debtors.jsx
import { useState, useEffect } from 'react'
import { MessageSquare, AlertCircle, Send } from 'lucide-react'
import { PageHeader, Button, Select, EmptyState, Spinner, Modal } from '../components/ui'
import api, { formatNaira, formatDate } from '../lib/api'
import toast from 'react-hot-toast'

export default function Debtors() {
  const [debtors, setDebtors]   = useState([])
  const [terms, setTerms]       = useState([])
  const [termId, setTermId]     = useState('')
  const [loading, setLoading]   = useState(false)
  const [blasting, setBlasting] = useState(false)
  const [showBlastModal, setShowBlastModal] = useState(false)
  const [customMsg, setCustomMsg] = useState('')

  useEffect(() => {
    api.get('/academic/terms').then(res => {
      const list = res.data.data || []
      setTerms(list)
      const active = list.find(t => t.is_active)
      if (active) setTermId(active.id)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!termId) return
    setLoading(true)
    api.get(`/fees/invoices?term_id=${termId}&status=unpaid,partial&page_size=200`)
      .then(res => setDebtors(res.data.data?.items || res.data.data || []))
      .catch(() => setDebtors([]))
      .finally(() => setLoading(false))
  }, [termId])

  const totalOutstanding = debtors.reduce((s, d) => s + Number(d.total_amount) - Number(d.amount_paid), 0)

  const handleBlast = async () => {
    setBlasting(true)
    try {
      await api.post('/sms/blast', {
        term_id: termId,
        message_template: customMsg || null,
      })
      toast.success(`SMS blast triggered for ${debtors.length} parents`)
      setShowBlastModal(false)
      setCustomMsg('')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to send SMS blast')
    } finally {
      setBlasting(false)
    }
  }

  return (
    <div className="animate-in">
      <PageHeader
        title="Debtors Report"
        subtitle="Students with outstanding fee balances"
        action={
          debtors.length > 0 && (
            <Button onClick={() => setShowBlastModal(true)}>
              <Send size={15} /> Send SMS Blast ({debtors.length})
            </Button>
          )
        }
      />

      {/* Term selector */}
      <div style={{ marginBottom: 20 }}>
        <Select value={termId} onChange={e => setTermId(e.target.value)} style={{ maxWidth: 260 }}>
          <option value="">Select term…</option>
          {terms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
      </div>

      {/* Summary */}
      {!loading && debtors.length > 0 && (
        <div style={{
          background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.15)',
          borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <AlertCircle size={22} style={{ color: 'var(--danger)', flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 600, color: 'var(--danger)', marginBottom: 2 }}>
              {debtors.length} students have outstanding balances
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Total outstanding: <strong style={{ color: 'var(--danger)' }}>{formatNaira(totalOutstanding)}</strong>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
        ) : debtors.length === 0 ? (
          <EmptyState
            icon="🎉"
            title={termId ? "No outstanding balances" : "Select a term"}
            description={termId ? "All students have paid their fees for this term." : "Choose a term to see the debtors report."}
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Total Fee</th>
                  <th>Paid</th>
                  <th>Balance</th>
                  <th>Guardian Phone</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {debtors.map((d, i) => {
                  const balance = Number(d.total_amount) - Number(d.amount_paid)
                  return (
                    <tr key={d.id}>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{i + 1}</td>
                      <td style={{ fontWeight: 500 }}>{d.student_name || `${d.first_name} ${d.last_name}`}</td>
                      <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{d.class_name}</td>
                      <td>{formatNaira(d.total_amount)}</td>
                      <td style={{ color: 'var(--success)' }}>{formatNaira(d.amount_paid)}</td>
                      <td style={{ color: 'var(--danger)', fontWeight: 700 }}>{formatNaira(balance)}</td>
                      <td style={{ fontSize: 13 }}>
                        <a href={`tel:${d.guardian_phone}`} style={{ color: 'var(--text-secondary)' }}>{d.guardian_phone}</a>
                      </td>
                      <td><span className={`badge badge-${d.status}`}>{d.status}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SMS Blast modal */}
      {showBlastModal && (
        <Modal title="Send SMS Blast to Debtors" onClose={() => setShowBlastModal(false)} width={520}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{
              background: 'var(--navy-800)', borderRadius: 'var(--radius-md)',
              padding: 14, border: '1px solid var(--border)', fontSize: 13,
            }}>
              <div style={{ color: 'var(--text-muted)', marginBottom: 4, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Will send to</div>
              <div style={{ color: 'var(--gold-400)', fontFamily: 'var(--font-display)', fontSize: 18 }}>
                {debtors.length} parents
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>
                Total outstanding: {formatNaira(totalOutstanding)}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Custom Message (optional)
              </label>
              <textarea
                value={customMsg}
                onChange={e => setCustomMsg(e.target.value)}
                placeholder={`Leave blank to use default message:\n"Dear {name}, your ward {student} has an outstanding fee of {balance}. Pay: {link}"`}
                rows={4}
                style={{
                  background: 'var(--navy-800)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)', padding: 12,
                  color: 'var(--text-primary)', fontFamily: 'var(--font-body)',
                  fontSize: 13, resize: 'vertical', outline: 'none',
                }}
              />
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Placeholders: <code style={{ color: 'var(--gold-400)' }}>{'{name}'} {'{student}'} {'{balance}'} {'{link}'}</code>
              </div>
            </div>

            <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, padding: 12, fontSize: 13, color: 'var(--warning)' }}>
              ⚠️ This will send an SMS and WhatsApp message to {debtors.length} guardian phone numbers. This action cannot be undone.
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => setShowBlastModal(false)}>Cancel</Button>
              <Button onClick={handleBlast} loading={blasting}>
                <Send size={14} /> Send {debtors.length} Messages
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
