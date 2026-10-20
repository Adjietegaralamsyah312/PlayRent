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

/** ISO-8601 week label, e.g. '2026-W42', computed on the Jakarta-local date. */
export function isoWeekStr(d = new Date()) {
  const p = nowJakartaParts(d)
  const date = new Date(Date.UTC(p.year, p.month - 1, p.day))
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export function jakartaMonthStr(d = new Date()) {
  const p = nowJakartaParts(d)
  return `${p.year}-${String(p.month).padStart(2, '0')}`
}
