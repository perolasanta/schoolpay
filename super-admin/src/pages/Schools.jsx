// src/pages/Schools.jsx
import { useState, useEffect, useCallback } from 'react'
import { Search, CheckCircle, XCircle, Eye } from 'lucide-react'
import { PageHeader, Button, Modal, EmptyState, Spinner } from '../components/ui'
import api, { fmt, fmtDate } from '../lib/api'
import toast from 'react-hot-toast'

export default function Schools() {
  const [schools, setSchools]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [statusFilter, setStatus] = useState('')
  const [detail, setDetail]     = useState(null)   // school detail modal
  const [detailData, setDetailData] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status_filter', statusFilter)
      if (search) params.set('search', search)
      const res = await api.get(`/platform/schools?${params}`)
      setSchools(res.data.data || [])
    } catch { setSchools([]) }
    finally { setLoading(false) }
  }, [search, statusFilter])

  useEffect(() => { load() }, [load])

  // Debounce search
  const [searchInput, setSearchInput] = useState('')
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput) }, 400)
    return () => clearTimeout(t)
  }, [searchInput])

  const openDetail = async (school) => {
    setDetail(school)
    setDetailLoading(true)
    try {
      const res = await api.get(`/platform/schools/${school.id}`)
      setDetailData(res.data)
    } catch { setDetailData(null) }
    finally { setDetailLoading(false) }
  }

  const handleActivate = async (schoolId) => {
    setActionLoading(schoolId)
    try {
      await api.post(`/platform/schools/${schoolId}/activate`)
      toast.success('School activated')
      load()
      if (detail?.id === schoolId) setDetail(d => ({ ...d, subscription_status: 'active' }))
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed') }
    finally { setActionLoading(null) }
  }

  const handleSuspend = async (schoolId) => {
    if (!window.confirm('Suspend this school? They will lose access to financial features.')) return
    setActionLoading(schoolId)
    try {
      await api.post(`/platform/schools/${schoolId}/suspend`)
      toast.success('School suspended')
      load()
      if (detail?.id === schoolId) setDetail(d => ({ ...d, subscription_status: 'suspended' }))
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed') }
    finally { setActionLoading(null) }
  }

  const STATUS_OPTS = ['', 'active', 'trial', 'suspended', 'cancelled']

  return (
    <div className="animate-in">
      <PageHeader title="All Schools" subtitle={`${schools.length} schools on the platform`} />

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220, position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input placeholder="Search by name or subdomain…" value={searchInput} onChange={e => setSearchInput(e.target.value)}
            style={{ width: '100%', background: 'var(--navy-800)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '9px 14px 9px 32px', color: 'var(--text-primary)', outline: 'none', fontSize: 14 }} />
        </div>
        <select value={statusFilter} onChange={e => setStatus(e.target.value)}
          style={{ background: 'var(--navy-800)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '9px 14px', color: 'var(--text-primary)', outline: 'none', cursor: 'pointer' }}>
          {STATUS_OPTS.map(s => <option key={s} value={s}>{s || 'All statuses'}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 56 }}><Spinner /></div>
        ) : schools.length === 0 ? (
          <EmptyState icon="🏫" title="No schools found" description="Try a different filter." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>School</th>
                  <th>Subdomain</th>
                  <th>Students</th>
                  <th>Current Sub</th>
                  <th>Status</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {schools.map(sc => {
                  const isLoading = actionLoading === sc.id
                  const sub = sc.latest_subscription
                  return (
                    <tr key={sc.id}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{sc.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sc.email}</div>
                      </td>
                      <td><code style={{ fontSize: 12, color: 'var(--gold-400)', background: 'rgba(212,168,67,0.08)', padding: '2px 6px', borderRadius: 4 }}>{sc.subdomain}</code></td>
                      <td style={{ fontWeight: 600 }}>{sc.active_students}</td>
                      <td style={{ fontSize: 12 }}>
                        {sub ? (
                          <div>
                            <div style={{ color: 'var(--text-secondary)' }}>{sub.term_label}</div>
                            <div style={{ color: fmt(sub.amount_due) ? 'var(--gold-400)' : 'var(--text-muted)', fontWeight: 600 }}>{fmt(sub.amount_due)}</div>
                          </div>
                        ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td><span className={`badge badge-${sc.subscription_status}`}>{sc.subscription_status}</span></td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtDate(sc.created_at)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <Button size="sm" variant="ghost" onClick={() => openDetail(sc)} title="View detail">
                            <Eye size={13} />
                          </Button>
                          {sc.subscription_status === 'suspended' ? (
                            <Button size="sm" variant="success" loading={isLoading} onClick={() => handleActivate(sc.id)}>
                              <CheckCircle size={12} /> Activate
                            </Button>
                          ) : (
                            <Button size="sm" variant="danger" loading={isLoading} onClick={() => handleSuspend(sc.id)}>
                              <XCircle size={12} /> Suspend
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail modal */}
      {detail && (
        <Modal title={detail.name} onClose={() => { setDetail(null); setDetailData(null) }} width={580}>
          {detailLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div>
          ) : detailData ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Key numbers */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {[
                  { label: 'Staff', value: detailData.staff_count },
                  { label: 'Total Payments Processed', value: fmt(detailData.total_payments_processed) },
                  { label: 'Subscriptions', value: detailData.subscriptions.length },
                ].map(({ label, value }) => (
                  <div key={label} style={{ background: 'var(--navy-800)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: 'var(--gold-400)', marginBottom: 4 }}>{value}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</div>
                  </div>
                ))}
              </div>

              {/* School info */}
              <div style={{ fontSize: 13, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  ['Email', detailData.school.email],
                  ['Phone', detailData.school.phone],
                  ['Address', detailData.school.address],
                  ['Status', detailData.school.subscription_status],
                ].map(([label, value]) => (
                  <div key={label} style={{ background: 'var(--navy-800)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{label}</div>
                    <div style={{ color: 'var(--text-primary)' }}>{value || '—'}</div>
                  </div>
                ))}
              </div>

              {/* Subscription history */}
              {detailData.subscriptions.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Subscription History</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {detailData.subscriptions.slice(0, 5).map(sub => (
                      <div key={sub.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--navy-800)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}>
                        <div>
                          <span style={{ color: 'var(--text-secondary)' }}>{sub.term_label}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 8 }}>{sub.student_count} students</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ color: 'var(--gold-400)', fontWeight: 600 }}>{fmt(sub.amount_due)}</span>
                          <span className={`badge badge-${sub.status}`}>{sub.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
                {detail.subscription_status === 'suspended' ? (
                  <Button variant="success" loading={actionLoading === detail.id} onClick={() => handleActivate(detail.id)}>
                    <CheckCircle size={14} /> Activate School
                  </Button>
                ) : (
                  <Button variant="danger" loading={actionLoading === detail.id} onClick={() => handleSuspend(detail.id)}>
                    <XCircle size={14} /> Suspend School
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>Could not load school details.</p>
          )}
        </Modal>
      )}
    </div>
  )
}
