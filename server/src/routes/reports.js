import { Router } from 'express'
import { ok } from '../lib/errors.js'
import { requireAuth, requireSuperAdmin } from '../lib/auth.js'
import { toCsv } from '../lib/csv.js'
import {
  jakartaDateStr, jakartaDayRangeUtc, isoWeekStr, jakartaMonthStr, formatJakarta,
} from '../lib/time.js'

const OPERATING_HOURS_PER_DAY = 16 // 08:00–24:00, per specs/reports.md
const validYmd = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)

function resolveRange(query) {
  const today = jakartaDateStr()
  const to = validYmd(query.to) ? query.to : today
  const from = validYmd(query.from) ? query.from : `${to.slice(0, 7)}-01`
  const { startIso } = jakartaDayRangeUtc(from)
  const { endIso } = jakartaDayRangeUtc(to)
  const days = Math.max(1, Math.round((Date.parse(endIso) - Date.parse(startIso)) / 86400000))
  return { from, to, startIso, endIso, days }
}

const labelOf = (bucket, iso) =>
  bucket === 'week' ? isoWeekStr(iso) : bucket === 'month' ? jakartaMonthStr(iso) : jakartaDateStr(iso)

export default function reportsRoutes(db) {
  const r = Router()
  // Reports and the CSV export are operator-only.
  r.use(requireAuth, requireSuperAdmin)

  r.get('/summary', (req, res) => {
    const { startIso, endIso } = resolveRange(req.query)
    const tx = db.prepare(
      `SELECT
         IFNULL(SUM(CASE WHEN status != 'void' AND payment_status = 'paid' THEN total ELSE 0 END), 0) AS recorded,
         IFNULL(SUM(CASE WHEN status != 'void' AND payment_status = 'unpaid' THEN total ELSE 0 END), 0) AS outstanding,
         SUM(CASE WHEN status != 'void' THEN 1 ELSE 0 END) AS count,
         SUM(CASE WHEN status = 'void' THEN 1 ELSE 0 END) AS voided
       FROM transactions WHERE created_at >= ? AND created_at <= ?`,
    ).get(startIso, endIso)
    const sess = db.prepare(
      `SELECT COUNT(*) AS count, IFNULL(SUM(IFNULL(billed_minutes, planned_minutes)), 0) AS minutes
         FROM rental_sessions
        WHERE status != 'void' AND started_at >= ? AND started_at <= ?`,
    ).get(startIso, endIso)
    const transactionCount = tx.count || 0
    return ok(res, {
      revenueRecorded: tx.recorded || 0,
      revenueOutstanding: tx.outstanding || 0,
      transactionCount,
      sessionsCount: sess.count || 0,
      totalMinutes: sess.minutes || 0,
      avgPerTransaction: transactionCount ? Math.round((tx.recorded || 0) / transactionCount) : 0,
      voidedCount: tx.voided || 0,
    })
  })

  const bucketReport = (bucket) => (req, res) => {
    const { startIso, endIso } = resolveRange(req.query)
    const txRows = db.prepare(
      `SELECT created_at, total FROM transactions
        WHERE status != 'void' AND payment_status = 'paid' AND created_at >= ? AND created_at <= ?`,
    ).all(startIso, endIso)
    const sessRows = db.prepare(
      `SELECT started_at, IFNULL(billed_minutes, planned_minutes) AS minutes FROM rental_sessions
        WHERE status != 'void' AND started_at >= ? AND started_at <= ?`,
    ).all(startIso, endIso)

    const buckets = new Map()
    const get = (label) => {
      const cur = buckets.get(label) || { date: label, revenue: 0, transactions: 0, sessions: 0, minutes: 0 }
      buckets.set(label, cur)
      return cur
    }
    for (const row of txRows) {
      const b = get(labelOf(bucket, row.created_at))
      b.revenue += row.total
      b.transactions += 1
    }
    for (const row of sessRows) {
      const b = get(labelOf(bucket, row.started_at))
      b.sessions += 1
      b.minutes += row.minutes || 0
    }
    const items = [...buckets.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    return ok(res, { items })
  }

  r.get('/daily', bucketReport('day'))
  r.get('/weekly', bucketReport('week'))
  r.get('/monthly', bucketReport('month'))

  r.get('/units', (req, res) => {
    const { startIso, endIso, days } = resolveRange(req.query)
    const consoles = db.prepare('SELECT * FROM consoles ORDER BY code ASC').all()
    const cap = days * OPERATING_HOURS_PER_DAY * 60
    const agg = db.prepare(
      `SELECT s.console_id AS consoleId,
              COUNT(*) AS sessions,
              IFNULL(SUM(IFNULL(s.billed_minutes, s.planned_minutes)), 0) AS minutes,
              IFNULL(SUM(CASE WHEN t.status != 'void' AND t.payment_status = 'paid' THEN t.total ELSE 0 END), 0) AS revenue
         FROM rental_sessions s
         LEFT JOIN transactions t ON t.session_id = s.id
        WHERE s.status != 'void' AND s.started_at >= ? AND s.started_at <= ?
        GROUP BY s.console_id`,
    ).all(startIso, endIso)
    const byId = new Map(agg.map((a) => [a.consoleId, a]))
    const items = consoles.map((c) => {
      const a = byId.get(c.id) || { sessions: 0, minutes: 0, revenue: 0 }
      const utilizationPct = cap > 0 ? Math.min(100, Math.round((a.minutes / cap) * 100)) : 0
      return {
        consoleId: c.id, code: c.code, consoleType: c.console_type, roomType: c.room_type,
        sessions: a.sessions, minutes: a.minutes, revenue: a.revenue, utilizationPct,
      }
    }).sort((a, b) => b.revenue - a.revenue)
    return ok(res, { items })
  })

  r.get('/payments', (req, res) => {
    const { startIso, endIso } = resolveRange(req.query)
    const { method, status } = req.query
    const where = ['created_at >= ?', 'created_at <= ?']
    const params = [startIso, endIso]
    if (['cash', 'transfer', 'qris'].includes(method)) { where.push('payment_method = ?'); params.push(method) }
    if (['paid', 'unpaid', 'void'].includes(status)) { where.push('payment_status = ?'); params.push(status) }
    const whereSql = `WHERE ${where.join(' AND ')}`
    const rows = db.prepare(`SELECT * FROM transactions ${whereSql} ORDER BY created_at DESC, id DESC`).all(...params)
    const totals = {
      count: rows.length,
      recorded: 0, outstanding: 0, voided: 0,
      subtotal: 0,
      byMethod: { cash: { count: 0, total: 0 }, transfer: { count: 0, total: 0 }, qris: { count: 0, total: 0 } },
    }
    for (const row of rows) {
      if (row.status === 'void') { totals.voided += row.total; continue }
      if (row.payment_status === 'paid') { totals.recorded += row.total; totals.subtotal += row.total }
      else totals.outstanding += row.total
      const m = totals.byMethod[row.payment_method]
      if (m) { m.count += 1; m.total += row.total }
    }
    const items = rows.map((row) => ({
      id: row.id, at: row.created_at, number: row.number, customerName: row.customer_name,
      consoleCode: row.console_code, method: row.payment_method, status: row.payment_status,
      total: row.total,
    }))
    return ok(res, { items, totals })
  })

  r.get('/export.csv', (req, res) => {
    const type = ['sessions', 'transactions', 'units', 'daily'].includes(req.query.type) ? req.query.type : 'transactions'
    const { from, to, startIso, endIso, days } = resolveRange(req.query)
    const money = (n) => String(n ?? 0)
    let rows = []
    let columns = []
    if (type === 'transactions') {
      rows = db.prepare('SELECT * FROM transactions WHERE created_at >= ? AND created_at <= ? ORDER BY created_at ASC').all(startIso, endIso)
      columns = [
        { key: 'number', label: 'No. Transaksi' },
        { key: 'createdAt', label: 'Waktu', value: (r) => formatJakarta(r.created_at, { dateStyle: 'short', timeStyle: 'short' }) },
        { key: 'customerName', label: 'Pelanggan', value: (r) => r.customer_name },
        { key: 'consoleCode', label: 'Unit', value: (r) => r.console_code },
        { key: 'subtotal', label: 'Subtotal', value: (r) => money(r.subtotal) },
        { key: 'extraCharge', label: 'Biaya Tambahan', value: (r) => money(r.extra_charge) },
        { key: 'discount', label: 'Diskon', value: (r) => money(r.discount) },
        { key: 'total', label: 'Total', value: (r) => money(r.total) },
        { key: 'method', label: 'Metode', value: (r) => r.payment_method },
        { key: 'paymentStatus', label: 'Status Bayar', value: (r) => r.payment_status },
        { key: 'status', label: 'Status', value: (r) => r.status },
      ]
    } else if (type === 'sessions') {
      rows = db.prepare(
        `SELECT s.*, c.code AS console_code FROM rental_sessions s JOIN consoles c ON c.id = s.console_id
          WHERE s.started_at >= ? AND s.started_at <= ? ORDER BY s.started_at ASC`,
      ).all(startIso, endIso)
      columns = [
        { key: 'id', label: 'ID' },
        { key: 'consoleCode', label: 'Unit', value: (r) => r.console_code },
        { key: 'customerName', label: 'Pelanggan', value: (r) => r.customer_name },
        { key: 'startedAt', label: 'Mulai', value: (r) => formatJakarta(r.started_at, { dateStyle: 'short', timeStyle: 'short' }) },
        { key: 'finishedAt', label: 'Selesai', value: (r) => (r.finished_at ? formatJakarta(r.finished_at, { dateStyle: 'short', timeStyle: 'short' }) : '') },
        { key: 'status', label: 'Status' },
        { key: 'plannedMinutes', label: 'Durasi Rencana', value: (r) => money(r.planned_minutes) },
        { key: 'billedMinutes', label: 'Durasi Tagih', value: (r) => money(r.billed_minutes) },
      ]
    } else if (type === 'units') {
      const consoles = db.prepare('SELECT * FROM consoles ORDER BY code ASC').all()
      const agg = db.prepare(
        `SELECT s.console_id AS id, COUNT(*) AS sessions, IFNULL(SUM(IFNULL(s.billed_minutes, s.planned_minutes)), 0) AS minutes,
                IFNULL(SUM(CASE WHEN t.status != 'void' AND t.payment_status = 'paid' THEN t.total ELSE 0 END), 0) AS revenue
           FROM rental_sessions s LEFT JOIN transactions t ON t.session_id = s.id
          WHERE s.status != 'void' AND s.started_at >= ? AND s.started_at <= ? GROUP BY s.console_id`,
      ).all(startIso, endIso)
      const byId = new Map(agg.map((a) => [a.id, a]))
      const cap = days * OPERATING_HOURS_PER_DAY * 60
      rows = consoles.map((c) => {
        const a = byId.get(c.id) || { sessions: 0, minutes: 0, revenue: 0 }
        return { ...c, sessions: a.sessions, minutes: a.minutes, revenue: a.revenue, utilizationPct: cap ? Math.min(100, Math.round((a.minutes / cap) * 100)) : 0 }
      })
      columns = [
        { key: 'code', label: 'Kode Unit' },
        { key: 'consoleType', label: 'Jenis', value: (r) => r.console_type },
        { key: 'roomType', label: 'Ruangan', value: (r) => r.room_type },
        { key: 'hourlyRate', label: 'Tarif/Jam', value: (r) => money(r.hourly_rate) },
        { key: 'sessions', label: 'Sesi' },
        { key: 'minutes', label: 'Menit' },
        { key: 'revenue', label: 'Pendapatan', value: (r) => money(r.revenue) },
        { key: 'utilizationPct', label: 'Utilisasi (%)' },
      ]
    } else {
      const txRows = db.prepare(
        `SELECT created_at, total FROM transactions WHERE status != 'void' AND payment_status = 'paid' AND created_at >= ? AND created_at <= ?`,
      ).all(startIso, endIso)
      const sessRows = db.prepare(
        `SELECT started_at, IFNULL(billed_minutes, planned_minutes) AS minutes FROM rental_sessions WHERE status != 'void' AND started_at >= ? AND started_at <= ?`,
      ).all(startIso, endIso)
      const buckets = new Map()
      const get = (label) => { const c = buckets.get(label) || { date: label, revenue: 0, transactions: 0, sessions: 0, minutes: 0 }; buckets.set(label, c); return c }
      for (const row of txRows) { const b = get(jakartaDateStr(row.created_at)); b.revenue += row.total; b.transactions += 1 }
      for (const row of sessRows) { const b = get(jakartaDateStr(row.started_at)); b.sessions += 1; b.minutes += row.minutes || 0 }
      rows = [...buckets.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
      columns = [
        { key: 'date', label: 'Tanggal' },
        { key: 'revenue', label: 'Pendapatan', value: (r) => money(r.revenue) },
        { key: 'transactions', label: 'Transaksi' },
        { key: 'sessions', label: 'Sesi' },
        { key: 'minutes', label: 'Menit' },
      ]
    }
    const csv = toCsv(rows, columns)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="playrent-${type}-${from}-${to}.csv"`)
    res.send(csv)
  })

  return r
}
