import { Router } from 'express'
import { ok } from '../lib/errors.js'
import { requireAuth, requireSuperAdmin } from '../lib/auth.js'
import { getSettingsRow, rulesFromRow } from '../lib/settings.js'
import {
  jakartaDateStr, jakartaDayRangeUtc, jakartaHour, isoWeekStr, jakartaMonthStr,
} from '../lib/time.js'

const validYmd = (s) => s && /^\d{4}-\d{2}-\d{2}$/.test(s)
const rangeFor = (from, to) => {
  if (validYmd(from) && validYmd(to)) {
    return { startIso: jakartaDayRangeUtc(from).startIso, endIso: jakartaDayRangeUtc(to).endIso }
  }
  return null
}

export default function dashboardRoutes(db) {
  const r = Router()
  // Operational dashboard: revenue and activity are operator-only.
  r.use(requireAuth, requireSuperAdmin)

  r.get('/summary', (req, res) => {
    const today = jakartaDateStr()
    const { startIso, endIso } = jakartaDayRangeUtc(today)
    const week = isoWeekStr()
    const month = jakartaMonthStr()

    const unitsRow = db.prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status='available' THEN 1 ELSE 0 END) AS available,
              SUM(CASE WHEN status='in_use' THEN 1 ELSE 0 END) AS in_use,
              SUM(CASE WHEN status='reserved' THEN 1 ELSE 0 END) AS reserved,
              SUM(CASE WHEN status='maintenance' THEN 1 ELSE 0 END) AS maintenance
         FROM consoles WHERE is_active = 1`,
    ).get()

    const revToday = db.prepare(
      `SELECT IFNULL(SUM(total),0) AS revenue, COUNT(*) AS transactions
         FROM transactions
        WHERE status != 'void' AND payment_status = 'paid' AND created_at >= ? AND created_at <= ?`,
    ).get(startIso, endIso)

    const sessionsToday = db.prepare(
      "SELECT COUNT(*) AS c FROM rental_sessions WHERE status != 'void' AND started_at >= ? AND started_at <= ?",
    ).get(startIso, endIso).c

    // Week/month: revenue is bucketed by Jakarta calendar labels, computed in JS from paid rows.
    const monthRows = db.prepare(
      "SELECT created_at, total FROM transactions WHERE status != 'void' AND payment_status = 'paid' AND substr(created_at,1,7) >= ?",
    ).all(month.slice(0, 4) + '-01')
    let revenueWeek = 0
    let revenueMonth = 0
    for (const row of monthRows) {
      if (isoWeekStr(row.created_at) === week) revenueWeek += row.total
      if (jakartaMonthStr(row.created_at) === month) revenueMonth += row.total
    }

    return ok(res, {
      units: {
        total: unitsRow.total || 0,
        available: unitsRow.available || 0,
        inUse: unitsRow.in_use || 0,
        reserved: unitsRow.reserved || 0,
        maintenance: unitsRow.maintenance || 0,
      },
      today: { sessions: sessionsToday, revenue: revToday.revenue, transactions: revToday.transactions },
      range: { revenueToday: revToday.revenue, revenueWeek, revenueMonth },
    })
  })

  r.get('/activity', (req, res) => {
    const types = ['session_started', 'session_finished', 'booking_created', 'transaction_voided']
    const rows = db.prepare(
      `SELECT action, created_at, description, actor_name, entity, entity_id
         FROM audit_logs
        WHERE action IN (${types.map(() => '?').join(',')})
        ORDER BY created_at DESC, id DESC LIMIT 20`,
    ).all(...types)
    const items = rows.map((row) => ({
      type: row.action,
      at: row.created_at,
      description: row.description,
      actor: row.actor_name,
      refId: row.entity_id,
    }))
    return ok(res, { items })
  })

  r.get('/ending-soon', (req, res) => {
    const rules = rulesFromRow(getSettingsRow(db))
    const warn = [...(rules.warnMinutes || [])].filter((n) => Number.isFinite(n)).sort((a, b) => a - b)
    const warnMax = warn.length ? Math.max(...warn) : 10
    const critMin = warn.length ? Math.min(...warn) : 1
    const now = Date.now()
    const rows = db.prepare(
      `SELECT s.*, c.code AS console_code
         FROM rental_sessions s JOIN consoles c ON c.id = s.console_id
        WHERE s.status IN ('active','overdue')
        ORDER BY s.ends_at ASC`,
    ).all()
    const items = []
    for (const row of rows) {
      const remainingSeconds = Math.round((Date.parse(row.ends_at) - now) / 1000)
      const minutes = remainingSeconds / 60
      if (minutes > warnMax) continue
      let severity = 'warn'
      if (remainingSeconds < 0) severity = 'overdue'
      else if (minutes <= critMin) severity = 'critical'
      items.push({
        sessionId: row.id,
        consoleCode: row.console_code,
        customerName: row.customer_name,
        endsAt: row.ends_at,
        remainingSeconds,
        severity,
      })
    }
    return ok(res, { items })
  })

  r.get('/revenue-chart', (req, res) => {
    const groupBy = ['day', 'week', 'month'].includes(req.query.groupBy) ? req.query.groupBy : 'day'
    const range = rangeFor(req.query.from, req.query.to)
      || (() => { const t = jakartaDateStr(); return { startIso: jakartaDayRangeUtc(t).startIso, endIso: jakartaDayRangeUtc(t).endIso } })()
    const rows = db.prepare(
      `SELECT created_at, total FROM transactions
        WHERE status != 'void' AND payment_status = 'paid' AND created_at >= ? AND created_at <= ?
        ORDER BY created_at ASC`,
    ).all(range.startIso, range.endIso)

    const buckets = new Map()
    for (const row of rows) {
      const label = groupBy === 'month' ? jakartaMonthStr(row.created_at)
        : groupBy === 'week' ? isoWeekStr(row.created_at)
          : jakartaDateStr(row.created_at)
      const cur = buckets.get(label) || { label, revenue: 0, transactions: 0 }
      cur.revenue += row.total
      cur.transactions += 1
      buckets.set(label, cur)
    }
    return ok(res, { buckets: [...buckets.values()] })
  })

  r.get('/busy-hours', (req, res) => {
    const range = rangeFor(req.query.from, req.query.to) || { startIso: '0000', endIso: '9999' }
    const rows = db.prepare(
      `SELECT s.started_at, IFNULL(t.total, 0) AS total
         FROM rental_sessions s
         LEFT JOIN transactions t ON t.session_id = s.id AND t.status != 'void'
        WHERE s.status != 'void' AND s.started_at >= ? AND s.started_at <= ?`,
    ).all(range.startIso, range.endIso)
    const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, sessions: 0, revenue: 0 }))
    for (const row of rows) {
      const h = jakartaHour(row.started_at)
      hours[h].sessions += 1
      hours[h].revenue += row.total || 0
    }
    return ok(res, { hours })
  })

  return r
}
