import { Router } from 'express'
import { z } from 'zod'
import { AppError, ok, created, isUniqueViolation } from '../lib/errors.js'
import { parse, idParam, likePattern } from '../lib/validate.js'
import { mapUser } from '../lib/mappers.js'
import { hashPassword, requireAuth, requireSuperAdmin, revokeAllForUser } from '../lib/auth.js'
import { withTx } from '../db.js'
import { logAudit } from '../lib/audit.js'

const usernameRe = /^[a-z0-9._]{3,32}$/

const createSchema = z.object({
  username: z.string().regex(usernameRe, 'Username hanya boleh huruf kecil, angka, titik, dan garis bawah, 3–32 karakter'),
  fullName: z.string().min(2, 'Nama minimal 2 karakter').max(80, 'Nama maksimal 80 karakter'),
  password: z.string().min(8, 'Kata sandi minimal 8 karakter').max(200),
  role: z.enum(['superadmin', 'user'], { message: 'Pilih peran' }),
}).strict()

const updateSchema = z.object({
  fullName: z.string().min(2, 'Nama minimal 2 karakter').max(80).optional(),
  role: z.enum(['superadmin', 'user']).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8, 'Kata sandi minimal 8 karakter').max(200).optional(),
}).strict()

const activeAdmins = (db) =>
  db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'superadmin' AND is_active = 1").get().c

export default function usersRoutes(db) {
  const r = Router()
  r.use(requireAuth, requireSuperAdmin)

  r.get('/', (req, res) => {
    const { q, role, isActive } = req.query
    const where = []
    const params = []
    if (q) { where.push("(username LIKE ? ESCAPE '\\' OR full_name LIKE ? ESCAPE '\\')"); params.push(likePattern(q), likePattern(q)) }
    if (role === 'superadmin' || role === 'user') { where.push('role = ?'); params.push(role) }
    if (isActive === 'true' || isActive === '1') where.push('is_active = 1')
    if (isActive === 'false' || isActive === '0') where.push('is_active = 0')
    const sql = `SELECT * FROM users ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY is_active DESC, full_name ASC`
    return ok(res, { items: db.prepare(sql).all(...params).map(mapUser) })
  })

  r.post('/', (req, res) => {
    const body = parse(createSchema, req.body)
    if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(body.username)) {
      throw new AppError(409, 'DUPLICATE_USERNAME')
    }
    const { hash, salt } = hashPassword(body.password)
    const now = new Date().toISOString()
    let info
    try {
      // BE-015: the SELECT above is a check-then-act. A concurrent insert of
      // the same username still hits the UNIQUE index — catch it here so the
      // client gets 409 instead of a 500.
      info = db.prepare(
        `INSERT INTO users (username, full_name, password_hash, password_salt, role, is_active, created_at, updated_at)
         VALUES (?,?,?,?,?,1,?,?)`,
      ).run(body.username, body.fullName, hash, salt, body.role, now, now)
    } catch (err) {
      if (isUniqueViolation(err, 'users')) throw new AppError(409, 'DUPLICATE_USERNAME')
      throw err
    }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(info.lastInsertRowid))
    logAudit(db, {
      actorId: req.user.id, actorName: req.user.full_name, action: 'user_created',
      entity: 'users', entityId: user.id, description: `Pengguna "${user.full_name}" ditambahkan`,
      meta: { role: user.role },
    })
    return created(res, { user: mapUser(user) })
  })

  r.patch('/:id', (req, res) => {
    const id = parse(idParam, req.params.id)
    const body = parse(updateSchema, req.body)

    // Guard + write share one BEGIN IMMEDIATE (withTx) so two concurrent
    // demotions can't both pass the activeAdmins count.
    const result = withTx(db, () => {
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id)
      if (!user) throw new AppError(404, 'USER_NOT_FOUND')

      // AUTH-4/AUTH-5: mirror the DELETE guard for admin-access removal.
      const dropsAdmin = user.role === 'superadmin' && user.is_active === 1 &&
        ((body.role !== undefined && body.role !== 'superadmin') || body.isActive === false)
      if (dropsAdmin) {
        if (id === req.user.id) throw new AppError(409, 'CANNOT_DELETE_SELF')
        if (activeAdmins(db) <= 1) throw new AppError(409, 'LAST_ADMIN')
      }

      const sets = []
      const params = []
      if (body.fullName !== undefined) { sets.push('full_name = ?'); params.push(body.fullName) }
      if (body.role !== undefined) { sets.push('role = ?'); params.push(body.role) }
      if (body.isActive !== undefined) { sets.push('is_active = ?'); params.push(body.isActive ? 1 : 0) }
      if (body.password !== undefined) {
        const { hash, salt } = hashPassword(body.password)
        sets.push('password_hash = ?', 'password_salt = ?')
        params.push(hash, salt)
      }
      if (sets.length) {
        sets.push('updated_at = ?'); params.push(new Date().toISOString(), id)
        db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...params)
      }

      // SES-4/SES-5: an access-rights change must end every session of that
      // account. Deactivating is enforced by `is_active` alone, so a token
      // minted before the deactivation would spring back to life the moment
      // the account is re-activated. The same goes for a role change and for
      // a credential reset. Revoke all of them — no exception: the caller can
      // never be the target here (self-deactivation/self-demotion is rejected
      // with CANNOT_DELETE_SELF above).
      //
      // The revoke fires when the state really CHANGES, in either direction:
      // re-activating an account must also cut the sessions it still had (a
      // database written by an older build can hold them), while a no-op
      // PATCH (isActive:true on an already active account) must not log the
      // caller out of their own session.
      const activeChanged = body.isActive !== undefined && body.isActive !== Boolean(user.is_active)
      const roleChanged = body.role !== undefined && body.role !== user.role
      const mustRevoke = activeChanged || roleChanged || body.password !== undefined
      let revoked = 0
      if (mustRevoke) {
        revoked = db.prepare('SELECT COUNT(*) AS c FROM auth_sessions WHERE user_id = ?').get(id).c
        revokeAllForUser(db, id)
      }
      return { user: db.prepare('SELECT * FROM users WHERE id = ?').get(id), revoked }
    })
    const updated = result.user

    // Which fields moved is recorded (never their values): an access-rights
    // change must be visible in the audit trail. A credential reset is flagged
    // as a boolean so no password ever reaches the log, and the number of
    // revoked sessions is a count — never a token.
    const changed = []
    if (body.fullName !== undefined) changed.push('fullName')
    if (body.role !== undefined) changed.push('role')
    if (body.isActive !== undefined) changed.push('isActive')
    logAudit(db, {
      actorId: req.user.id, actorName: req.user.full_name, action: 'user_updated',
      entity: 'users', entityId: id, description: `Perubahan pada "${updated.full_name}" tersimpan`,
      meta: { changed, credentialReset: body.password !== undefined, sessionsRevoked: result.revoked },
    })
    return ok(res, { user: mapUser(updated) })
  })

  r.delete('/:id', (req, res) => {
    const id = parse(idParam, req.params.id)
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id)
    if (!user) throw new AppError(404, 'USER_NOT_FOUND')
    if (id === req.user.id) throw new AppError(409, 'CANNOT_DELETE_SELF')
    if (user.role === 'superadmin' && user.is_active && activeAdmins(db) <= 1) {
      throw new AppError(409, 'LAST_ADMIN')
    }
    db.prepare('UPDATE users SET is_active = 0, updated_at = ? WHERE id = ?')
      .run(new Date().toISOString(), id)
    revokeAllForUser(db, id)
    logAudit(db, {
      actorId: req.user.id, actorName: req.user.full_name, action: 'user_deactivated',
      entity: 'users', entityId: id, description: `Akun "${user.full_name}" dinonaktifkan`,
      meta: { role: user.role },
    })
    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(id)
    return ok(res, { user: mapUser(updated) })
  })

  return r
}
