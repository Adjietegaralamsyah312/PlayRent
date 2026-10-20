import express from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { corsOrigin, webDistPath, trustProxy } from './config.js'
import { errorHandler, notFoundHandler } from './lib/errors.js'
import { csrfGuard } from './lib/auth.js'
import createRouter from './routes/index.js'

export function createApp(db) {
  const app = express()
  app.disable('x-powered-by')
  app.locals.db = db

  // AUTH-10: trust X-Forwarded-For only when TRUST_PROXY=true (default off).
  app.set('trust proxy', trustProxy)

  app.use(cors({ origin: corsOrigin, credentials: true }))
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
