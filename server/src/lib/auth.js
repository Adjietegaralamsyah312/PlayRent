// Auth: scrypt password hashing, opaque session tokens, middleware, rate limit, CSRF.
import { scryptSync, randomBytes, createHash, timingSafeEqual } from 'node:crypto'
import { sessionTtlHours, cookieSecure, cookieSameSite, corsOrigins } from '../config.js'
import { AppError } from './errors.js'
import { nowIso, addMinutes } from './time.js'

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
const KEYLEN = 64
export const COOKIE_NAME = 'pr_session'
const ttlMinutes = () => sessionTtlHours * 60

const sha256 = (s) => createHash('sha256').update(s).digest('hex')

// --- passwords --------------------------------------------------------------

export function hashPassword(plain) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(String(plain), salt, KEYLEN, SCRYPT).toString('hex')
  return { hash, salt }
}

export function verifyPassword(plain, hash, salt) {
  try {
    const expected = Buffer.from(hash, 'hex')
    const actual = scryptSync(String(plain), salt, KEYLEN, SCRYPT)
    if (expected.length !== actual.length) return false
    return timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}

// LOG-3 (login timing oracle): the scrypt cost must be paid even when the
// account does not exist, otherwise the response time tells an attacker which
// usernames are registered. The dummy hash is built once, on first use
// (~100 ms), and reused for every later miss.
let dummyHash = null
export function dummyHashPair() {
  if (!dummyHash) dummyHash = hashPassword(randomBytes(24).toString('hex'))
  return dummyHash
}

// --- sessions ---------------------------------------------------------------

/** Stores only sha256(token); returns the raw token to the caller. */
export function createSession(db, userId, { ip = null, userAgent = null } = {}) {
  const token = randomBytes(32).toString('base64url')
  const now = nowIso()
  const expiresAt = addMinutes(now, ttlMinutes())
  db.prepare(
    `INSERT INTO auth_sessions
     (token_hash, user_id, created_at, expires_at, last_seen_at, ip, user_agent)
     VALUES (?,?,?,?,?,?,?)`,
  ).run(sha256(token), userId, now, expiresAt, now, ip, userAgent)
  return { token, expiresAt }
}

/** Returns the joined user row (with `sid`) or null. Slides the TTL at most once / 5 min. */
export function resolveSession(db, token) {
  if (!token) return null
  const row = db.prepare(
    `SELECT s.id AS sid, s.expires_at, s.last_seen_at, u.*
       FROM auth_sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?`,
  ).get(sha256(token))
  if (!row) return null
  const now = Date.now()
  if (Date.parse(row.expires_at) <= now) {
    db.prepare('DELETE FROM auth_sessions WHERE id = ?').run(row.sid)
    return null
  }
  if (now - Date.parse(row.last_seen_at) > 5 * 60 * 1000) {
    const nowStr = nowIso()
    db.prepare('UPDATE auth_sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?')
      .run(nowStr, addMinutes(nowStr, ttlMinutes()), row.sid)
  }
  if (!row.is_active) return null
  return row
}

export function revokeSession(db, token) {
  if (!token) return
  db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(sha256(token))
}

export function revokeAllForUser(db, userId, { keepToken = null } = {}) {
  if (keepToken) {
    db.prepare('DELETE FROM auth_sessions WHERE user_id = ? AND token_hash != ?')
      .run(userId, sha256(keepToken))
  } else {
    db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(userId)
  }
}

// --- cookie -----------------------------------------------------------------

/**
 * Session cookie attributes (deploy contract §2).
 * - httpOnly is always true: the token never leaves the browser via JS.
 * - no `domain`: host-only is enough for a cookie set by the API origin.
 * - invariant: SameSite=None is only honoured together with Secure — a browser
 *   silently drops a `SameSite=None` cookie that is not Secure, so a
 *   plain-HTTP deploy falls back to `lax` instead of losing the session.
 */
export function sessionCookieOptions() {
  const secure = cookieSecure()
  const requested = cookieSameSite()
  return {
    httpOnly: true,
    sameSite: !secure && requested === 'none' ? 'lax' : requested,
    secure,
    path: '/',
  }
}

export function setSessionCookie(res, token, expiresAt) {
  const maxAge = Math.max(0, Date.parse(expiresAt) - Date.now())
  res.cookie(COOKIE_NAME, token, { ...sessionCookieOptions(), maxAge })
}

export function clearSessionCookie(res) {
  // Identical attributes to setSessionCookie, otherwise the browser keeps the
  // old cookie and the session survives logout.
  res.clearCookie(COOKIE_NAME, sessionCookieOptions())
}

// --- middleware -------------------------------------------------------------

export function requireAuth(req, res, next) {
  const db = req.app.locals.db
  const token = req.cookies?.[COOKIE_NAME]
  if (!token) throw new AppError(401, 'UNAUTHENTICATED')
  const user = resolveSession(db, token)
  if (!user) throw new AppError(401, 'SESSION_EXPIRED')
  req.token = token
  req.user = user
  next()
}

/** The only privileged role. `user` is a plain customer account. */
export const isSuperAdmin = (user) => user?.role === 'superadmin'

/** Gate for every admin-only route. Replaces the old `requireRole('admin')`. */
export function requireSuperAdmin(req, res, next) {
  if (!req.user) throw new AppError(401, 'UNAUTHENTICATED')
  if (req.user.role !== 'superadmin') throw new AppError(403, 'FORBIDDEN')
  next()
}

/**
 * Belt-and-braces CSRF: the SameSite cookie is the primary defence; this
 * rejects foreign Origins on writes. Allowed = the CORS allowlist + the API's
 * own origin (so a same-origin SPA keeps working without extra config).
 * Never disableable by env — a foreign Origin on a write is always a 403.
 *
 * A write without an Origin header is not automatically trusted: browsers
 * always send Sec-Fetch-Site, so 'cross-site' there means a cross-site write
 * (the Origin header was stripped or never sent) and is rejected with the
 * same code. 'same-origin' / 'same-site' / no header at all is allowed —
 * non-browser clients (curl, Postman) send neither header.
 */
export function csrfGuard(req, res, next) {
  const m = req.method
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return next()
  const origin = req.get('origin')
  if (!origin) {
    const site = (req.get('sec-fetch-site') || '').trim().toLowerCase()
    if (site === 'cross-site') throw new AppError(403, 'CSRF_ORIGIN_MISMATCH')
    return next()
  }
  const allowed = new Set(corsOrigins())
  const host = req.get('host')
  if (host) allowed.add(`${req.protocol}://${host}`)
  if (!allowed.has(origin)) throw new AppError(403, 'CSRF_ORIGIN_MISMATCH')
  next()
}

// --- login rate limit -------------------------------------------------------

/**
 * Rate limit for a (username, ip) bucket: `max` failed attempts per 15 minutes.
 * `countSuccesses` is only used by the public-registration bucket ('__register__'),
 * where every attempt counts — a successful registration is still an attempt
 * against the IP quota. Login keeps counting failures only.
 */
export function checkLoginRateLimit(db, username, ip, max = 5, { countSuccesses = false } = {}) {
  const since = addMinutes(nowIso(), -15)
  const row = db.prepare(
    `SELECT COUNT(*) AS c FROM login_attempts
      WHERE username = ? AND IFNULL(ip,'') = ? AND attempted_at >= ?
        ${countSuccesses ? '' : 'AND succeeded = 0'}`,
  ).get(String(username), ip || '', since)
  if (row.c >= max) throw new AppError(429, 'RATE_LIMITED')
}

export function recordLoginAttempt(db, username, ip, succeeded) {
  db.prepare('INSERT INTO login_attempts (username, ip, succeeded, attempted_at) VALUES (?,?,?,?)')
    .run(String(username), ip || null, succeeded ? 1 : 0, nowIso())
}
