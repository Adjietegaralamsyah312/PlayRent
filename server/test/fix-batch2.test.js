// Batch 2 — laporan, ekspor, dan ketahanan (fix-contract §4).
//
// Regresi untuk: BE-007 (periode kosong), BE-008 (jenis ekspor), BE-011
// (revenueWeek lintas batas tahun), BE-012 (snapshot skema v1), BE-013
// (formula injection CSV), BE-016 (query dashboard dibatasi), BE-018a
// (escape LIKE), BE-018b (id non-numerik -> 400).
import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { withServer, ADMIN } from './helpers.js'
import { jakartaLocalToUtc, jakartaDateStr, shiftYmd } from '../src/lib/time.js'

const here = dirname(fileURLToPath(import.meta.url))
const at = (ymd, hhmm = '12:00') => new Date(jakartaLocalToUtc(ymd, hhmm)).toISOString()

/** A console + one paid transaction + one finished session on `ymd`. */
function seedDay(db, consoleId, ymd, { total = 20000, minutes = 60, customer = 'Pelanggan' } = {}) {
  db.prepare(
    `INSERT INTO transactions
     (number, console_code, customer_name, subtotal, total, payment_method, payment_status, amount_paid, status, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  ).run(`TRX-${ymd.replace(/-/g, '')}-0001`, 'R-1', customer, total, total, 'cash', 'paid', total, 'completed', at(ymd, '10:00'))
  db.prepare(
    `INSERT INTO rental_sessions
     (console_id, customer_name, status, started_at, ends_at, planned_minutes, billed_minutes, rate_snapshot, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  ).run(consoleId, customer, 'finished', at(ymd, '09:00'), at(ymd, '10:00'), minutes, minutes, 12000, at(ymd, '09:00'), at(ymd, '09:00'))
}

/** Raw CSV text for an export (the endpoint answers text/csv, not JSON). */
async function csv(base, cookie, query) {
  const res = await fetch(`${base}/api/reports/export.csv${query}`, { headers: { cookie } })
  return { res, text: await res.text() }
}

// ───────────────────────────── BE-007 ─────────────────────────────

test('BE-007 laporan harian mengisi periode kosong dengan 0', async () => {
  await withServer(async ({ login, db }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const c = (await admin.post('/api/consoles', { code: 'R-1', consoleType: 'PS4', roomType: 'Reguler', controllers: 2, hourlyRate: 12000 })).body.data.console
    seedDay(db, c.id, '2026-05-10')

    const items = (await admin.get('/api/reports/daily?from=2026-05-08&to=2026-05-12')).body.data.items
    assert.equal(items.length, 5, 'satu baris per hari, termasuk hari kosong')
    assert.deepEqual(items.map((i) => i.date), ['2026-05-08', '2026-05-09', '2026-05-10', '2026-05-11', '2026-05-12'])
    const empty = items[0]
    assert.equal(empty.revenue, 0)
    assert.equal(empty.transactions, 0)
    assert.equal(empty.sessions, 0)
    assert.equal(empty.minutes, 0)
    const busy = items[2]
    assert.equal(busy.revenue, 20000)
    assert.equal(busy.transactions, 1)
    assert.equal(busy.sessions, 1)
    assert.equal(busy.minutes, 60)
    assert.equal(items[4].revenue, 0, 'hari terakhir juga ada walau kosong')
  })
})

test('BE-007 laporan mingguan & bulanan mengisi periode kosong', async () => {
  await withServer(async ({ login, db }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const c = (await admin.post('/api/consoles', { code: 'R-1', consoleType: 'PS4', roomType: 'Reguler', controllers: 2, hourlyRate: 12000 })).body.data.console
    seedDay(db, c.id, '2026-05-10') // minggu ISO 2026-W19

    const weeks = (await admin.get('/api/reports/weekly?from=2026-05-01&to=2026-05-31')).body.data.items
    assert.deepEqual(weeks.map((w) => w.date), ['2026-W18', '2026-W19', '2026-W20', '2026-W21', '2026-W22'])
    assert.equal(weeks[1].revenue, 20000, 'minggu yang ada transaksinya berisi nominal')
    assert.equal(weeks[0].revenue, 0, 'minggu kosong tetap muncul')
    assert.equal(weeks[4].sessions, 0)

    const months = (await admin.get('/api/reports/monthly?from=2026-04-01&to=2026-06-30')).body.data.items
    assert.deepEqual(months.map((m) => m.date), ['2026-04', '2026-05', '2026-06'])
    assert.equal(months[1].revenue, 20000)
    assert.equal(months[0].revenue, 0)
    assert.equal(months[2].revenue, 0)
  })
})

test('BE-007 revenue-chart mengisi bucket kosong per hari', async () => {
  await withServer(async ({ login, db }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const c = (await admin.post('/api/consoles', { code: 'R-1', consoleType: 'PS4', roomType: 'Reguler', controllers: 2, hourlyRate: 12000 })).body.data.console
    seedDay(db, c.id, '2026-05-10')

    const buckets = (await admin.get('/api/dashboard/revenue-chart?from=2026-05-08&to=2026-05-12')).body.data.buckets
    assert.equal(buckets.length, 5, 'sumbu-x tidak boleh melompati hari sepi')
    assert.deepEqual(buckets.map((b) => b.label), ['2026-05-08', '2026-05-09', '2026-05-10', '2026-05-11', '2026-05-12'])
    assert.equal(buckets[0].revenue, 0)
    assert.equal(buckets[0].transactions, 0)
    assert.equal(buckets[2].revenue, 20000)
    assert.equal(buckets[2].transactions, 1)
  })
})

// ───────────────────────────── BE-008 ─────────────────────────────

test('BE-008 ekspor CSV weekly/monthly memakai agregasi, bukan daftar transaksi', async () => {
  await withServer(async ({ login, db, base }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const c = (await admin.post('/api/consoles', { code: 'R-1', consoleType: 'PS4', roomType: 'Reguler', controllers: 2, hourlyRate: 12000 })).body.data.console
    seedDay(db, c.id, '2026-05-10')

    const weekly = await csv(base, admin.cookie, '?type=weekly&from=2026-05-01&to=2026-05-31')
    assert.match(weekly.res.headers.get('content-type'), /text\/csv/)
    assert.match(weekly.res.headers.get('content-disposition'), /playrent-weekly-2026-05-01-2026-05-31\.csv/)
    assert.ok(weekly.text.includes('2026-W19'), 'baris mingguan berisi label minggu')
    assert.ok(weekly.text.includes('2026-W18'), 'minggu kosong ikut diekspor')
    assert.ok(!weekly.text.includes('No. Transaksi'), 'bukan CSV transaksi')
    assert.ok(weekly.text.includes('Tanggal') && weekly.text.includes('Pendapatan') && weekly.text.includes('Sesi'))

    const monthly = await csv(base, admin.cookie, '?type=monthly&from=2026-04-01&to=2026-06-30')
    assert.match(monthly.res.headers.get('content-disposition'), /playrent-monthly-2026-04-01-2026-06-30\.csv/)
    assert.ok(monthly.text.includes('2026-05'))
    assert.ok(monthly.text.includes('2026-04'))
    assert.ok(!monthly.text.includes('No. Transaksi'))
  })
})

test('BE-008 ekspor CSV payments memakai data /reports/payments', async () => {
  await withServer(async ({ login, db, base }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const c = (await admin.post('/api/consoles', { code: 'R-1', consoleType: 'PS4', roomType: 'Reguler', controllers: 2, hourlyRate: 12000 })).body.data.console
    seedDay(db, c.id, '2026-05-10')

    const payments = await csv(base, admin.cookie, '?type=payments&from=2026-05-01&to=2026-05-31')
    assert.match(payments.res.headers.get('content-disposition'), /playrent-payments-2026-05-01-2026-05-31\.csv/)
    assert.ok(payments.text.includes('No. Transaksi'), 'kolom transaksi')
    assert.ok(payments.text.includes('TRX-20260510-0001'), 'baris dari dataset payments')
    assert.ok(payments.text.includes('Status Bayar'))
  })
})

test('BE-008 type ekspor tak dikenal -> 400 VALIDATION_ERROR (bukan fallback diam-diam)', async () => {
  await withServer(async ({ login, base }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const res = await admin.get('/api/reports/export.csv?type=bogus&from=2026-05-01&to=2026-05-31')
    assert.equal(res.status, 400)
    assert.equal(res.body.success, false)
    assert.equal(res.body.error.code, 'VALIDATION_ERROR')
    assert.match(res.body.error.message, /bogus/)

    const missing = await admin.get('/api/reports/export.csv?from=2026-05-01&to=2026-05-31')
    assert.equal(missing.status, 400, 'type kosong juga 400, bukan fallback ke transactions')
    assert.equal(missing.body.error.code, 'VALIDATION_ERROR')
  })
})

// ───────────────────────────── BE-011 ─────────────────────────────

test('BE-011 revenueWeek mencakup 7 hari utuh, termasuk saat lintasi batas tahun', async () => {
  // 2026-01-02 (Jumat) -> minggu ISO 2026-W01 = 2025-12-29 .. 2026-01-04.
  // Transaksi 2025-12-29 punya label minggu yang sama, jadi ikut dihitung.
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-01-02T03:00:00Z') })
  try {
    await withServer(async ({ login, db }) => {
      const admin = await login(ADMIN.username, ADMIN.password)
      const c = (await admin.post('/api/consoles', { code: 'R-1', consoleType: 'PS4', roomType: 'Reguler', controllers: 2, hourlyRate: 12000 })).body.data.console
      const tx = db.prepare(
        `INSERT INTO transactions
         (number, console_code, customer_name, subtotal, total, payment_method, payment_status, amount_paid, status, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      )
      tx.run('TRX-X-0001', 'R-1', 'Pelanggan', 8000, 8000, 'cash', 'paid', 8000, 'completed', at('2025-12-29', '10:00'))
      tx.run('TRX-X-0002', 'R-1', 'Pelanggan', 5000, 5000, 'cash', 'paid', 5000, 'completed', at('2026-01-02', '10:00'))
      assert.ok(c.id > 0)

      const s = (await admin.get('/api/dashboard/summary')).body.data
      assert.equal(s.range.revenueWeek, 13000, 'hari terakhir tahun sebelumnya ikut terhitung')
      assert.equal(s.range.revenueToday, 5000)
      assert.equal(s.range.revenueMonth, 5000, 'bulan berjalan tetap bulan berjalan')
    })
  } finally {
    mock.timers.reset()
  }
})

// ───────────────────────────── BE-012 ─────────────────────────────

test('BE-012 skema hasil migrasi cocok api-contract; schema.sql tetap snapshot v1', async () => {
  await withServer(async ({ db }) => {
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 4, 'versi skema saat ini = 4')

    const usersSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get().sql
    assert.match(usersSql, /role IN \('superadmin','user'\)/, 'CHECK role sesuai kontrak')
    assert.ok(!usersSql.includes('cashier'), 'role cashier sudah hilang')

    const userCols = db.prepare("SELECT name FROM pragma_table_info('users')").all().map((c) => c.name)
    assert.ok(userCols.includes('phone'), 'users.phone ada setelah migrasi')

    const bookingCols = db.prepare("SELECT name FROM pragma_table_info('bookings')").all().map((c) => c.name)
    assert.ok(bookingCols.includes('customer_user_id'), 'bookings.customer_user_id ada setelah migrasi')

    assert.throws(
      () => db.prepare(
        `INSERT INTO users (username, full_name, password_hash, password_salt, role, created_at, updated_at)
         VALUES ('kasir2','Kasir','x','y','cashier','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')`,
      ).run(),
      /CHECK constraint failed/i,
      'CHECK menolak role lama',
    )

    // The file itself stays the frozen v1 snapshot — it must NOT be edited.
    const snapshot = readFileSync(join(here, '../src/schema.sql'), 'utf8')
    assert.match(snapshot, /SNAPSHOT v1/i, 'header menandai snapshot v1')
    assert.match(snapshot, /role IN \('admin','cashier'\)/, 'isi file v1 tidak diubah')
  })
})

// ───────────────────────────── BE-013 ─────────────────────────────

test('BE-013 formula injection pada ekspor CSV dicegah', async () => {
  await withServer(async ({ login, db, base }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const c = (await admin.post('/api/consoles', { code: 'R-1', consoleType: 'PS4', roomType: 'Reguler', controllers: 2, hourlyRate: 12000 })).body.data.console
    seedDay(db, c.id, '2026-05-10', { customer: "=cmd|'/c calc'!A1" })
    seedDay(db, c.id, '2026-05-11', { customer: 'Budi Santoso' })

    const { text } = await csv(base, admin.cookie, '?type=transactions&from=2026-05-01&to=2026-05-31')
    assert.ok(text.includes("'=cmd|'/c calc'!A1"), 'nama berbahaya diberi prefix apostrof')
    assert.ok(!text.includes(',=cmd'), 'tidak ada sel yang diawali = tanpa prefix')
    assert.ok(text.includes('Budi Santoso'), 'nama biasa tidak berubah')
  })
})

// ───────────────────────────── BE-016 ─────────────────────────────

test('BE-016 query dashboard dibatasi: rentang terlalu lebar -> 400', async () => {
  await withServer(async ({ login }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    for (const path of ['/api/dashboard/revenue-chart', '/api/dashboard/busy-hours']) {
      const res = await admin.get(`${path}?from=2020-01-01&to=2026-10-20`)
      assert.equal(res.status, 400, path)
      assert.equal(res.body.error.code, 'VALIDATION_ERROR')
      assert.match(res.body.error.message, /terlalu lebar/i)
    }
    const okRange = await admin.get('/api/dashboard/revenue-chart?from=2026-01-01&to=2026-10-20')
    assert.equal(okRange.status, 200, 'rentang <= 365 hari tetap boleh')
  })
})

test('BE-016 busy-hours tanpa rentang tidak lagi membaca seluruh riwayat', async () => {
  await withServer(async ({ login, db }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const c = (await admin.post('/api/consoles', { code: 'R-1', consoleType: 'PS4', roomType: 'Reguler', controllers: 2, hourlyRate: 12000 })).body.data.console
    const sess = db.prepare(
      `INSERT INTO rental_sessions
       (console_id, customer_name, status, started_at, ends_at, planned_minutes, billed_minutes, rate_snapshot, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    )
    sess.run(c.id, 'Lama', 'finished', at('2024-05-01', '10:00'), at('2024-05-01', '11:00'), 60, 60, 12000, at('2024-05-01', '10:00'), at('2024-05-01', '10:00'))
    sess.run(c.id, 'Baru', 'finished', at(shiftYmd(jakartaDateStr(), -1), '10:00'), at(shiftYmd(jakartaDateStr(), -1), '11:00'), 60, 60, 12000, at(shiftYmd(jakartaDateStr(), -1), '10:00'), at(shiftYmd(jakartaDateStr(), -1), '10:00'))

    const hours = (await admin.get('/api/dashboard/busy-hours')).body.data.hours
    const total = hours.reduce((a, h) => a + h.sessions, 0)
    assert.equal(total, 1, 'hanya sesi dalam 30 hari terakhir yang dihitung')
  })
})

// ───────────────────────────── BE-018 ─────────────────────────────

test('BE-018a wildcard LIKE dari pengguna diperlakukan sebagai karakter literal', async () => {
  await withServer(async ({ login, db }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const codes = []
    for (const code of ['PS-01', 'PS-02']) {
      const res = await admin.post('/api/consoles', { code, consoleType: 'PS4', roomType: 'Reguler', controllers: 2, hourlyRate: 12000 })
      assert.equal(res.status, 201)
      codes.push(res.body.data.console.id)
    }
    seedDay(db, codes[0], '2026-05-10', { customer: 'Budi' })

    const all = (await admin.get('/api/consoles?q=%')).body.data.items
    assert.equal(all.length, 0, 'q=% tidak boleh mengembalikan seluruh tabel')
    const underscore = (await admin.get('/api/consoles?q=PS_01')).body.data.items
    assert.equal(underscore.length, 0, 'q=_ bukan wildcard')
    const literal = (await admin.get('/api/consoles?q=PS-01')).body.data.items
    assert.equal(literal.length, 1, 'pencarian biasa tetap jalan')
    const partial = (await admin.get('/api/consoles?q=PS-0')).body.data.items
    assert.equal(partial.length, 2, 'sebagian teks tetap cocok')

    const tx = (await admin.get('/api/transactions?q=%')).body.data.items
    assert.equal(tx.length, 0, 'transaksi: q=% tidak_match semua')
    const txName = (await admin.get('/api/transactions?q=Bud')).body.data.items
    assert.equal(txName.length, 1)
  })
})

test('BE-018b id non-numerik -> 400 VALIDATION_ERROR (bukan 500)', async () => {
  await withServer(async ({ login }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    for (const path of ['/api/sessions/abc', '/api/consoles/abc', '/api/bookings/abc', '/api/transactions/abc']) {
      const res = await admin.get(path)
      assert.equal(res.status, 400, path)
      assert.equal(res.body.success, false)
      assert.equal(res.body.error.code, 'VALIDATION_ERROR')
    }
    // Not a plain decimal integer either — rejected, not coerced to another row.
    for (const path of ['/api/sessions/1e2', '/api/sessions/0x10', '/api/sessions/1.5']) {
      const res = await admin.get(path)
      assert.equal(res.status, 400, path)
      assert.equal(res.body.error.code, 'VALIDATION_ERROR')
    }
  })
})
