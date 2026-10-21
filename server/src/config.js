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

// --- runtime env readers ----------------------------------------------------
// The cookie & CORS values are runtime configuration (deploy contract §1.2),
// so they are read on every call instead of being frozen at import time —
// that keeps the values overridable per process and per test case.

/** Effective NODE_ENV — the single source of truth for the environment name. */
export function nodeEnv() {
  return process.env.NODE_ENV || 'development'
}

/** Are we in production? (runtime) */
const prodEnv = () => nodeEnv() === 'production'

// Import-time snapshot, kept only for tools/security-probe.mjs (child-process
// check). Every runtime path uses nodeEnv()/prodEnv() instead.
export const isProd = prodEnv()

/**
 * Allowlist of browser origins allowed to call the API.
 * CORS_ORIGIN is comma-separated; blank entries are dropped.
 */
export function corsOrigins() {
  const list = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (list.length) return list
  // Production default = the GitHub Pages origin of the SPA (origin only, the
  // /PlayRent path is NOT part of an origin).
  return prodEnv()
    ? ['https://adjietegaralamsyah312.github.io']
    : ['http://localhost:5173', 'http://127.0.0.1:5173']
}

/** 'lax' | 'strict' | 'none'. Unknown values fall back to the default. */
export function cookieSameSite() {
  const raw = (process.env.COOKIE_SAME_SITE || '').trim().toLowerCase()
  if (raw === 'lax' || raw === 'strict' || raw === 'none') return raw
  return prodEnv() ? 'none' : 'lax'
}

/**
 * Defaults to production so the safe behaviour is preserved; only an explicit
 * COOKIE_SECURE=false turns the Secure flag off (plain-HTTP LAN deploy).
 */
export function cookieSecure() {
  const raw = process.env.COOKIE_SECURE
  if (raw === 'true') return true
  if (raw === 'false') return false
  return prodEnv()
}

/**
 * Bind address for the HTTP server.
 * Unset/blank => undefined => Node binds every interface (0.0.0.0), which is
 * the current default and keeps the LAN reachable. Set it (e.g. 127.0.0.1) to
 * make the API local-only.
 */
export function host() {
  const raw = (process.env.HOST || '').trim()
  return raw === '' ? undefined : raw
}

// --- trust proxy (hop count) -------------------------------------------------
// TRUST_PROXY is a HOP COUNT, never a boolean:
//   unset | false | 0 -> false  (X-Forwarded-For ignored — anti-spoof default)
//   1 | 2 | ...        -> that many trusted hops
//   true               -> 1, NOT trust-all
//
// Why not trust-all: Cloudflare *appends* to X-Forwarded-For instead of
// replacing it, so the leftmost entry is attacker-controlled. With
// `trust proxy: true` Express would use that leftmost entry as req.ip and the
// login rate limit (5 failures / 15 min) could be bypassed by rotating the
// header on every attempt (review HIGH-1). With a hop count of 1, req.ip is
// the entry the trusted proxy appended — the real client IP — and the
// spoofable leftmost entry is ignored.

function parseTrustProxy() {
  const raw = (process.env.TRUST_PROXY || '').trim().toLowerCase()
  if (raw === '' || raw === 'false' || raw === '0') return { value: false, warning: null }
  if (raw === 'true') {
    return {
      value: 1,
      warning: 'TRUST_PROXY=true kini berarti 1 hop. Set angka eksplisit (mis. 2) bila ada lebih dari satu proxy di depan server.',
    }
  }
  if (/^\d+$/.test(raw) && Number(raw) > 0) return { value: Number(raw), warning: null }
  return {
    value: false,
    warning: `TRUST_PROXY="${raw}" tidak dikenal — X-Forwarded-For diabaikan. Set jumlah hop (mis. 1) bila server di belakang proxy.`,
  }
}

/** Value for `app.set('trust proxy', …)`: false (off) or a number of hops. */
export function trustProxy() {
  return parseTrustProxy().value
}

/** Startup notice for a non-default TRUST_PROXY (printed once by src/index.js). */
export function trustProxyWarning() {
  return parseTrustProxy().warning
}

/**
 * Startup notice for a trusted-proxy setup that is also reachable from the LAN
 * (printed once by src/index.js). Two facts must be stated together, because
 * each alone is misleading:
 *  - X-Forwarded-For is trusted, so a caller that skips the tunnel can forge
 *    the header and mint a fresh rate-limit bucket for the login endpoint;
 *  - the fix is to stop exposing the port: bind to loopback (HOST=127.0.0.1)
 *    when the only client is a tunnel running on this same machine.
 */
export function trustProxyLanWarning() {
  const hops = trustProxy()
  if (!(hops > 0)) return null
  return `TRUST_PROXY=${hops} mempercayai X-Forwarded-For. Permintaan yang datang langsung dari LAN (melewati tunnel) bisa memalsukan X-Forwarded-For sehingga rate limit login bisa dilewati. Set HOST=127.0.0.1 di server/.env kalau API hanya diakses lewat Cloudflare Tunnel (tunnel berjalan di mesin yang sama → cukup akses lokal).`
}

export const webDistPath = join(repoRoot, 'web', 'dist')

export { dbPath }
