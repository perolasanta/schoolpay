// src/pages/Debtors.jsx
import { useState, useEffect } from 'react'
import { MessageSquare, AlertCircle, Send, ChevronLeft, ChevronRight } from 'lucide-react'
import { PageHeader, Button, Select, EmptyState, Spinner, Modal } from '../components/ui'
import api, { formatNaira } from '../lib/api'
import toast from 'react-hot-toast'

const PAGE_SIZE = 15

export default function Debtors() {
  const [debtors, setDebtors]   = useState([])
  const [terms, setTerms]       = useState([])
  const [classes, setClasses]   = useState([])
  const [termId, setTermId]     = useState('')
  const [classId, setClassId]   = useState('')
  const [page, setPage]         = useState(1)
  const [loading, setLoading]   = useState(false)
  const [blasting, setBlasting] = useState(false)
  const [showBlastModal, setShowBlastModal] = useState(false)
  const [customMsg, setCustomMsg] = useState('')

  // Load terms + classes on mount
  useEffect(() => {
    Promise.all([
      api.get('/academic/terms'),
      api.get('/academic/classes'),
    ]).then(([tRes, cRes]) => {
      const list = tRes.data.data || []
      setTerms(list)
      setClasses(cRes.data.data || [])
      const active = list.find(t => t.is_active)
      if (active) setTermId(active.id)
      else if (list.length > 0) setTermId(list[0].id)
    }).catch(() => {})
  }, [])

  // Reload when filters change — reset to page 1
  useEffect(() => {
    if (!termId) return
    setPage(1)
    load(termId, classId)
  }, [termId, classId])

  const load = (tid, cid) => {
    setLoading(true)
    const params = new URLSearchParams({ term_id: tid, status: 'unpaid,partial', page_size: 200 })
    if (cid) params.set('class_id', cid)
    api.get(`/fees/invoices?${params}`)
      .then(res => setDebtors(res.data.data?.items || res.data.data || []))
      .catch(() => setDebtors([]))
      .finally(() => setLoading(false))
  }

  // Pagination
  const totalPages = Math.max(1, Math.ceil(debtors.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const pageSlice  = debtors.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const totalOut   = debtors.reduce((s, d) => s + Number(d.total_amount) - Number(d.amount_paid), 0)

  const handleBlast = async () => {
    setBlasting(true)
    try {
      const res = await api.post('/sms/blast', {
        term_id: termId,
        message_template: customMsg || null,
      })
      toast.success(res.data.message || `SMS blast queued for ${debtors.length} parents`)
      setShowBlastModal(false)
      setCustomMsg('')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to send SMS blast')
    } finally { setBlasting(false) }
  }

  return (
    <div className="animate-in">
      <PageHeader
        title="Debtors Report"
        subtitle="Students with outstanding fee balances"
        action={
          debtors.length > 0 && (
            <Button onClick={() => setShowBlastModal(true)}>
              <Send size={15} /> SMS Blast ({debtors.length})
            </Button>
          )
        }
      />

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <Select value={termId} onChange={e => setTermId(e.target.value)} style={{ minWidth: 180 }}>
          <option value="">Select term…</option>
          {terms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
        <Select value={classId} onChange={e => setClassId(e.target.value)} style={{ minWidth: 150 }}>
          <option value="">All classes</option>
          {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        {(classId) && (
          <button onClick={() => setClassId('')}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '6px 12px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}>
            Clear filter ×
          </button>
        )}
      </div>

      {/* Summary bar */}
      {!loading && debtors.length > 0 && (
        <div style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 'var(--radius-lg)', padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <AlertCircle size={20} style={{ color: 'var(--danger)', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 600, color: 'var(--danger)' }}>{debtors.length} students</span>
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}> have outstanding balances · Total: </span>
            <strong style={{ color: 'var(--danger)' }}>{formatNaira(totalOut)}</strong>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, debtors.length)} of {debtors.length}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
        ) : debtors.length === 0 ? (
          <EmptyState
            icon={termId ? '🎉' : '📋'}
            title={termId ? 'No outstanding balances' : 'Select a term'}
            description={termId ? 'All students have paid their fees for this term.' : 'Choose a term to view the debtors report.'}
          />
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>#</th>
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
                  {pageSlice.map((d, i) => {
                    const balance = Number(d.total_amount) - Number(d.amount_paid)
                    const rowNum  = (safePage - 1) * PAGE_SIZE + i + 1
                    return (
                      <tr key={d.id}>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{rowNum}</td>
                        <td style={{ fontWeight: 500 }}>{d.student_name}</td>
                        <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                          {d.class_name}{d.arm ? ` ${d.arm}` : ''}
                        </td>
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

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  Page {safePage} of {totalPages}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1}
                    style={{ background: 'var(--navy-800)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '6px 12px', cursor: safePage === 1 ? 'default' : 'pointer', color: safePage === 1 ? 'var(--text-muted)' : 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                    <ChevronLeft size={14} /> Prev
                  </button>
                  {/* Page number pills */}
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    const pg = totalPages <= 7 ? i + 1 : safePage <= 4 ? i + 1 : safePage >= totalPages - 3 ? totalPages - 6 + i : safePage - 3 + i
                    return (
                      <button key={pg} onClick={() => setPage(pg)}
                        style={{ background: pg === safePage ? 'var(--gold-600)' : 'var(--navy-800)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '6px 10px', cursor: 'pointer', color: pg === safePage ? '#fff' : 'var(--text-secondary)', fontSize: 13, minWidth: 34 }}>
                        {pg}
                      </button>
                    )
                  })}
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
                    style={{ background: 'var(--navy-800)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '6px 12px', cursor: safePage === totalPages ? 'default' : 'pointer', color: safePage === totalPages ? 'var(--text-muted)' : 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                    Next <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* SMS Blast modal */}
      {showBlastModal && (
        <Modal title="Send SMS Blast to Debtors" onClose={() => setShowBlastModal(false)} width={520}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ background: 'var(--navy-800)', borderRadius: 'var(--radius-md)', padding: 14, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Will send to</div>
              <div style={{ color: 'var(--gold-400)', fontFamily: 'var(--font-display)', fontSize: 22 }}>{debtors.length} parents</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>
                Total outstanding: {formatNaira(totalOut)}
                {classId && classes.find(c => c.id === classId) && (
                  <span> · {classes.find(c => c.id === classId).name} only</span>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Custom Message (optional)
              </label>
              <textarea
                value={customMsg}
                onChange={e => setCustomMsg(e.target.value)}
                placeholder={`Leave blank to use default:\n"Dear {guardian_name}, your ward {student_name} has an outstanding fee of {balance}. Pay: {payment_link}"`}
                rows={4}
                style={{ background: 'var(--navy-800)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 12, color: 'var(--text-primary)', fontFamily: 'var(--font-body)', fontSize: 13, resize: 'vertical', outline: 'none', width: '100%', boxSizing: 'border-box' }}
              />
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Placeholders: <code style={{ color: 'var(--gold-400)' }}>{'{guardian_name}'} {'{student_name}'} {'{balance}'} {'{payment_link}'}</code>
              </div>
            </div>

            <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, padding: 12, fontSize: 13, color: 'var(--warning)' }}>
              ⚠️ This will send SMS + WhatsApp to {debtors.length} guardian phone numbers. Cannot be undone.
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
