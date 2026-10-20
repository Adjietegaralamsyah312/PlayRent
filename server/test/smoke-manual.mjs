// Smoke test — boots the real app on a throwaway DB and walks the money path.
// Run: node test/smoke-manual.mjs
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'playrent-smoke-')), 'verify.db')
process.env.NODE_ENV = 'development'
process.env.CORS_ORIGIN = 'http://localhost:5173'

let failures = 0
let checks = 0
const check = (name, cond, detail) => {
  checks += 1
  if (cond) return
  failures += 1
  console.error(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`)
}
const section = (s) => console.log(`\n${s}`)

const { default: db, migrate } = await import('../src/db.js')
const { seed } = await import('../src/seed.js')
const { createApp } = await import('../src/app.js')
const { hashPassword } = await import('../src/lib/auth.js')

migrate(db)
seed()

// The seed creates no account (the owner uses the bootstrap CLI), so the smoke
// run makes its own Super Admin with a runtime-random password.
const ADMIN = { username: 'admin', password: randomBytes(24).toString('base64url') }
{
  const { hash, salt } = hashPassword(ADMIN.password)
  const t = new Date().toISOString()
  db.prepare(
    `INSERT INTO users (username, full_name, password_hash, password_salt, role, is_active, phone, created_at, updated_at)
     VALUES (?,?,?,?,'superadmin',1,NULL,?,?)`,
  ).run(ADMIN.username, 'Admin PlayRent', hash, salt, t, t)
}

const app = createApp(db)
const server = app.listen(0)
await new Promise((r) => server.once('listening', r))
const base = `http://127.0.0.1:${server.address().port}`
console.log(`[smoke] ${base}`)

const request = async (method, path, { body, cookie } = {}) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* html/text */ }
  return { status: res.status, json, text, headers: res.headers }
}

const cookieOf = (res) => (res.headers.getSetCookie?.() || []).find((c) => c.startsWith('pr_session='))?.split(';')[0]

try {
  // --- health -------------------------------------------------------------
  section('health')
  const health = await request('GET', '/api/health')
  check('health 200', health.status === 200, health.status)
  check('health db.ok', health.json?.data?.db?.ok === true, health.json)
  check('health version', typeof health.json?.data?.version === 'string', health.json)

  // --- auth ---------------------------------------------------------------
  section('auth')
  const badLogin = await request('POST', '/api/auth/login', { body: { username: 'admin', password: 'wrong' } })
  check('bad login 401', badLogin.status === 401, badLogin.status)
  check('bad login code', badLogin.json?.error?.code === 'INVALID_CREDENTIALS', badLogin.json)

  const adminLogin = await request('POST', '/api/auth/login', { body: { username: ADMIN.username, password: ADMIN.password } })
  check('admin login 200', adminLogin.status === 200, adminLogin.json)
  const adminCookie = cookieOf(adminLogin)
  check('admin cookie set', !!adminCookie, adminLogin.headers.getSetCookie?.())
  check('login envelope', adminLogin.json?.success === true && adminLogin.json?.data?.user?.role === 'superadmin', adminLogin.json)
  check('password never returned', !JSON.stringify(adminLogin.json).includes('password'), true)

  const me = await request('GET', '/api/auth/me', { cookie: adminCookie })
  check('me 200', me.status === 200, me.status)
  const anon = await request('GET', '/api/auth/me')
  check('me without cookie 401', anon.status === 401, anon.status)

  // --- dashboard ----------------------------------------------------------
  section('dashboard')
  const summary = await request('GET', '/api/dashboard/summary', { cookie: adminCookie })
  check('summary 200', summary.status === 200, summary.json)
  check('summary units.total > 0', (summary.json?.data?.units?.total ?? 0) > 0, summary.json?.data?.units)
  check('summary today.revenue is int', Number.isInteger(summary.json?.data?.today?.revenue), summary.json?.data?.today)
  const activity = await request('GET', '/api/dashboard/activity', { cookie: adminCookie })
  check('activity 200', activity.status === 200, activity.status)
  check('activity items <= 20', (activity.json?.data?.items?.length ?? 0) <= 20, activity.json?.data?.items?.length)
  const ending = await request('GET', '/api/dashboard/ending-soon', { cookie: adminCookie })
  check('ending-soon 200', ending.status === 200, ending.status)

  // --- quote --------------------------------------------------------------
  section('quote')
  const consoles = await request('GET', '/api/consoles', { cookie: adminCookie })
  check('consoles 200', consoles.status === 200, consoles.status)
  const ps01 = consoles.json.data.items.find((c) => c.code === 'PS-01')
  check('PS-01 exists', !!ps01, consoles.json.data.items.map((c) => c.code))

  const quote = await request('POST', '/api/sessions/quote', {
    cookie: adminCookie, body: { consoleId: ps01.id, durationMinutes: 60 },
  })
  check('quote 200', quote.status === 200, quote.json)
  check('quote subtotal = 8000', quote.json?.data?.subtotal === 8000, quote.json?.data)
  check('quote timeZone naive-free', Number.isInteger(quote.json?.data?.total), quote.json?.data)

  const shortQuote = await request('POST', '/api/sessions/quote', {
    cookie: adminCookie, body: { consoleId: ps01.id, durationMinutes: 10 },
  })
  check('quote below min 400', shortQuote.status === 400, shortQuote.status)
  check('quote below min code', shortQuote.json?.error?.code === 'DURATION_BELOW_MINIMUM', shortQuote.json)

  // --- session lifecycle --------------------------------------------------
  section('session start / duplicate / extend / finish')
  const started = await request('POST', '/api/sessions', {
    cookie: adminCookie,
    body: { consoleId: ps01.id, customerName: 'Smoke Tester', durationMinutes: 60 },
  })
  check('start 201', started.status === 201, started.json)
  const sessionId = started.json?.data?.session?.id
  check('start returns session', !!sessionId, started.json)

  const dup = await request('POST', '/api/sessions', {
    cookie: adminCookie,
    body: { consoleId: ps01.id, customerName: 'Second', durationMinutes: 60 },
  })
  check('duplicate start 409', dup.status === 409, dup.status)
  check('duplicate start UNIT_OCCUPIED', dup.json?.error?.code === 'UNIT_OCCUPIED', dup.json)

  const unitAfterStart = await request('GET', `/api/consoles/${ps01.id}`, { cookie: adminCookie })
  check('console in_use after start', unitAfterStart.json?.data?.console?.status === 'in_use', unitAfterStart.json?.data?.console)

  const extend = await request('POST', `/api/sessions/${sessionId}/extend`, {
    cookie: adminCookie, body: { extraMinutes: 30 },
  })
  check('extend 200', extend.status === 200, extend.json)
  check('plannedMinutes = 90', extend.json?.data?.session?.plannedMinutes === 90, extend.json?.data?.session)

  const finish = await request('POST', `/api/sessions/${sessionId}/finish`, {
    cookie: adminCookie,
    body: { paymentMethod: 'cash', amountPaid: 17000 }, // 12000 total + 5000 change
  })
  check('finish 201', finish.status === 201, finish.json)
  const tx = finish.json?.data?.transaction
  check('subtotal = 12000', tx?.subtotal === 12000, tx)
  check('total = 12000', tx?.total === 12000, tx)
  check('changeDue = 5000', tx?.changeDue === 5000, tx)
  check('paymentStatus paid', tx?.paymentStatus === 'paid', tx)
  check('number format', /^TRX-\d{8}-\d{4}$/.test(tx?.number || ''), tx?.number)

  const refinished = await request('POST', `/api/sessions/${sessionId}/finish`, {
    cookie: adminCookie, body: { paymentMethod: 'cash', amountPaid: 999999 },
  })
  check('re-finish 409', refinished.status === 409, refinished.status)

  const shortPay = await request('POST', '/api/sessions', {
    cookie: adminCookie, body: { consoleId: consoles.json.data.items.find((c) => c.code === 'PS-02').id, customerName: 'Miskin', durationMinutes: 60 },
  })
  const shortId = shortPay.json?.data?.session?.id
  const insufficient = await request('POST', `/api/sessions/${shortId}/finish`, {
    cookie: adminCookie, body: { paymentMethod: 'cash', amountPaid: 1000 },
  })
  check('insufficient payment 400', insufficient.status === 400, insufficient.status)
  check('insufficient code', insufficient.json?.error?.code === 'INSUFFICIENT_PAYMENT', insufficient.json)
  const voidShort = await request('POST', `/api/sessions/${shortId}/void`, { cookie: adminCookie, body: { reason: 'Uji smoke selesai' } })
  check('void session 200', voidShort.status === 200, voidShort.json)
  check('void status', voidShort.json?.data?.session?.status === 'void', voidShort.json?.data?.session)

  // --- transactions -------------------------------------------------------
  section('transactions')
  const list = await request('GET', '/api/transactions', { cookie: adminCookie })
  check('transactions 200', list.status === 200, list.status)
  check('totals has record+outstanding', Number.isInteger(list.json?.data?.totals?.paid) && Number.isInteger(list.json?.data?.totals?.outstanding), list.json?.data?.totals)
  check('meta present', list.json?.meta?.total > 0, list.json?.meta)

  const detail = await request('GET', `/api/transactions/${tx.id}`, { cookie: adminCookie })
  check('tx detail 200', detail.status === 200, detail.status)
  check('tx items non-empty', (detail.json?.data?.items?.length ?? 0) > 0, detail.json?.data?.items)
  check('tx session joined', !!detail.json?.data?.session, detail.json?.data?.session)
  check('tx cashier joined', detail.json?.data?.cashier?.fullName === 'Admin PlayRent', detail.json?.data?.cashier)

  const receiptHtml = await request('GET', `/api/transactions/${tx.id}/receipt?format=html&print=1`, { cookie: adminCookie })
  check('receipt html 200', receiptHtml.status === 200, receiptHtml.status)
  check('receipt content-type html', receiptHtml.headers.get('content-type')?.includes('text/html'), receiptHtml.headers.get('content-type'))
  check('receipt embeds number', receiptHtml.text.includes(tx.number), true)
  check('receipt lang=id', receiptHtml.text.includes('lang="id"'), true)
  check('receipt 80mm page', receiptHtml.text.includes('size: 80mm auto'), true)
  check('receipt print flag honoured', receiptHtml.text.includes('window.print()'), true)

  const receiptText = await request('GET', `/api/transactions/${tx.id}/receipt`, { cookie: adminCookie })
  check('receipt text 200', receiptText.status === 200, receiptText.status)
  check('receipt text is plain', receiptText.headers.get('content-type')?.includes('text/plain'), receiptText.headers.get('content-type'))

  const voidTx = await request('POST', `/api/transactions/${tx.id}/void`, { cookie: adminCookie, body: { reason: 'Uji pembatalan smoke' } })
  check('void tx 200', voidTx.status === 200, voidTx.json)
  check('void tx status void', voidTx.json?.data?.transaction?.status === 'void', voidTx.json?.data?.transaction)
  check('void tx paymentStatus void', voidTx.json?.data?.transaction?.paymentStatus === 'void', voidTx.json?.data?.transaction)
  const doubleVoid = await request('POST', `/api/transactions/${tx.id}/void`, { cookie: adminCookie, body: { reason: 'Batal dua kali' } })
  check('double void 409', doubleVoid.status === 409, doubleVoid.status)

  const afterVoidSummary = await request('GET', '/api/reports/summary', { cookie: adminCookie })
  check('reports summary 200', afterVoidSummary.status === 200, afterVoidSummary.status)
  check('voidedCount >= 1', (afterVoidSummary.json?.data?.voidedCount ?? 0) >= 1, afterVoidSummary.json?.data)
  check('recorded != outstanding keys', 'revenueRecorded' in (afterVoidSummary.json?.data || {}) && 'revenueOutstanding' in (afterVoidSummary.json?.data || {}), afterVoidSummary.json?.data)

  // --- bookings -----------------------------------------------------------
  section('bookings')
  const ps05 = consoles.json.data.items.find((c) => c.code === 'PS-05')
  const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + 86400000))
  const mkBooking = (startTime) => request('POST', '/api/bookings', {
    cookie: adminCookie,
    body: { consoleId: ps05.id, customerName: 'Booking Smoke', bookingDate: tomorrow, startTime, durationMinutes: 60 },
  })
  const b1 = await mkBooking('10:00')
  check('booking 201', b1.status === 201, b1.json)
  const conflict = await mkBooking('10:30')
  check('booking conflict 409', conflict.status === 409, conflict.status)
  check('conflict code', conflict.json?.error?.code === 'BOOKING_CONFLICT', conflict.json)
  check('conflict details', Array.isArray(conflict.json?.error?.details) && conflict.json.error.details[0]?.conflictingBookingId === b1.json.data.booking.id, conflict.json?.error?.details)
  const touch = await mkBooking('11:00')
  check('touching boundary allowed 201', touch.status === 201, touch.json)

  // --- reports ------------------------------------------------------------
  section('reports')
  for (const path of ['/api/reports/daily', '/api/reports/weekly', '/api/reports/monthly', '/api/reports/units', '/api/reports/payments']) {
    const res = await request('GET', path, { cookie: adminCookie })
    check(`${path} 200`, res.status === 200, res.status)
  }
  const unitsReport = await request('GET', '/api/reports/units', { cookie: adminCookie })
  const firstUnit = unitsReport.json?.data?.items?.[0]
  check('units utilizationPct 0..100', firstUnit && firstUnit.utilizationPct >= 0 && firstUnit.utilizationPct <= 100, firstUnit)

  const chart = await request('GET', '/api/dashboard/revenue-chart?groupBy=day', { cookie: adminCookie })
  check('revenue-chart 200', chart.status === 200, chart.status)
  const busy = await request('GET', '/api/dashboard/busy-hours', { cookie: adminCookie })
  check('busy-hours 24 slots', busy.json?.data?.hours?.length === 24, busy.json?.data?.hours?.length)

  const csv = await request('GET', '/api/reports/export.csv?type=transactions', { cookie: adminCookie })
  check('csv 200', csv.status === 200, csv.status)
  check('csv content-type', csv.headers.get('content-type')?.includes('text/csv'), csv.headers.get('content-type'))
  // fetch's text() strips the UTF-8 BOM; inspect the raw bytes instead.
  const csvBytes = new Uint8Array(await (await fetch(`${base}/api/reports/export.csv?type=transactions`, { headers: { cookie: adminCookie } })).arrayBuffer())
  check('csv BOM bytes EF BB BF', csvBytes[0] === 0xef && csvBytes[1] === 0xbb && csvBytes[2] === 0xbf, [...csvBytes.slice(0, 3)])
  check('csv disposition filename', /playrent-transactions-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.csv/.test(csv.headers.get('content-disposition') || ''), csv.headers.get('content-disposition'))

  // --- settings -----------------------------------------------------------
  section('settings')
  const settings = await request('GET', '/api/settings', { cookie: adminCookie })
  check('settings 200', settings.status === 200, settings.status)
  check('settings shape', !!settings.json?.data?.business?.name && Array.isArray(settings.json?.data?.rules?.warnMinutes), settings.json?.data)
  const put = await request('PUT', '/api/settings', { cookie: adminCookie, body: { business: { name: 'PlayRent Smoke' } } })
  check('put settings 200', put.status === 200, put.json)
  check('put settings applied', put.json?.data?.business?.name === 'PlayRent Smoke', put.json?.data?.business)
  const afterPut = await request('GET', '/api/settings', { cookie: adminCookie })
  check('settings persisted', afterPut.json?.data?.business?.name === 'PlayRent Smoke', afterPut.json?.data?.business)

  const packages = await request('GET', '/api/packages', { cookie: adminCookie })
  check('packages 200', packages.status === 200, packages.status)
  check('packages seeded', (packages.json?.data?.items?.length ?? 0) > 0, packages.json?.data?.items?.length)

  // --- games --------------------------------------------------------------
  section('games')
  const games = await request('GET', '/api/games', { cookie: adminCookie })
  check('games 200', games.status === 200, games.status)
  const newGame = await request('POST', '/api/games', { cookie: adminCookie, body: { title: 'Smoke Game', platform: 'PS5', genre: 'Test' } })
  check('create game 201', newGame.status === 201, newGame.json)

  // --- customer role boundaries -------------------------------------------
  section('customer role boundaries')
  const CUSTOMER = { username: 'pelanggan', password: randomBytes(24).toString('base64url') }
  const reg = await request('POST', '/api/auth/register', {
    body: { username: CUSTOMER.username, fullName: 'Pelanggan Smoke', phone: '081200000000', password: CUSTOMER.password },
  })
  check('register 201', reg.status === 201, reg.json)
  check('register role user', reg.json?.data?.user?.role === 'user', reg.json?.data?.user)
  check('register leaks no password', !JSON.stringify(reg.json).includes('password'), reg.json)

  const customerLogin = await request('POST', '/api/auth/login', { body: { username: CUSTOMER.username, password: CUSTOMER.password } })
  check('customer login 200', customerLogin.status === 200, customerLogin.json)
  const customerCookie = cookieOf(customerLogin)
  const customerCreateConsole = await request('POST', '/api/consoles', {
    cookie: customerCookie, body: { code: 'PS-99', consoleType: 'PS5', roomType: 'VIP', controllers: 2, hourlyRate: 20000 },
  })
  check('customer cannot create console 403', customerCreateConsole.status === 403, customerCreateConsole.status)
  const customerUsers = await request('GET', '/api/users', { cookie: customerCookie })
  check('customer cannot list users 403', customerUsers.status === 403, customerUsers.status)
  const customerVoid = await request('POST', `/api/transactions/${tx.id}/void`, { cookie: customerCookie, body: { reason: 'Nope' } })
  check('customer cannot void tx 403', customerVoid.status === 403, customerVoid.status)
  const customerSessions = await request('GET', '/api/sessions', { cookie: customerCookie })
  check('customer cannot read sessions 403', customerSessions.status === 403, customerSessions.status)
  const customerConsoles = await request('GET', '/api/consoles', { cookie: customerCookie })
  check('customer can read consoles 200', customerConsoles.status === 200, customerConsoles.status)
  check('customer console payload has no conditionNote', !('conditionNote' in (customerConsoles.json?.data?.items?.[0] ?? {})), customerConsoles.json?.data?.items?.[0])
  const customerSettings = await request('GET', '/api/settings', { cookie: customerCookie })
  check('customer settings 200', customerSettings.status === 200, customerSettings.status)
  check('customer settings has no payments', customerSettings.json?.data?.payments === undefined, customerSettings.json?.data)
  check('customer settings rules have no overtime rate', customerSettings.json?.data?.rules?.overtimeRatePerHour === undefined, customerSettings.json?.data?.rules)

  // --- validation + csrf --------------------------------------------------
  section('validation / csrf')
  const badBody = await request('POST', '/api/sessions', { cookie: adminCookie, body: { consoleId: ps01.id } })
  check('missing fields 400', badBody.status === 400, badBody.status)
  check('validation details array', Array.isArray(badBody.json?.error?.details), badBody.json)
  const badJson = await fetch(`${base}/api/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: adminCookie },
    body: '{not json',
  })
  check('malformed json 400', badJson.status === 400, badJson.status)
  const foreignOrigin = await fetch(`${base}/api/settings`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie: adminCookie, origin: 'https://evil.example' },
    body: JSON.stringify({ business: { name: 'Evil' } }),
  })
  check('foreign origin write 403', foreignOrigin.status === 403, foreignOrigin.status)
  const unknown = await request('GET', '/api/nope', { cookie: adminCookie })
  check('unknown route 404', unknown.status === 404, unknown.status)

  // --- logout -------------------------------------------------------------
  section('logout')
  const logout = await request('POST', '/api/auth/logout', { cookie: adminCookie })
  check('logout 200', logout.status === 200, logout.json)
  const afterLogout = await request('GET', '/api/auth/me', { cookie: adminCookie })
  check('me after logout 401', afterLogout.status === 401, afterLogout.status)
} finally {
  server.close()
  try { db.close() } catch { /* ignore */ }
}

console.log(`\n[smoke] ${checks - failures}/${checks} checks passed`)
if (failures > 0) {
  console.error(`[smoke] FAILED (${failures})`)
  process.exit(1)
}
console.log('[smoke] OK')
