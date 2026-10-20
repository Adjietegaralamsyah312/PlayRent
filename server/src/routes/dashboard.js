import { Router } from 'express'
import { ok, AppError } from '../lib/errors.js'
import { requireAuth, requireSuperAdmin } from '../lib/auth.js'
import { getSettingsRow, rulesFromRow } from '../lib/settings.js'
import {
  jakartaDateStr, jakartaDayRangeUtc, jakartaHour, isoWeekStr, jakartaMonthStr,
  isoWeekRange, jakartaMonthRange, periodLabels, daysBetween, shiftYmd,
} from '../lib/time.js'

const validYmd = (s) => s && /^\d{4}-\d{2}-\d{2}$/.test(s)

// BE-016: a dashboard query must never scan an unbounded window. 365 days is
// more than any operator ever needs on a screen and keeps the work predictable.
const MAX_RANGE_DAYS = 365
const DEFAULT_RANGE_DAYS = 30

/**
 * The window a dashboard query may read. Both bounds are required (a
 * one-sided range is ignored, as before); a window wider than MAX_RANGE_DAYS
 * is refused with 400 instead of being scanned.
 */
function boundedRange(from, to) {
  if (validYmd(from) && validYmd(to)) {
    const days = daysBetween(from, to) + 1
    if (days < 1) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Rentang tanggal tidak valid: `from` harus sebelum `to`')
    }
    if (days > MAX_RANGE_DAYS) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `Rentang tanggal terlalu lebar (${days} hari). Maksimal ${MAX_RANGE_DAYS} hari per permintaan.`,
      )
    }
    return { from, to, days, startIso: jakartaDayRangeUtc(from).startIso, endIso: jakartaDayRangeUtc(to).endIso }
  }
  const end = jakartaDateStr()
  const start = shiftYmd(end, -(DEFAULT_RANGE_DAYS - 1))
  return {
    from: start,
    to: end,
    days: DEFAULT_RANGE_DAYS,
    startIso: jakartaDayRangeUtc(start).startIso,
    endIso: jakartaDayRangeUtc(end).endIso,
  }
}

export default function dashboardRoutes(db) {
  const r = Router()
  // Operational dashboard: revenue and activity are operator-only.
  r.use(requireAuth, requireSuperAdmin)

  r.get('/summary', (req, res) => {
    const today = jakartaDateStr()
    const { startIso, endIso } = jakartaDayRangeUtc(today)

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

    // Week/month revenue.
    //
    // BE-011: the window is the 7 days of the current ISO week (Mon..Sun).
    // The old query filtered on the UTC month, so on 1-4 January the days of
    // the week that fall in the previous December were silently dropped.
    // The week may start in the previous year — never assume the same year.
    //
    // BE-016: both windows are bounded (7 and <= 31 days) — no more "every
    // transaction since January" pulled into memory.
    const week = isoWeekRange()
    const month = jakartaMonthRange()
    const weekStart = jakartaDayRangeUtc(week.start).startIso
    const weekEnd = jakartaDayRangeUtc(week.end).endIso
    const monthStart = jakartaDayRangeUtc(month.start).startIso
    const monthEnd = jakartaDayRangeUtc(month.end).endIso

    const paidRevenue = db.prepare(
      `SELECT IFNULL(SUM(total), 0) AS revenue FROM transactions
        WHERE status != 'void' AND payment_status = 'paid' AND created_at >= ? AND created_at <= ?`,
    )
    const revenueWeek = paidRevenue.get(weekStart, weekEnd).revenue
    const revenueMonth = paidRevenue.get(monthStart, monthEnd).revenue

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
    const { from, to, startIso, endIso } = boundedRange(req.query.from, req.query.to)
    const rows = db.prepare(
      `SELECT created_at, total FROM transactions
        WHERE status != 'void' AND payment_status = 'paid' AND created_at >= ? AND created_at <= ?
        ORDER BY created_at ASC`,
    ).all(startIso, endIso)

    // BE-007: every period in the window gets a bucket, empty ones included —
    // a chart that skips quiet days silently lies about the shape of the week.
    const bucket = groupBy === 'month' ? 'month' : groupBy === 'week' ? 'week' : 'day'
    const buckets = new Map()
    for (const label of periodLabels(from, to, bucket)) buckets.set(label, { label, revenue: 0, transactions: 0 })
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
    // BE-016: the old default read every session ever recorded. The default
    // window is now the last 30 days, and a wider request is refused.
    const { startIso, endIso } = boundedRange(req.query.from, req.query.to)
    const rows = db.prepare(
      `SELECT s.started_at, IFNULL(t.total, 0) AS total
         FROM rental_sessions s
         LEFT JOIN transactions t ON t.session_id = s.id AND t.status != 'void'
        WHERE s.status != 'void' AND s.started_at >= ? AND s.started_at <= ?`,
    ).all(startIso, endIso)
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
