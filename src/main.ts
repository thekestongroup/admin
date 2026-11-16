import { loadConfig } from './lib/config'

// The addresses of Keston ID and the Admin API come from the server at
// start-up (lib/config.ts), so load them before anything that reads them.
loadConfig().then(() => import('./app'))
