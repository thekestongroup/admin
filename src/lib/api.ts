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

/** An organisation's dashboard numbers (GET …/summary): counts only. */
export interface OrganisationSummary {
  users: { total: number; active: number; disabled: number; locked: number; passwordChangeRequired: number }
  mfa: {
    mode: 'off' | 'required' | 'custom'
    /** Users who can sign in, and how many of them have an authenticator app or a passkey. */
    eligible: number
    enrolled: number
  }
  groups: number
  apps: { enabled: number; available: number }
  licences: {
    inUse: number
    licensedUsers: number
    /** People a group gives a licence to who have no seat left. */
    unlicensed: number
    unlicensedByProduct: Record<string, number>
  }
  signIns: {
    /** The last 7 days (UTC): everything, and the failed ones. */
    total: number
    failed: number
    /** One per day, oldest first. date is YYYY-MM-DD. */
    daily: { date: string; success: number; failed: number }[]
  }
  /** The latest admin actions; null without See logs (reports.view). */
  recentActivity: import('./logs').AuditEntry[] | null
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
  /** Verified by Keston staff. Until then its people can't sign in. Always true for The Keston Group. */
  verified: boolean
  verifiedAt?: string
  /** Its people may be guests in other organisations (Security → Guests). */
  allowGuests?: boolean
}

/** Someone invited to be a guest in an organisation, or a guest there. */
export interface Guest {
  id: string
  organisationId: string
  organisationName: string
  organisationDomain: string
  userId: string
  name: string
  email: string
  homeOrganisationId: string
  homeOrganisationName: string
  /** Admin roles this organisation gave them (Keston Admin there). */
  roles: string[]
  status: 'pending' | 'accepted' | 'declined' | 'removed'
  invitedByName: string
  createdAt: string
  /** Their home organisation allows guests right now; if not, it's on hold. */
  active: boolean
}

/** An organisation you can open: your own, or one you're a guest in. */
export interface MyOrganisation {
  id: string
  name: string
  domain: string
  home: boolean
  guestId?: string
  /** You have some permission in Keston Admin there. */
  canManage: boolean
}

/** A request to move an account to another organisation. */
export interface AccountMove {
  id: string
  userId: string
  name: string
  oldEmail: string
  newEmail: string
  fromOrganisationId: string
  fromOrganisationName: string
  toOrganisationId: string
  toOrganisationName: string
  status: 'pending' | 'accepted' | 'declined' | 'cancelled'
  requestedByName: string
  decidedByName: string
  createdAt: string
  decidedAt?: string
}

/** What needs your answer; popup is true until its pop-up has been shown. */
export interface Prompts {
  guestInvitations: (Guest & { popup: boolean })[]
  moveRequests: (AccountMove & { popup: boolean })[]
}

/** Platform-wide settings (platform admins only). */
export interface PlatformSettings {
  /** Organisations that sign themselves up start unverified. */
  requireOrganisationVerification: boolean
}

/** forced: on, can't be turned off · enabled: on, each person can turn it off · disabled: off. */
export type AppMode = 'forced' | 'enabled' | 'disabled'

export interface AppInfo {
  id: string
  name: string
  publisher: string
  description: string
  verification: 'owned' | 'verified' | 'none'
  /** One of Keston's own apps: forced unless set otherwise. */
  builtin: boolean
  /** Added by this organisation (its own SSO apps). */
  own: boolean
  protocol: 'oidc' | 'saml'
  logoUrl: string
  /** Who publishes it: The Keston Group, this organisation (its own apps) or someone else. */
  publisherKind: 'keston' | 'organisation' | 'other'
  /** web: has a secret · native: single-page or mobile · saml. */
  type: 'web' | 'native' | 'saml'
  /** The organisation's default: '' when not set. */
  defaultMode: AppMode | ''
  /** What it is when not set: forced for Keston's own apps, else '' (people choose). */
  fallback: AppMode | ''
  ruleCount: number
  /** Registered for every organisation. */
  kestonWide: boolean
  /** Keston-wide apps: 'deployment' (deploy/clients.json, read-only) or 'admin' (TKG Admins). */
  managedBy: 'deployment' | 'admin'
  retired: boolean
  /** You can change it in Keston Admin (a TKG Admin, for an app managed in Keston Admin). */
  canManage: boolean
}

export interface Group {
  id: string
  name: string
  memberCount: number
  createdAt: string
  /** What its users can do in Keston Admin. */
  permissions: PermissionId[]
}

export interface AppRequestPlan {
  addToRule: boolean
  assignLicence: boolean
  seatsLeft: number | null
  noSeats: boolean
  alreadyAccess: boolean
}

export interface AppRequest {
  id: string
  userId: string
  userName: string
  userEmail: string
  clientId: string
  appName: string
  reason: string
  status: 'pending' | 'approved' | 'declined'
  decisionMessage: string
  decidedByName: string
  decidedAt?: string
  addedToRule: boolean
  licenceAssigned: boolean
  createdAt: string
  /** Pending only: what approving will do. */
  plan?: AppRequestPlan
}

export interface AppRequestResult {
  id: string
  name: string
  app: string
  result: 'done' | 'skipped'
  reason?: string
}

export interface AppRequestSettings {
  enabled: boolean
  excluded: string[]
}

export interface AppAccess {
  apps: AppInfo[]
  /** A TKG Admin in The Keston Group: can add and manage Keston-wide apps. */
  canManageKeston: boolean
}

/**
 * An app access rule. Tried in order; the first turned-on one whose
 * conditions all match gives the person's access to the app (otherwise the
 * app's default). A condition left empty matches anyone / anywhere.
 */
export interface AppRule {
  id: string
  name: string
  enabled: boolean
  mode: AppMode
  users: string[]
  groups: string[]
  /** IP addresses or ranges, e.g. 203.0.113.7/32 or 10.0.0.0/8. */
  ipRanges: string[]
}

/** What an app rule can be about: the organisation's users and groups. */
export interface AppRuleOptions {
  users: { id: string; name: string; extra?: string }[]
  groups: { id: string; name: string }[]
}

/** A Keston-wide app, as TKG Admins see it. */
export interface KestonApp {
  id: string
  name: string
  description: string
  publisher: string
  type: 'web' | 'native'
  logoUrl: string
  privacyUrl: string
  termsUrl: string
  redirectUris: string[]
  postLogoutRedirectUris: string[]
  scopes: string[]
  managedBy: 'deployment' | 'admin'
  retired: boolean
  hasSecret: boolean
  issuer: string
  discoveryUrl: string
}

export interface KestonAppChanges {
  name?: string
  description?: string
  type?: 'web' | 'native'
  logoUrl?: string
  privacyUrl?: string
  termsUrl?: string
  redirectUris?: string[]
  postLogoutRedirectUris?: string[]
  scopes?: string[]
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

export type ServiceId = 'keston-id' | 'keston-admin' | 'keston-forms' | 'learn' | 'work' | 'apps'
export const serviceIds: ServiceId[] = ['keston-id', 'keston-admin', 'keston-forms', 'learn', 'work', 'apps']
export type ServiceState = 'operational' | 'degraded' | 'outage' | 'maintenance'
export type IncidentStatus = 'investigating' | 'identified' | 'monitoring' | 'resolved'
export type IncidentImpact = 'degraded' | 'outage'

export interface IncidentUpdate {
  id: string
  status: IncidentStatus
  message: string
  author: string
  createdAt: string
}

export interface Incident {
  id: string
  title: string
  impact: IncidentImpact
  status: IncidentStatus
  services: ServiceId[]
  createdAt: string
  resolvedAt?: string | null
  /** Newest first. */
  updates: IncidentUpdate[]
}

export interface Maintenance {
  id: string
  title: string
  description: string
  services: ServiceId[]
  startsAt: string
  endsAt: string
}

export interface Health {
  services: { id: ServiceId; status: ServiceState }[]
  incidents: Incident[]
  maintenance: Maintenance[]
  canManage: boolean
}

export type MessageCategory = 'feature' | 'change' | 'action_required' | 'notice'

export interface KestonMessage {
  id: string
  title: string
  /** Markdown (a safe subset: see lib/markdown.ts). */
  body: string
  category: MessageCategory
  /** YYYY-MM-DDT00:00:00Z, or null. */
  actionBy?: string | null
  allOrganisations: boolean
  organisationIds: string[]
  author: string
  createdAt: string
  updatedAt: string
  read?: boolean
  archived?: boolean
}

export interface Messages {
  messages: KestonMessage[]
  unread: number
  actionRequired: KestonMessage[]
  canPost: boolean
}

export interface MessageInput {
  title: string
  body: string
  category: MessageCategory
  actionBy: string
  allOrganisations: boolean
  organisationIds: string[]
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
  /** How many of the organisation's users have a licence for it (licences in use). */
  assigned: number
  /** The licences the organisation has for it; null is unlimited. */
  seats: number | null
  unlimited: boolean
  /** Seats left (null when unlimited; 0 when full or over). */
  available: number | null
  /** More in use than seats: nothing more can be assigned until under. */
  overAllocated: boolean
  /** People a group gives it to who have no seat left. */
  unlicensed: number
  /** The groups that give it to their members. */
  groups: { id: string; name: string }[]
}

/** Where someone's licence for a product comes from. */
export interface LicenceSource {
  product: string
  name: string
  /** Assigned to them. */
  direct: boolean
  /** The groups that give it to them. */
  groups: { id: string; name: string }[]
  /** They have a seat; false: "Not licensed: no seats left". */
  licensed: boolean
}

/** A group member with no seat for a licence the group gives them. */
export interface LicenceIssue {
  userId: string
  name: string
  email: string
  products: string[]
}

export interface GroupLicences {
  products: string[]
  issues: LicenceIssue[]
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
  /** Assigned to them directly (what Manage licences edits). */
  licences: string[]
  /** Every licence, direct or from groups, with whether it has a seat. */
  licenceSources: LicenceSource[]
  roles: string[]
}

/** A user in Deleted users: kept 30 days, then removed for good. */
export interface DeletedUser extends User {
  deletedAt: string
  /** When they're removed for good. */
  purgeAfter: string
  deletedByName?: string
}

/** What the Users list can be filtered and sorted by (all optional; lists are any-of). */
export interface UserListQuery {
  q?: string
  /** 'user', 'global_admin', 'tkg_admin' or an admin role's ID. */
  role?: string[]
  status?: ('active' | 'disabled' | 'locked')[]
  /** A product's ID, or 'none'. */
  licence?: string[]
  group?: string[]
  mfa?: 'on' | 'off'
  sort?: 'name' | 'email' | 'role' | 'status' | 'created'
  dir?: 'asc' | 'desc'
}

/** What the Groups list can be filtered and sorted by. */
export interface GroupListQuery {
  q?: string
  /** A comparison and a number, e.g. 'gt:12' (more than 12). */
  members?: string
  /** Gives permissions in Keston Admin (yes) or none (no). */
  permissions?: 'yes' | 'no'
  sort?: 'name' | 'members' | 'permissions' | 'created'
  dir?: 'asc' | 'desc'
}

/** One group in a bulk membership change: who joined and who left. */
export interface GroupBulkResult {
  id: string
  name: string
  result: 'done' | 'skipped'
  reason?: string
  added: { id: string; name: string; email: string }[]
  removed: { id: string; name: string; email: string }[]
  /** How many users it has now. */
  memberCount: number
}

export interface GroupBulkResponse {
  groups: GroupBulkResult[]
  /** Users left alone (not found, or ones you can't change). */
  skippedUsers: BulkResult[]
}

/** ?a=1&b=x,y from an object: lists are comma-separated, empty values left out. */
export function queryString(query: object): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    const value = Array.isArray(v) ? v.join(',') : v
    if (value !== undefined && value !== '') q.set(k, String(value))
  }
  const s = q.toString()
  return s ? `?${s}` : ''
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
    publicRequest<{ organisation: Organisation; admin: User; awaitingVerification: boolean }>(
      'POST',
      '/organisations',
      body,
    ),
}

export type SecurityItem = {
  id: string
  weight: number
  done: boolean
  canApply: boolean
  link: string
  detail?: Record<string, number>
  canMark?: boolean
}
export type SecurityDefaults = { score: number; items: SecurityItem[]; done: number; total: number }
export type SecurityAlert = {
  id: string
  kind: string
  severity: 'info' | 'warning' | 'critical'
  subjectId: string | null
  subjectName: string
  params: Record<string, string | number>
  title: string
  body: string
  createdAt: string
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
  /** Your own organisation and the ones you're a guest in. */
  myOrganisations: () => request<{ organisations: MyOrganisation[]; canBrowseAll: boolean }>('GET', '/my-organisations'),
  guestInvitations: () => request<Guest[]>('GET', '/guest-invitations'),
  respondToInvitation: (id: string, accept: boolean) =>
    request<Guest>('POST', `/guest-invitations/${id}/${accept ? 'accept' : 'decline'}`, {}),
  /** Stop being a guest in an organisation. */
  leaveGuest: (guestId: string) => request<void>('POST', `/guest-memberships/${guestId}/leave`, {}),
  prompts: () => request<Prompts>('GET', '/prompts'),
  promptSeen: (kind: 'guest_invitation' | 'account_move', id: string) => request<void>('POST', '/prompts/seen', { kind, id }),
  guests: (orgId: string) => request<Guest[]>('GET', `${org(orgId)}/guests`),
  inviteGuest: (orgId: string, email: string) => request<Guest>('POST', `${org(orgId)}/guests`, { email }),
  removeGuest: (orgId: string, guestId: string) => request<void>('DELETE', `${org(orgId)}/guests/${guestId}`),
  setGuestRoles: (orgId: string, guestId: string, roles: string[]) =>
    request<Guest>('PUT', `${org(orgId)}/guests/${guestId}/roles`, { roles }),
  domains: (orgId: string) => request<{ domains: OrgDomain[]; canOverride: boolean }>('GET', `${org(orgId)}/domains`),
  addDomain: (orgId: string, domain: string, override: boolean) =>
    request<OrgDomain>('POST', `${org(orgId)}/domains`, { domain, override }),
  verifyDomain: (orgId: string, id: string) => request<OrgDomain>('POST', `${org(orgId)}/domains/${id}/verify`, {}),
  makePrimaryDomain: (orgId: string, id: string, renameUsers: boolean) =>
    request<OrgDomain>('POST', `${org(orgId)}/domains/${id}/primary`, { renameUsers }),
  removeDomain: (orgId: string, id: string) => request<void>('DELETE', `${org(orgId)}/domains/${id}`),
  securityDefaults: (orgId: string) => request<SecurityDefaults>('GET', `${org(orgId)}/security/defaults`),
  applySecurityDefaults: (orgId: string, items: string[]) =>
    request<{ results: { id: string; result: string }[]; state: SecurityDefaults }>(
      'POST',
      `${org(orgId)}/security/defaults/apply`,
      { items },
    ),
  markSignInsReviewed: (orgId: string) => request<SecurityDefaults>('POST', `${org(orgId)}/security/defaults/sign-in-review`),
  securityAlerts: (orgId: string, query: string) =>
    request<{ items: SecurityAlert[]; next: string | null }>('GET', `${org(orgId)}/security/alerts${query}`),
  guestSettings: (orgId: string) => request<{ allowGuests: boolean }>('GET', `${org(orgId)}/guest-settings`),
  setGuestSettings: (orgId: string, allowGuests: boolean) =>
    request<{ allowGuests: boolean }>('PUT', `${org(orgId)}/guest-settings`, { allowGuests }),
  moves: (orgId: string) => request<AccountMove[]>('GET', `${org(orgId)}/moves`),
  requestMove: (orgId: string, userId: string, domain: string) =>
    request<AccountMove>('POST', `${org(orgId)}/users/${userId}/move`, { domain }),
  decideMove: (orgId: string, moveId: string, decision: 'accept' | 'decline' | 'cancel') =>
    request<AccountMove | void>('POST', `${org(orgId)}/moves/${moveId}/${decision}`, {}),
  organisation: (id: string) => request<Organisation>('GET', org(id)),
  summary: (id: string) => request<OrganisationSummary>('GET', `${org(id)}/summary`),
  platformSettings: () => request<PlatformSettings>('GET', '/platform-settings'),
  savePlatformSettings: (settings: PlatformSettings) => request<PlatformSettings>('PUT', '/platform-settings', settings),
  /** Verify an organisation (platform admins). */
  verifyOrganisation: (id: string) => request<Organisation>('POST', `${org(id)}/verify`, {}),


  /** The users, filtered and sorted by Keston ID (see UserListQuery). */
  users: (orgId: string, query: UserListQuery = {}) => request<User[]>('GET', `${org(orgId)}/users${queryString(query)}`),
  user: (orgId: string, userId: string) => request<UserDetail>('GET', `${org(orgId)}/users/${userId}`),
  permissions: () => request<Permission[]>('GET', '/permissions'),
  updateUser: (orgId: string, userId: string, changes: { name?: string; username?: string; role?: User['role']; platformAdmin?: boolean }) =>
    request<User>('PATCH', `${org(orgId)}/users/${userId}`, changes),
  setUserPicture: (orgId: string, userId: string, file: File) =>
    request<User>('PUT', `${org(orgId)}/users/${userId}/picture`, file),
  removeUserPicture: (orgId: string, userId: string) => request<void>('DELETE', `${org(orgId)}/users/${userId}/picture`),

  appRequests: (orgId: string, query = '') => request<AppRequest[]>('GET', `${org(orgId)}/app-requests${query}`),
  appRequestCount: (orgId: string) => request<{ pending: number }>('GET', `${org(orgId)}/app-requests/count`),
  decideAppRequest: (
    orgId: string,
    id: string,
    decision: 'approve' | 'decline',
    body: { message?: string; addToRule?: boolean; assignLicence?: boolean } = {},
  ) => request<AppRequest>('POST', `${org(orgId)}/app-requests/${encodeURIComponent(id)}/${decision}`, body),
  bulkAppRequests: (orgId: string, ids: string[], action: 'approve' | 'decline', message = '') =>
    request<{ results: AppRequestResult[] }>('POST', `${org(orgId)}/app-requests/bulk`, { ids, action, message }),
  appRequestSettings: (orgId: string) => request<AppRequestSettings>('GET', `${org(orgId)}/app-request-settings`),
  setAppRequestSettings: (orgId: string, settings: AppRequestSettings) =>
    request<AppRequestSettings>('PUT', `${org(orgId)}/app-request-settings`, settings),
  apps: (orgId: string) => request<AppAccess>('GET', `${org(orgId)}/apps`),
  app: (orgId: string, appId: string) => request<AppInfo>('GET', `${org(orgId)}/apps/${encodeURIComponent(appId)}`),
  /** Sets the organisation's default for an app; mode '' removes the setting. */
  setAppAccess: (orgId: string, appId: string, mode: AppMode | '') =>
    request<void>('PUT', `${org(orgId)}/apps/${encodeURIComponent(appId)}`, { mode }),
  appRules: (orgId: string, appId: string) =>
    request<AppRule[]>('GET', `${org(orgId)}/apps/${encodeURIComponent(appId)}/rules`),
  appRuleOptions: (orgId: string, appId: string) =>
    request<AppRuleOptions>('GET', `${org(orgId)}/apps/${encodeURIComponent(appId)}/rules/options`),
  saveAppRule: (orgId: string, appId: string, rule: Omit<AppRule, 'id'> & { id?: string }) =>
    rule.id
      ? request<AppRule>('PUT', `${org(orgId)}/apps/${encodeURIComponent(appId)}/rules/${rule.id}`, rule)
      : request<AppRule>('POST', `${org(orgId)}/apps/${encodeURIComponent(appId)}/rules`, rule),
  deleteAppRule: (orgId: string, appId: string, id: string) =>
    request<void>('DELETE', `${org(orgId)}/apps/${encodeURIComponent(appId)}/rules/${id}`),
  /** Every rule of the app, in the order they're tried. */
  orderAppRules: (orgId: string, appId: string, ids: string[]) =>
    request<AppRule[]>('PUT', `${org(orgId)}/apps/${encodeURIComponent(appId)}/rules/order`, { ids }),

  /** The groups, filtered and sorted by Keston ID (see GroupListQuery). */
  groups: (orgId: string, query: GroupListQuery = {}) => request<Group[]>('GET', `${org(orgId)}/groups${queryString(query)}`),
  /** Add users to, and take users out of, several groups at once. */
  bulkGroupMembers: (orgId: string, groupIds: string[], add: string[], remove: string[]) =>
    request<GroupBulkResponse>('POST', `${org(orgId)}/groups/bulk/members`, { groupIds, add, remove }),
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
  /** TKG Admins: delete an organisation that's scheduled for deletion now, skipping the wait. */
  deleteOrganisationNow: (orgId: string) => request<void>('POST', `${org(orgId)}/delete-now`, {}),
  startLockout: (orgId: string, reason: string) => request<LockoutRequest>('POST', `${org(orgId)}/lockout`, { reason }),
  decideLockout: (orgId: string, lockoutId: string, decision: 'deny' | 'cancel') =>
    request<void>('POST', `${org(orgId)}/lockout/${lockoutId}/${decision}`, {}),

  health: () => request<Health>('GET', '/health'),
  openIncident: (b: { title: string; impact: IncidentImpact; status: IncidentStatus; services: ServiceId[]; message: string }) =>
    request<Incident>('POST', '/health/incidents', b),
  updateIncident: (id: string, b: { status: IncidentStatus; impact?: IncidentImpact; message: string }) =>
    request<Incident>('POST', `/health/incidents/${id}/updates`, b),
  scheduleMaintenance: (b: { title: string; description: string; services: ServiceId[]; startsAt: string; endsAt: string }) =>
    request<Maintenance>('POST', '/health/maintenance', b),
  cancelMaintenance: (id: string) => request<void>('DELETE', `/health/maintenance/${id}`),
  messages: () => request<Messages>('GET', '/messages'),
  allMessages: () => request<KestonMessage[]>('GET', '/messages/all'),
  setMessageState: (id: string, action: 'read' | 'unread' | 'archive' | 'unarchive') =>
    request<void>('POST', `/messages/${id}/${action}`, {}),
  postMessage: (b: MessageInput) => request<KestonMessage>('POST', '/messages', b),
  editMessage: (id: string, b: MessageInput) => request<KestonMessage>('PUT', `/messages/${id}`, b),
  deleteMessage: (id: string) => request<void>('DELETE', `/messages/${id}`),
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
      /** TKG Admin: a global admin of The Keston Group who sees every organisation. */
      platformAdmin?: boolean
      /** Keston ID makes one up (meeting the policy): it's in the response, once. */
      generatePassword: boolean
      password?: string
      requirePasswordChange: boolean
      /** Products to give them a licence for (needs users.licences). */
      licences?: string[]
      /** Admin roles, besides global admin (role). */
      roles?: string[]
      /** One of its verified domains (default: the primary one). */
      domain?: string
    },
  ) => request<User & { password?: string }>('POST', `${org(orgId)}/users`, body),
  userApps: (orgId: string, userId: string) => request<UserApp[]>('GET', `${org(orgId)}/users/${userId}/apps`),
  roles: (orgId: string) => request<AdminRole[]>('GET', `${org(orgId)}/roles`),
  setRoles: (orgId: string, userId: string, roles: string[]) =>
    request<{ roles: string[] }>('PUT', `${org(orgId)}/users/${userId}/roles`, { roles }),
  products: (orgId: string) => request<Product[]>('GET', `${org(orgId)}/products`),
  /** TKG Admins only: how many licences the organisation has per product (seats null: unlimited). */
  setAllocations: (orgId: string, allocations: { product: string; seats: number | null }[]) =>
    request<Product[]>('PUT', `${org(orgId)}/licences`, { allocations }),
  groupLicences: (orgId: string, groupId: string) => request<GroupLicences>('GET', `${org(orgId)}/groups/${groupId}/licences`),
  setGroupLicences: (orgId: string, groupId: string, products: string[]) =>
    request<GroupLicences>('PUT', `${org(orgId)}/groups/${groupId}/licences`, { products }),
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
  bulkLicences: (orgId: string, userIds: string[], add: string[], remove: string[]) =>
    request<{ results: BulkResult[] }>('POST', `${org(orgId)}/users/bulk/licences`, { userIds, add, remove }),
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
  description: string
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
  description?: string
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

// ── Keston-wide apps (TKG Admins, in The Keston Group) ───────────────────

type SavedKestonApp = { app: KestonApp; clientSecret?: string }

export const kestonApps = {
  get: (orgId: string, appId: string) =>
    request<SavedKestonApp>('GET', `${org(orgId)}/keston-apps/${encodeURIComponent(appId)}`),
  create: (orgId: string, body: KestonAppChanges) => request<SavedKestonApp>('POST', `${org(orgId)}/keston-apps`, body),
  update: (orgId: string, appId: string, body: KestonAppChanges) =>
    request<SavedKestonApp>('PATCH', `${org(orgId)}/keston-apps/${encodeURIComponent(appId)}`, body),
  /** A new secret, shown once; the old one stops working. */
  newSecret: (orgId: string, appId: string) =>
    request<SavedKestonApp>('POST', `${org(orgId)}/keston-apps/${encodeURIComponent(appId)}/secret`),
  retire: (orgId: string, appId: string) =>
    request<SavedKestonApp>('POST', `${org(orgId)}/keston-apps/${encodeURIComponent(appId)}/retire`),
  restore: (orgId: string, appId: string) =>
    request<SavedKestonApp>('POST', `${org(orgId)}/keston-apps/${encodeURIComponent(appId)}/restore`),
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

/**
 * Where to start: your own organisation if you can manage it, otherwise the
 * first organisation you're a guest in and can manage (undefined: none).
 */
export async function landingOrganisation(): Promise<string | undefined> {
  const me = await loadMe()
  if (me.platformAdmin || me.permissions.length) return me.organisation.id
  const mine = await api.myOrganisations().catch(() => undefined)
  return mine?.organisations.find((o) => o.canManage)?.id
}

/** One of an organisation's domains (Settings → Domains). */
export interface OrgDomain {
  id: string
  domain: string
  primary: boolean
  verified: boolean
  verifiedAt?: string
  verifiedByName?: string
  /** Verified by a TKG Admin without DNS. */
  override: boolean
  createdAt: string
  /** People whose email uses it. */
  userCount: number
  /** The TXT record to create, while it isn't verified. */
  record?: { name: string; value: string }
}
