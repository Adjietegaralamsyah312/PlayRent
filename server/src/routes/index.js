import { Router } from 'express'
import authRoutes from './auth.js'
import usersRoutes from './users.js'
import consolesRoutes from './consoles.js'
import sessionsRoutes from './sessions.js'
import bookingsRoutes from './bookings.js'
import transactionsRoutes from './transactions.js'
import dashboardRoutes from './dashboard.js'
import gamesRoutes from './games.js'
import reportsRoutes from './reports.js'
import settingsRoutes, { packagesRoutes } from './settings.js'

const VERSION = '1.0.0'
const startedAt = Date.now()

export default function createRouter(db) {
  const r = Router()

  r.get('/health', (req, res) => {
    let ok = true
    try { db.prepare('SELECT 1').get() } catch { ok = false }
    res.json({
      success: true,
      data: {
        status: ok ? 'ok' : 'degraded',
        version: VERSION,
        // HYG-3: this endpoint is public — the absolute DB path is host
        // information and must not leave the server. `db.ok` is enough.
        db: { ok },
        uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      },
    })
  })

  r.use('/auth', authRoutes(db))
  r.use('/users', usersRoutes(db))
  r.use('/consoles', consolesRoutes(db))
  r.use('/sessions', sessionsRoutes(db))
  r.use('/bookings', bookingsRoutes(db))
  r.use('/transactions', transactionsRoutes(db))
  r.use('/dashboard', dashboardRoutes(db))
  r.use('/games', gamesRoutes(db))
  r.use('/reports', reportsRoutes(db))
  r.use('/settings', settingsRoutes(db))
  r.use('/packages', packagesRoutes(db))

  return r
}
