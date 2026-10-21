import {
  port, dbPath, nodeEnv, corsOrigins, cookieSameSite, cookieSecure,
  trustProxy, trustProxyWarning, trustProxyLanWarning, host,
} from './config.js'
import db, { migrate } from './db.js'
import { createApp } from './app.js'

migrate(db)

const users = db.prepare('SELECT COUNT(*) AS c FROM users').get().c
const app = createApp(db)

// HOST unset => bind every interface (0.0.0.0), the current default.
// HOST set   => bind that address only (e.g. 127.0.0.1 = local-only).
const bindHost = host()

const onListening = () => {
  const shownHost = bindHost ?? '0.0.0.0'
  console.log(`[playrent] listening on http://${shownHost}:${port} · host=${shownHost} · env=${nodeEnv()} · db=${dbPath}`)
  // Effective configuration in one line — the operator can see at a glance
  // whether .env was loaded at all (the old bug: it never was). No secret is
  // printed here, only the resolved deploy values.
  console.log(`[playrent] env=${nodeEnv()} cors=${JSON.stringify(corsOrigins())} sameSite=${cookieSameSite()} secure=${cookieSecure()} trustProxy=${trustProxy()}`)
  const warning = trustProxyWarning()
  if (warning) console.warn(`[playrent] PERINGATAN: ${warning}`)
  const lanWarning = trustProxyLanWarning()
  if (lanWarning) console.warn(`[playrent] PERINGATAN: ${lanWarning}`)
  if (users === 0) console.log('[playrent] tidak ada pengguna — jalankan: npm run seed')
}

// No host argument => Node binds all interfaces (0.0.0.0), reachable from the LAN.
// `undefined` is never passed to listen() — the call is split so the default
// stays byte-identical to the previous behaviour.
const server = bindHost === undefined
  ? app.listen(port, onListening)
  : app.listen(port, bindHost, onListening)

const shutdown = () => {
  server.close(() => {
    try { db.close() } catch { /* already closed */ }
    process.exit(0)
  })
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
