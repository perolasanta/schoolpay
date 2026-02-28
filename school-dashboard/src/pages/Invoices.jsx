// src/pages/Invoices.jsx
import { useState, useEffect, useCallback } from 'react'
import { FileText, Zap, Download, ChevronLeft, ChevronRight } from 'lucide-react'
import { PageHeader, Button, Select, EmptyState, Spinner, Modal } from '../components/ui'
import api, { formatNaira, formatDate } from '../lib/api'
import toast from 'react-hot-toast'

const STATUS_COLORS = { paid: 'badge-paid', partial: 'badge-partial', unpaid: 'badge-unpaid', waived: 'badge-pending' }

export default function Invoices() {
  const [invoices, setInvoices]   = useState([])
  const [terms, setTerms]         = useState([])
  const [classes, setClasses]     = useState([])
  const [termId, setTermId]       = useState('')
  const [classId, setClassId]     = useState('')
  const [statusFilter, setStatus] = useState('')
  const [loading, setLoading]     = useState(false)
  const [generating, setGenerating] = useState(false)
  const [showGenModal, setShowGenModal] = useState(false)
  const [page, setPage]           = useState(1)
  const PAGE_SIZE = 20

  // Load terms and classes on mount
  useEffect(() => {
    const load = async () => {
      try {
        const [termsRes, classesRes] = await Promise.all([
          api.get('/academic/terms'),
          api.get('/academic/classes'),
        ])
        const termList = termsRes.data.data || []
        setTerms(termList)
        setClasses(classesRes.data.data || [])
        // Auto-select active term
        const active = termList.find(t => t.is_active)
        if (active) setTermId(active.id)
        else if (termList.length > 0) setTermId(termList[0].id)
      } catch {
        toast.error('Failed to load terms')
      }
    }
    load()
  }, [])

  // Load invoices when filters change
  // Reset to page 1 when filters change
  useEffect(() => { setPage(1) }, [termId, classId, statusFilter])

  const loadInvoices = useCallback(async () => {
    if (!termId) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ term_id: termId, page_size: 500 })
      if (classId) params.set('class_id', classId)
      if (statusFilter) params.set('status', statusFilter)
      const res = await api.get(`/fees/invoices?${params}`)
      setInvoices(res.data.data?.items || res.data.data || [])
    } catch {
      setInvoices([])
    } finally {
      setLoading(false)
    }
  }, [termId, classId, statusFilter])

  useEffect(() => { loadInvoices() }, [loadInvoices])

  // Generate invoices for the selected term
  const handleGenerate = async () => {
    if (!termId) return toast.error('Select a term first')
    setGenerating(true)
    try {
      const res = await api.post('/fees/invoices/generate', {
        term_id: termId,
        apply_arrears: true,
        include_optional_fees: false,
      })
      const result = res.data.data
      toast.success(`Generated ${result.generated_count} invoices — ${result.skipped_count} skipped`)
      setShowGenModal(false)
      loadInvoices()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  const activeTerm = terms.find(t => t.id === termId)
  const totalInvoiced   = invoices.reduce((s, i) => s + Number(i.total_amount || 0), 0)
  const totalCollected  = invoices.reduce((s, i) => s + Number(i.amount_paid || 0), 0)

  // Client-side pagination
  const totalPages = Math.max(1, Math.ceil(invoices.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const pageSlice  = invoices.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  return (
    <div className="animate-in">
      <PageHeader
        title="Invoices"
        subtitle="Generate and manage term fee bills"
        action={
          <Button onClick={() => setShowGenModal(true)} disabled={!termId}>
            <Zap size={15} /> Generate Bills
          </Button>
        }
      />

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <Select value={termId} onChange={e => setTermId(e.target.value)} style={{ minWidth: 200 }}>
          <option value="">Select term…</option>
          {terms.map(t => (
            <option key={t.id} value={t.id}>{t.name} {t.session_name || ''}</option>
          ))}
        </Select>
        <Select value={classId} onChange={e => setClassId(e.target.value)} style={{ minWidth: 150 }}>
          <option value="">All classes</option>
          {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select value={statusFilter} onChange={e => setStatus(e.target.value)} style={{ minWidth: 140 }}>
          <option value="">All statuses</option>
          <option value="unpaid">Unpaid</option>
          <option value="partial">Partial</option>
          <option value="paid">Paid</option>
        </Select>
      </div>

      {/* Summary strip */}
      {invoices.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20,
        }}>
          {[
            { label: 'Total Invoiced', value: formatNaira(totalInvoiced), color: 'var(--text-primary)' },
            { label: 'Collected', value: formatNaira(totalCollected), color: 'var(--success)' },
            { label: 'Outstanding', value: formatNaira(totalInvoiced - totalCollected), color: 'var(--danger)' },
          ].map(({ label, value, color }) => (
            <div key={label} className="card" style={{ padding: '14px 18px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 20, fontFamily: 'var(--font-display)', color }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48 }}><Spinner /></div>
        ) : invoices.length === 0 ? (
          <EmptyState
            icon="📄"
            title="No invoices found"
            description={termId ? "No invoices for the selected filters. Try generating bills first." : "Select a term to view invoices."}
          />
        ) : (
          <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Total</th>
                  <th>Paid</th>
                  <th>Balance</th>
                  <th>Due Date</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pageSlice.map(inv => {
                  const balance = Number(inv.total_amount) - Number(inv.amount_paid)
                  return (
                    <tr key={inv.id}>
                      <td style={{ fontWeight: 500 }}>{inv.student_name || `${inv.first_name} ${inv.last_name}`}</td>
                      <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{inv.class_name}</td>
                      <td>{formatNaira(inv.total_amount)}</td>
                      <td style={{ color: 'var(--success)' }}>{formatNaira(inv.amount_paid)}</td>
                      <td style={{ color: balance > 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 500 }}>
                        {formatNaira(balance)}
                      </td>
                      <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>{formatDate(inv.due_date)}</td>
                      <td><span className={`badge ${STATUS_COLORS[inv.status] || 'badge-pending'}`}>{inv.status}</span></td>
                      <td>
                        <a
                          href={`/api/v1/payments/receipt/${inv.latest_payment_id}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: 'var(--text-muted)', display: inv.latest_payment_id ? 'inline-flex' : 'none', alignItems: 'center', gap: 4, fontSize: 12 }}
                        >
                          <Download size={13} /> PDF
                        </a>
                      </td>
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
                {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, invoices.length)} of {invoices.length} invoices
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1}
                  style={{ background: 'var(--navy-800)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '6px 12px', cursor: safePage === 1 ? 'default' : 'pointer', color: safePage === 1 ? 'var(--text-muted)' : 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                  <ChevronLeft size={14} /> Prev
                </button>
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

      {/* Generate modal */}
      {showGenModal && (
        <Modal title="Generate Term Invoices" onClose={() => setShowGenModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{
              background: 'var(--navy-800)', borderRadius: 'var(--radius-md)',
              padding: 16, border: '1px solid var(--border)',
            }}>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>Selected term</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--gold-400)' }}>
                {activeTerm?.name} {activeTerm?.session_name}
              </div>
            </div>
            <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 'var(--radius-md)', padding: 14, fontSize: 13, color: 'var(--warning)', lineHeight: 1.6 }}>
              ⚠️ This will generate invoices for all active enrolled students who don't already have one for this term. Existing invoices are never overwritten.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => setShowGenModal(false)}>Cancel</Button>
              <Button onClick={handleGenerate} loading={generating}>
                Generate Invoices
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
