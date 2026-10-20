// BE-004 verification runner — 13 checks against throwaway DBs in server/data/.
// The real ./data/playrent.db is never opened for writing (it is only copied).
//   node tools/be004-verify.mjs
import { existsSync, copyFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { once } from 'node:events'

const here = dirname(fileURLToPath(import.meta.url))
const serverRoot = join(here, '..')
const dataDir = join(serverRoot, 'data')

// Must be set BEFORE importing db.js/config.js (they read it at import time).
process.env.DB_PATH = 'data/tmp-be004.db'
process.env.NODE_ENV = 'development'
process.env.CORS_ORIGIN = 'http://localhost:5173'

const { default: db, openDatabase, migrate } = await import('../src/db.js')
const { createApp } = await import('../src/app.js')

const out = (s = '') => console.log(s)
const raw = (res) => `${res.status} ${res.text.length > 400 ? `${res.text.slice(0, 400)}…` : res.text}`

const http = (base) => async (path, { method = 'GET', body, cookie } = {}) => {
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
  return { status: res.status, text, json, cookie: res.headers.getSetCookie?.().find((c) => c.startsWith('pr_session='))?.split(';')[0] }
}

const boot = async (database) => {
  const app = createApp(database)
  const server = app.listen(0)
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}`
  return { base, request: http(base), close: () => new Promise((r) => server.close(r)) }
}

const freshDb = (name) => {
  const file = join(dataDir, name)
  for (const suffix of ['', '-wal', '-shm']) {
    if (existsSync(file + suffix)) rmSync(file + suffix, { force: true })
  }
  const database = openDatabase(file)
  migrate(database)
  return { file, database }
}

const openDb = (name) => {
  const file = join(dataDir, name)
  const database = openDatabase(file)
  migrate(database)
  // One business_settings row (the seed does not create accounts, and the
  // routes need this row to compute rules).
  database.prepare(
    `INSERT OR IGNORE INTO business_settings
     (id, business_name, address, phone, receipt_footer, tax_note,
      min_duration_minutes, rounding_minutes, overtime_rate_per_hour, overtime_grace_minutes,
      default_hourly_rate, warn_minutes_json, payment_methods_json, updated_at)
     VALUES (1,'PlayRent Uji','','0812-3456','Terima kasih!','',30,15,12000,5,15000,'[10,5,1]','["cash","transfer","qris"]',?)`,
  ).run(new Date().toISOString())
  return { file, database }
}

const SUPER_PASSWORD = 'RahasiaSuper123'
const CUSTOMER_PASSWORD = 'rahasia123'

// ─────────────────────────────────────────────────────────────────────────────
const phaseA = async () => {
  out('════ 1–3, 5–9: publik + enforcement (DB: server/data/tmp-be004.db) ════')
  const { database } = openDb('tmp-be004.db')
  const { base, request, close } = await boot(database)

  out('\n--- [1] register tanpa body ---')
  out(`POST /api/auth/register  ->  ${raw(await request('/api/auth/register', { method: 'POST', body: {} }))}`)

  out('\n--- [1] register body valid ---')
  const reg = await request('/api/auth/register', {
    method: 'POST',
    body: { username: 'budi', fullName: 'Budi', phone: '0812', password: CUSTOMER_PASSWORD },
  })
  out(`POST /api/auth/register  ->  ${raw(reg)}`)
  out(`role=${reg.json?.data?.user?.role}  isActive=${reg.json?.data?.user?.isActive}  phone=${reg.json?.data?.user?.phone}`)
  out(`response memuat "password"? ${reg.text.includes('password')}  "password_hash"? ${reg.text.includes('password_hash')}`)

  out('\n--- [2] register dengan body "role":"superadmin" (bukti inti) ---')
  out(`POST /api/auth/register  ->  ${raw(await request('/api/auth/register', {
    method: 'POST',
    body: { username: 'budi', fullName: 'Budi', phone: '0812', password: CUSTOMER_PASSWORD, role: 'superadmin' },
  }))}`)

  out('\n--- [3] register username yang sama dua kali ---')
  out(`POST /api/auth/register  ->  ${raw(await request('/api/auth/register', {
    method: 'POST', body: { username: 'budi', fullName: 'Budi', password: CUSTOMER_PASSWORD },
  }))}`)

  out('\n--- [5] login sebagai user baru, lalu akses terlarang ---')
  const login = await request('/api/auth/login', { method: 'POST', body: { username: 'budi', password: CUSTOMER_PASSWORD } })
  out(`POST /api/auth/login  ->  ${raw(login)}`)
  const userCookie = login.cookie
  for (const p of ['/api/dashboard/summary', '/api/reports/summary', '/api/transactions', '/api/users', '/api/sessions/active']) {
    out(`GET ${p}  ->  ${raw(await request(p, { cookie: userCookie }))}`)
  }

  out('\n--- [6] GET /api/consoles sebagai user (harus tanpa conditionNote) ---')
  const sa = await request('/api/auth/login', { method: 'POST', body: { username: 'admin', password: SUPER_PASSWORD } })
  out(`login superadmin  ->  ${sa.status}`)
  const adminCookie = sa.cookie
  const c = await request('/api/consoles', { method: 'POST', cookie: adminCookie, body: { code: 'PS-V1', consoleType: 'PS5', roomType: 'VIP', controllers: 4, hourlyRate: 20000, conditionNote: 'RAHASIA' } })
  const consoleId = c.json?.data?.console?.id
  await request('/api/sessions', { method: 'POST', cookie: adminCookie, body: { consoleId, customerName: 'Pelangiin Lain', durationMinutes: 60 } })
  const listUser = await request('/api/consoles', { cookie: userCookie })
  out(`GET /api/consoles  ->  ${raw(listUser)}`)
  out(`memuat "conditionNote"? ${listUser.text.includes('conditionNote')}  "conditionName"? ${listUser.text.includes('conditionName')}`)
  const oneUser = await request(`/api/consoles/${consoleId}`, { cookie: userCookie })
  out(`GET /api/consoles/${consoleId}  ->  ${raw(oneUser)}`)
  out(`memuat "currentSession"? ${oneUser.text.includes('currentSession')}  "customerName"? ${oneUser.text.includes('customerName')}`)

  out('\n--- [7] GET /api/settings sebagai user ---')
  const setUser = await request('/api/settings', { cookie: userCookie })
  out(`GET /api/settings  ->  ${raw(setUser)}`)
  out(`memuat "payments"/"payment_methods"? ${setUser.text.includes('payment')}  "overtimeRatePerHour"? ${setUser.text.includes('overtimeRatePerHour')}`)

  out('\n--- [8] bookings milik user ---')
  const bkUser = await request('/api/bookings', {
    method: 'POST', cookie: userCookie,
    body: { consoleId, customerName: 'Budi', bookingDate: '2026-12-01', startTime: '10:00', durationMinutes: 60 },
  })
  out(`POST /api/bookings (user)  ->  ${raw(bkUser)}`)
  const ownId = bkUser.json?.data?.booking?.id
  const row = database.prepare('SELECT id, customer_user_id, created_by FROM bookings WHERE id = ?').get(ownId)
  out(`baris DB: ${JSON.stringify(row)}  (customer_user_id = user id ${row?.customer_user_id})`)

  const bkAdmin = await request('/api/bookings', {
    method: 'POST', cookie: adminCookie,
    body: { consoleId, customerName: 'Pelanggan Orang Lain', bookingDate: '2026-12-01', startTime: '14:00', durationMinutes: 60 },
  })
  const otherId = bkAdmin.json?.data?.booking?.id
  const listUserBk = await request('/api/bookings', { cookie: userCookie })
  out(`GET /api/bookings (user)  ->  items=${listUserBk.json?.data?.items?.length}  ids=${JSON.stringify(listUserBk.json?.data?.items?.map((b) => b.id))}`)
  out(`GET /api/bookings/${otherId} (milik orang lain)  ->  ${raw(await request(`/api/bookings/${otherId}`, { cookie: userCookie }))}`)
  out(`POST /api/bookings/${ownId}/check-in (user)  ->  ${raw(await request(`/api/bookings/${ownId}/check-in`, { method: 'POST', cookie: userCookie, body: {} }))}`)
  out(`PATCH /api/bookings/${ownId} {status:'completed'} (user)  ->  ${raw(await request(`/api/bookings/${ownId}`, { method: 'PATCH', cookie: userCookie, body: { status: 'completed' } }))}`)
  out(`PATCH /api/bookings/${ownId} {discount:5000} (user)  ->  ${raw(await request(`/api/bookings/${ownId}`, { method: 'PATCH', cookie: userCookie, body: { discount: 5000 } }))}`)

  out('\n--- [9] Super Admin: akses penuh ---')
  for (const p of ['/api/dashboard/summary', '/api/reports/summary', '/api/users', '/api/transactions', '/api/sessions/active']) {
    out(`GET ${p}  ->  ${(await request(p, { cookie: adminCookie })).status}`)
  }
  out(`PUT /api/settings  ->  ${raw(await request('/api/settings', { method: 'PUT', cookie: adminCookie, body: { business: { name: 'PlayRent' } } }))}`)
  out(`POST /api/consoles  ->  ${(await request('/api/consoles', { method: 'POST', cookie: adminCookie, body: { code: 'PS-V2', consoleType: 'PS4', roomType: 'Reguler', controllers: 2, hourlyRate: 10000 } })).status}`)
  out(`POST /api/games  ->  ${(await request('/api/games', { method: 'POST', cookie: adminCookie, body: { title: 'Game Uji', platform: 'PS5', genre: 'Uji' } })).status}`)
  out(`POST /api/packages  ->  ${(await request('/api/packages', { method: 'POST', cookie: adminCookie, body: { name: 'Paket Uji', durationMinutes: 60, price: 10000 } })).status}`)
  out(`POST /api/users  ->  ${(await request('/api/users', { method: 'POST', cookie: adminCookie, body: { username: 'operator1', fullName: 'Operator Satu', password: 'operator123', role: 'user' } })).status}`)

  await close()
  database.close()
}

// ─────────────────────────────────────────────────────────────────────────────
const phaseB = async () => {
  out('\n════ 4: rate limit pendaftaran 10/15 menit per IP (DB baru) ════')
  const { database } = freshDb('tmp-be004-rl.db')
  const { base, request, close } = await boot(database)
  for (let i = 1; i <= 11; i++) {
    const r = await request('/api/auth/register', {
      method: 'POST', body: { username: `pelanggan${i}`, fullName: `Pelanggan ${i}`, password: CUSTOMER_PASSWORD },
    })
    out(`percobaan ${String(i).padStart(2)}  ->  ${r.status} ${r.json?.error?.code ?? ''}`)
  }
  await close()
  database.close()
}

// ─────────────────────────────────────────────────────────────────────────────
const phaseC = async () => {
  out('\n════ 10: akun kasir lama (dev DB disalin, tidak disentuh) ════')
  const src = join(dataDir, 'playrent.db')
  const copy = join(dataDir, 'tmp-be004-legacy.db')
  copyFileSync(src, copy)
  const database = openDatabase(copy)
  migrate(database)
  const { base, request, close } = await boot(database)
  const row = database.prepare('SELECT username, role, is_active FROM users WHERE username = ?').get('kasir')
  out(`baris DB kasir: ${JSON.stringify(row)}`)
  out(`POST /api/auth/login {username:'kasir',password:'kasir123'}  ->  ${raw(await request('/api/auth/login', { method: 'POST', body: { username: 'kasir', password: 'kasir123' } }))}`)
  await close()
  database.close()
  for (const suffix of ['', '-wal', '-shm']) rmSync(copy + suffix, { force: true })
}

// ─────────────────────────────────────────────────────────────────────────────
const phaseD = async () => {
  out('\n════ 11: CLI bootstrap (node src/admin-bootstrap.js) ════')
  const file = join(dataDir, 'tmp-be004-cli.db')
  for (const suffix of ['', '-wal', '-shm']) rmSync(file + suffix, { force: true })
  const env = { ...process.env, DB_PATH: 'data/tmp-be004-cli.db', ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: SUPER_PASSWORD }
  const run = (args) => {
    try {
      const stdout = execFileSync(process.execPath, ['src/admin-bootstrap.js', ...args], { cwd: serverRoot, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
      return { code: 0, stdout, stderr: '' }
    } catch (err) {
      return { code: err.status, stdout: err.stdout ?? '', stderr: err.stderr ?? '' }
    }
  }
  const first = run([])
  out(`$ node src/admin-bootstrap.js   (env ADMIN_USERNAME/ADMIN_PASSWORD, tanpa TTY)   exit=${first.code}`)
  out('--- stdout ---'); out(first.stdout.trimEnd())
  if (first.stderr.trim()) { out('--- stderr ---'); out(first.stderr.trimEnd()) }

  const second = run([])
  out(`\n$ node src/admin-bootstrap.js   (ulangi)   exit=${second.code}`)
  out('--- stdout ---'); out(second.stdout.trimEnd())
  if (second.stderr.trim()) { out('--- stderr ---'); out(second.stderr.trimEnd()) }

  const forced = run(['--force'])
  out(`\n$ node src/admin-bootstrap.js --force   exit=${forced.code}`)
  out('--- stdout ---'); out(forced.stdout.trimEnd())
  if (forced.stderr.trim()) { out('--- stderr ---'); out(forced.stderr.trimEnd()) }

  const leaks = [first.stdout + first.stderr, second.stdout + second.stderr, forced.stdout + forced.stderr]
    .some((t) => t.includes(SUPER_PASSWORD) || /password_hash|\$scrypt\$|[0-9a-f]{64}/.test(t))
  out(`\noutput memuat kata sandi/hash? ${leaks}`)
  for (const suffix of ['', '-wal', '-shm']) rmSync(file + suffix, { force: true })
}

// ─────────────────────────────────────────────────────────────────────────────
// The Super Admin for phase A is created by the CLI first (same code path).
{
  for (const suffix of ['', '-wal', '-shm']) rmSync(join(dataDir, `tmp-be004.db${suffix}`), { force: true })
  db.close() // release the handle db.js opened at import time
  const env = { ...process.env, DB_PATH: 'data/tmp-be004.db', ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: SUPER_PASSWORD }
  execFileSync(process.execPath, ['src/admin-bootstrap.js'], { cwd: serverRoot, env, encoding: 'utf8' })
}

await phaseA()
await phaseB()
await phaseC()
await phaseD()

for (const name of ['tmp-be004.db', 'tmp-be004-rl.db']) {
  for (const suffix of ['', '-wal', '-shm']) rmSync(join(dataDir, name + suffix), { force: true })
}
out('\n[verify] selesai — DB uji dihapus, server/data/playrent.db tidak disentuh.')
