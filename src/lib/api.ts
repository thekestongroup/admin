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

export interface Organisation {
  id: string
  name: string
  domain: string
  passwordPolicy: PasswordPolicy
  userCount: number
  createdAt: string
}

export interface Account {
  id: string
  email: string
  username: string
  name: string
  role: 'member' | 'global_admin'
  platformAdmin: boolean
  status: 'active' | 'disabled'
  twoStep: boolean
  locked: boolean
  createdAt: string
  passwordChangedAt: string
}

export interface Me {
  user: Account
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

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
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
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
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
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiError(res.status, data.error ?? 'error', data.message ?? 'Something went wrong. Try again.', data.field)
  }
  return data as T
}

const org = (id: string) => `/organisations/${encodeURIComponent(id)}`

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
  createOrganisation: (body: {
    name: string
    domain: string
    adminName: string
    adminUsername: string
    adminPassword: string
  }) => request<{ organisation: Organisation; admin: Account }>('POST', '/organisations', body),

  users: (orgId: string) => request<Account[]>('GET', `${org(orgId)}/users`),
  createUser: (orgId: string, body: { name: string; username: string; password: string; role: Account['role'] }) =>
    request<Account>('POST', `${org(orgId)}/users`, body),
  resetPassword: (orgId: string, userId: string, password: string) =>
    request<void>('POST', `${org(orgId)}/users/${userId}/reset-password`, { password }),
  setStatus: (orgId: string, userId: string, status: Account['status']) =>
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
