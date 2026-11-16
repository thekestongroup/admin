import { UserManager, WebStorageStateStore, type User } from 'oidc-client-ts'

/**
 * Signing in with Keston ID (OpenID Connect, code flow with PKCE). Keston
 * Admin is the "admin" app in Keston ID; it skips the consent prompt, as one
 * of The Keston Group's own apps.
 *
 * Keston ID's address is VITE_ID_URL (set when the app is built, e.g.
 * https://id.example.com). Without it, it comes from this one's: admin.keston.co
 * → id.keston.co, admin.keston.localhost → id.keston.localhost.
 */
export function idUrl() {
  const set = import.meta.env.VITE_ID_URL?.replace(/\/+$/, '')
  if (set) return set
  const { protocol, hostname } = window.location
  return `${protocol}//${hostname.replace(/^admin\./, 'id.')}`
}

export const userManager = new UserManager({
  authority: idUrl(),
  client_id: 'admin',
  redirect_uri: `${window.location.origin}/callback`,
  post_logout_redirect_uri: `${window.location.origin}/`,
  response_type: 'code',
  scope: 'openid profile email',
  loadUserInfo: false,
  monitorSession: false,
  // The access token lasts 15 minutes. When it runs out, signing in again
  // is a quick redirect: Keston ID still has the browser's session.
  automaticSilentRenew: false,
  userStore: new WebStorageStateStore({ store: window.sessionStorage }),
})

/** The signed-in user, if their token is still good. */
export async function currentUser(): Promise<User | null> {
  const user = await userManager.getUser()
  return user && !user.expired ? user : null
}

/** Off to Keston ID to sign in, coming back to where we were. */
export function signIn(returnTo = window.location.pathname + window.location.search) {
  return userManager.signinRedirect({ state: { returnTo } })
}

/**
 * Switch user: Keston ID's account chooser (every account signed in to this
 * browser, and "Use a different account"), then back here as the one picked.
 */
export function switchUser() {
  return userManager.signinRedirect({ prompt: 'select_account', state: { returnTo: '/' } })
}

/**
 * After Keston ID opened a support account (it's now the active account
 * there): sign in again as it, without asking which account.
 */
export async function signInAsActiveAccount(returnTo: string) {
  await userManager.removeUser()
  return userManager.signinRedirect({ prompt: 'none', state: { returnTo } })
}

export function signOut() {
  return userManager.signoutRedirect()
}
