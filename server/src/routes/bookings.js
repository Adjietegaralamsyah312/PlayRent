import { Router } from 'express'
import { z } from 'zod'
import { AppError, ok, created, isUniqueViolation } from '../lib/errors.js'
import { parse, idParam, isoDate, hhmm } from '../lib/validate.js'
import { mapBooking, sessionById } from '../lib/mappers.js'
import { requireAuth, requireSuperAdmin, isSuperAdmin } from '../lib/auth.js'
import { logAudit } from '../lib/audit.js'
import { withTx } from '../db.js'
import { quote, validateDuration } from '../lib/pricing.js'
import { getSettingsRow, rulesFromRow } from '../lib/settings.js'
import {
  nowIso, addMinutes, jakartaLocalToUtc, formatJakarta,
} from '../lib/time.js'

const STATUSES = ['pending', 'confirmed', 'checked_in', 'completed', 'cancelled']
const DURATION_MAX = 1440

const createSchema = z.object({
  consoleId: z.coerce.number().int().positive(),
  customerName: z.string().min(2, 'Nama pelanggan minimal 2 karakter').max(60, 'Nama pelanggan maksimal 60 karakter'),
  customerContact: z.string().max(40).optional().nullable(),
  bookingDate: isoDate,
  startTime: hhmm,
  durationMinutes: z.coerce.number().int().positive().max(DURATION_MAX, 'Durasi maksimal 1440 menit'),
  notes: z.string().max(300).optional().nullable(),
  discount: z.coerce.number().int().min(0).optional(),
}).strict()

const updateSchema = z.object({
  consoleId: z.coerce.number().int().positive().optional(),
  customerName: z.string().min(2, 'Nama pelanggan minimal 2 karakter').max(60).optional(),
  contact: z.string().max(40).nullable().optional(),
  customerContact: z.string().max(40).nullable().optional(),
  bookingDate: isoDate.optional(),
  startTime: hhmm.optional(),
  durationMinutes: z.coerce.number().int().positive().max(DURATION_MAX).optional(),
  status: z.enum(STATUSES).optional(),
  notes: z.string().max(300).nullable().optional(),
  discount: z.coerce.number().int().min(0).optional(),
}).strict()

const checkInSchema = z.object({
  durationMinutes: z.coerce.number().int().positive().max(DURATION_MAX).optional(),
}).strict()

const cancelSchema = z.object({ reason: z.string().max(200).optional().nullable() }).strict()

// A customer may only touch these fields on their own booking. `status` and
// `discount` are operator decisions (money + workflow) — Super Admin only.
const CUSTOMER_EDITABLE = new Set([
  'customerName', 'customerContact', 'contact', 'consoleId', 'startTime', 'durationMinutes', 'notes',
])

const window = (bookingDate, startTime, durationMinutes) => {
  const startMs = jakartaLocalToUtc(bookingDate, startTime)
  const endMs = startMs + durationMinutes * 60000
  return { startMs, endMs, endsAt: new Date(endMs).toISOString() }
}

/** Conflict test lives in SQL (half-open interval): touching boundaries do not conflict. */
function findConflicts(db, { consoleId, startMs, endMs, excludeId = -1 }) {
  return db.prepare(
    `SELECT id, start_time, ends_at
       FROM bookings
      WHERE console_id = ?
        AND status IN ('pending','confirmed')
        AND ? < ends_at_epoch
        AND ? > started_at_epoch
        AND id != ?`,
  ).all(consoleId, startMs, endMs, excludeId)
}

const conflictDetails = (rows) => rows.map((r) => ({
  conflictingBookingId: r.id,
  startTime: r.start_time,
  endTime: formatJakarta(r.ends_at, { hour: '2-digit', minute: '2-digit', hour12: false }),
}))

const estimatedCost = (db, consoleRow, durationMinutes) => {
  const rules = rulesFromRow(getSettingsRow(db))
  return quote({ durationMinutes, actualMinutes: durationMinutes, hourlyRate: consoleRow.hourly_rate, rules }).total
}

export default function bookingsRoutes(db) {
  const r = Router()
  r.use(requireAuth)

  r.get('/', (req, res) => {
    const { date, from, to, status, consoleId, q } = req.query
    const page = Math.max(1, parseInt(req.query.page, 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50))
    const where = []
    const params = []
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) { where.push('booking_date = ?'); params.push(date) }
    if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) { where.push('booking_date >= ?'); params.push(from) }
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) { where.push('booking_date <= ?'); params.push(to) }
    if (STATUSES.includes(status)) { where.push('status = ?'); params.push(status) }
    if (consoleId) { where.push('console_id = ?'); params.push(Number(consoleId)) }
    if (q) { where.push('(customer_name LIKE ? OR customer_contact LIKE ?)'); params.push(`%${q}%`, `%${q}%`) }
    // A customer only ever sees their own bookings — the scope is server-side
    // and cannot be widened by a query parameter.
    if (!isSuperAdmin(req.user)) { where.push('customer_user_id = ?'); params.push(req.user.id) }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const total = db.prepare(`SELECT COUNT(*) AS c FROM bookings ${whereSql}`).get(...params).c
    const rows = db.prepare(
      `SELECT * FROM bookings ${whereSql} ORDER BY booking_date ASC, start_time ASC, id ASC LIMIT ? OFFSET ?`,
    ).all(...params, limit, (page - 1) * limit)
    const now = Date.now()
    return ok(res, { items: rows.map((row) => mapBooking(row, now)) }, {
      page, limit, total, totalPages: Math.ceil(total / limit) || 1,
    })
  })

  r.get('/:id', (req, res) => {
    const id = parse(idParam, req.params.id)
    const b = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id)
    if (!b) throw new AppError(404, 'BOOKING_NOT_FOUND')
    // 404 (not 403) for someone else's booking: never confirm it exists.
    if (!isSuperAdmin(req.user) && b.customer_user_id !== req.user.id) {
      throw new AppError(404, 'BOOKING_NOT_FOUND')
    }
    return ok(res, { booking: mapBooking(b) })
  })

  r.post('/', (req, res) => {
    const body = parse(createSchema, req.body)
    const admin = isSuperAdmin(req.user)
    if (!admin && body.discount !== undefined) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Diskon hanya dapat diatur oleh Super Admin', [
        { path: 'discount', message: 'Field ini hanya dapat diubah Super Admin' },
      ])
    }
    const rules = rulesFromRow(getSettingsRow(db))
    validateDuration(body.durationMinutes, rules)
    const { startMs, endMs, endsAt } = window(body.bookingDate, body.startTime, body.durationMinutes)
    const c = db.prepare('SELECT * FROM consoles WHERE id = ? AND is_active = 1').get(body.consoleId)
    if (!c) throw new AppError(404, 'CONSOLE_NOT_FOUND')

    const conflicts = findConflicts(db, { consoleId: body.consoleId, startMs, endMs })
    if (conflicts.length) throw new AppError(409, 'BOOKING_CONFLICT', undefined, conflictDetails(conflicts))

    const now = nowIso()
    // Owner of the booking is the signed-in customer — never a body field.
    const customerUserId = admin ? null : req.user.id
    const info = db.prepare(
      `INSERT INTO bookings
       (console_id, customer_name, customer_contact, booking_date, start_time, duration_minutes,
        ends_at, started_at_epoch, ends_at_epoch, estimated_cost, status, notes, discount, created_by,
        customer_user_id, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,'pending',?,?,?,?,?,?)`,
    ).run(body.consoleId, body.customerName, body.customerContact ?? null, body.bookingDate, body.startTime,
      body.durationMinutes, endsAt, startMs, endMs, estimatedCost(db, c, body.durationMinutes),
      body.notes ?? null, body.discount || 0, req.user.id, customerUserId, now, now)
    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(Number(info.lastInsertRowid))
    logAudit(db, {
      actorId: req.user.id, actorName: req.user.full_name, action: 'booking_created',
      entity: 'bookings', entityId: booking.id,
      description: `Booking ${c.code} ${body.startTime} - ${body.customerName}`,
    })
    return created(res, { booking: mapBooking(booking) })
  })

  r.patch('/:id', (req, res) => {
    const id = parse(idParam, req.params.id)
    const body = parse(updateSchema, req.body)
    const b = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id)
    if (!b) throw new AppError(404, 'BOOKING_NOT_FOUND')
    const admin = isSuperAdmin(req.user)
    if (!admin) {
      if (b.customer_user_id !== req.user.id) throw new AppError(404, 'BOOKING_NOT_FOUND')
      const forbidden = Object.keys(body).filter((k) => !CUSTOMER_EDITABLE.has(k))
      if (forbidden.length) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          `Field tidak boleh diubah pelanggan: ${forbidden.join(', ')}`,
          forbidden.map((f) => ({ path: f, message: 'Field ini hanya dapat diubah Super Admin' })),
        )
      }
    }

    const consoleId = body.consoleId ?? b.console_id
    const bookingDate = body.bookingDate ?? b.booking_date
    const startTime = body.startTime ?? b.start_time
    const durationMinutes = body.durationMinutes ?? b.duration_minutes
    const scheduleChanged = ['consoleId', 'bookingDate', 'startTime', 'durationMinutes'].some((k) => body[k] !== undefined)

    let { startMs, endMs, endsAt } = { startMs: b.started_at_epoch, endMs: b.ends_at_epoch, endsAt: b.ends_at }
    let est = b.estimated_cost
    if (scheduleChanged) {
      // IDR-10: the operator's minimum duration binds on PATCH exactly like on
      // POST — otherwise a customer shortens the booking below the minimum.
      if (body.durationMinutes !== undefined) {
        validateDuration(durationMinutes, rulesFromRow(getSettingsRow(db)))
      }
      // IDR-9: a unit the operator deactivated is not bookable — POST already
      // filters is_active = 1, PATCH must not let a customer move a booking
      // onto a dead unit. Same lookup, same 404 CONSOLE_NOT_FOUND.
      const c = db.prepare('SELECT * FROM consoles WHERE id = ? AND is_active = 1').get(consoleId)
      if (!c) throw new AppError(404, 'CONSOLE_NOT_FOUND')
      ;({ startMs, endMs, endsAt } = window(bookingDate, startTime, durationMinutes))
      const conflicting = findConflicts(db, { consoleId, startMs, endMs, excludeId: id })
      if (conflicting.length) throw new AppError(409, 'BOOKING_CONFLICT', undefined, conflictDetails(conflicting))
      est = estimatedCost(db, c, durationMinutes)
    }

    const sets = []
    const params = []
    const push = (col, v) => { sets.push(`${col} = ?`); params.push(v) }
    if (body.consoleId !== undefined) push('console_id', consoleId)
    if (body.customerName !== undefined) push('customer_name', body.customerName)
    const contact = body.contact !== undefined ? body.contact : body.customerContact
    if (contact !== undefined) push('customer_contact', contact)
    if (body.bookingDate !== undefined) push('booking_date', bookingDate)
    if (body.startTime !== undefined) push('start_time', startTime)
    if (body.durationMinutes !== undefined) push('duration_minutes', durationMinutes)
    if (scheduleChanged) {
      push('ends_at', endsAt); push('started_at_epoch', startMs); push('ends_at_epoch', endMs); push('estimated_cost', est)
    }
    if (body.status !== undefined) push('status', body.status)
    if (body.notes !== undefined) push('notes', body.notes)
    if (body.discount !== undefined) push('discount', body.discount)
    if (sets.length) {
      push('updated_at', nowIso())
      params.push(id)
      db.prepare(`UPDATE bookings SET ${sets.join(', ')} WHERE id = ?`).run(...params)
    }
    const updated = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id)
    logAudit(db, {
      actorId: req.user.id, actorName: req.user.full_name, action: 'booking_updated',
      entity: 'bookings', entityId: id, description: `Booking ${updated.customer_name} diperbarui`,
    })
    return ok(res, { booking: mapBooking(updated) })
  })

  r.post('/:id/check-in', requireSuperAdmin, (req, res) => {
    const id = parse(idParam, req.params.id)
    const body = parse(checkInSchema, req.body)
    let sessionId
    try {
      sessionId = withTx(db, () => {
        const b = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id)
        if (!b) throw new AppError(404, 'BOOKING_NOT_FOUND')
        if (b.status !== 'confirmed') throw new AppError(409, 'BOOKING_NOT_CONFIRMED')
        const c = db.prepare('SELECT * FROM consoles WHERE id = ?').get(b.console_id)
        if (!c) throw new AppError(404, 'CONSOLE_NOT_FOUND')
        const minutes = body.durationMinutes ?? b.duration_minutes
        const rules = rulesFromRow(getSettingsRow(db))
        validateDuration(minutes, rules)
        const startedAt = nowIso()
        const endsAt = addMinutes(startedAt, minutes)
        const now = nowIso()
        const info = db.prepare(
          `INSERT INTO rental_sessions
           (console_id, customer_name, customer_contact, status, started_at, ends_at, planned_minutes,
            extensions_json, rate_snapshot, notes, booking_id, created_by, created_at, updated_at)
           VALUES (?,?,?,'active',?,?,?,'[]',?,?,?,?,?,?)`,
        ).run(c.id, b.customer_name, b.customer_contact, startedAt, endsAt, minutes,
          c.hourly_rate, b.notes, b.id, req.user.id, now, now)
        const sid = Number(info.lastInsertRowid)
        db.prepare("UPDATE bookings SET status = 'checked_in', session_id = ?, updated_at = ? WHERE id = ?")
          .run(sid, now, id)
        db.prepare("UPDATE consoles SET status = 'in_use', updated_at = ? WHERE id = ?").run(now, c.id)
        logAudit(db, {
          actorId: req.user.id, actorName: req.user.full_name, action: 'session_started',
          entity: 'rental_sessions', entityId: sid,
          description: `Sesi ${c.code} dimulai dari booking - ${b.customer_name}`,
        })
        return sid
      })
    } catch (err) {
      if (isUniqueViolation(err, 'rental_sessions')) throw new AppError(409, 'UNIT_OCCUPIED')
      throw err
    }
    return created(res, { session: sessionById(db, sessionId) })
  })

  r.post('/:id/cancel', (req, res) => {
    const id = parse(idParam, req.params.id)
    const body = parse(cancelSchema, req.body)
    const b = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id)
    if (!b) throw new AppError(404, 'BOOKING_NOT_FOUND')
    // A customer may cancel their own booking only.
    if (!isSuperAdmin(req.user) && b.customer_user_id !== req.user.id) {
      throw new AppError(404, 'BOOKING_NOT_FOUND')
    }
    if (b.status === 'cancelled') throw new AppError(409, 'ALREADY_VOID')
    db.prepare("UPDATE bookings SET status = 'cancelled', notes = ?, updated_at = ? WHERE id = ?")
      .run(body.reason ? `${b.notes ? `${b.notes} | ` : ''}Batal: ${body.reason}` : b.notes, nowIso(), id)
    const updated = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id)
    logAudit(db, {
      actorId: req.user.id, actorName: req.user.full_name, action: 'booking_cancelled',
      entity: 'bookings', entityId: id, description: `Booking ${b.customer_name} dibatalkan`,
      meta: { reason: body.reason ?? null },
    })
    return ok(res, { booking: mapBooking(updated) })
  })

  return r
}
