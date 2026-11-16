import { t } from '../i18n'
import { currentUser, signIn } from './auth'
import { runtimeConfig } from './config'

/**
 * Keston Admin's own backend (the Admin API, only for this app): every request
 * goes here, and it passes it to
 * the right service (Keston ID, and later Keston's other apps) or splits it
 * between several. Signing in is the exception: it goes straight to Keston ID
 * (lib/auth.ts). KESTON_API_URL (on the server, or VITE_API_URL when built) is its
 * address when it's on its own site (the API lists this site in
 * KESTON_API_ORIGINS); without it, it's /api on this
 * origin, passed on by Caddy or the dev server. Each request carries the
 * Keston ID access token.
 */
const apiUrl = (runtimeConfig().apiUrl || import.meta.env.VITE_API_URL)?.replace(/\/+$/, '')
const API = apiUrl ? `${apiUrl}/v1` : '/api'


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
  /** Its main domain. */
  domain: string
  /** Every domain its users can have (when there's more than the main one). */
  domains?: string[]
  passwordPolicy: PasswordPolicy
  profileEditing: ProfileEditing
  /** How new users' usernames are suggested from their names: a formula, e.g. {first}.{last}. */
  usernameFormat: string
  userCount: number
  createdAt: string
  /** Whether you have any permission here (Keston support: through a support account). */
  canManage?: boolean
  /** What you can do here (from getOrganisation). */
  permissions?: PermissionId[]
  /** The Keston Group's own organisation (can't be deleted). */
  isPlatform: boolean
  /** Deletion scheduled: it goes on deleteAfter unless a global admin signs in. */
  deletionRequestedAt?: string
  deleteAfter?: string
}

/** forced: on, can't be turned off · enabled: on, each person can turn it off · disabled: off. */
export type AppMode = 'forced' | 'enabled' | 'disabled'

export interface AppInfo {
  id: string
  name: string
  publisher: string
  verification: 'owned' | 'verified' | 'none'
  /** One of Keston's own apps: forced unless set otherwise. */
  builtin: boolean
  /** Added by this organisation (its own SSO apps). */
  own: boolean
  protocol: 'oidc' | 'saml'
  logoUrl: string
}

export interface Group {
  id: string
  name: string
  memberCount: number
  createdAt: string
  /** What its users can do in Keston Admin. */
  permissions: PermissionId[]
}

export interface AppAccess {
  apps: AppInfo[]
  groups: Group[]
  policies: {
    /** The organisation's default, per app. */
    default: Record<string, AppMode>
    /** Per group, per app: overrides the default for the group's members. */
    groups: Record<string, Record<string, AppMode>>
  }
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
  /** Your support account in this organisation (Keston staff), if access is allowed. */
  supportAccount?: { email: string; expiresAt: string } | null
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
  /** Multi-factor authentication is on: an authenticator app, or any passkey. */
  mfa: boolean
  /** How many passkeys and security keys they have. */
  passkeys: number
  locked: boolean
  createdAt: string
  passwordChangedAt: string
  avatar?: string
  /** A temporary Keston support account, and when it ends. */
  support: boolean
  expiresAt?: string
  /** You can change them (in lists and one user): your permissions cover theirs. */
  canChange?: boolean
  /** The products they have a licence for (lists and one user). */
  licences?: string[]
  /** Their admin roles, besides global admin (lists and one user). */
  roles?: string[]
}

/** A built-in admin role: a named set of Keston Admin permissions, given to a user. */
export interface AdminRole {
  id: string
  label: string
  description: string
  permissions: PermissionId[]
}

/** An app someone has (or is kept from): from their licences and app access. */
export interface UserApp {
  id: string
  name: string
  publisher: string
  access: 'forced' | 'enabled' | 'disabled' | 'no_licence'
}

/** One of Keston's products (e.g. Keston Work): someone needs a licence to use it. */
export interface Product {
  id: string
  name: string
  publisher: string
  /** How many of the organisation's users have a licence for it. */
  assigned: number
}

export interface Me {
  user: User
  platformAdmin: boolean
  organisation: Organisation
  /** What you can do in your own organisation. */
  permissions: PermissionId[]
}

/** Keston Admin permissions, given to groups. Global admins have them all. */
export type PermissionId =
  | 'users.view'
  | 'users.create'
  | 'users.edit'
  | 'users.reset_password'
  | 'users.mfa'
  | 'users.access_pass'
  | 'users.licences'
  | 'users.status'
  | 'users.delete'
  | 'groups.manage'
  | 'permissions.assign'
  | 'apps.manage'
  | 'policy.manage'
  | 'settings.manage'
  | 'reports.view'

/** Whether MFA is required: the organisation's default, and per group (null: use the default). */
/** off: nobody must; required: everyone (after the grace period); custom: rules (today, per group). */
export type MfaMode = 'off' | 'required' | 'custom'

export interface MfaPolicy {
  mode: MfaMode
  /** Required: days to set up MFA before it's enforced at their next sign-in (0: straight away). */
  gracePeriodDays: number
  /** Custom rules: "Everyone else", for anyone no rule matches. */
  required: boolean
}

/**
 * An MFA custom rule. Tried in order; the first enabled one whose conditions
 * all match decides whether MFA is required. A condition left empty matches
 * anyone / anywhere.
 */
export interface MfaRule {
  id: string
  name: string
  enabled: boolean
  /** Require MFA (true), or don't (false). */
  require: boolean
  users: string[]
  groups: string[]
  apps: string[]
  /** IP addresses or ranges, e.g. 203.0.113.7/32 or 10.0.0.0/8. */
  ipRanges: string[]
}

/** What a rule can be about: the organisation's users, groups and apps. */
export interface MfaRuleOptions {
  users: { id: string; name: string; extra?: string }[]
  groups: { id: string; name: string }[]
  apps: { id: string; name: string; extra?: string }[]
}

/** A temporary access pass: signs someone in without their password or MFA. The code is only shown once. */
export interface AccessPass {
  id: string
  oneTime: boolean
  /** Who issued it (if they're still here). */
  createdBy?: string | null
  createdAt: string
  expiresAt: string
  lastUsedAt?: string | null
  revokedAt?: string | null
  /** Can still be used to sign in. */
  active: boolean
}

/** What a user must do at their next sign-in, and their access passes from the last week. */
export interface SignInState {
  passwordChangeRequired: boolean
  mfaRequired: boolean
  accessPasses: AccessPass[]
}

export interface Permission {
  id: PermissionId
  label: string
  description: string
}

/** One user, with their groups and permissions, and whether you can change them. */
export interface UserDetail extends User {
  groups: Group[]
  permissions: PermissionId[]
  canChange: boolean
  licences: string[]
  roles: string[]
}

/** A user in Deleted users: kept 30 days, then removed for good. */
export interface DeletedUser extends User {
  deletedAt: string
  /** When they're removed for good. */
  purgeAfter: string
  deletedByName?: string
}

/** Bulk actions on users, each its own endpoint. */
export type BulkAction = 'reset-password' | 'disable' | 'enable' | 'add-to-group' | 'remove-from-group' | 'delete'

/** What happened to one user in a bulk action. */
export interface BulkResult {
  id: string
  name: string
  email: string
  result: 'done' | 'skipped'
  /** Why they were skipped. */
  reason?: string
  /** Reset passwords only: their new password, shown once. */
  password?: string
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
    throw new ApiError(res.status, data.error ?? 'error', data.message ?? t('errors.generic'), data.field)
  }
  return data as T
}

/** Self-service sign-up: no sign-in needed (Keston ID rate limits it). */
async function publicRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API}/public${path}`, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'network', "Couldn't reach Keston. Check your connection and try again.")
  }
  return parse<T>(res)
}

export async function request<T>(method: string, path: string, body?: unknown | Blob): Promise<T> {
  const user = await currentUser()
  if (!user) {
    await signIn()
    throw new ApiError(401, 'signed_out', t('errors.signingIn'))
  }
  let res: Response
  try {
    res = await fetch(`${API}${path}`, {
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
    throw new ApiError(401, 'signed_out', t('errors.signingInAgain'))
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
  user: (orgId: string, userId: string) => request<UserDetail>('GET', `${org(orgId)}/users/${userId}`),
  permissions: () => request<Permission[]>('GET', '/permissions'),
  updateUser: (orgId: string, userId: string, changes: { name?: string; username?: string; role?: User['role'] }) =>
    request<User>('PATCH', `${org(orgId)}/users/${userId}`, changes),
  setUserPicture: (orgId: string, userId: string, file: File) =>
    request<User>('PUT', `${org(orgId)}/users/${userId}/picture`, file),
  removeUserPicture: (orgId: string, userId: string) => request<void>('DELETE', `${org(orgId)}/users/${userId}/picture`),

  apps: (orgId: string) => request<AppAccess>('GET', `${org(orgId)}/apps`),
  /** Sets the default (no groupId) or a group's access to an app; mode '' removes the setting. */
  setAppAccess: (orgId: string, appId: string, mode: AppMode | '', groupId?: string) =>
    request<void>('PUT', `${org(orgId)}/apps/${encodeURIComponent(appId)}`, { mode, groupId }),

  groups: (orgId: string) => request<Group[]>('GET', `${org(orgId)}/groups`),
  group: (orgId: string, groupId: string) =>
    request<{ group: Group; members: User[] }>('GET', `${org(orgId)}/groups/${groupId}`),
  createGroup: (orgId: string, name: string) => request<Group>('POST', `${org(orgId)}/groups`, { name }),
  renameGroup: (orgId: string, groupId: string, name: string) =>
    request<void>('PATCH', `${org(orgId)}/groups/${groupId}`, { name }),
  deleteGroup: (orgId: string, groupId: string) => request<void>('DELETE', `${org(orgId)}/groups/${groupId}`),
  addMember: (orgId: string, groupId: string, userId: string) =>
    request<void>('PUT', `${org(orgId)}/groups/${groupId}/members/${userId}`, {}),
  setGroupPermissions: (orgId: string, groupId: string, permissions: PermissionId[]) =>
    request<Group>('PUT', `${org(orgId)}/groups/${groupId}/permissions`, { permissions }),
  removeMember: (orgId: string, groupId: string, userId: string) =>
    request<void>('DELETE', `${org(orgId)}/groups/${groupId}/members/${userId}`),
  settings: (orgId: string) =>
    request<{ profileEditing: ProfileEditing; usernameFormat: string }>('GET', `${org(orgId)}/settings`),
  saveSettings: (orgId: string, profileEditing: ProfileEditing) =>
    request<{ profileEditing: ProfileEditing; usernameFormat: string }>('PUT', `${org(orgId)}/settings`, { profileEditing }),
  saveUsernameFormat: (orgId: string, usernameFormat: string) =>
    request<{ profileEditing: ProfileEditing; usernameFormat: string }>('PUT', `${org(orgId)}/settings`, { usernameFormat }),

  support: (orgId: string) => request<Support>('GET', `${org(orgId)}/support`),
  requestSupport: (orgId: string, reason: string) => request<void>('POST', `${org(orgId)}/support/requests`, { reason }),
  decideSupport: (orgId: string, requestId: string, decision: 'approve' | 'deny', days?: number) =>
    request<void>('POST', `${org(orgId)}/support/requests/${requestId}/${decision}`, days ? { days } : {}),
  revokeSupport: (orgId: string) => request<void>('POST', `${org(orgId)}/support/revoke`, {}),
  /** A Keston ID link that opens your support account in this organisation. */
  openSupportAccount: (orgId: string) => request<{ url: string }>('POST', `${org(orgId)}/support/open`, {}),
  scheduleDeletion: (orgId: string, confirm: string) =>
    request<{ deleteAfter: string }>('POST', `${org(orgId)}/deletion`, { confirm }),
  cancelDeletion: (orgId: string) => request<void>('DELETE', `${org(orgId)}/deletion`),
  startLockout: (orgId: string, reason: string) => request<LockoutRequest>('POST', `${org(orgId)}/lockout`, { reason }),
  decideLockout: (orgId: string, lockoutId: string, decision: 'deny' | 'cancel') =>
    request<void>('POST', `${org(orgId)}/lockout/${lockoutId}/${decision}`, {}),

  notifications: () => request<AdminNotification[]>('GET', '/notifications'),
  readNotifications: () => request<void>('POST', '/notifications/read', {}),
  clearNotifications: () => request<void>('DELETE', '/notifications'),
  /** requirePasswordChange: they choose their own password when they first sign in. */
  createUser: (
    orgId: string,
    body: {
      name: string
      username: string
      role: User['role']
      /** Keston ID makes one up (meeting the policy): it's in the response, once. */
      generatePassword: boolean
      password?: string
      requirePasswordChange: boolean
      /** Products to give them a licence for (needs users.licences). */
      licences?: string[]
      /** Admin roles, besides global admin (role). */
      roles?: string[]
    },
  ) => request<User & { password?: string }>('POST', `${org(orgId)}/users`, body),
  userApps: (orgId: string, userId: string) => request<UserApp[]>('GET', `${org(orgId)}/users/${userId}/apps`),
  roles: (orgId: string) => request<AdminRole[]>('GET', `${org(orgId)}/roles`),
  setRoles: (orgId: string, userId: string, roles: string[]) =>
    request<{ roles: string[] }>('PUT', `${org(orgId)}/users/${userId}/roles`, { roles }),
  products: (orgId: string) => request<Product[]>('GET', `${org(orgId)}/products`),
  setLicences: (orgId: string, userId: string, products: string[]) =>
    request<{ licences: string[] }>('PUT', `${org(orgId)}/users/${userId}/licences`, { products }),
  /** Set a password, or with `generatePassword` have Keston ID make one up: returned once. */
  resetPassword: (
    orgId: string,
    userId: string,
    body: { password?: string; generatePassword?: boolean; requirePasswordChange: boolean },
  ) => request<{ password?: string } | undefined>('POST', `${org(orgId)}/users/${userId}/reset-password`, body),

  signInState: (orgId: string, userId: string) => request<SignInState>('GET', `${org(orgId)}/users/${userId}/sign-in`),
  requirePasswordChange: (orgId: string, userId: string, required = true) =>
    request<void>('POST', `${org(orgId)}/users/${userId}/require-password-change`, { required }),
  /** A new access pass for 1–8 hours; the code is in this response only. */
  createAccessPass: (
    orgId: string,
    userId: string,
    body: { hours: number; oneTime: boolean; requirePasswordChange: boolean },
  ) => request<{ code: string; pass: AccessPass }>('POST', `${org(orgId)}/users/${userId}/access-passes`, body),
  revokeAccessPass: (orgId: string, userId: string, passId: string) =>
    request<void>('DELETE', `${org(orgId)}/users/${userId}/access-passes/${passId}`),
  mfaPolicy: (orgId: string) => request<MfaPolicy>('GET', `${org(orgId)}/mfa-policy`),
  /** Any of the mode, the grace period, and "Everyone else" (custom rules' default). */
  setMfaPolicy: (orgId: string, change: { mode?: MfaMode; gracePeriodDays?: number; required?: boolean }) =>
    request<MfaPolicy>('PUT', `${org(orgId)}/mfa-policy`, change),
  mfaRules: (orgId: string) => request<MfaRule[]>('GET', `${org(orgId)}/mfa-rules`),
  mfaRuleOptions: (orgId: string) => request<MfaRuleOptions>('GET', `${org(orgId)}/mfa-rules/options`),
  /** A new rule (no id: it goes last), or a change to one. */
  saveMfaRule: (orgId: string, rule: Omit<MfaRule, 'id'> & { id?: string }) =>
    rule.id
      ? request<MfaRule>('PUT', `${org(orgId)}/mfa-rules/${rule.id}`, rule)
      : request<MfaRule>('POST', `${org(orgId)}/mfa-rules`, rule),
  deleteMfaRule: (orgId: string, id: string) => request<void>('DELETE', `${org(orgId)}/mfa-rules/${id}`),
  /** Every rule's id, in the order they're tried. */
  orderMfaRules: (orgId: string, ids: string[]) => request<MfaRule[]>('PUT', `${org(orgId)}/mfa-rules/order`, { ids }),
  /** Turns off a user's MFA, e.g. when they've lost their authenticator. */
  disableMfa: (orgId: string, userId: string) => request<User>('POST', `${org(orgId)}/users/${userId}/mfa/disable`, {}),
  /** Removes all of a user's passkeys and security keys (their authenticator app stays). */
  removePasskeys: (orgId: string, userId: string) => request<User>('DELETE', `${org(orgId)}/users/${userId}/passkeys`, {}),
  setStatus: (orgId: string, userId: string, status: User['status']) =>
    request<void>('POST', `${org(orgId)}/users/${userId}/status`, { status }),
  /** Kept 30 days in Deleted users, where they can be restored. */
  deleteUser: (orgId: string, userId: string) => request<void>('DELETE', `${org(orgId)}/users/${userId}`),
  /** One bulk action; groupId for adding to or removing from a group. */
  bulk: (orgId: string, action: BulkAction, userIds: string[], groupId?: string) =>
    request<{ results: BulkResult[] }>('POST', `${org(orgId)}/users/bulk/${action}`, { userIds, groupId }),
  /** Without a password, each gets their own (in the results, once). */
  bulkResetPassword: (orgId: string, userIds: string[], opts: { password?: string; requirePasswordChange: boolean }) =>
    request<{ results: BulkResult[] }>('POST', `${org(orgId)}/users/bulk/reset-password`, { userIds, ...opts }),
  /** Add a list of members, each with their own password (in the results, once). */
  bulkCreate: (
    orgId: string,
    body: {
      users: { name: string; username: string; domain?: string }[]
      /** One password for everyone; leave out for each their own. */
      password?: string
      licences: string[]
      requirePasswordChange: boolean
    },
  ) => request<{ results: BulkResult[] }>('POST', `${org(orgId)}/users/bulk/create`, body),
  /** Add everyone to some groups and take them out of others. */
  bulkGroups: (orgId: string, userIds: string[], add: string[], remove: string[]) =>
    request<{ results: BulkResult[] }>('POST', `${org(orgId)}/users/bulk/groups`, { userIds, add, remove }),
  deletedUsers: (orgId: string) => request<DeletedUser[]>('GET', `${org(orgId)}/deleted-users`),
  restoreUsers: (orgId: string, userIds: string[]) =>
    request<{ results: BulkResult[] }>('POST', `${org(orgId)}/deleted-users/restore`, { userIds }),

  policy: (orgId: string) =>
    request<{ policy: PasswordPolicy; rules: Rule[]; baselineMinLength: number }>('GET', `${org(orgId)}/password-policy`),
  savePolicy: (orgId: string, policy: PasswordPolicy) =>
    request<{ policy: PasswordPolicy; rules: Rule[]; baselineMinLength: number }>(
      'PUT',
      `${org(orgId)}/password-policy`,
      policy,
    ),
}

// ── The organisation's own apps (OpenID Connect and SAML) ────────────────

export type OwnAppType = 'web' | 'native'

export interface OwnApp {
  id: string
  name: string
  protocol: 'oidc' | 'saml'
  logoUrl: string
  privacyUrl: string
  termsUrl: string
  oidc?: {
    /** web: a server-side app with a secret · native: single-page or mobile, PKCE. */
    type: OwnAppType
    clientId: string
    hasSecret: boolean
    issuer: string
    discoveryUrl: string
    redirectUris: string[]
    postLogoutRedirectUris: string[]
    scopes: string[]
  }
  saml?: {
    entityId: string
    acsUrl: string
    /** Where its metadata came from ('' when pasted or typed in). */
    metadataUrl: string
    /** What to give the app. */
    idp: {
      entityId: string
      metadataUrl: string
      ssoUrl: string
      startUrl: string
      certificate: string
      nameIdFormat: string
      attributes: string[]
    }
  }
}

export interface OwnAppChanges {
  name?: string
  logoUrl?: string
  privacyUrl?: string
  termsUrl?: string
  type?: OwnAppType
  redirectUris?: string[]
  postLogoutRedirectUris?: string[]
  scopes?: string[]
  metadataUrl?: string
  metadataXml?: string
  entityId?: string
  acsUrl?: string
}

/** A new or changed app; clientSecret only when one was just made (shown once). */
type SavedOwnApp = { app: OwnApp; clientSecret?: string }

export const ownApps = {
  list: (orgId: string) => request<OwnApp[]>('GET', `${org(orgId)}/own-apps`),
  get: (orgId: string, appId: string) => request<SavedOwnApp>('GET', `${org(orgId)}/own-apps/${encodeURIComponent(appId)}`),
  create: (orgId: string, protocol: OwnApp['protocol'], body: OwnAppChanges) =>
    request<SavedOwnApp>('POST', `${org(orgId)}/own-apps`, { protocol, ...body }),
  update: (orgId: string, appId: string, body: OwnAppChanges) =>
    request<SavedOwnApp>('PATCH', `${org(orgId)}/own-apps/${encodeURIComponent(appId)}`, body),
  remove: (orgId: string, appId: string) => request<void>('DELETE', `${org(orgId)}/own-apps/${encodeURIComponent(appId)}`),
  /** A new secret; the old one stops working. */
  newSecret: (orgId: string, appId: string) =>
    request<SavedOwnApp>('POST', `${org(orgId)}/own-apps/${encodeURIComponent(appId)}/secret`),
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
