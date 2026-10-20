// Time helpers. All storage is ISO-8601 UTC; Jakarta-local is presentation.
// Never hardcode +07:00 — the tz database is authoritative.
const JAKARTA = 'Asia/Jakarta'

const dtfParts = new Intl.DateTimeFormat('en-US', {
  timeZone: JAKARTA, hour12: false,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
})
const dtfYmd = new Intl.DateTimeFormat('en-CA', {
  timeZone: JAKARTA, year: 'numeric', month: '2-digit', day: '2-digit',
})

export const nowIso = () => new Date().toISOString()

const toMs = (v) => (v instanceof Date ? v.getTime() : Date.parse(v))

export function addMinutes(when, m) {
  return new Date(toMs(when) + Math.round(m) * 60000).toISOString()
}

export function minutesBetween(a, b) {
  return Math.floor((toMs(b) - toMs(a)) / 60000)
}

/** 'YYYY-MM-DD' in Asia/Jakarta for a Date or ISO string. */
export function jakartaDateStr(d = new Date()) {
  return dtfYmd.format(d instanceof Date ? d : new Date(d))
}

export function nowJakartaParts(d = new Date()) {
  const p = {}
  for (const x of dtfParts.formatToParts(d instanceof Date ? d : new Date(d))) p[x.type] = x.value
  return {
    year: +p.year, month: +p.month, day: +p.day,
    hour: +p.hour % 24, minute: +p.minute, second: +p.second,
  }
}

export const jakartaHour = (d) => nowJakartaParts(d).hour

function tzOffsetMs(date, tz = JAKARTA) {
  const p = {}
  for (const x of new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date)) p[x.type] = x.value
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second)
  return asUtc - date.getTime()
}

/** Wall-clock Jakarta (date + 'HH:mm') -> UTC epoch ms. Two-pass offset resolve. */
export function jakartaLocalToUtc(ymd, hhmm = '00:00') {
  const [y, m, d] = ymd.split('-').map(Number)
  const [h, mi] = hhmm.split(':').map(Number)
  const naive = Date.UTC(y, m - 1, d, h, mi, 0, 0)
  let ts = naive - tzOffsetMs(new Date(naive))
  ts = naive - tzOffsetMs(new Date(ts))
  return ts
}

const ymdOfUtcDate = (dt) =>
  `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`

/** Inclusive Jakarta-local day -> {startIso, endIso} UTC instants. */
export function jakartaDayRangeUtc(ymd) {
  const [y, m, d] = ymd.split('-').map(Number)
  const start = jakartaLocalToUtc(ymd, '00:00')
  const nextYmd = ymdOfUtcDate(new Date(Date.UTC(y, m - 1, d + 1)))
  const end = jakartaLocalToUtc(nextYmd, '00:00') - 1
  return { startIso: new Date(start).toISOString(), endIso: new Date(end).toISOString() }
}

export function formatJakarta(iso, opts = {}) {
  return new Intl.DateTimeFormat('id-ID', { timeZone: JAKARTA, ...opts }).format(
    iso instanceof Date ? iso : new Date(iso),
  )
}

/** ISO-8601 week label from a plain Y/M/D triple (no timezone involved). */
function isoWeekFromYmd(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day))
  const dow = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dow)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/** ISO-8601 week label, e.g. '2026-W42', computed on the Jakarta-local date. */
export function isoWeekStr(d = new Date()) {
  const p = nowJakartaParts(d)
  return isoWeekFromYmd(p.year, p.month, p.day)
}

export function jakartaMonthStr(d = new Date()) {
  const p = nowJakartaParts(d)
  return `${p.year}-${String(p.month).padStart(2, '0')}`
}

const ymdToUtcDay = (ymd) => {
  const [y, m, d] = ymd.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

const utcDayToYmd = (ms) => {
  const dt = new Date(ms)
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

/** Whole days between two 'YYYY-MM-DD' strings (b - a). */
export const daysBetween = (a, b) => Math.round((ymdToUtcDay(b) - ymdToUtcDay(a)) / 86400000)

/** Shift a 'YYYY-MM-DD' string by n days. */
export const shiftYmd = (ymd, days) => utcDayToYmd(ymdToUtcDay(ymd) + days * 86400000)

/**
 * Every period label in the inclusive Jakarta-local range [from, to].
 * bucket: 'day' -> 'YYYY-MM-DD', 'week' -> 'YYYY-Www' (ISO), 'month' -> 'YYYY-MM'.
 * Used to fill empty periods so a report never silently drops a quiet day.
 */
export function periodLabels(from, to, bucket = 'day') {
  const total = daysBetween(from, to)
  if (total < 0) return []
  const labels = []
  const seen = new Set()
  for (let i = 0; i <= total; i++) {
    const ms = ymdToUtcDay(from) + i * 86400000
    const dt = new Date(ms)
    const y = dt.getUTCFullYear()
    const m = dt.getUTCMonth() + 1
    const d = dt.getUTCDate()
    const label = bucket === 'week' ? isoWeekFromYmd(y, m, d)
      : bucket === 'month' ? `${y}-${String(m).padStart(2, '0')}`
        : `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    if (!seen.has(label)) { seen.add(label); labels.push(label) }
  }
  return labels
}

/**
 * The 7 days of the ISO week (Mon..Sun) that contains `d`, as Jakarta-local
 * YYYY-MM-DD strings. The week may start in the previous year (e.g. 2026-W01
 * starts on 2025-12-29) — callers must not assume the same calendar year.
 */
export function isoWeekRange(d = new Date()) {
  const p = nowJakartaParts(d)
  const ms = Date.UTC(p.year, p.month - 1, p.day)
  const dow = new Date(ms).getUTCDay() || 7
  const startMs = ms - (dow - 1) * 86400000
  return { start: utcDayToYmd(startMs), end: utcDayToYmd(startMs + 6 * 86400000) }
}

/** The Jakarta-local calendar month that contains `d`, as YYYY-MM-DD bounds. */
export function jakartaMonthRange(d = new Date()) {
  const p = nowJakartaParts(d)
  const nextMonthStart = p.month === 12 ? Date.UTC(p.year + 1, 0, 1) : Date.UTC(p.year, p.month, 1)
  return {
    start: `${p.year}-${String(p.month).padStart(2, '0')}-01`,
    end: utcDayToYmd(nextMonthStart - 86400000),
  }
}
