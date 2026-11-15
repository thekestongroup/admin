import { currentUser, signIn } from './auth'

/**
 * Keston ID's admin API, at /api on this origin (Caddy passes it to Keston
 * ID). Each request carries the Keston ID access token.
 */

export interface Rule {
  id: string
  label: string
  /** Keston's own rule: every organisation has it. */
  baseline: boolean
}

export interface RuleResult extends Rule {
  met: boolean
}

export interface PasswordPolicy {
  minLength: number
  minUppercase: number
  minLowercase: number
  minDigits: number
  minSpecial: number
  blocked: string[]
}

export interface ProfileEditing {
  name: boolean
  email: boolean
  picture: boolean
}

export interface Organisation {
  id: string
  name: string
  domain: string
  passwordPolicy: PasswordPolicy
  profileEditing: ProfileEditing
  userCount: number
  createdAt: string
  /** Whether you can see and manage its users (Keston support: only with approved access). */
  canManage?: boolean
}

export interface AppSummary {
  id: string
  name: string
  publisher: string
  verification: 'owned' | 'verified' | 'none'
}

export interface OrganisationApps {
  builtin: AppSummary[]
  organisation: { app: AppSummary; mode: 'enabled' | 'optional'; addedAt: string }[]
  available: AppSummary[]
}

export interface SupportRequest {
  id: string
  requester?: string
  reason: string
  status: 'pending' | 'approved' | 'denied' | 'revoked'
  via: 'request' | 'lockout'
  decidedAt?: string
  expiresAt?: string
  createdAt: string
}

export interface LockoutRequest {
  id: string
  requester?: string
  reason: string
  status: 'pending' | 'denied' | 'completed' | 'cancelled'
  effectiveAt: string
  decidedAt?: string
  createdAt: string
}

export interface Support {
  access: { active: boolean; until?: string }
  requests: SupportRequest[]
  lockouts: LockoutRequest[]
  canManage: boolean
}

export interface AdminNotification {
  id: string
  type: 'info' | 'success' | 'warning' | 'error'
  title: string
  body: string
  link: string
  readAt?: string
  createdAt: string
}

export interface User {
  id: string
  email: string
  username: string
  name: string
  role: 'member' | 'global_admin'
  platformAdmin: boolean
  status: 'active' | 'disabled'
  /** Multi-factor authentication (an authenticator app) is on. */
  mfa: boolean
  locked: boolean
  createdAt: string
  passwordChangedAt: string
  avatar?: string
}

export interface Me {
  user: User
  platformAdmin: boolean
  organisation: Organisation
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly field?: string

  constructor(status: number, code: string, message: string, field?: string) {
    super(message)
    this.status = status
    this.code = code
    this.field = field
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiError(res.status, data.error ?? 'error', data.message ?? 'Something went wrong. Try again.', data.field)
  }
  return data as T
}

/** Self-service sign-up: no sign-in needed (Keston ID rate limits it). */
async function publicRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api/public${path}`, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'network', "Couldn't reach Keston. Check your connection and try again.")
  }
  return parse<T>(res)
}

async function request<T>(method: string, path: string, body?: unknown | Blob): Promise<T> {
  const user = await currentUser()
  if (!user) {
    await signIn()
    throw new ApiError(401, 'signed_out', 'Signing you in…')
  }
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${user.access_token}`,
        ...(body === undefined ? {} : { 'Content-Type': body instanceof Blob ? body.type : 'application/json' }),
      },
      body: body === undefined ? undefined : body instanceof Blob ? body : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'network', "Couldn't reach Keston ID. Check your connection and try again.")
  }
  // Token expired or revoked: sign in again (quick while Keston ID still
  // has a session), then come back here.
  if (res.status === 401) {
    await signIn()
    throw new ApiError(401, 'signed_out', 'Signing you in again…')
  }
  return parse<T>(res)
}

const org = (id: string) => `/organisations/${encodeURIComponent(id)}`

type NewOrganisation = {
  name: string
  domain: string
  adminName: string
  adminUsername: string
  adminPassword: string
}

/** Self-service sign-up (admin.keston.co/create-organisation). */
export const publicApi = {
  domain: (domain: string) =>
    publicRequest<{ domain: string; valid: boolean; available: boolean; message?: string }>(
      'GET',
      `/domains/${encodeURIComponent(domain)}`,
    ),
  passwordCheck: (password: string, username?: string) =>
    publicRequest<RuleResult[]>('POST', '/password-check', { password, username }),
  createOrganisation: (body: NewOrganisation) =>
    publicRequest<{ organisation: Organisation; admin: User }>('POST', '/organisations', body),
}

export const api = {
  me: () => request<Me>('GET', '/me'),
  passwordCheck: (password: string, opts: { organisationId?: string; username?: string } = {}) =>
    request<RuleResult[]>('POST', '/password-check', { password, ...opts }),
  domain: (domain: string) =>
    request<{ domain: string; valid: boolean; available: boolean; message?: string }>(
      'GET',
      `/domains/${encodeURIComponent(domain)}`,
    ),

  organisations: () => request<Organisation[]>('GET', '/organisations'),
  organisation: (id: string) => request<Organisation>('GET', org(id)),


  users: (orgId: string) => request<User[]>('GET', `${org(orgId)}/users`),
  user: (orgId: string, userId: string) => request<User>('GET', `${org(orgId)}/users/${userId}`),
  updateUser: (orgId: string, userId: string, changes: { name?: string; username?: string; role?: User['role'] }) =>
    request<User>('PATCH', `${org(orgId)}/users/${userId}`, changes),
  setUserPicture: (orgId: string, userId: string, file: File) =>
    request<User>('PUT', `${org(orgId)}/users/${userId}/picture`, file),
  removeUserPicture: (orgId: string, userId: string) => request<void>('DELETE', `${org(orgId)}/users/${userId}/picture`),

  apps: (orgId: string) => request<OrganisationApps>('GET', `${org(orgId)}/apps`),
  setApp: (orgId: string, appId: string, mode: 'enabled' | 'optional') =>
    request<void>('PUT', `${org(orgId)}/apps/${encodeURIComponent(appId)}`, { mode }),
  removeApp: (orgId: string, appId: string) => request<void>('DELETE', `${org(orgId)}/apps/${encodeURIComponent(appId)}`),
  settings: (orgId: string) => request<{ profileEditing: ProfileEditing }>('GET', `${org(orgId)}/settings`),
  saveSettings: (orgId: string, profileEditing: ProfileEditing) =>
    request<{ profileEditing: ProfileEditing }>('PUT', `${org(orgId)}/settings`, { profileEditing }),

  support: (orgId: string) => request<Support>('GET', `${org(orgId)}/support`),
  requestSupport: (orgId: string, reason: string) => request<void>('POST', `${org(orgId)}/support/requests`, { reason }),
  decideSupport: (orgId: string, requestId: string, decision: 'approve' | 'deny', days?: number) =>
    request<void>('POST', `${org(orgId)}/support/requests/${requestId}/${decision}`, days ? { days } : {}),
  revokeSupport: (orgId: string) => request<void>('POST', `${org(orgId)}/support/revoke`, {}),
  startLockout: (orgId: string, reason: string) => request<LockoutRequest>('POST', `${org(orgId)}/lockout`, { reason }),
  decideLockout: (orgId: string, lockoutId: string, decision: 'deny' | 'cancel') =>
    request<void>('POST', `${org(orgId)}/lockout/${lockoutId}/${decision}`, {}),

  notifications: () => request<AdminNotification[]>('GET', '/notifications'),
  readNotifications: () => request<void>('POST', '/notifications/read', {}),
  clearNotifications: () => request<void>('DELETE', '/notifications'),
  createUser: (orgId: string, body: { name: string; username: string; password: string; role: User['role'] }) =>
    request<User>('POST', `${org(orgId)}/users`, body),
  resetPassword: (orgId: string, userId: string, password: string) =>
    request<void>('POST', `${org(orgId)}/users/${userId}/reset-password`, { password }),
  /** Turns off a user's MFA, e.g. when they've lost their authenticator. */
  disableMfa: (orgId: string, userId: string) => request<User>('POST', `${org(orgId)}/users/${userId}/mfa/disable`, {}),
  setStatus: (orgId: string, userId: string, status: User['status']) =>
    request<void>('POST', `${org(orgId)}/users/${userId}/status`, { status }),

  policy: (orgId: string) =>
    request<{ policy: PasswordPolicy; rules: Rule[]; baselineMinLength: number }>('GET', `${org(orgId)}/password-policy`),
  savePolicy: (orgId: string, policy: PasswordPolicy) =>
    request<{ policy: PasswordPolicy; rules: Rule[]; baselineMinLength: number }>(
      'PUT',
      `${org(orgId)}/password-policy`,
      policy,
    ),
}

/** The signed-in admin, loaded once. */
let mePromise: Promise<Me> | undefined
export function loadMe(force = false) {
  if (force || !mePromise) mePromise = api.me().catch((e) => {
    mePromise = undefined
    throw e
  })
  return mePromise
}
