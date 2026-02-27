// src/pages/Users.jsx
// School Admin only — manage staff accounts.
// Features: list staff, invite new user, deactivate, change role.
// Role capability matrix shown inline so admin understands what they're assigning.

import { useState, useEffect } from 'react'
import {
  UserPlus, ShieldCheck, MoreVertical,
  UserX, RefreshCw, Check, X, Info,
} from 'lucide-react'
import { PageHeader, Button, Input, Select, Modal, EmptyState, Spinner } from '../components/ui'
import { SCHOOL_PERMISSIONS, SCHOOL_ROLE_OPTIONS, roleInfo } from '../lib/permissions'
import api from '../lib/api'
import toast from 'react-hot-toast'

export default function Users() {
  const [users, setUsers]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [actionUser, setActionUser] = useState(null)   // user being acted on
  const [showMatrix, setShowMatrix] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get('/users')
      setUsers(res.data.data || [])
    } catch {
      setUsers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleDeactivate = async (userId, currentActive) => {
    const action = currentActive ? 'deactivate' : 'reactivate'
    if (!window.confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} this user?`)) return
    try {
      await api.patch(`/users/${userId}`, { is_active: !currentActive })
      toast.success(`User ${action}d`)
      load()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Action failed')
    }
  }

  const handleRoleChange = async (userId, newRole) => {
    try {
      await api.patch(`/users/${userId}`, { role: newRole })
      toast.success('Role updated')
      load()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update role')
    }
  }

  const activeCount   = users.filter(u => u.is_active).length
  const inactiveCount = users.filter(u => !u.is_active).length

  return (
    <div className="animate-in">
      <PageHeader
        title="Staff Management"
        subtitle="Invite and manage your school's staff accounts"
        action={
          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="secondary" onClick={() => setShowMatrix(true)}>
              <Info size={15} /> Role Guide
            </Button>
            <Button onClick={() => setShowInvite(true)}>
              <UserPlus size={15} /> Invite Staff
            </Button>
          </div>
        }
      />

      {/* Summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total Staff', value: users.length, color: 'var(--gold-500)' },
          { label: 'Active', value: activeCount, color: 'var(--success)' },
          { label: 'Inactive', value: inactiveCount, color: 'var(--text-muted)' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card" style={{ padding: '14px 18px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 22, fontFamily: 'var(--font-display)', color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Staff table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
        ) : users.length === 0 ? (
          <EmptyState icon="👤" title="No staff yet" description="Invite your first staff member to get started." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Staff Member</th>
                  <th>Role</th>
                  <th>Phone</th>
                  <th>Last Login</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const info = roleInfo(u.role)
                  return (
                    <tr key={u.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 34, height: 34, borderRadius: '50%',
                            background: `${info.color}20`,
                            border: `1px solid ${info.color}40`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 13, fontWeight: 600, color: info.color,
                            flexShrink: 0,
                          }}>
                            {u.full_name?.[0]?.toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 500, fontSize: 14 }}>{u.full_name}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        {/* Inline role changer */}
                        <select
                          value={u.role}
                          onChange={e => handleRoleChange(u.id, e.target.value)}
                          style={{
                            background: `${info.color}15`,
                            border: `1px solid ${info.color}30`,
                            color: info.color,
                            borderRadius: 20, padding: '3px 10px',
                            fontSize: 12, fontWeight: 500, cursor: 'pointer',
                            outline: 'none',
                          }}
                        >
                          {SCHOOL_ROLE_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}
                              style={{ background: 'var(--navy-800)', color: 'var(--text-primary)' }}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                        {u.phone || '—'}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {u.last_login
                          ? new Date(u.last_login).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: '2-digit' })
                          : 'Never'}
                      </td>
                      <td>
                        <span className={`badge ${u.is_active ? 'badge-paid' : 'badge-unpaid'}`}>
                          {u.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <Button
                          variant={u.is_active ? 'danger' : 'success'}
                          size="sm"
                          onClick={() => handleDeactivate(u.id, u.is_active)}
                        >
                          {u.is_active
                            ? <><UserX size={13} /> Deactivate</>
                            : <><RefreshCw size={13} /> Reactivate</>
                          }
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invite modal */}
      {showInvite && (
        <InviteModal onClose={() => { setShowInvite(false); load() }} />
      )}

      {/* Role capability matrix modal */}
      {showMatrix && (
        <RoleMatrixModal onClose={() => setShowMatrix(false)} />
      )}
    </div>
  )
}

// ── Invite Staff Modal ─────────────────────────────────────────────────────
function InviteModal({ onClose }) {
  const [form, setForm] = useState({
    full_name: '', email: '', phone: '', role: 'bursar', password: '',
  })
  const [loading, setLoading] = useState(false)
  const selectedRole = roleInfo(form.role)

  const handle = async (e) => {
    e.preventDefault()
    if (form.password.length < 8) return toast.error('Password must be at least 8 characters')
    setLoading(true)
    try {
      await api.post('/users', form)
      toast.success(`${form.full_name} invited as ${selectedRole.label}`)
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create user')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title="Invite Staff Member" onClose={onClose} width={520}>
      <form onSubmit={handle} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Input
            label="Full Name"
            placeholder="Amaka Okonkwo"
            value={form.full_name}
            onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
            required
          />
          <Input
            label="Phone (optional)"
            placeholder="080xxxxxxxx"
            value={form.phone}
            onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
          />
        </div>

        <Input
          label="Email Address"
          type="email"
          placeholder="amaka@greenfield.edu.ng"
          value={form.email}
          onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
          required
        />

        <Input
          label="Temporary Password"
          type="password"
          placeholder="Min. 8 characters"
          value={form.password}
          onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
          required
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Role
          </label>
          {/* Role selector cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {SCHOOL_ROLE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setForm(f => ({ ...f, role: opt.value }))}
                style={{
                  background: form.role === opt.value ? `${opt.color}15` : 'var(--navy-800)',
                  border: `1px solid ${form.role === opt.value ? opt.color + '50' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-md)', padding: '12px 14px',
                  cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                  color: 'inherit',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  {form.role === opt.value && (
                    <div style={{
                      width: 16, height: 16, borderRadius: '50%',
                      background: opt.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Check size={10} color="#000" />
                    </div>
                  )}
                  <span style={{ fontSize: 13, fontWeight: 600, color: form.role === opt.value ? opt.color : 'var(--text-primary)' }}>
                    {opt.label}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  {opt.description}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ background: 'var(--navy-800)', borderRadius: 'var(--radius-md)', padding: 12, fontSize: 12, color: 'var(--text-muted)' }}>
          💡 Share the email and password with {form.full_name || 'the staff member'} directly.
          They can change their password after first login.
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading}>
            <UserPlus size={14} /> Create Account
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// ── Role Matrix Modal ──────────────────────────────────────────────────────
const CAPABILITY_LABELS = {
  view_dashboard:       'View Dashboard',
  view_students:        'View Students',
  add_student:          'Add Student',
  edit_student:         'Edit Student',
  view_invoices:        'View Invoices',
  generate_invoices:    'Generate Invoices',
  record_cash:          'Record Cash',
  record_transfer:      'Record Transfer',
  approve_transfers:    'Approve Transfers',
  view_debtors:         'View Debtors',
  send_sms_blast:       'Send SMS Blast',
  manage_fee_structure: 'Manage Fees',
  manage_users:         'Manage Staff',
  view_activity_logs:   'Activity Logs',
  void_payment:         'Void Payment',
}

function RoleMatrixModal({ onClose }) {
  const roles = Object.entries(SCHOOL_PERMISSIONS)
  const capabilities = Object.keys(CAPABILITY_LABELS)

  return (
    <Modal title="Role Capabilities" onClose={onClose} width={700}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>
                Capability
              </th>
              {roles.map(([role, meta]) => (
                <th key={role} style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <div style={{ color: meta.color, fontWeight: 600, fontSize: 12 }}>{meta.label}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {capabilities.map((cap, i) => (
              <tr key={cap} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                <td style={{ padding: '9px 12px', color: 'var(--text-secondary)', fontSize: 13 }}>
                  {CAPABILITY_LABELS[cap]}
                </td>
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

      <div style={{ marginTop: 20, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {roles.map(([role, meta]) => (
          <div key={role} style={{
            display: 'flex', alignItems: 'flex-start', gap: 8,
            background: 'var(--navy-800)', borderRadius: 'var(--radius-md)',
            padding: '10px 14px', flex: '1 1 140px',
          }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color, marginTop: 4, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: meta.color, marginBottom: 2 }}>{meta.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>{meta.description}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16, textAlign: 'right' }}>
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </div>
    </Modal>
  )
}
