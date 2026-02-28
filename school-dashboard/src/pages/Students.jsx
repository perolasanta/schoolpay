// src/pages/Students.jsx
// Three-level drill-down:
//   Level 0: Class cards (default view)
//   Level 1: Arm breakdown (if class has arms) OR student table (if no arms)
//   Level 2: Student table filtered by class + arm

import { useState, useEffect, useCallback } from 'react'
import {
  Search, Phone, ChevronRight,
  Users, ArrowLeft,
} from 'lucide-react'
import { PageHeader, Button, Select, EmptyState, Spinner } from '../components/ui'
import api, { formatNaira } from '../lib/api'

const fmt = (n) => formatNaira(n ?? 0)

function CollectionBar({ rate, height = 6 }) {
  const pct = Math.min(Math.max(rate || 0, 0), 100)
  const color = pct >= 80
    ? 'var(--success)'
    : pct >= 50
    ? 'var(--warning)'
    : 'var(--danger)'
  return (
    <div style={{ background: 'var(--navy-700)', borderRadius: 4, height, overflow: 'hidden', marginTop: 8 }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.6s ease' }} />
    </div>
  )
}

function StatusDots({ paid, partial, unpaid }) {
  return (
    <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
      {[
        { label: 'Paid', count: paid, color: 'var(--success)' },
        { label: 'Partial', count: partial, color: 'var(--warning)' },
        { label: 'Unpaid', count: unpaid, color: 'var(--danger)' },
      ].map(({ label, count, color }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}: </span>
          <span style={{ fontSize: 11, fontWeight: 600, color }}>{count ?? 0}</span>
        </div>
      ))}
    </div>
  )
}

export default function Students() {
  const [view, setView] = useState('classes') // classes | arms | students
  const [selectedClass, setSelectedClass] = useState(null)
  const [selectedArm, setSelectedArm] = useState(null)

  const [classSummary, setClassSummary] = useState([])
  const [students, setStudents] = useState([])
  const [total, setTotal] = useState(0)
  const [sessions, setSessions] = useState([])
  const [sessionId, setSessionId] = useState('')
  const [terms, setTerms] = useState([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [paymentFilter, setPaymentFilter] = useState('')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 50

  useEffect(() => {
    api.get('/academic/sessions').then(res => {
      const list = res.data.data || []
      setSessions(list)
      const active = list.find(s => s.is_active)
      if (active) setSessionId(active.id)
      else if (list.length > 0) setSessionId(list[0].id)
      else setLoading(false)
    }).catch(() => {
      setSessions([])
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!sessionId) {
      setTerms([])
      return
    }
    api.get(`/academic/terms?session_id=${sessionId}`)
      .then(res => setTerms(res.data.data || []))
      .catch(() => setTerms([]))
  }, [sessionId])

  useEffect(() => {
    if (!sessionId) return
    setLoading(true)
    const params = new URLSearchParams({ session_id: sessionId })
    api.get(`/students/class-summary?${params}`)
      .then(res => setClassSummary(res.data.data || []))
      .catch(() => setClassSummary([]))
      .finally(() => setLoading(false))
  }, [sessionId])

  const loadStudents = useCallback(async () => {
    if (view !== 'students') return
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page,
        page_size: PAGE_SIZE,
        ...(sessionId && { session_id: sessionId }),
        ...(selectedClass && { class_id: selectedClass.class_id }),
        ...(selectedArm && { arm: selectedArm }),
        ...(search && { search }),
        ...(paymentFilter && { payment_status: paymentFilter }),
      })
      const res = await api.get(`/students?${params}`)
      setStudents(res.data.data?.items || [])
      setTotal(res.data.data?.total || 0)
    } catch {
      setStudents([])
    } finally {
      setLoading(false)
    }
  }, [view, page, sessionId, selectedClass, selectedArm, search, paymentFilter])

  useEffect(() => { loadStudents() }, [loadStudents])

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1) }, 400)
    return () => clearTimeout(t)
  }, [searchInput])

  const openClass = (cls) => {
    setSelectedClass(cls)
    setSelectedArm(null)
    setPage(1)
    setSearchInput('')
    setSearch('')
    setPaymentFilter('')
    if (cls.arms && cls.arms.length > 0) setView('arms')
    else setView('students')
  }

  const openArm = (arm) => {
    setSelectedArm(arm)
    setPage(1)
    setView('students')
  }

  const goBack = () => {
    if (view === 'students' && selectedArm) {
      setSelectedArm(null)
      setView('arms')
    } else if (view === 'students' || view === 'arms') {
      setSelectedClass(null)
      setSelectedArm(null)
      setView('classes')
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const selectedSession = sessions.find(s => s.id === sessionId)
  const termNames = terms.map(t => t.name).filter(Boolean)
  const termScope = termNames.length > 0 ? `Terms: ${termNames.join(', ')}` : 'Terms: all configured terms'
  const scopeSubtitle = selectedSession?.name ? `${selectedSession.name} • ${termScope}` : termScope

  const Breadcrumb = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20, fontSize: 13, color: 'var(--text-muted)' }}>
      <button
        onClick={() => { setSelectedClass(null); setSelectedArm(null); setView('classes') }}
        style={{ background: 'none', border: 'none', color: view === 'classes' ? 'var(--text-primary)' : 'var(--text-muted)', cursor: 'pointer', padding: 0, fontSize: 13 }}
      >
        All Classes
      </button>
      {selectedClass && (
        <>
          <ChevronRight size={14} />
          <button
            onClick={() => selectedClass.arms?.length ? setView('arms') : null}
            style={{ background: 'none', border: 'none', color: view === 'arms' ? 'var(--text-primary)' : 'var(--text-muted)', cursor: selectedClass.arms?.length ? 'pointer' : 'default', padding: 0, fontSize: 13 }}
          >
            {selectedClass.class_name}
          </button>
        </>
      )}
      {selectedArm && (
        <>
          <ChevronRight size={14} />
          <span style={{ color: 'var(--text-primary)' }}>Arm {selectedArm}</span>
        </>
      )}
    </div>
  )

  if (view === 'classes') {
    return (
      <div className="animate-in">
        <PageHeader
          title="Students"
          subtitle={`Select a class to view students • ${scopeSubtitle}`}
          action={
            <Select value={sessionId} onChange={e => setSessionId(e.target.value)} style={{ minWidth: 180 }}>
              {sessions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          }
        />

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}><Spinner /></div>
        ) : classSummary.length === 0 ? (
          <EmptyState icon="🎓" title="No classes found" description="No students are enrolled for this session yet." />
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 28 }}>
              {[
                { label: 'Total Students', value: classSummary.reduce((s, c) => s + c.student_count, 0), color: 'var(--gold-500)' },
                { label: 'Total Invoiced', value: fmt(classSummary.reduce((s, c) => s + c.total_invoiced, 0)), color: 'var(--text-primary)' },
                { label: 'Collected', value: fmt(classSummary.reduce((s, c) => s + c.total_collected, 0)), color: 'var(--success)' },
                { label: 'Outstanding', value: fmt(classSummary.reduce((s, c) => s + c.total_outstanding, 0)), color: 'var(--danger)' },
              ].map(({ label, value, color }) => (
                <div key={label} className="card" style={{ padding: '14px 18px' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</div>
                  <div style={{ fontSize: 18, fontFamily: 'var(--font-display)', color }}>{value}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
              {classSummary.map(cls => (
                <button
                  key={cls.class_id}
                  onClick={() => openClass(cls)}
                  style={{ background: 'var(--navy-900)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 20, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s', color: 'inherit', display: 'block', width: '100%' }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--text-primary)', marginBottom: 2 }}>{cls.class_name}</div>
                      {cls.arms?.length > 0 && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {cls.arms.length} arm{cls.arms.length > 1 ? 's' : ''}: {cls.arms.map(a => a.arm).join(', ')}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                      <Users size={13} />
                      {cls.student_count}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Collection rate</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: cls.collection_rate >= 80 ? 'var(--success)' : cls.collection_rate >= 50 ? 'var(--warning)' : 'var(--danger)' }}>{cls.collection_rate}%</span>
                  </div>
                  <CollectionBar rate={cls.collection_rate} />
                  <StatusDots paid={cls.paid_count} partial={cls.partial_count} unpaid={cls.unpaid_count} />

                  {cls.total_outstanding > 0 && (
                    <div style={{ marginTop: 12, padding: '6px 10px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 11, color: 'var(--danger)' }}>Outstanding</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--danger)' }}>{fmt(cls.total_outstanding)}</span>
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginTop: 12, gap: 4, fontSize: 12, color: 'var(--gold-400)' }}>
                    View students <ChevronRight size={13} />
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    )
  }

  if (view === 'arms') {
    const cls = selectedClass
    return (
      <div className="animate-in">
        <PageHeader
          title={cls.class_name}
          subtitle={`Select an arm to view students • ${scopeSubtitle}`}
          action={<Button variant="secondary" onClick={goBack}><ArrowLeft size={15} /> All Classes</Button>}
        />
        <Breadcrumb />

        <div style={{ marginBottom: 16 }}>
          <button
            onClick={() => openArm(null)}
            style={{ background: 'var(--navy-800)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '12px 18px', cursor: 'pointer', color: 'inherit', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.15s' }}
          >
            <Users size={15} style={{ color: 'var(--gold-400)' }} />
            View all {cls.student_count} students in {cls.class_name}
            <ChevronRight size={14} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
          {cls.arms.map(arm => (
            <button key={arm.arm} onClick={() => openArm(arm.arm)} style={{ background: 'var(--navy-900)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 18, cursor: 'pointer', textAlign: 'left', color: 'inherit', transition: 'all 0.15s', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--gold-400)' }}>Arm {arm.arm}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}><Users size={12} /> {arm.student_count}</div>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>{cls.class_name} {arm.arm}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Collection</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: arm.collection_rate >= 80 ? 'var(--success)' : arm.collection_rate >= 50 ? 'var(--warning)' : 'var(--danger)' }}>{arm.collection_rate}%</span>
              </div>
              <CollectionBar rate={arm.collection_rate} height={5} />
              <StatusDots paid={arm.paid_count} partial={arm.partial_count} unpaid={arm.unpaid_count} />
            </button>
          ))}
        </div>
      </div>
    )
  }

  const tableTitle = selectedClass
    ? selectedArm
      ? `${selectedClass.class_name} — Arm ${selectedArm}`
      : selectedClass.class_name
    : 'All Students'

  return (
    <div className="animate-in">
      <PageHeader
        title={tableTitle}
        subtitle={`${total} student${total !== 1 ? 's' : ''} • ${scopeSubtitle}`}
        action={<Button variant="secondary" onClick={goBack}><ArrowLeft size={15} />{selectedArm ? ` ${selectedClass.class_name} Arms` : ' All Classes'}</Button>}
      />
      <Breadcrumb />

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input
            placeholder="Search name, admission no, guardian…"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            style={{ width: '100%', background: 'var(--navy-800)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 14px 10px 36px', color: 'var(--text-primary)', outline: 'none', fontSize: 14 }}
          />
        </div>
        <Select value={paymentFilter} onChange={e => { setPaymentFilter(e.target.value); setPage(1) }} style={{ minWidth: 140 }}>
          <option value="">All statuses</option>
          <option value="paid">Paid</option>
          <option value="partial">Partial</option>
          <option value="unpaid">Unpaid</option>
        </Select>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
        ) : students.length === 0 ? (
          <EmptyState icon="👨‍🎓" title="No students found" description={search ? 'Try a different search term.' : 'No students match the selected filters.'} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Adm. No.</th>
                  {!selectedClass && <th>Class</th>}
                  {selectedClass && !selectedArm && selectedClass.arms?.length > 0 && <th>Arm</th>}
                  <th>Guardian</th>
                  <th>Phone</th>
                  <th>Fee Status</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                {students.map(s => {
                  const balanceNum = parseFloat(s.balance || 0)
                  return (
                    <tr key={s.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: `hsl(${(s.first_name?.charCodeAt(0) ?? 65) * 5 % 360}, 35%, 22%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: 'var(--gold-400)', flexShrink: 0 }}>
                            {s.first_name?.[0]}{s.last_name?.[0]}
                          </div>
                          <div>
                            <div style={{ fontWeight: 500, fontSize: 14 }}>{s.first_name} {s.last_name}</div>
                            <div style={{ fontSize: 11, color: `${s.status === 'active' ? 'var(--success)' : 'var(--text-muted)'}` }}>{s.status}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-secondary)' }}>{s.admission_number}</td>
                      {!selectedClass && <td style={{ fontSize: 13 }}>{s.class_arm_name || '—'}</td>}
                      {selectedClass && !selectedArm && selectedClass.arms?.length > 0 && (
                        <td>{s.arm ? <span style={{ background: 'rgba(212,168,67,0.1)', color: 'var(--gold-400)', border: '1px solid rgba(212,168,67,0.2)', borderRadius: 12, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>Arm {s.arm}</span> : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}</td>
                      )}
                      <td style={{ fontSize: 13 }}>{s.guardian_name || '—'}</td>
                      <td>
                        {s.guardian_phone ? (
                          <a href={`tel:${s.guardian_phone}`} style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-secondary)', fontSize: 13 }}>
                            <Phone size={12} /> {s.guardian_phone}
                          </a>
                        ) : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                      </td>
                      <td>
                        {s.payment_status ? (
                          <span className={`badge badge-${s.payment_status === 'paid' ? 'paid' : s.payment_status === 'partial' ? 'partial' : 'unpaid'}`}>
                            {s.payment_status}
                          </span>
                        ) : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>No invoice</span>}
                      </td>
                      <td style={{ fontWeight: balanceNum > 0 ? 600 : 400, color: balanceNum > 0 ? 'var(--danger)' : 'var(--success)', fontSize: 13 }}>
                        {s.payment_status ? fmt(balanceNum) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Page {page} of {totalPages} — {total} students</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="secondary" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 1}>← Prev</Button>
              <Button variant="secondary" size="sm" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>Next →</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
