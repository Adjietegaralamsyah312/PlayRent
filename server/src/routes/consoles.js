import { Router } from 'express'
import { z } from 'zod'
import { AppError, ok, created, isUniqueViolation } from '../lib/errors.js'
import { parse, idParam } from '../lib/validate.js'
import { mapConsole, mapConsolePublic, mapSession } from '../lib/mappers.js'
import { requireAuth, requireSuperAdmin, isSuperAdmin } from '../lib/auth.js'
import { logAudit } from '../lib/audit.js'

const STATUSES = ['available', 'in_use', 'reserved', 'maintenance']

const createSchema = z.object({
  code: z.string().regex(/^[A-Za-z0-9-]{2,12}$/, 'Kode unit hanya boleh huruf, angka, dan tanda hubung (2–12 karakter)'),
  consoleType: z.enum(['PS4', 'PS5'], { message: 'Pilih jenis konsol' }),
  roomType: z.enum(['Reguler', 'VIP'], { message: 'Pilih jenis ruangan' }),
  controllers: z.coerce.number().int().min(1, 'Jumlah controller harus 1 sampai 8').max(8, 'Jumlah controller harus 1 sampai 8'),
  hourlyRate: z.coerce.number().int().min(1000, 'Tarif minimal Rp 1.000'),
  status: z.enum(STATUSES).optional(),
  conditionNote: z.string().max(300).optional().nullable(),
}).strict()

const updateSchema = createSchema.partial().extend({ isActive: z.boolean().optional() }).strict()

const activeSessionFor = (db, consoleId) =>
  db.prepare("SELECT * FROM rental_sessions WHERE console_id = ? AND status IN ('active','overdue')").get(consoleId)

export default function consolesRoutes(db) {
  const r = Router()
  r.use(requireAuth)

  r.get('/', (req, res) => {
    const { status, type, roomType, q, includeInactive } = req.query
    const where = []
    const params = []
    if (!(includeInactive === 'true' || includeInactive === '1')) where.push('is_active = 1')
    if (status && STATUSES.includes(status)) { where.push('status = ?'); params.push(status) }
    if (type === 'PS4' || type === 'PS5') { where.push('console_type = ?'); params.push(type) }
    if (roomType) { where.push('room_type = ?'); params.push(roomType) }
    if (q) { where.push('code LIKE ?'); params.push(`%${q}%`) }
    const sql = `SELECT * FROM consoles ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY code ASC`
    const rows = db.prepare(sql).all(...params)
    // A customer sees the unit list without internal notes (condition_note).
    const items = isSuperAdmin(req.user) ? rows.map(mapConsole) : rows.map(mapConsolePublic)
    return ok(res, { items })
  })

  r.get('/:id', (req, res) => {
    const id = parse(idParam, req.params.id)
    const c = db.prepare('SELECT * FROM consoles WHERE id = ?').get(id)
    if (!c) throw new AppError(404, 'CONSOLE_NOT_FOUND')
    const session = activeSessionFor(db, id)
    if (!isSuperAdmin(req.user)) {
      // The active session carries the name of another customer — expose only
      // whether the unit is busy.
      return ok(res, { console: mapConsolePublic(c), isBusy: !!session })
    }
    return ok(res, { console: mapConsole(c), currentSession: session ? mapSession(session) : null })
  })

  r.post('/', requireSuperAdmin, (req, res) => {
    const body = parse(createSchema, req.body)
    const now = new Date().toISOString()
    let info
    try {
      info = db.prepare(
        `INSERT INTO consoles
         (code, console_type, room_type, controllers, hourly_rate, status, condition_note, is_active, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,1,?,?)`,
      ).run(body.code, body.consoleType, body.roomType, body.controllers, body.hourlyRate,
        body.status || 'available', body.conditionNote ?? null, now, now)
    } catch (err) {
      if (isUniqueViolation(err, 'consoles.code') || isUniqueViolation(err, 'consoles')) {
        throw new AppError(409, 'DUPLICATE_CODE')
      }
      throw err
    }
    const c = db.prepare('SELECT * FROM consoles WHERE id = ?').get(Number(info.lastInsertRowid))
    logAudit(db, {
      actorId: req.user.id, actorName: req.user.full_name, action: 'console_created',
      entity: 'consoles', entityId: c.id, description: `Unit ${c.code} berhasil ditambahkan`,
    })
    return created(res, { console: mapConsole(c) })
  })

  r.patch('/:id', requireSuperAdmin, (req, res) => {
    const id = parse(idParam, req.params.id)
    const body = parse(updateSchema, req.body)
    const c = db.prepare('SELECT * FROM consoles WHERE id = ?').get(id)
    if (!c) throw new AppError(404, 'CONSOLE_NOT_FOUND')

    const active = activeSessionFor(db, id)
    if (body.status === 'available' && active) throw new AppError(409, 'UNIT_OCCUPIED')
    if (body.isActive === false && active) throw new AppError(409, 'UNIT_OCCUPIED')

    const map = {
      code: 'code', consoleType: 'console_type', roomType: 'room_type',
      controllers: 'controllers', hourlyRate: 'hourly_rate', status: 'status',
      conditionNote: 'condition_note', isActive: 'is_active',
    }
    const sets = []
    const params = []
    for (const [k, col] of Object.entries(map)) {
      if (body[k] !== undefined) {
        sets.push(`${col} = ?`)
        params.push(k === 'isActive' ? (body.isActive ? 1 : 0) : body[k])
      }
    }
    if (sets.length) {
      sets.push('updated_at = ?'); params.push(new Date().toISOString(), id)
      try {
        db.prepare(`UPDATE consoles SET ${sets.join(', ')} WHERE id = ?`).run(...params)
      } catch (err) {
        if (isUniqueViolation(err, 'consoles')) throw new AppError(409, 'DUPLICATE_CODE')
        throw err
      }
    }
    const updated = db.prepare('SELECT * FROM consoles WHERE id = ?').get(id)
    logAudit(db, {
      actorId: req.user.id, actorName: req.user.full_name, action: 'console_updated',
      entity: 'consoles', entityId: id, description: `Perubahan pada ${updated.code} tersimpan`,
    })
    return ok(res, { console: mapConsole(updated) })
  })

  r.delete('/:id', requireSuperAdmin, (req, res) => {
    const id = parse(idParam, req.params.id)
    const c = db.prepare('SELECT * FROM consoles WHERE id = ?').get(id)
    if (!c) throw new AppError(404, 'CONSOLE_NOT_FOUND')
    if (activeSessionFor(db, id)) throw new AppError(409, 'UNIT_OCCUPIED')
    db.prepare('UPDATE consoles SET is_active = 0, updated_at = ? WHERE id = ?')
      .run(new Date().toISOString(), id)
    logAudit(db, {
      actorId: req.user.id, actorName: req.user.full_name, action: 'console_deactivated',
      entity: 'consoles', entityId: id, description: `Unit ${c.code} dinonaktifkan`,
    })
    return ok(res, { console: mapConsole(db.prepare('SELECT * FROM consoles WHERE id = ?').get(id)) })
  })

  return r
}
