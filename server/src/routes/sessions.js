import { Router } from 'express'
import { z } from 'zod'
import { AppError, ok, created, isUniqueViolation } from '../lib/errors.js'
import { parse, idParam } from '../lib/validate.js'
import { mapConsole, mapSession, mapTransaction, sessionById } from '../lib/mappers.js'
import { requireAuth, requireSuperAdmin } from '../lib/auth.js'
import { logAudit } from '../lib/audit.js'
import { withTx } from '../db.js'
import { getSettingsRow, rulesFromRow } from '../lib/settings.js'
import { quote, validateDuration, roundUpMinutes } from '../lib/pricing.js'
import {
  nowIso, addMinutes, minutesBetween, jakartaDateStr, jakartaDayRangeUtc,
} from '../lib/time.js'

const DURATION_MAX = 1440

const quoteSchema = z.object({
  consoleId: z.coerce.number().int().positive(),
  durationMinutes: z.coerce.number().int().positive().max(DURATION_MAX, 'Durasi maksimal 1440 menit'),
  startedAt: z.string().datetime().optional(),
  extraMinutes: z.coerce.number().int().min(0).max(DURATION_MAX).optional(),
}).strict()

const startSchema = z.object({
  consoleId: z.coerce.number().int().positive(),
  customerName: z.string().min(2, 'Nama pelanggan minimal 2 karakter').max(60, 'Nama pelanggan maksimal 60 karakter'),
  customerContact: z.string().max(40).optional().nullable(),
  durationMinutes: z.coerce.number().int().positive().max(DURATION_MAX, 'Durasi maksimal 1440 menit'),
  notes: z.string().max(300).optional().nullable(),
  startedAt: z.string().datetime().optional(),
}).strict()

const extendSchema = z.object({
  extraMinutes: z.coerce.number().int().min(1, 'Tambahan waktu minimal 1 menit').max(DURATION_MAX),
}).strict()

const finishSchema = z.object({
  paymentMethod: z.enum(['cash', 'transfer', 'qris'], { message: 'Pilih metode pembayaran' }),
  amountPaid: z.coerce.number().int().min(0, 'Uang diterima tidak boleh negatif').optional(),
  discount: z.coerce.number().int().min(0).optional(),
  discountReason: z.string().max(200).optional().nullable(),
  extraCharge: z.coerce.number().int().min(0).optional(),
  notes: z.string().max(300).optional().nullable(),
}).strict()

const voidSchema = z.object({ reason: z.string().min(5, 'Isi alasan pembatalan').max(200) }).strict()

/** Compute-on-read overdue, persisted so reporting sees it too. */
function markOverdue(db) {
  const now = nowIso()
  db.prepare("UPDATE rental_sessions SET status = 'overdue', updated_at = ? WHERE status = 'active' AND ends_at < ?")
    .run(now, now)
}

const int = (n) => (Number.isFinite(Number(n)) ? Math.trunc(Number(n)) : 0)

function nextTrxNumber(db, isoNow) {
  const ymd = jakartaDateStr(isoNow).replace(/-/g, '')
  const prefix = `TRX-${ymd}-`
  const row = db.prepare('SELECT number FROM transactions WHERE number LIKE ? ORDER BY number DESC LIMIT 1')
    .get(`${prefix}%`)
  const last = row ? Number(row.number.slice(prefix.length)) : 0
  const next = (Number.isFinite(last) ? last : 0) + 1
  return `${prefix}${String(next).padStart(4, '0')}`
}

function rewriteSessionValues(db, session, body) {
  const row = getSettingsRow(db)
  const rules = rulesFromRow(row)
  const planned = session.planned_minutes + body.extraMinutes
  const endsAt = addMinutes(session.ends_at, body.extraMinutes)
  const billed = roundUpMinutes(planned, rules.roundingMinutes)
  const ext = JSON.parse(session.extensions_json || '[]')
  ext.push({ minutes: body.extraMinutes, at: nowIso(), byUserId: body.userId })
  db.prepare(
    `UPDATE rental_sessions
        SET planned_minutes = ?, ends_at = ?, billed_minutes = ?, extensions_json = ?, updated_at = ?
      WHERE id = ?`,
  ).run(planned, endsAt, billed, JSON.stringify(ext), nowIso(), session.id)
  if (session.status === 'overdue' && Date.parse(endsAt) > Date.now()) {
    db.prepare("UPDATE rental_sessions SET status = 'active' WHERE id = ?").run(session.id)
  }
}

export default function sessionsRoutes(db) {
  const r = Router()
  // Rental operations are operator-only: a customer account never sees the
  // session board, quotes, or the money path.
  r.use(requireAuth, requireSuperAdmin)

  // S1 — pure price preview, no writes.
  r.post('/quote', (req, res) => {
    const body = parse(quoteSchema, req.body)
    const c = db.prepare('SELECT * FROM consoles WHERE id = ? AND is_active = 1').get(body.consoleId)
    if (!c) throw new AppError(404, 'CONSOLE_NOT_FOUND')
    const rules = rulesFromRow(getSettingsRow(db))
    validateDuration(body.durationMinutes, rules)
    const planned = body.durationMinutes + (body.extraMinutes || 0)
    return ok(res, quote({ durationMinutes: planned, actualMinutes: planned, hourlyRate: c.hourly_rate, rules }))
  })

  // S2 — list + meta
  r.get('/', (req, res) => {
    const { status, consoleId, from, to, q } = req.query
    const page = Math.max(1, int(req.query.page) || 1)
    const limit = Math.min(100, Math.max(1, int(req.query.limit) || 20))
    const where = []
    const params = []
    if (['active', 'overdue', 'finished', 'void'].includes(status)) { where.push('s.status = ?'); params.push(status) }
    if (consoleId) { where.push('s.console_id = ?'); params.push(int(consoleId)) }
    if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) { where.push('s.started_at >= ?'); params.push(jakartaDayRangeUtc(from).startIso) }
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) { where.push('s.started_at <= ?'); params.push(jakartaDayRangeUtc(to).endIso) }
    if (q) { where.push('(c.code LIKE ? OR s.customer_name LIKE ?)'); params.push(`%${q}%`, `%${q}%`) }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const total = db.prepare(
      `SELECT COUNT(*) AS c FROM rental_sessions s JOIN consoles c ON c.id = s.console_id ${whereSql}`,
    ).get(...params).c
    const rows = db.prepare(
      `SELECT s.*, c.code AS console_code
         FROM rental_sessions s JOIN consoles c ON c.id = s.console_id
         ${whereSql}
        ORDER BY s.started_at DESC, s.id DESC
        LIMIT ? OFFSET ?`,
    ).all(...params, limit, (page - 1) * limit)
    return ok(res, { items: rows.map(mapSession) }, {
      page, limit, total, totalPages: Math.ceil(total / limit) || 1,
    })
  })

  // S3 — active board with server-computed remainingSeconds
  r.get('/active', (req, res) => {
    const rows = db.prepare(
      `SELECT s.*, c.code AS console_code
         FROM rental_sessions s JOIN consoles c ON c.id = s.console_id
        WHERE s.status IN ('active','overdue')
        ORDER BY s.ends_at ASC`,
    ).all()
    const now = Date.now()
    const items = rows.map((row) => ({
      ...mapSession(row),
      remainingSeconds: Math.round((Date.parse(row.ends_at) - now) / 1000),
    }))
    return ok(res, { items })
  })

  // S4 — detail
  r.get('/:id', (req, res) => {
    markOverdue(db)
    const id = parse(idParam, req.params.id)
    const row = db.prepare('SELECT * FROM rental_sessions WHERE id = ?').get(id)
    if (!row) throw new AppError(404, 'SESSION_NOT_FOUND')
    const session = sessionById(db, id)
    const consoleRow = db.prepare('SELECT * FROM consoles WHERE id = ?').get(row.console_id)
    const data = { session, console: consoleRow ? mapConsole(consoleRow) : null }
    if (row.transaction_id) {
      const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(row.transaction_id)
      data.transaction = tx ? mapTransaction(tx) : null
    }
    return ok(res, data)
  })

  // S5 — start session inside a transaction; occupancy enforced by the DB index.
  r.post('/', (req, res) => {
    const body = parse(startSchema, req.body)
    const rules = rulesFromRow(getSettingsRow(db))
    validateDuration(body.durationMinutes, rules)

    let sessionId
    try {
      sessionId = withTx(db, () => {
        const c = db.prepare('SELECT * FROM consoles WHERE id = ?').get(body.consoleId)
        if (!c || !c.is_active) throw new AppError(404, 'CONSOLE_NOT_FOUND')
        if (c.status === 'maintenance') throw new AppError(409, 'UNIT_OCCUPIED', 'Unit sedang dalam perawatan.')
        const startedAt = body.startedAt ? new Date(body.startedAt).toISOString() : nowIso()
        const endsAt = addMinutes(startedAt, body.durationMinutes)
        const now = nowIso()
        const info = db.prepare(
          `INSERT INTO rental_sessions
           (console_id, customer_name, customer_contact, status, started_at, ends_at, planned_minutes,
            extensions_json, rate_snapshot, notes, created_by, created_at, updated_at)
           VALUES (?,?,?,'active',?,?,?,'[]',?,?,?,?,?)`,
        ).run(c.id, body.customerName, body.customerContact ?? null, startedAt, endsAt,
          body.durationMinutes, c.hourly_rate, body.notes ?? null, req.user.id, now, now)
        const id = Number(info.lastInsertRowid)
        db.prepare("UPDATE consoles SET status = 'in_use', updated_at = ? WHERE id = ?").run(now, c.id)
        logAudit(db, {
          actorId: req.user.id, actorName: req.user.full_name, action: 'session_started',
          entity: 'rental_sessions', entityId: id,
          description: `Sesi ${c.code} dimulai - ${body.customerName}`,
        })
        return id
      })
    } catch (err) {
      if (isUniqueViolation(err, 'rental_sessions')) throw new AppError(409, 'UNIT_OCCUPIED')
      throw err
    }
    return created(res, { session: sessionById(db, sessionId) })
  })

  // S6 — extend
  r.post('/:id/extend', (req, res) => {
    const id = parse(idParam, req.params.id)
    const body = parse(extendSchema, req.body)
    withTx(db, () => {
      const s = db.prepare('SELECT * FROM rental_sessions WHERE id = ?').get(id)
      if (!s) throw new AppError(404, 'SESSION_NOT_FOUND')
      if (s.status !== 'active' && s.status !== 'overdue') throw new AppError(409, 'SESSION_NOT_ACTIVE')
      rewriteSessionValues(db, s, { extraMinutes: body.extraMinutes, userId: req.user.id })
    })
    return ok(res, { session: sessionById(db, id) })
  })

  // S7 — finish + pay. Everything recomputed from the DB row; client totals ignored.
  r.post('/:id/finish', (req, res) => {
    const id = parse(idParam, req.params.id)
    const body = parse(finishSchema, req.body)
    const isAdmin = req.user.role === 'superadmin'
    if (!isAdmin && ((body.discount || 0) > 0 || (body.extraCharge || 0) > 0)) {
      throw new AppError(403, 'FORBIDDEN', 'Hanya admin yang dapat memberi diskon atau biaya tambahan')
    }

    let txId
    try {
      txId = withTx(db, () => {
        const s = db.prepare('SELECT * FROM rental_sessions WHERE id = ?').get(id)
        if (!s) throw new AppError(404, 'SESSION_NOT_FOUND')
        if (s.status === 'finished') throw new AppError(409, 'SESSION_ALREADY_FINISHED')
        if (s.status === 'void') throw new AppError(409, 'SESSION_NOT_ACTIVE')

        const c = db.prepare('SELECT * FROM consoles WHERE id = ?').get(s.console_id)
        const finishedAt = nowIso()
        const actualMinutes = Math.max(0, minutesBetween(s.started_at, finishedAt))
        const rules = rulesFromRow(getSettingsRow(db))
        const q = quote({
          durationMinutes: s.planned_minutes,
          actualMinutes,
          hourlyRate: s.rate_snapshot,
          rules,
          discount: body.discount || 0,
          extraCharge: body.extraCharge || 0,
        })

        let amountPaid
        let changeDue
        if (body.paymentMethod === 'cash') {
          amountPaid = int(body.amountPaid)
          if (amountPaid < q.total) throw new AppError(400, 'INSUFFICIENT_PAYMENT')
          changeDue = amountPaid - q.total
        } else {
          amountPaid = q.total
          changeDue = 0
        }

        const number = nextTrxNumber(db, finishedAt)
        const info = db.prepare(
          `INSERT INTO transactions
           (number, session_id, console_id, console_code, customer_name, cashier_id, cashier_name,
            subtotal, extra_charge, discount, discount_reason, overtime_minutes, overtime_amount,
            total, payment_method, payment_status, amount_paid, change_due, status, notes, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'paid',?,?,'completed',?,?)`,
        ).run(
          number, id, s.console_id, c?.code ?? null, s.customer_name, req.user.id, req.user.full_name,
          q.subtotal, int(body.extraCharge) || 0, q.discount, body.discountReason ?? null,
          q.overtimeMinutes, q.overtimeAmount, q.total, body.paymentMethod, amountPaid, changeDue,
          body.notes ?? null, finishedAt,
        )
        const transactionId = Number(info.lastInsertRowid)

        const insItem = db.prepare(
          'INSERT INTO transaction_items (transaction_id, kind, label, quantity, unit_price, amount) VALUES (?,?,?,?,?,?)',
        )
        insItem.run(transactionId, 'rental', `Sewa ${c?.code ?? ''} ${q.billableMinutes} menit`, 1, q.subtotal, q.subtotal)
        if (q.overtimeMinutes > 0) {
          insItem.run(transactionId, 'overtime', `Overtime ${q.overtimeMinutes} menit`, 1, q.overtimeAmount, q.overtimeAmount)
        }
        if ((int(body.extraCharge) || 0) > 0) {
          insItem.run(transactionId, 'extra', 'Biaya tambahan', 1, int(body.extraCharge), int(body.extraCharge))
        }
        if (q.discount > 0) {
          insItem.run(transactionId, 'discount', `Diskon${body.discountReason ? ` - ${body.discountReason}` : ''}`, 1, -q.discount, -q.discount)
        }

        db.prepare(
          `UPDATE rental_sessions
              SET status = 'finished', finished_at = ?, billed_minutes = ?, transaction_id = ?, updated_at = ?
            WHERE id = ?`,
        ).run(finishedAt, q.billableMinutes, transactionId, finishedAt, id)
        db.prepare("UPDATE consoles SET status = 'available', updated_at = ? WHERE id = ?").run(finishedAt, s.console_id)
        logAudit(db, {
          actorId: req.user.id, actorName: req.user.full_name, action: 'session_finished',
          entity: 'rental_sessions', entityId: id,
          description: `Sesi ${c?.code ?? ''} selesai - ${s.customer_name}`,
        })
        return transactionId
      })
    } catch (err) {
      if (isUniqueViolation(err, 'transactions')) {
        // Number collision: retry once by rethrowing so Express can 500; extremely unlikely.
        throw new AppError(409, 'SESSION_ALREADY_FINISHED')
      }
      throw err
    }
    const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txId)
    return created(res, { transaction: mapTransaction(tx) })
  })

  // S8 — void (superadmin only; the router guard above already enforces it)
  r.post('/:id/void', (req, res) => {
    const id = parse(idParam, req.params.id)
    const body = parse(voidSchema, req.body)
    withTx(db, () => {
      const s = db.prepare('SELECT * FROM rental_sessions WHERE id = ?').get(id)
      if (!s) throw new AppError(404, 'SESSION_NOT_FOUND')
      if (s.status !== 'active' && s.status !== 'overdue') throw new AppError(409, 'SESSION_NOT_ACTIVE')
      const now = nowIso()
      db.prepare("UPDATE rental_sessions SET status = 'void', void_reason = ?, updated_at = ? WHERE id = ?")
        .run(body.reason, now, id)
      db.prepare("UPDATE consoles SET status = 'available', updated_at = ? WHERE id = ?").run(now, s.console_id)
      const c = db.prepare('SELECT code FROM consoles WHERE id = ?').get(s.console_id)
      logAudit(db, {
        actorId: req.user.id, actorName: req.user.full_name, action: 'session_voided',
        entity: 'rental_sessions', entityId: id,
        description: `Sesi ${c?.code ?? ''} dibatalkan - ${body.reason}`, meta: { reason: body.reason },
      })
    })
    return ok(res, { session: sessionById(db, id) })
  })

  return r
}
