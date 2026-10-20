import { port, dbPath, nodeEnv } from './config.js'
import db, { migrate } from './db.js'
import { createApp } from './app.js'

migrate(db)

const users = db.prepare('SELECT COUNT(*) AS c FROM users').get().c
const app = createApp(db)

const server = app.listen(port, () => {
  // No host argument => Node binds all interfaces (0.0.0.0), reachable from the LAN.
  console.log(`[playrent] listening on http://0.0.0.0:${port} · env=${nodeEnv} · db=${dbPath}`)
  if (users === 0) console.log('[playrent] tidak ada pengguna — jalankan: npm run seed')
})

const shutdown = () => {
  server.close(() => {
    try { db.close() } catch { /* already closed */ }
    process.exit(0)
  })
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
