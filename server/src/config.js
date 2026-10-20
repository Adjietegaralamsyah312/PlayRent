// Env parsing with sane defaults. dbPath is resolved from the package root
// (not cwd) so `node src/seed.js` and `node src/index.js` agree on the file.
import { fileURLToPath } from 'node:url'
import { dirname, join, isAbsolute, resolve } from 'node:path'
import { mkdirSync } from 'node:fs'

const srcDir = dirname(fileURLToPath(import.meta.url))
export const packageRoot = resolve(srcDir, '..')
export const repoRoot = resolve(packageRoot, '..')

const num = (v, d) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}

const rawDb = process.env.DB_PATH || './data/playrent.db'
const dbPath = isAbsolute(rawDb) ? rawDb : join(packageRoot, rawDb)
mkdirSync(dirname(dbPath), { recursive: true })

export const port = num(process.env.PORT, 4000)
export const sessionTtlHours = num(process.env.SESSION_TTL_HOURS, 12)
export const nodeEnv = process.env.NODE_ENV || 'development'
export const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173'
// Off by default: only honour X-Forwarded-For when explicitly behind a proxy,
// otherwise any caller can spoof the login rate-limit IP (AUTH-10).
export const trustProxy = process.env.TRUST_PROXY === 'true'
export const isProd = nodeEnv === 'production'
// Defaults to isProd so the safe behaviour is preserved; only an explicit
// COOKIE_SECURE=false turns the Secure flag off (plain-HTTP LAN deploy).
const rawCookieSecure = process.env.COOKIE_SECURE
export const cookieSecure =
  rawCookieSecure === 'true' ? true : rawCookieSecure === 'false' ? false : isProd
export const webDistPath = join(repoRoot, 'web', 'dist')

export { dbPath }
