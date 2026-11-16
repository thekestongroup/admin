/**
 * Where Keston ID and the Admin API are. The server says, from its own
 * settings (KESTON_ID_URL and KESTON_API_URL: see deploy/Caddyfile), so the
 * same build works anywhere. Not set (or no server, as in local development):
 * the build-time VITE_ID_URL / VITE_API_URL, then the defaults in
 * lib/auth.ts and lib/api.ts.
 */
export interface RuntimeConfig {
  idUrl?: string
  apiUrl?: string
}

let config: RuntimeConfig = {}

export async function loadConfig() {
  try {
    const res = await fetch('/config.json', { cache: 'no-store' })
    if (res.ok && res.headers.get('content-type')?.includes('json')) config = await res.json()
  } catch {
    // Nothing to read: use the defaults.
  }
}

export const runtimeConfig = () => config
