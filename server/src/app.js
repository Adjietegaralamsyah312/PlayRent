import express from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { corsOrigins, webDistPath, trustProxy } from './config.js'
import { errorHandler, notFoundHandler } from './lib/errors.js'
import { csrfGuard } from './lib/auth.js'
import createRouter from './routes/index.js'

export function createApp(db) {
  const app = express()
  app.disable('x-powered-by')
  app.locals.db = db

  // AUTH-10 / deploy contract §1.2: TRUST_PROXY is a HOP COUNT, not a boolean.
  // `false` (default) ignores X-Forwarded-For entirely. A number trusts that
  // many hops, so req.ip is the entry the trusted proxy appended (the rightmost
  // one) and the attacker-controlled leftmost entry is ignored — `true` would
  // let anyone rotate the header and mint a fresh rate-limit bucket (HIGH-1).
  app.set('trust proxy', trustProxy())

  // CORS allowlist, re-read per request (deploy contract §3). Never a
  // wildcard: Access-Control-Allow-Origin must echo the matched origin, or the
  // cross-site session cookie (SameSite=None; Secure) is never sent.
  app.use(cors((req, cb) => cb(null, {
    origin: corsOrigins(),
    credentials: true,
  })))
  app.use(express.json({ limit: '1mb' }))
  app.use(cookieParser())
  app.use(csrfGuard)

  app.use('/api', createRouter(db))

  if (existsSync(webDistPath)) {
    app.use(express.static(webDistPath))
    // Express 5 dropped the '*' wildcard — use a RegExp for the SPA fallback.
    app.get(/.*/, (req, res, next) => {
      if (req.path.startsWith('/api')) return next()
      res.sendFile(join(webDistPath, 'index.html'))
    })
  }

  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}
