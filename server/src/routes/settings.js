import { Router } from 'express'
import { z } from 'zod'
import { AppError, ok, created } from '../lib/errors.js'
import { parse, idParam } from '../lib/validate.js'
import { mapPackage } from '../lib/mappers.js'
import { getSettingsRow, settingsToApi, settingsToPublicApi } from '../lib/settings.js'
import { requireAuth, requireSuperAdmin, isSuperAdmin } from '../lib/auth.js'
import { logAudit } from '../lib/audit.js'
import { nowIso } from '../lib/time.js'

const businessSchema = z.object({
  name: z.string().min(1, 'Isi nama rental').max(120),
  address: z.string().max(300).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  receiptFooter: z.string().max(300).nullable().optional(),
  taxNote: z.string().max(300).nullable().optional(),
}).strict()

const rulesSchema = z.object({
  defaultHourlyRate: z.coerce.number().int().min(1000, 'Tarif minimal Rp 1.000'),
  minDurationMinutes: z.coerce.number().int().min(15, 'Durasi minimum minimal 15 menit').max(480, 'Durasi minimum maksimal 480 menit'),
  roundingMinutes: z.coerce.number().int().refine((v) => [5, 10, 15, 30, 60].includes(v), 'Pembulatan harus 5, 10, 15, 30, atau 60 menit'),
  overtimeRatePerHour: z.coerce.number().int().min(1000, 'Tarif overtime minimal Rp 1.000'),
  overtimeGraceMinutes: z.coerce.number().int().min(0).max(60, 'Toleransi overtime maksimal 60 menit'),
  warnMinutes: z.array(z.coerce.number().int().min(1, 'Ambang peringatan harus 1 sampai 120 menit').max(120, 'Ambang peringatan harus 1 sampai 120 menit'))
    .min(1, 'Sediakan minimal satu ambang peringatan'),
}).strict()

const updateSchema = z.object({
  business: businessSchema.optional(),
  rules: rulesSchema.optional(),
  payments: z.object({
    methods: z.array(z.enum(['cash', 'transfer', 'qris'])).min(1, 'Pilih minimal satu metode pembayaran'),
  }).strict().optional(),
}).strict()

export default function settingsRoutes(db) {
  const r = Router()
  r.use(requireAuth)

  // Read: a customer gets the renter-facing subset only (no payment methods,
  // no internal overtime tariff).
  r.get('/', (req, res) => {
    const row = getSettingsRow(db)
    return ok(res, isSuperAdmin(req.user) ? settingsToApi(row) : settingsToPublicApi(row))
  })

  r.put('/', requireSuperAdmin, (req, res) => {
    const body = parse(updateSchema, req.body)
    const before = getSettingsRow(db)
    const beforeApi = settingsToApi(before)
    const sets = []
    const params = []
    const push = (col, val) => { sets.push(`${col} = ?`); params.push(val) }

    if (body.business) {
      const b = body.business
      push('business_name', b.name)
      if (b.address !== undefined) push('address', b.address ?? '')
      if (b.phone !== undefined) push('phone', b.phone ?? '')
      if (b.receiptFooter !== undefined) push('receipt_footer', b.receiptFooter ?? '')
      if (b.taxNote !== undefined) push('tax_note', b.taxNote ?? '')
    }
    if (body.rules) {
      const rl = body.rules
      push('min_duration_minutes', rl.minDurationMinutes)
      push('rounding_minutes', rl.roundingMinutes)
      push('overtime_rate_per_hour', rl.overtimeRatePerHour)
      push('overtime_grace_minutes', rl.overtimeGraceMinutes)
      push('default_hourly_rate', rl.defaultHourlyRate)
      push('warn_minutes_json', JSON.stringify(rl.warnMinutes))
    }
    if (body.payments) push('payment_methods_json', JSON.stringify(body.payments.methods))

    if (sets.length) {
      push('updated_at', nowIso())
      params.push(1)
      db.prepare(`UPDATE business_settings SET ${sets.join(', ')} WHERE id = ?`).run(...params)
    }
    const after = settingsToApi(getSettingsRow(db))
    logAudit(db, {
      actorId: req.user.id, actorName: req.user.full_name, action: 'settings_updated',
      entity: 'business_settings', entityId: 1, description: 'Pengaturan usaha diperbarui',
      meta: { before: beforeApi, after },
    })
    return ok(res, after)
  })

  return r
}

// --- packages (P3–P6) -------------------------------------------------------

const packageCreateSchema = z.object({
  name: z.string().min(1, 'Isi nama paket').max(40, 'Nama paket maksimal 40 karakter'),
  durationMinutes: z.coerce.number().int().positive('Isi durasi paket'),
  price: z.coerce.number().int().min(1000, 'Harga minimal Rp 1.000'),
  consoleType: z.enum(['PS4', 'PS5']).nullable().optional(),
  isActive: z.boolean().optional(),
}).strict()

const packageUpdateSchema = packageCreateSchema.partial().strict()

export function packagesRoutes(db) {
  const r = Router()
  r.use(requireAuth)

  r.get('/', (req, res) => {
    const rows = db.prepare('SELECT * FROM packages ORDER BY duration_minutes ASC, id ASC').all()
    return ok(res, { items: rows.map(mapPackage) })
  })

  r.post('/', requireSuperAdmin, (req, res) => {
    const body = parse(packageCreateSchema, req.body)
    const info = db.prepare(
      `INSERT INTO packages (name, duration_minutes, price, console_type, is_active, created_at)
       VALUES (?,?,?,?,?,?)`,
    ).run(body.name, body.durationMinutes, body.price, body.consoleType ?? null,
      body.isActive === false ? 0 : 1, nowIso())
    const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(Number(info.lastInsertRowid))
    logAudit(db, {
      actorId: req.user.id, actorName: req.user.full_name, action: 'package_created',
      entity: 'packages', entityId: pkg.id, description: `Paket "${pkg.name}" ditambahkan`,
    })
    return created(res, { package: mapPackage(pkg) })
  })

  r.patch('/:id', requireSuperAdmin, (req, res) => {
    const id = parse(idParam, req.params.id)
    const body = parse(packageUpdateSchema, req.body)
    const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(id)
    if (!pkg) throw new AppError(404, 'PACKAGE_NOT_FOUND')
    const map = { name: 'name', durationMinutes: 'duration_minutes', price: 'price', consoleType: 'console_type', isActive: 'is_active' }
    const sets = []
    const params = []
    for (const [k, col] of Object.entries(map)) {
      if (body[k] !== undefined) {
        sets.push(`${col} = ?`)
        params.push(k === 'isActive' ? (body.isActive ? 1 : 0) : body[k])
      }
    }
    if (sets.length) {
      params.push(id)
      db.prepare(`UPDATE packages SET ${sets.join(', ')} WHERE id = ?`).run(...params)
    }
    const updated = db.prepare('SELECT * FROM packages WHERE id = ?').get(id)
    logAudit(db, {
      actorId: req.user.id, actorName: req.user.full_name, action: 'package_updated',
      entity: 'packages', entityId: id, description: `Paket "${updated.name}" diperbarui`,
    })
    return ok(res, { package: mapPackage(updated) })
  })

  r.delete('/:id', requireSuperAdmin, (req, res) => {
    const id = parse(idParam, req.params.id)
    const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(id)
    if (!pkg) throw new AppError(404, 'PACKAGE_NOT_FOUND')
    db.prepare('UPDATE packages SET is_active = 0 WHERE id = ?').run(id)
    const updated = db.prepare('SELECT * FROM packages WHERE id = ?').get(id)
    logAudit(db, {
      actorId: req.user.id, actorName: req.user.full_name, action: 'package_deactivated',
      entity: 'packages', entityId: id, description: `Paket "${pkg.name}" dinonaktifkan`,
    })
    return ok(res, { package: mapPackage(updated) })
  })

  return r
}
