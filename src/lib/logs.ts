import { request } from './api'

/**
 * Logs (permission reports.view): what admins did, and every sign-in
 * attempt. Keston ID keeps them for a year.
 */

export interface AuditEntry {
  id: number
  action: string
  /** Who did it; null: Keston ID itself. */
  actorId: string | null
  actorName: string
  actorEmail: string
  /** Done through a Keston support account: the Keston staff member. */
  supportStaffId: string | null
  supportStaffName: string | null
  targetType: 'user' | 'group' | 'app' | 'organisation' | ''
  targetId: string | null
  targetName: string
  /** A short before → after, e.g. "Status: Active → Disabled". */
  summary: string
  ip: string
  createdAt: string
}

export type SignInMethod = 'password' | 'mfa' | 'backup_code' | 'passkey' | 'access_pass' | 'support' | 'app'

export interface SignInEntry {
  id: number
  userId: string | null
  userName: string
  email: string
  method: SignInMethod
  clientId: string | null
  clientName: string | null
  success: boolean
  reason: string
  supportStaffName: string | null
  ip: string
  userAgent: string
  createdAt: string
}

export interface LogPage<T> {
  entries: T[]
  /** Pass as `before` for the next page; null: no more. */
  next: string | null
}

export interface LogFilters {
  user?: string
  /** Dates, YYYY-MM-DD (both days included). */
  from?: string
  to?: string
  before?: string
  limit?: number
}

const query = (f: Record<string, string | number | undefined>) => {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== '') q.set(k, String(v))
  const s = q.toString()
  return s ? `?${s}` : ''
}

const org = (id: string) => `/organisations/${encodeURIComponent(id)}`

export const logsApi = {
  auditLog: (orgId: string, f: LogFilters & { action?: string } = {}) =>
    request<LogPage<AuditEntry>>('GET', `${org(orgId)}/audit-log${query({ ...f })}`),
  signIns: (orgId: string, f: LogFilters & { result?: 'success' | 'failure'; reason?: string } = {}) =>
    request<LogPage<SignInEntry>>('GET', `${org(orgId)}/sign-ins${query({ ...f })}`),
}

// ── Labels ─────────────────────────────────────────────────────────────────

/** Admin actions, grouped as the filter shows them. */
export const actionGroups: { label: string; actions: Record<string, string> }[] = [
  {
    label: 'Users',
    actions: {
      'user.created': 'User added',
      'user.updated': 'User edited',
      'user.picture_changed': 'Profile picture changed',
      'user.picture_removed': 'Profile picture removed',
      'user.password_reset': 'Password reset',
      'user.disabled': 'User disabled',
      'user.enabled': 'User enabled',
      'user.mfa_disabled': 'MFA turned off',
      'user.passkeys_removed': 'Passkeys removed',
      'user.password_change_required': 'Password change at next sign-in',
      'user.access_pass_issued': 'Access pass issued',
      'user.access_pass_revoked': 'Access pass revoked',
      'user.deleted': 'User deleted',
      'user.restored': 'User restored',
    },
  },
  {
    label: 'Groups',
    actions: {
      'group.created': 'Group created',
      'group.renamed': 'Group renamed',
      'group.deleted': 'Group deleted',
      'group.member_added': 'Added to a group',
      'group.member_removed': 'Removed from a group',
      'group.permissions_changed': 'Group permissions changed',
    },
  },
  {
    label: 'Organisation',
    actions: {
      'organisation.created': 'Organisation created',
      'app.access_changed': 'App access changed',
      'settings.changed': 'Settings changed',
      'password_policy.changed': 'Password policy changed',
      'mfa_policy.changed': 'MFA requirement changed',
      'deletion.scheduled': 'Deletion scheduled',
      'deletion.cancelled': 'Deletion cancelled',
    },
  },
  {
    label: 'Your apps',
    actions: {
      'own_app.created': 'App added',
      'own_app.updated': 'App changed',
      'own_app.deleted': 'App deleted',
      'own_app.secret_changed': 'App secret changed',
    },
  },
  {
    label: 'Keston support',
    actions: {
      'support.requested': 'Support access requested',
      'support.allowed': 'Support access allowed',
      'support.declined': 'Support access declined',
      'support.ended': 'Support access ended',
      'support.opened': 'Support account opened',
      'lockout.started': 'Lockout procedure started',
      'lockout.denied': 'Lockout procedure denied',
      'lockout.cancelled': 'Lockout procedure cancelled',
      'lockout.completed': 'Lockout procedure went through',
    },
  },
]

const actionLabels: Record<string, string> = Object.assign({}, ...actionGroups.map((g) => g.actions))
export const actionLabel = (a: string) => actionLabels[a] ?? a

export const methodLabels: Record<SignInMethod, string> = {
  password: 'Password',
  mfa: 'MFA code',
  backup_code: 'Backup code',
  passkey: 'Passkey',
  access_pass: 'Access pass',
  support: 'Support account',
  app: 'App',
}

export const reasonLabels: Record<string, string> = {
  unknown_user: 'No such user',
  wrong_password: 'Wrong password',
  locked: 'Locked out',
  disabled: 'User disabled',
  expired: 'Support access ended',
  support_account: 'Support account (no password)',
  mfa_failed: 'Wrong code',
  wrong_access_pass: 'Wrong or expired access pass',
  app_disabled: 'App turned off for them',
}
export const reasonLabel = (r: string) => reasonLabels[r] ?? r

/** "Chrome on macOS", from a user agent; "" if unknown. */
export function device(ua: string): string {
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : ''
  const os = /iPhone|iPad/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac OS X/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /CrOS/.test(ua)
            ? 'ChromeOS'
            : /Linux/.test(ua)
              ? 'Linux'
              : ''
  return [browser, os].filter(Boolean).join(' on ')
}
