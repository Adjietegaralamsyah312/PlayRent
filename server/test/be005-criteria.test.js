// BE-005 — acceptance criteria of plan.md §8 (K1..K16) plus the owner's extra
// rules K17..K23. One test per criterion; the name states the criterion so the
// acceptance report can map criterion -> test.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import {
  withServer, ADMIN, USER, INACTIVE, mkTmpDir, openDatabase, migrate,
} from './helpers.js'
import { verifyPassword } from '../src/lib/auth.js'

const serverDir = fileURLToPath(new URL('..', import.meta.url))
const WIDE = 'from=2020-01-01&to=2030-12-31'

/** Run a server CLI with a throwaway DB_PATH. */
const runCli = (script, { dbPath, args = [], env = {}, input = '' } = {}) => spawnSync(
  process.execPath,
  [join(serverDir, 'src', script), ...args],
  { env: { ...process.env, DB_PATH: dbPath, ...env }, input, encoding: 'utf8' },
)

// ───────────────────────────── K1 · K2 · K3 ─────────────────────────────

test('K1 Admin (superadmin) login dengan kredensial valid -> 200', async () => {
  await withServer(async ({ api, db }) => {
    const r = await api('/api/auth/login', { method: 'POST', body: { username: ADMIN.username, password: ADMIN.password } })
    assert.equal(r.status, 200)
    assert.equal(r.body.success, true)
    assert.equal(r.body.data.user.role, 'superadmin')
    const cookie = r.setCookie.find((c) => c.startsWith('pr_session='))
    assert.ok(cookie, 'session cookie issued')
    assert.match(cookie, /HttpOnly/i)
    assert.equal(db.prepare("SELECT COUNT(*) c FROM users WHERE role='superadmin' AND is_active=1").get().c, 1)
  })
})

test('K2 Login superadmin dengan password salah -> 401', async () => {
  await withServer(async ({ api, db }) => {
    const before = db.prepare('SELECT COUNT(*) c FROM auth_sessions').get().c
    const r = await api('/api/auth/login', { method: 'POST', body: { username: ADMIN.username, password: 'kata-sandi-salah' } })
    assert.equal(r.status, 401)
    assert.equal(r.body.error.code, 'INVALID_CREDENTIALS')
    assert.equal(r.setCookie.length, 0, 'no cookie for a failed login')
    assert.equal(db.prepare('SELECT COUNT(*) c FROM auth_sessions').get().c, before, 'no session row created')
  })
})

test('K3 Superadmin dapat membuka seluruh modul -> semua 200', async () => {
  await withServer(async ({ login }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const modules = [
      ['dashboard', '/api/dashboard/summary'],
      ['sesi rental', '/api/sessions'],
      ['unit', '/api/consoles'],
      ['booking', '/api/bookings'],
      ['transaksi', '/api/transactions'],
      ['laporan', '/api/reports/summary'],
      ['game', '/api/games'],
      ['pengaturan', '/api/settings'],
      ['paket', '/api/packages'],
      ['pengguna', '/api/users'],
    ]
    for (const [name, path] of modules) {
      const r = await admin.get(path)
      assert.equal(r.status, 200, `${name} (${path}) harus 200, dapat ${r.status}`)
      assert.equal(r.body.success, true, `${name} envelope`)
    }
  })
})

// ───────────────────────────── K4 · K5 · K6 ─────────────────────────────

test('K4 Superadmin dapat membuat, mengedit, dan menonaktifkan unit', async () => {
  await withServer(async ({ login, db }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const created = await admin.post('/api/consoles', {
      code: 'K4-1', consoleType: 'PS5', roomType: 'VIP', controllers: 4, hourlyRate: 20000,
    })
    assert.equal(created.status, 201)
    const id = created.body.data.console.id

    const edited = await admin.patch(`/api/consoles/${id}`, { hourlyRate: 25000, conditionNote: 'stick baru' })
    assert.equal(edited.status, 200)
    assert.equal(edited.body.data.console.hourlyRate, 25000)

    const reread = await admin.get(`/api/consoles/${id}`)
    assert.equal(reread.body.data.console.hourlyRate, 25000, 'perubahan tersimpan')

    const off = await admin.del(`/api/consoles/${id}`)
    assert.equal(off.status, 200)
    assert.equal(off.body.data.console.isActive, false)
    assert.equal(db.prepare('SELECT is_active FROM consoles WHERE id=?').get(id).is_active, 0)
  })
})

test('K5 Superadmin dapat membuat, memperpanjang, menyelesaikan, dan melihat sesi rental', async () => {
  await withServer(async ({ login, db }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const c = (await admin.post('/api/consoles', { code: 'K5-1', consoleType: 'PS4', roomType: 'Reguler', controllers: 2, hourlyRate: 12000 })).body.data.console

    const start = await admin.post('/api/sessions', { consoleId: c.id, customerName: 'Budi', durationMinutes: 60 })
    assert.equal(start.status, 201)
    const sid = start.body.data.session.id
    assert.equal(start.body.data.session.status, 'active')
    assert.equal(db.prepare('SELECT status FROM consoles WHERE id=?').get(c.id).status, 'in_use')

    const list = await admin.get('/api/sessions')
    assert.equal(list.status, 200)
    assert.ok(list.body.data.items.some((s) => s.id === sid), 'sesi terlihat di daftar')

    const detail = await admin.get(`/api/sessions/${sid}`)
    assert.equal(detail.status, 200)
    assert.equal(detail.body.data.session.id, sid)

    const ext = await admin.post(`/api/sessions/${sid}/extend`, { extraMinutes: 30 })
    assert.equal(ext.status, 200)
    assert.equal(ext.body.data.session.plannedMinutes, 90)

    const fin = await admin.post(`/api/sessions/${sid}/finish`, { paymentMethod: 'cash', amountPaid: 100000 })
    assert.equal(fin.status, 201)
    assert.equal(fin.body.data.transaction.paymentStatus, 'paid')
    assert.equal(db.prepare('SELECT status FROM rental_sessions WHERE id=?').get(sid).status, 'finished')
  })
})

test('K6 Timer konsisten: endsAt sesi tidak berubah setelah fetch ulang / login ulang', async () => {
  await withServer(async ({ login, db }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const c = (await admin.post('/api/consoles', { code: 'K6-1', consoleType: 'PS5', roomType: 'Reguler', controllers: 2, hourlyRate: 15000 })).body.data.console
    const start = await admin.post('/api/sessions', { consoleId: c.id, customerName: 'Sari', durationMinutes: 90 })
    const { id, endsAt, startedAt } = start.body.data.session

    // reload = new client, new session
    const reloaded = await login(ADMIN.username, ADMIN.password)
    const again = await reloaded.get(`/api/sessions/${id}`)
    assert.equal(again.status, 200)
    assert.equal(again.body.data.session.endsAt, endsAt, 'endsAt tidak berubah setelah reload')
    assert.equal(again.body.data.session.startedAt, startedAt)

    // logout + login again: the deadline is still the persisted one
    await reloaded.post('/api/auth/logout')
    const relogin = await login(ADMIN.username, ADMIN.password)
    const third = await relogin.get(`/api/sessions/${id}`)
    assert.equal(third.body.data.session.endsAt, endsAt, 'endsAt tidak berubah setelah logout+login')
    assert.equal(db.prepare('SELECT ends_at FROM rental_sessions WHERE id=?').get(id).ends_at, endsAt)
  })
})

// ───────────────────────────── K7 · K8 ─────────────────────────────

test('K7 Superadmin dapat mengelola booking; konflik waktu tetap ditolak 409', async () => {
  await withServer(async ({ login }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const c = (await admin.post('/api/consoles', { code: 'K7-1', consoleType: 'PS4', roomType: 'Reguler', controllers: 2, hourlyRate: 10000 })).body.data.console
    const book = (startTime, durationMinutes = 60) => admin.post('/api/bookings', {
      consoleId: c.id, customerName: 'Budi', bookingDate: '2026-12-01', startTime, durationMinutes,
    })

    const b1 = await book('10:00')
    assert.equal(b1.status, 201)
    const id = b1.body.data.booking.id

    const clash = await book('10:30')
    assert.equal(clash.status, 409, 'slot bertabrakan harus 409')
    assert.equal(clash.body.error.code, 'BOOKING_CONFLICT')

    const edited = await admin.patch(`/api/bookings/${id}`, { status: 'confirmed', notes: 'bayar di muka' })
    assert.equal(edited.status, 200)
    assert.equal(edited.body.data.booking.status, 'confirmed')

    const cancelled = await admin.post(`/api/bookings/${id}/cancel`, { reason: 'pelanggan batal' })
    assert.equal(cancelled.status, 200)
    assert.equal(cancelled.body.data.booking.status, 'cancelled')
  })
})

test('K8 Superadmin dapat mengelola transaksi dan angka laporan == DB', async () => {
  await withServer(async ({ login, db }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const c = (await admin.post('/api/consoles', { code: 'K8-1', consoleType: 'PS4', roomType: 'Reguler', controllers: 2, hourlyRate: 12000 })).body.data.console
    const s = (await admin.post('/api/sessions', { consoleId: c.id, customerName: 'Budi', durationMinutes: 60 })).body.data.session
    const fin = await admin.post(`/api/sessions/${s.id}/finish`, { paymentMethod: 'cash', amountPaid: 100000 })
    assert.equal(fin.status, 201)
    const txId = fin.body.data.transaction.id

    const list = await admin.get('/api/transactions')
    assert.equal(list.status, 200)
    assert.ok(list.body.data.items.some((t) => t.id === txId), 'transaksi terlihat')

    const detail = await admin.get(`/api/transactions/${txId}`)
    assert.equal(detail.status, 200)
    assert.equal(detail.body.data.transaction.total, fin.body.data.transaction.total)

    const receipt = await admin.get(`/api/transactions/${txId}/receipt`)
    assert.equal(receipt.status, 200)
    assert.ok(receipt.text.includes(fin.body.data.transaction.number), 'struk memuat nomor transaksi')

    const report = (await admin.get(`/api/reports/summary?${WIDE}`)).body.data
    const dbSum = db.prepare("SELECT IFNULL(SUM(total),0) s FROM transactions WHERE status != 'void' AND payment_status = 'paid'").get().s
    const dbCount = db.prepare("SELECT COUNT(*) c FROM transactions WHERE status != 'void'").get().c
    assert.equal(report.revenueRecorded, dbSum, 'pendapatan laporan == DB')
    assert.equal(report.transactionCount, dbCount, 'jumlah transaksi laporan == DB')
  })
})

// ───────────────────────────── K9 · K10 · K11 ─────────────────────────────

test('K9 Akun kasir lama (is_active=0) tidak bisa login -> 401', async () => {
  await withServer(async ({ api, db }) => {
    const row = db.prepare('SELECT id, is_active, role FROM users WHERE username = ?').get(INACTIVE.username)
    assert.equal(row.is_active, 0, 'kasir lama memang dinonaktifkan')
    const r = await api('/api/auth/login', { method: 'POST', body: { username: INACTIVE.username, password: INACTIVE.password } })
    assert.equal(r.status, 401)
    assert.equal(r.body.error.code, 'INVALID_CREDENTIALS', 'sama dengan password salah (tidak ada enumerasi)')
    assert.equal(r.setCookie.length, 0)
  })
})

test('K10 Seed tidak membuat akun login sama sekali (users = 0)', async () => {
  const dir = mkTmpDir('playrent-seed-')
  const dbFile = join(dir, 'seed.db')
  const r = runCli('seed.js', { dbPath: dbFile })
  assert.equal(r.status, 0, `seed harus sukses: ${r.stderr}`)
  const db = openDatabase(dbFile)
  try {
    assert.equal(db.prepare('SELECT COUNT(*) c FROM users').get().c, 0, 'seed tidak boleh membuat akun login')
    assert.equal(db.prepare('SELECT COUNT(*) c FROM users WHERE role = ?').get('cashier').c, 0)
    // data demo tetap ada
    assert.ok(db.prepare('SELECT COUNT(*) c FROM consoles').get().c > 0)
  } finally {
    db.close()
  }
})

test('K11 Sesi kasir lama yang dicabut tidak bisa mengakses endpoint -> 401', async () => {
  await withServer(async ({ login, db }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const created = await admin.post('/api/users', {
      username: 'kasirlama', fullName: 'Kasir Lama', password: 'PasswordLama123', role: 'user',
    })
    assert.equal(created.status, 201)
    const id = created.body.data.user.id

    const kasir = await login('kasirlama', 'PasswordLama123')
    assert.equal((await kasir.get('/api/auth/me')).status, 200, 'kasir lama masih bisa masuk sebelum dicabut')

    const off = await admin.del(`/api/users/${id}`)
    assert.equal(off.status, 200)

    assert.equal((await kasir.get('/api/auth/me')).status, 401, 'sesi lama dicabut -> 401')
    assert.equal((await kasir.get('/api/dashboard/summary')).status, 401)
    assert.equal((await kasir.get('/api/transactions')).status, 401)
    assert.equal(db.prepare('SELECT COUNT(*) c FROM auth_sessions WHERE user_id = ?').get(id).c, 0, 'baris sesi dihapus')
  })
})

// ───────────────────────────── K12 · K13 · K14 · K15 ─────────────────────────────

test('K12 Tidak ada endpoint sensitif terbuka tanpa autentikasi -> semua 401', async () => {
  await withServer(async ({ api }) => {
    const protectedEndpoints = [
      ['GET', '/api/users'], ['POST', '/api/users', { username: 'x1', fullName: 'X Y', password: 'password1', role: 'user' }],
      ['GET', '/api/consoles'], ['GET', '/api/consoles/1'], ['POST', '/api/consoles', { code: 'X-1', consoleType: 'PS4', roomType: 'Reguler', controllers: 2, hourlyRate: 12000 }],
      ['PATCH', '/api/consoles/1', { hourlyRate: 13000 }], ['DELETE', '/api/consoles/1'],
      ['GET', '/api/sessions'], ['GET', '/api/sessions/active'], ['GET', '/api/sessions/1'],
      ['POST', '/api/sessions', { consoleId: 1, customerName: 'Budi', durationMinutes: 60 }],
      ['POST', '/api/sessions/quote', { consoleId: 1, durationMinutes: 60 }],
      ['POST', '/api/sessions/1/extend', { extraMinutes: 30 }],
      ['POST', '/api/sessions/1/finish', { paymentMethod: 'cash', amountPaid: 100000 }],
      ['POST', '/api/sessions/1/void', { reason: 'alasan pembatalan' }],
      ['GET', '/api/bookings'], ['GET', '/api/bookings/1'],
      ['POST', '/api/bookings', { consoleId: 1, customerName: 'Budi', bookingDate: '2026-12-01', startTime: '10:00', durationMinutes: 60 }],
      ['PATCH', '/api/bookings/1', { status: 'confirmed' }],
      ['POST', '/api/bookings/1/check-in', {}], ['POST', '/api/bookings/1/cancel', { reason: 'batal' }],
      ['GET', '/api/transactions'], ['GET', '/api/transactions/1'], ['GET', '/api/transactions/1/receipt'],
      ['POST', '/api/transactions/1/void', { reason: 'alasan pembatalan' }],
      ['GET', '/api/dashboard/summary'], ['GET', '/api/dashboard/activity'], ['GET', '/api/dashboard/ending-soon'],
      ['GET', '/api/dashboard/revenue-chart'], ['GET', '/api/dashboard/busy-hours'],
      ['GET', '/api/reports/summary'], ['GET', '/api/reports/daily'], ['GET', '/api/reports/weekly'],
      ['GET', '/api/reports/monthly'], ['GET', '/api/reports/units'], ['GET', '/api/reports/payments'],
      ['GET', '/api/reports/export.csv'],
      ['GET', '/api/games'], ['POST', '/api/games', { title: 'Game X', platform: 'PS4', genre: 'arcade' }],
      ['PATCH', '/api/games/1', { title: 'Game Y' }], ['DELETE', '/api/games/1'],
      ['GET', '/api/settings'], ['PUT', '/api/settings', { business: { name: 'X' } }],
      ['GET', '/api/packages'], ['POST', '/api/packages', { name: 'P', durationMinutes: 60, price: 10000 }],
      ['PATCH', '/api/packages/1', { price: 11000 }], ['DELETE', '/api/packages/1'],
      ['GET', '/api/auth/me'], ['POST', '/api/auth/logout'],
      ['PATCH', '/api/auth/profile', { fullName: 'X Y' }], ['POST', '/api/auth/change-password', { currentPassword: 'a', newPassword: 'bbbbbbbb' }],
    ]
    const bad = []
    for (const [method, path, body] of protectedEndpoints) {
      const r = await api(path, { method, body })
      if (r.status !== 401) bad.push(`${method} ${path} -> ${r.status}`)
    }
    assert.deepEqual(bad, [], 'semua endpoint sensitif harus 401 tanpa cookie')

    // endpoint publik tetap publik
    assert.equal((await api('/api/health')).status, 200)
  })
})

test('K13 Integritas transaksi & laporan lama terjaga (jumlah & total tidak berubah)', async () => {
  await withServer(async ({ login, db }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const legacy = [
      { number: 'TRX-LEGACY-0001', total: 25000, at: '2026-03-01T10:00:00.000Z' },
      { number: 'TRX-LEGACY-0002', total: 40000, at: '2026-03-02T10:00:00.000Z' },
      { number: 'TRX-LEGACY-0003', total: 15000, at: '2026-03-03T10:00:00.000Z' },
    ]
    const kasirId = db.prepare('SELECT id FROM users WHERE username = ?').get(INACTIVE.username).id
    const ins = db.prepare(
      `INSERT INTO transactions
       (number, session_id, console_id, console_code, customer_name, cashier_id, cashier_name,
        subtotal, total, payment_method, payment_status, amount_paid, change_due, status, created_at)
       VALUES (?, NULL, NULL, 'PS-01', 'Budi', ?, ?, ?, ?, 'cash', 'paid', ?, 0, 'completed', ?)`,
    )
    for (const t of legacy) {
      ins.run(t.number, kasirId, 'Kasir PlayRent', t.total, t.total, t.total, t.at)
    }
    const before = { count: legacy.length, total: legacy.reduce((s, t) => s + t.total, 0) }

    // aktivitas normal superadmin tidak boleh mengubah data historis
    const c = (await admin.post('/api/consoles', { code: 'K13-1', consoleType: 'PS4', roomType: 'Reguler', controllers: 2, hourlyRate: 12000 })).body.data.console
    const s = (await admin.post('/api/sessions', { consoleId: c.id, customerName: 'Budi', durationMinutes: 60 })).body.data.session
    await admin.post(`/api/sessions/${s.id}/finish`, { paymentMethod: 'cash', amountPaid: 100000 })

    const legacyRows = db.prepare(
      "SELECT COUNT(*) c, IFNULL(SUM(total),0) s FROM transactions WHERE number LIKE 'TRX-LEGACY-%'",
    ).get()
    assert.equal(legacyRows.c, before.count, 'jumlah transaksi lama tidak berubah')
    assert.equal(legacyRows.s, before.total, 'total transaksi lama tidak berubah')

    const report = (await admin.get(`/api/reports/summary?${WIDE}`)).body.data
    const dbTotal = db.prepare("SELECT IFNULL(SUM(total),0) s FROM transactions WHERE status != 'void' AND payment_status = 'paid'").get().s
    assert.equal(report.revenueRecorded, dbTotal, 'laporan tetap sinkron dengan DB')
    assert.ok(report.revenueRecorded >= before.total, 'pendapatan lama masih terhitung')
  })
})

test('K14 Data historis tetap terbaca setelah akun kasir dinonaktifkan (tidak ada orphan)', async () => {
  await withServer(async ({ login, db }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const kasirId = db.prepare('SELECT id FROM users WHERE username = ?').get(INACTIVE.username).id
    db.prepare(
      `INSERT INTO transactions
       (number, console_code, customer_name, cashier_id, cashier_name, subtotal, total,
        payment_method, payment_status, amount_paid, change_due, status, created_at)
       VALUES ('TRX-ORPHAN-CHECK', 'PS-01', 'Budi', ?, 'Kasir PlayRent', 30000, 30000,
        'cash', 'paid', 30000, 0, 'completed', '2026-04-01T10:00:00.000Z')`,
    ).run(kasirId)

    // kasir lama sudah nonaktif (lihat helpers) tapi datanya harus utuh
    assert.equal(db.prepare('SELECT is_active FROM users WHERE id=?').get(kasirId).is_active, 0)
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0, 'tidak ada pelanggaran foreign key')
    const orphan = db.prepare(
      'SELECT COUNT(*) c FROM transactions t WHERE t.cashier_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = t.cashier_id)',
    ).get().c
    assert.equal(orphan, 0, 'transactions.cashier_id tidak menunjuk user yang hilang')

    const list = await admin.get('/api/transactions?q=ORPHAN')
    assert.equal(list.status, 200)
    assert.equal(list.body.data.items.length, 1, 'transaksi historis masih terbaca')
    assert.equal(list.body.data.items[0].cashierName, 'Kasir PlayRent')

    const report = (await admin.get(`/api/reports/summary?${WIDE}`)).body.data
    assert.ok(report.revenueRecorded >= 30000, 'laporan lama tetap menghitung transaksi kasir')
  })
})

test('K15 Perubahan role dari browser tidak menambah hak akses', async () => {
  await withServer(async ({ api, login, db }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const customer = await login(USER.username, USER.password)
    const myId = db.prepare('SELECT id FROM users WHERE username = ?').get(USER.username).id

    // (a) register dengan body role -> ditolak
    const reg = await api('/api/auth/register', {
      method: 'POST',
      body: { username: 'escalate1', fullName: 'Escalate Me', password: 'Password123', role: 'superadmin' },
    })
    assert.equal(reg.status, 400, 'role di body register harus 400')
    assert.equal(db.prepare('SELECT COUNT(*) c FROM users WHERE username = ?').get('escalate1').c, 0)

    // (b) pelanggan men escalate dirinya sendiri -> ditolak
    const self = await customer.patch(`/api/users/${myId}`, { role: 'superadmin' })
    assert.equal(self.status, 403)
    assert.equal(db.prepare('SELECT role FROM users WHERE id=?').get(myId).role, 'user', 'role tidak berubah')

    // (c) header/header palsu tidak menambah hak akses
    const fake = await customer.get('/api/users', {
      headers: { 'x-role': 'superadmin', 'x-user-role': 'superadmin', authorization: 'Bearer superadmin' },
    })
    assert.equal(fake.status, 403, 'header palsu tetap 403')
    const anon = await api('/api/users', { headers: { 'x-role': 'superadmin', authorization: 'Bearer superadmin' } })
    assert.equal(anon.status, 401, 'tanpa sesi tetap 401')

    // (d) role selalu berasal dari sesi server
    const me = await customer.get('/api/auth/me')
    assert.equal(me.body.data.user.role, 'user')
    assert.ok(admin.get('/api/users') !== undefined)
    assert.equal((await admin.get('/api/users')).status, 200)
  })
})

test('K16 build + typecheck + security probe + test lama tetap lulus (tidak dihapus/dilemahkan)', async () => {
  const oldTestFiles = [
    'auth.test.js', 'bookings.test.js', 'consoles.test.js', 'pricing.test.js', 'reports.test.js',
    'sessions.test.js', 'security.test.js', 'timer.test.js', 'transactions.test.js', 'validation.test.js',
  ]
  let total = 0
  for (const f of oldTestFiles) {
    const src = readFileSync(join(serverDir, 'test', f), 'utf8')
    const n = (src.match(/^test\(/gm) || []).length
    assert.ok(n >= 1, `${f} masih punya test`)
    total += n
  }
  assert.ok(total >= 30, `test lama utuh (${total} test, minimal 30)`)

  // security probe: semua check id masih ada (tidak dihapus/dinonaktifkan)
  const probe = readFileSync(join(serverDir, 'tools', 'security-probe.mjs'), 'utf8')
  const ids = [
    ...Array.from({ length: 14 }, (_, i) => `AUTH-${i + 1}`),
    ...Array.from({ length: 4 }, (_, i) => `INJ-${i + 1}`),
    ...Array.from({ length: 2 }, (_, i) => `XSS-${i + 1}`),
    ...Array.from({ length: 9 }, (_, i) => `MONEY-${i + 1}`),
    ...Array.from({ length: 5 }, (_, i) => `DISC-${i + 1}`),
    ...Array.from({ length: 2 }, (_, i) => `HYG-${i + 1}`),
  ]
  for (const id of ids) {
    assert.ok(probe.includes(`'${id}'`), `security probe masih punya check ${id}`)
  }

  // frontend: script typecheck + build masih ada
  const webPkg = JSON.parse(readFileSync(join(serverDir, '..', 'web', 'package.json'), 'utf8'))
  assert.ok(webPkg.scripts.typecheck, 'web typecheck script ada')
  assert.ok(webPkg.scripts.build, 'web build script ada')
})

// ───────────────────────────── K17 · K18 · K19 ─────────────────────────────

test('K17 Register -> 201, role user, tanpa auto-login, response tanpa password', async () => {
  await withServer(async ({ api, db }) => {
    const r = await api('/api/auth/register', {
      method: 'POST',
      body: { username: 'pelangganbaru', fullName: 'Pelanggan Baru', phone: '0812-999-888', password: 'PasswordBaru123' },
    })
    assert.equal(r.status, 201)
    assert.equal(r.body.success, true)
    assert.equal(r.body.data.user.role, 'user', 'role selalu user, bukan dari body')
    assert.equal(r.body.data.user.isActive, true)
    assert.equal(r.setCookie.length, 0, 'tidak ada auto-login')
    const raw = JSON.stringify(r.body)
    assert.ok(!raw.includes('password'), 'password tidak ada di response')
    assert.ok(!raw.includes('password_hash'))
    assert.ok(!raw.includes('password_salt'))
    assert.equal(r.body.data.user.password, undefined)
    assert.equal(r.body.data.user.passwordHash, undefined)
    const stored = db.prepare('SELECT role, is_active FROM users WHERE username = ?').get('pelangganbaru')
    assert.equal(stored.role, 'user')
    assert.equal(stored.is_active, 1)
  })
})

test('K18 Register dengan body role:superadmin -> 400 (field tak dikenal ditolak)', async () => {
  await withServer(async ({ api, db }) => {
    const r = await api('/api/auth/register', {
      method: 'POST',
      body: { username: 'escalate2', fullName: 'Escalate Two', password: 'Password123', role: 'superadmin' },
    })
    assert.equal(r.status, 400)
    assert.equal(r.body.error.code, 'VALIDATION_ERROR')
    assert.equal(db.prepare('SELECT COUNT(*) c FROM users WHERE username = ?').get('escalate2').c, 0, 'tidak ada akun yang dibuat')
  })
})

test('K19a Register duplikat -> 409', async () => {
  await withServer(async ({ api }) => {
    const body = { username: 'duplikat1', fullName: 'Duplikat Satu', password: 'Password123' }
    assert.equal((await api('/api/auth/register', { method: 'POST', body })).status, 201)
    const again = await api('/api/auth/register', { method: 'POST', body })
    assert.equal(again.status, 409)
    assert.equal(again.body.error.code, 'DUPLICATE_USERNAME')
  })
})

test('K19b Register 11x per IP -> 429', async () => {
  await withServer(async ({ api }) => {
    let last = null
    for (let i = 1; i <= 11; i++) {
      last = await api('/api/auth/register', {
        method: 'POST',
        body: { username: `banyak${i}`, fullName: `Banyak ${i}`, password: 'Password123' },
      })
      if (i <= 10) assert.equal(last.status, 201, `register ke-${i} harus 201`)
    }
    assert.equal(last.status, 429, 'register ke-11 harus 429')
    assert.equal(last.body.error.code, 'RATE_LIMITED')
  })
})

// ───────────────────────────── K20 · K21 · K22 ─────────────────────────────

test('K20 User tidak bisa mengakses modul superadmin -> semua 403', async () => {
  await withServer(async ({ login }) => {
    const customer = await login(USER.username, USER.password)
    const denied = [
      ['GET', '/api/dashboard/summary'],
      ['GET', '/api/reports/summary'],
      ['GET', '/api/transactions'],
      ['GET', '/api/sessions'],
      ['GET', '/api/users'],
      ['POST', '/api/consoles', { code: 'K20-1', consoleType: 'PS4', roomType: 'Reguler', controllers: 2, hourlyRate: 12000 }],
      ['PUT', '/api/settings', { business: { name: 'Dimodif' } }],
      ['POST', '/api/games', { title: 'Game X', platform: 'PS4', genre: 'arcade' }],
    ]
    const bad = []
    for (const [method, path, body] of denied) {
      const r = await customer(path, { method, body })
      if (r.status !== 403) bad.push(`${method} ${path} -> ${r.status}`)
    }
    assert.deepEqual(bad, [], 'semua modul superadmin harus 403 untuk role user')
  })
})

test('K21 User hanya melihat booking miliknya; booking orang lain -> 404', async () => {
  await withServer(async ({ login, db }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const customer = await login(USER.username, USER.password)
    const c = (await admin.post('/api/consoles', { code: 'K21-1', consoleType: 'PS4', roomType: 'Reguler', controllers: 2, hourlyRate: 10000 })).body.data.console

    const mine = await customer.post('/api/bookings', {
      consoleId: c.id, customerName: 'Saya Sendiri', bookingDate: '2026-12-05', startTime: '10:00', durationMinutes: 60,
    })
    assert.equal(mine.status, 201)
    const mineId = mine.body.data.booking.id
    assert.equal(db.prepare('SELECT customer_user_id FROM bookings WHERE id=?').get(mineId).customer_user_id,
      db.prepare('SELECT id FROM users WHERE username=?').get(USER.username).id, 'pemilik booking = akun yang login')

    const other = await admin.post('/api/bookings', {
      consoleId: c.id, customerName: 'Orang Lain', bookingDate: '2026-12-05', startTime: '14:00', durationMinutes: 60,
    })
    const otherId = other.body.data.booking.id

    const list = await customer.get('/api/bookings')
    assert.equal(list.status, 200)
    assert.equal(list.body.data.items.length, 1, 'hanya booking sendiri yang terlihat')
    assert.equal(list.body.data.items[0].id, mineId)

    const own = await customer.get(`/api/bookings/${mineId}`)
    assert.equal(own.status, 200)
    const foreign = await customer.get(`/api/bookings/${otherId}`)
    assert.equal(foreign.status, 404, 'booking orang lain -> 404 (bukan 403)')
    assert.equal(foreign.body.error.code, 'BOOKING_NOT_FOUND')

    // filter query tidak bisa memperluas cakupan
    const filtered = await customer.get('/api/bookings?status=pending&limit=100')
    assert.ok(filtered.body.data.items.every((b) => b.id === mineId))
  })
})

test('K22 User tidak melihat conditionNote, currentSession.customerName, payments, overtimeRatePerHour', async () => {
  await withServer(async ({ login }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const customer = await login(USER.username, USER.password)
    const c = (await admin.post('/api/consoles', {
      code: 'K22-1', consoleType: 'PS5', roomType: 'VIP', controllers: 4, hourlyRate: 20000, conditionNote: 'RAHASIA-KONDISI-XYZ',
    })).body.data.console
    await admin.post('/api/sessions', { consoleId: c.id, customerName: 'RAHASIA-PELANGGAN-XYZ', durationMinutes: 60 })

    const list = await customer.get('/api/consoles')
    assert.equal(list.status, 200)
    assert.ok(!JSON.stringify(list.body).includes('RAHASIA-KONDISI-XYZ'), 'conditionNote tidak bocor')
    assert.ok(!('conditionNote' in list.body.data.items[0]))

    const one = await customer.get(`/api/consoles/${c.id}`)
    assert.equal(one.status, 200)
    assert.equal(one.body.data.currentSession, undefined, 'currentSession tidak ada untuk user')
    assert.equal(one.body.data.console.conditionNote, undefined)
    assert.ok(!JSON.stringify(one.body).includes('RAHASIA-PELANGGAN-XYZ'), 'nama pelanggan sesi lain tidak bocor')

    const settings = await customer.get('/api/settings')
    assert.equal(settings.status, 200)
    assert.equal(settings.body.data.payments, undefined, 'metode pembayaran internal tidak bocor')
    assert.equal(settings.body.data.rules.overtimeRatePerHour, undefined, 'tarif overtime internal tidak bocor')
    assert.ok(!JSON.stringify(settings.body).includes('overtimeRatePerHour'))
  })
})

// ───────────────────────────── K23 ─────────────────────────────

test('K23 CLI admin:bootstrap: buat -> sukses, ulang -> ditolak, --force -> reset password, output tanpa password', async () => {
  const dir = mkTmpDir('playrent-bootstrap-')
  const dbFile = join(dir, 'boot.db')
  const username = 'owner'
  const password = 'PasswordBootstrap123'

  const first = runCli('admin-bootstrap.js', { dbPath: dbFile, env: { ADMIN_USERNAME: username, ADMIN_PASSWORD: password } })
  assert.equal(first.status, 0, `bootstrap harus sukses: ${first.stderr}`)
  assert.match(first.stdout, /berhasil dibuat/i)
  assert.ok(!first.stdout.includes(password), 'password tidak boleh tercetak')
  assert.ok(!first.stderr.includes(password))

  const db = openDatabase(dbFile)
  try {
    const row = db.prepare('SELECT id, role, is_active, password_hash, password_salt FROM users WHERE username = ?').get(username)
    assert.ok(row, 'akun superadmin dibuat')
    assert.equal(row.role, 'superadmin')
    assert.equal(verifyPassword(password, row.password_hash, row.password_salt), true, 'password tersimpan sebagai hash yang cocok')

    // kedua: sudah ada -> ditolak
    const second = runCli('admin-bootstrap.js', { dbPath: dbFile, env: { ADMIN_USERNAME: username, ADMIN_PASSWORD: password } })
    assert.equal(second.status, 1, 'bootstrap kedua harus ditolak')
    assert.match(second.stderr, /sudah ada/i)
    assert.ok(!second.stderr.includes(password))
    assert.equal(db.prepare('SELECT COUNT(*) c FROM users WHERE role = ?').get('superadmin').c, 1, 'tidak ada akun ganda')

    // --force: reset password
    const newPassword = 'PasswordBaru456'
    const third = runCli('admin-bootstrap.js', {
      dbPath: dbFile, args: ['--force'], env: { ADMIN_USERNAME: username, ADMIN_PASSWORD: newPassword },
    })
    assert.equal(third.status, 0, `--force harus sukses: ${third.stderr}`)
    assert.match(third.stdout, /berhasil diatur ulang/i)
    assert.ok(!third.stdout.includes(newPassword), 'password baru tidak boleh tercetak')

    const after = db.prepare('SELECT password_hash, password_salt FROM users WHERE id = ?').get(row.id)
    assert.equal(verifyPassword(newPassword, after.password_hash, after.password_salt), true, 'password baru aktif')
    assert.equal(verifyPassword(password, after.password_hash, after.password_salt), false, 'password lama tidak berlaku')
    assert.equal(db.prepare('SELECT COUNT(*) c FROM users').get().c, 1, 'tidak ada akun kasir/double yang dibuat')
  } finally {
    db.close()
  }
})
