import { t, te } from '../i18n'
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
  /** One or more users' IDs, comma-separated. */
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
  signIns: (orgId: string, f: LogFilters & { result?: 'success' | 'failure'; /** One or more reasons, comma-separated. */ reason?: string } = {}) =>
    request<LogPage<SignInEntry>>('GET', `${org(orgId)}/sign-ins${query({ ...f })}`),
}

// ── Labels ─────────────────────────────────────────────────────────────────

/** Admin actions, grouped as the filter shows them. */
const actionKeys: Record<string, string[]> = {'users': ['user.created', 'user.updated', 'user.picture_changed', 'user.picture_removed', 'user.password_reset', 'user.disabled', 'user.enabled', 'user.mfa_disabled', 'user.passkeys_removed', 'user.password_change_required', 'user.access_pass_issued', 'user.access_pass_revoked', 'user.deleted', 'user.restored', 'user.licences_changed', 'user.roles_changed'], 'groups': ['group.created', 'group.renamed', 'group.deleted', 'group.member_added', 'group.member_removed', 'group.permissions_changed', 'group.licences_changed'], 'organisation': ['organisation.created', 'organisation.verified', 'organisation.deleted_now', 'organisation.licences_changed', 'platform_settings.changed', 'app.access_changed', 'settings.changed', 'password_policy.changed', 'mfa_policy.changed', 'deletion.scheduled', 'deletion.cancelled'], 'ownApps': ['own_app.created', 'own_app.updated', 'own_app.deleted', 'own_app.secret_changed'], 'kestonApps': ['keston_app.created', 'keston_app.updated', 'keston_app.retired', 'keston_app.restored', 'keston_app.secret_changed'], 'appRequests': ['app_request.created', 'app_request.cancelled', 'app_request.approved', 'app_request.declined', 'app_request.settings_changed'], 'guests': ['guests.setting_changed', 'guest.invited', 'guest.accepted', 'guest.declined', 'guest.removed', 'guest.left', 'guest.roles_changed', 'move.requested', 'move.accepted', 'move.declined', 'move.cancelled'], 'support': ['support.requested', 'support.allowed', 'support.declined', 'support.ended', 'support.opened', 'lockout.started', 'lockout.denied', 'lockout.cancelled', 'lockout.completed']}

export const actionGroups = (): { label: string; actions: Record<string, string> }[] =>
  Object.entries(actionKeys).map(([group, actions]) => ({
    label: t(`logs.groups.${group}`),
    actions: Object.fromEntries(actions.map((a) => [a, t(`logs.actions.${a}`)])),
  }))

/** What an action is called; the action itself if it isn't known. */
export const actionLabel = (a: string) => (te(`logs.actions.${a}`) ? t(`logs.actions.${a}`) : a)

export const methodLabel = (m: string) => (te(`logs.methods.${m}`) ? t(`logs.methods.${m}`) : m)

const reasons = ['unknown_user', 'wrong_password', 'locked', 'disabled', 'expired', 'support_account', 'mfa_failed', 'wrong_access_pass', 'app_disabled', 'no_licence', 'organisation_unverified']
/** Why a sign-in failed, for the filter. */
export const reasonOptions = () => reasons.map((r) => ({ label: t(`logs.reasons.${r}`), value: r }))
export const reasonLabel = (r: string) => (te(`logs.reasons.${r}`) ? t(`logs.reasons.${r}`) : r)

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
  return browser && os ? t('logs.device', { browser, os }) : browser || os
}
