// src/pages/Students.jsx
import { useState, useEffect, useCallback } from 'react'
import { Search, UserPlus, Phone, GraduationCap } from 'lucide-react'
import { PageHeader, Button, Input, EmptyState, Spinner } from '../components/ui'
import api, { formatDate } from '../lib/api'

export default function Students() {
  const [students, setStudents] = useState([])
  const [total, setTotal]       = useState(0)
  const [search, setSearch]     = useState('')
  const [page, setPage]         = useState(1)
  const [loading, setLoading]   = useState(true)
  const PAGE_SIZE = 20

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page, page_size: PAGE_SIZE,
        ...(search && { search }),
      })
      const res = await api.get(`/students?${params}`)
      setStudents(res.data.data?.items || res.data.data || [])
      setTotal(res.data.data?.total || 0)
    } catch {
      setStudents([])
    } finally {
      setLoading(false)
    }
  }, [page, search])

  useEffect(() => { load() }, [load])

  // Debounce search
  const [searchInput, setSearchInput] = useState('')
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1) }, 400)
    return () => clearTimeout(t)
  }, [searchInput])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="animate-in">
      <PageHeader
        title="Students"
        subtitle={`${total} students enrolled`}
      />

      {/* Search bar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input
            placeholder="Search by name or admission number…"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            style={{
              width: '100%', background: 'var(--navy-800)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
              padding: '10px 14px 10px 36px', color: 'var(--text-primary)',
              outline: 'none', fontSize: 14,
            }}
          />
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48 }}>
            <Spinner />
          </div>
        ) : students.length === 0 ? (
          <EmptyState icon="👨‍🎓" title="No students found" description={search ? 'Try a different search term.' : 'No students have been enrolled yet.'} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Admission No.</th>
                  <th>Class</th>
                  <th>Guardian</th>
                  <th>Phone</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {students.map(s => (
                  <tr key={s.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%',
                          background: `hsl(${s.first_name?.charCodeAt(0) * 5}, 40%, 25%)`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12, fontWeight: 600, color: 'var(--gold-400)',
                          flexShrink: 0,
                        }}>
                          {s.first_name?.[0]}{s.last_name?.[0]}
                        </div>
                        <div>
                          <div style={{ fontWeight: 500 }}>{s.first_name} {s.last_name}</div>
                          {s.middle_name && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.middle_name}</div>}
                        </div>
                      </div>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-secondary)' }}>{s.admission_number}</td>
                    <td style={{ fontSize: 13 }}>{s.class_name || <span style={{ color: 'var(--text-muted)' }}>Not enrolled</span>}</td>
                    <td style={{ fontSize: 13 }}>{s.guardian_name}</td>
                    <td>
                      <a href={`tel:${s.guardian_phone}`} style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-secondary)', fontSize: 13 }}>
                        <Phone size={12} /> {s.guardian_phone}
                      </a>
                    </td>
                    <td>
                      <span className={`badge badge-${s.status === 'active' ? 'paid' : 'unpaid'}`}>
                        {s.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 20px', borderTop: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Page {page} of {totalPages} — {total} students
            </span>
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
