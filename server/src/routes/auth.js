import { Router } from 'express'
import { z } from 'zod'
import { AppError, ok, created } from '../lib/errors.js'
import { parse } from '../lib/validate.js'
import { mapUser } from '../lib/mappers.js'
import { logAudit } from '../lib/audit.js'
import {
  hashPassword, verifyPassword, createSession, revokeSession, revokeAllForUser,
  setSessionCookie, clearSessionCookie, requireAuth, dummyHashPair,
  checkLoginRateLimit, recordLoginAttempt, COOKIE_NAME,
} from '../lib/auth.js'

// AUTH-10: key on the transport socket, not a caller-supplied header. Express's
// `trust proxy` setting decides whether X-Forwarded-For is honoured at all; it is
// off unless TRUST_PROXY=true, so a fresh XFF per request no longer mints a bucket.
const clientIp = (req) => req.ip || req.socket.remoteAddress || ''

// AUTH-11: the rate-limit bucket is the normalised username so case/whitespace
// variants of one username share a bucket. The credential lookup below stays
// exact-match (case-sensitive).
const rateKey = (username) => String(username).trim().toLowerCase()

// Public registration shares the login_attempts table with a constant bucket key,
// so the quota is per IP: 10 registrations / 15 min.
const REGISTER_BUCKET = '__register__'
const REGISTER_MAX = 10

const usernameRe = /^[a-z0-9._]{3,32}$/

const loginSchema = z.object({
  username: z.string().min(1, 'Isi username').max(64),
  password: z.string().min(1, 'Isi kata sandi').max(200),
}).strict()

// Public self-registration. `.strict()` is the security boundary: a body that
// carries `role` (or any other unknown field) is rejected with 400, so a client
// can never ask for a privileged account.
const registerSchema = z.object({
  username: z.string().regex(usernameRe, 'Username hanya boleh huruf kecil, angka, titik, dan garis bawah, 3–32 karakter'),
  fullName: z.string().min(2, 'Nama minimal 2 karakter').max(80, 'Nama maksimal 80 karakter'),
  phone: z.string().max(40, 'Nomor telepon maksimal 40 karakter').optional().nullable(),
  password: z.string().min(8, 'Kata sandi minimal 8 karakter').max(200),
}).strict()

const profileSchema = z.object({
  fullName: z.string().min(2, 'Nama minimal 2 karakter').max(80, 'Nama maksimal 80 karakter').optional(),
  phone: z.string().max(40, 'Nomor telepon maksimal 40 karakter').optional().nullable(),
}).strict()

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Isi kata sandi saat ini'),
  newPassword: z.string().min(8, 'Kata sandi minimal 8 karakter').max(200),
}).strict()

export default function authRoutes(db) {
  const r = Router()

  // Public registration — no session, no cookie. The new account is a plain
  // customer (`user`); the role is decided by the server, never by the body.
  r.post('/register', (req, res) => {
    const body = parse(registerSchema, req.body)
    const ip = clientIp(req)
    checkLoginRateLimit(db, REGISTER_BUCKET, ip, REGISTER_MAX, { countSuccesses: true })

    if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(body.username)) {
      throw new AppError(409, 'DUPLICATE_USERNAME')
    }

    const { hash, salt } = hashPassword(body.password)
    const now = new Date().toISOString()
    const info = db.prepare(
      `INSERT INTO users
       (username, full_name, password_hash, password_salt, role, is_active, phone, created_at, updated_at)
       VALUES (?,?,?,?,'user',1,?,?,?)`,
    ).run(body.username, body.fullName, hash, salt, body.phone ?? null, now, now)
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(info.lastInsertRowid))

    recordLoginAttempt(db, REGISTER_BUCKET, ip, true)
    logAudit(db, {
      actorId: user.id, actorName: user.full_name, action: 'user_registered',
      entity: 'users', entityId: user.id, description: 'Akun pelanggan terdaftar',
    })
    return created(res, { user: mapUser(user) })
  })

  r.post('/login', (req, res) => {
    const { username, password } = parse(loginSchema, req.body)
    const ip = clientIp(req)
    const key = rateKey(username)
    checkLoginRateLimit(db, key, ip)

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username)
    // A deactivated account is indistinguishable from a wrong password: same
    // 401 INVALID_CREDENTIALS, no user enumeration.
    //
    // LOG-3: the scrypt cost is paid on BOTH paths, so the response time
    // cannot reveal whether a username exists. A miss is verified against a
    // dummy hash (built once, lazily) and the result is discarded — the body
    // and the error code stay byte-identical.
    let valid = false
    if (user && user.is_active) {
      valid = verifyPassword(password, user.password_hash, user.password_salt)
    } else {
      const dummy = dummyHashPair()
      verifyPassword(password, dummy.hash, dummy.salt)
    }
    if (!valid) {
      recordLoginAttempt(db, key, ip, false)
      throw new AppError(401, 'INVALID_CREDENTIALS')
    }
    recordLoginAttempt(db, key, ip, true)
    const { token, expiresAt } = createSession(db, user.id, { ip, userAgent: req.get('user-agent') })
    setSessionCookie(res, token, expiresAt)
    return ok(res, { user: mapUser(user) })
  })

  r.post('/logout', requireAuth, (req, res) => {
    revokeSession(db, req.token)
    clearSessionCookie(res)
    return ok(res, { ok: true })
  })

  r.get('/me', requireAuth, (req, res) => ok(res, { user: mapUser(req.user) }))

  // Self-service profile: only the signed-in account, only these two fields.
  r.patch('/profile', requireAuth, (req, res) => {
    const body = parse(profileSchema, req.body)
    const sets = []
    const params = []
    if (body.fullName !== undefined) { sets.push('full_name = ?'); params.push(body.fullName) }
    if (body.phone !== undefined) { sets.push('phone = ?'); params.push(body.phone ?? null) }
    if (sets.length) {
      sets.push('updated_at = ?'); params.push(new Date().toISOString(), req.user.id)
      db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...params)
    }
    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)
    logAudit(db, {
      actorId: req.user.id, actorName: req.user.full_name, action: 'profile_updated',
      entity: 'users', entityId: req.user.id, description: 'Profil pelanggan diperbarui',
    })
    return ok(res, { user: mapUser(updated) })
  })

  r.post('/change-password', requireAuth, (req, res) => {
    const { currentPassword, newPassword } = parse(changePasswordSchema, req.body)
    if (!verifyPassword(currentPassword, req.user.password_hash, req.user.password_salt)) {
      throw new AppError(400, 'INVALID_CREDENTIALS', 'Kata sandi saat ini salah')
    }
    const { hash, salt } = hashPassword(newPassword)
    db.prepare('UPDATE users SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?')
      .run(hash, salt, new Date().toISOString(), req.user.id)
    revokeAllForUser(db, req.user.id, { keepToken: req.token })
    logAudit(db, {
      actorId: req.user.id, actorName: req.user.full_name, action: 'password_changed',
      entity: 'users', entityId: req.user.id, description: 'Kata sandi akun diubah sendiri',
    })
    return ok(res, { ok: true })
  })

  return r
}

export { COOKIE_NAME }
