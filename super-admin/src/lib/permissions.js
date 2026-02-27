// src/lib/permissions.js
// ============================================================
// SINGLE SOURCE OF TRUTH for all role-based access control.
// Import this everywhere — never hardcode role checks inline.
//
// School roles:  school_admin | bursar | teacher | accountant
// Platform roles: platform_admin | platform_support
// ============================================================

// What each school role can do
export const SCHOOL_PERMISSIONS = {
  school_admin: {
    label: 'Administrator',
    description: 'Full access. Manages staff, fees, and all settings.',
    color: '#e8c97a',         // gold
    nav: ['dashboard', 'students', 'invoices', 'payments', 'debtors', 'approvals', 'users'],
    can: {
      view_dashboard:       true,
      view_students:        true,
      add_student:          true,
      edit_student:         true,
      view_invoices:        true,
      generate_invoices:    true,
      record_cash:          true,
      record_transfer:      true,
      approve_transfers:    true,
      view_debtors:         true,
      send_sms_blast:       true,
      manage_fee_structure: true,
      manage_users:         true,   // only admin can invite/deactivate staff
      view_activity_logs:   true,
      void_payment:         true,
    },
  },

  bursar: {
    label: 'Bursar',
    description: 'Records and approves payments. Cannot manage staff or fee structures.',
    color: '#60a5fa',         // blue
    nav: ['dashboard', 'students', 'invoices', 'payments', 'debtors', 'approvals'],
    can: {
      view_dashboard:       true,
      view_students:        true,
      add_student:          false,
      edit_student:         false,
      view_invoices:        true,
      generate_invoices:    false,
      record_cash:          true,
      record_transfer:      true,
      approve_transfers:    true,
      view_debtors:         true,
      send_sms_blast:       true,
      manage_fee_structure: false,
      manage_users:         false,
      view_activity_logs:   false,
      void_payment:         false,
    },
  },

  teacher: {
    label: 'Teacher',
    description: 'View-only access to students and fee status. Cannot record payments.',
    color: '#4ade80',         // green
    nav: ['dashboard', 'students'],
    can: {
      view_dashboard:       true,
      view_students:        true,
      add_student:          false,
      edit_student:         false,
      view_invoices:        false,
      generate_invoices:    false,
      record_cash:          false,
      record_transfer:      false,
      approve_transfers:    false,
      view_debtors:         false,
      send_sms_blast:       false,
      manage_fee_structure: false,
      manage_users:         false,
      view_activity_logs:   false,
      void_payment:         false,
    },
  },

  accountant: {
    label: 'Accountant',
    description: 'Read-only financial reports. Cannot record or approve payments.',
    color: '#f472b6',         // pink
    nav: ['dashboard', 'invoices', 'debtors'],
    can: {
      view_dashboard:       true,
      view_students:        false,
      add_student:          false,
      edit_student:         false,
      view_invoices:        true,
      generate_invoices:    false,
      record_cash:          false,
      record_transfer:      false,
      approve_transfers:    false,
      view_debtors:         true,
      send_sms_blast:       false,
      manage_fee_structure: false,
      manage_users:         false,
      view_activity_logs:   false,
      void_payment:         false,
    },
  },
}

// What each platform role can do
export const PLATFORM_PERMISSIONS = {
  platform_admin: {
    label: 'Platform Admin',
    description: 'Full platform access. Can activate/suspend schools, see all revenue.',
    color: '#e8c97a',
    nav: ['dashboard', 'schools', 'subscriptions', 'revenue', 'team'],
    can: {
      view_all_schools:     true,
      activate_school:      true,
      suspend_school:       true,
      view_revenue:         true,
      manage_subscriptions: true,
      manage_team:          true,
      impersonate_school:   true,
    },
  },

  platform_support: {
    label: 'Support Staff',
    description: 'Can view schools and help with issues. Cannot take financial actions.',
    color: '#60a5fa',
    nav: ['dashboard', 'schools'],
    can: {
      view_all_schools:     true,
      activate_school:      false,
      suspend_school:       false,
      view_revenue:         false,
      manage_subscriptions: false,
      manage_team:          false,
      impersonate_school:   false,
    },
  },
}

// ── Helpers ────────────────────────────────────────────────

/**
 * Check if a user can perform an action.
 * Usage: can(user, 'record_cash')
 */
export function can(user, action) {
  if (!user?.role) return false
  const perms = SCHOOL_PERMISSIONS[user.role] ?? PLATFORM_PERMISSIONS[user.role]
  return perms?.can?.[action] ?? false
}

/**
 * Get nav items for a role.
 * Returns array of route strings the role is allowed to see.
 */
export function allowedNav(role) {
  const perms = SCHOOL_PERMISSIONS[role] ?? PLATFORM_PERMISSIONS[role]
  return perms?.nav ?? ['dashboard']
}

/**
 * Get role metadata (label, description, color).
 */
export function roleInfo(role) {
  return SCHOOL_PERMISSIONS[role] ?? PLATFORM_PERMISSIONS[role] ?? {
    label: role, description: '', color: '#64748b',
  }
}

/**
 * All school roles as options for a <select>.
 */
export const SCHOOL_ROLE_OPTIONS = Object.entries(SCHOOL_PERMISSIONS).map(([value, meta]) => ({
  value, label: meta.label, description: meta.description, color: meta.color,
}))

/**
 * All platform roles as options for a <select>.
 */
export const PLATFORM_ROLE_OPTIONS = Object.entries(PLATFORM_PERMISSIONS).map(([value, meta]) => ({
  value, label: meta.label, description: meta.description, color: meta.color,
}))
