// super-admin/src/pages/Team.jsx
// Platform Admin only — manage platform team (support staff etc.)
// Shows capability matrix for platform roles.

import { useState, useEffect } from 'react'
import { UserPlus, Check, X, UserX, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react'
import { PLATFORM_PERMISSIONS, PLATFORM_ROLE_OPTIONS, roleInfo } from '../lib/permissions'
import api from '../lib/api'
import toast from 'react-hot-toast'

// Re-use same UI primitives as school dashboard (same design system)
import { PageHeader, Button, Input, Modal, EmptyState, Spinner } from '../components/ui'

export default function Team() {
  const [members, setMembers]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [showMatrix, setShowMatrix] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get('/platform/team')
      setMembers(res.data.data || [])
    } catch {
      setMembers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleDeactivate = async (id, isActive) => {
    const action = isActive ? 'deactivate' : 'reactivate'
    if (!window.confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} this team member?`)) return
    try {
      await api.patch(`/platform/team/${id}`, { is_active: !isActive })
      toast.success(`Team member ${action}d`)
      load()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Action failed')
    }
  }

  const handleRoleChange = async (id, newRole) => {
    try {
      await api.patch(`/platform/team/${id}`, { role: newRole })
      toast.success('Role updated')
      load()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed')
    }
  }

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Permanently remove ${name} from platform team?\n\nThis cannot be undone.`)) return
    try {
      await api.delete(`/platform/team/${id}`)
      toast.success(`${name} removed`)
      load()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to remove member')
    }
  }

  return (
    <div className="animate-in">
      <PageHeader
        title="Platform Team"
        subtitle="Manage who has access to the SchoolPay admin panel"
        action={
          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="secondary" onClick={() => setShowMatrix(true)}>
              Role Guide
            </Button>
            <Button onClick={() => setShowInvite(true)}>
              <UserPlus size={15} /> Add Team Member
            </Button>
          </div>
        }
      />

      {/* Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total Members', value: members.length, color: 'var(--gold-500)' },
          { label: 'Active', value: members.filter(m => m.is_active).length, color: 'var(--success)' },
          { label: 'Admins', value: members.filter(m => m.role === 'platform_admin').length, color: 'var(--gold-400)' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card" style={{ padding: '14px 18px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 22, fontFamily: 'var(--font-display)', color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
        ) : members.length === 0 ? (
          <EmptyState icon="🛡️" title="No team members yet" description="Add your first platform team member." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Team Member</th>
                  <th>Role</th>
                  <th>Last Login</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map(m => {
                  const info = roleInfo(m.role)
                  return (
                    <tr key={m.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 34, height: 34, borderRadius: '50%',
                            background: `${info.color}20`,
                            border: `1px solid ${info.color}40`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 13, fontWeight: 600, color: info.color,
                          }}>
                            {m.full_name?.[0]?.toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 500 }}>{m.full_name}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <select
                          value={m.role}
                          onChange={e => handleRoleChange(m.id, e.target.value)}
                          style={{
                            background: `${info.color}15`,
                            border: `1px solid ${info.color}30`,
                            color: info.color,
                            borderRadius: 20, padding: '3px 10px',
                            fontSize: 12, fontWeight: 500, cursor: 'pointer', outline: 'none',
                          }}
                        >
                          {PLATFORM_ROLE_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}
                              style={{ background: 'var(--navy-800)', color: 'var(--text-primary)' }}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {m.last_login
                          ? new Date(m.last_login).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: '2-digit' })
                          : 'Never'}
                      </td>
                      <td>
                        <span className={`badge ${m.is_active ? 'badge-paid' : 'badge-unpaid'}`}>
                          {m.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <Button
                            variant={m.is_active ? 'danger' : 'success'}
                            size="sm"
                            onClick={() => handleDeactivate(m.id, m.is_active)}
                          >
                            {m.is_active
                              ? <><UserX size={13} /> Deactivate</>
                              : <><RefreshCw size={13} /> Reactivate</>
                            }
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleDelete(m.id, m.full_name)}
                            title="Permanently remove this team member"
                            style={{ padding: '4px 8px' }}
                          >
                            <Trash2 size={13} />
                          </Button>
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

      {showInvite && <InviteTeamModal onClose={() => { setShowInvite(false); load() }} />}
      {showMatrix && <PlatformRoleMatrixModal onClose={() => setShowMatrix(false)} />}
    </div>
  )
}

// ── Invite Modal ───────────────────────────────────────────────────────────
function InviteTeamModal({ onClose }) {
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'platform_support' })
  const [loading, setLoading] = useState(false)

  const handle = async (e) => {
    e.preventDefault()
    if (form.password.length < 8) return toast.error('Password must be at least 8 characters')
    setLoading(true)
    try {
      await api.post('/platform/team', form)
      toast.success(`${form.full_name} added to platform team`)
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create user')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title="Add Team Member" onClose={onClose} width={480}>
      <form onSubmit={handle} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Input label="Full Name" placeholder="Tunde Adeyemi" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} required />
        <Input label="Email Address" type="email" placeholder="tunde@schoolpay.ng" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
        <Input label="Temporary Password" type="password" placeholder="Min. 8 characters" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />

        {/* Role cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Role</label>
          {PLATFORM_ROLE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setForm(f => ({ ...f, role: opt.value }))}
              style={{
                background: form.role === opt.value ? `${opt.color}15` : 'var(--navy-800)',
                border: `1px solid ${form.role === opt.value ? opt.color + '50' : 'var(--border)'}`,
                borderRadius: 'var(--radius-md)', padding: '12px 14px',
                cursor: 'pointer', textAlign: 'left', color: 'inherit', transition: 'all 0.15s',
                display: 'flex', alignItems: 'flex-start', gap: 10,
              }}
            >
              <div style={{
                width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                background: form.role === opt.value ? opt.color : 'var(--navy-700)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {form.role === opt.value && <Check size={11} color="#000" />}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: form.role === opt.value ? opt.color : 'var(--text-primary)', marginBottom: 2 }}>{opt.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{opt.description}</div>
              </div>
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading}><UserPlus size={14} /> Add Member</Button>
        </div>
      </form>
    </Modal>
  )
}

// ── Platform Role Matrix ───────────────────────────────────────────────────
const PLATFORM_CAP_LABELS = {
  view_all_schools:     'View All Schools',
  activate_school:      'Activate School',
  suspend_school:       'Suspend School',
  view_revenue:         'View Revenue',
  manage_subscriptions: 'Manage Subscriptions',
  manage_team:          'Manage Team',
  impersonate_school:   'View School Data',
}

function PlatformRoleMatrixModal({ onClose }) {
  const roles = Object.entries(PLATFORM_PERMISSIONS)
  const caps = Object.keys(PLATFORM_CAP_LABELS)

  return (
    <Modal title="Platform Role Capabilities" onClose={onClose} width={580}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Capability</th>
              {roles.map(([role, meta]) => (
                <th key={role} style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <div style={{ color: meta.color, fontWeight: 600, fontSize: 12 }}>{meta.label}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {caps.map((cap, i) => (
              <tr key={cap} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                <td style={{ padding: '9px 12px', color: 'var(--text-secondary)' }}>{PLATFORM_CAP_LABELS[cap]}</td>
                {roles.map(([role, meta]) => (
                  <td key={role} style={{ padding: '9px 12px', textAlign: 'center' }}>
                    {meta.can[cap]
                      ? <Check size={15} style={{ color: 'var(--success)', margin: '0 auto' }} />
                      : <X size={13} style={{ color: 'var(--text-muted)', opacity: 0.4, margin: '0 auto' }} />
                    }
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 16, textAlign: 'right' }}>
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </div>
    </Modal>
  )
}
