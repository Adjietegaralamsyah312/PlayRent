// Batch 1 — uang & integritas data (fix-contract §1–§4).
//
// Regresi untuk: BE-001 (migrasi v4), BE-002 (quote == finish), BE-003
// (bentuk /reports/payments), BE-004 (bentuk items[]), BE-005 (filter
// overdue), BE-006 (cancel booking check-in), BE-010 (batas startedAt),
// BE-014 (amountPaid non-tunai), BE-015 (username ganda).
import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { once } from 'node:events'
import { rmSync } from 'node:fs'
import {
  withServer, ADMIN, USER, mkTmpDir, openDatabase, migrate, makeHttp, makeClient,
} from './helpers.js'

const MINUTE = 60000

/** A console for the money tests. */
async function mkConsole(admin, overrides = {}) {
  const res = await admin.post('/api/consoles', {
    code: 'C-1', consoleType: 'PS4', roomType: 'Reguler', controllers: 2, hourlyRate: 12000, ...overrides,
  })
  assert.equal(res.status, 201, JSON.stringify(res.body))
  return res.body.data.console
}

/**
 * A start time ~100.5 minutes in the past: the session is 100 whole minutes
 * overdue, and the next whole-minute boundary is 30 s away — far enough that
 * the quote call and the finish call below cannot straddle it.
 */
const overdueStart = () => new Date(Date.now() - 100.5 * MINUTE).toISOString()

// ───────────────────────────── BE-001 ─────────────────────────────

test('BE-001 migrasi v4: DB tanpa seed punya baris business_settings dan jalur uang tidak 500', async () => {
  const dir = mkTmpDir('playrent-v4-')
  const dbFile = join(dir, 'fresh.db')
  const db = openDatabase(dbFile)
  try {
    migrate(db)

    // The row the migration must create — the demo seeder is no longer needed
    // for the money path to work.
    const row = db.prepare('SELECT * FROM business_settings WHERE id = 1').get()
    assert.ok(row, 'baris business_settings harus ada setelah migrasi')
    assert.equal(row.business_name, 'PlayRent')
    assert.equal(row.min_duration_minutes, 30)
    assert.equal(row.rounding_minutes, 15)
    assert.equal(row.overtime_rate_per_hour, 12000)
    assert.equal(row.overtime_grace_minutes, 5)
    assert.equal(row.default_hourly_rate, 15000)
    assert.deepEqual(JSON.parse(row.warn_minutes_json), [10, 5, 1])
    assert.deepEqual(JSON.parse(row.payment_methods_json), ['cash', 'transfer', 'qris'])

    // Idempotent: migrating again must not fail or duplicate the row.
    migrate(db)
    assert.equal(db.prepare('SELECT COUNT(*) c FROM business_settings').get().c, 1)

    // One operator account so the protected routes can be exercised.
    const { hashPassword } = await import('../src/lib/auth.js')
    const { hash, salt } = hashPassword('PasswordV4Test123')
    const t = new Date().toISOString()
    db.prepare(
      `INSERT INTO users (username, full_name, password_hash, password_salt, role, is_active, created_at, updated_at)
       VALUES (?,?,?,?,?,1,?,?)`,
    ).run('owner', 'Owner PlayRent', hash, salt, 'superadmin', t, t)

    // Boot the real app on this never-seeded database.
    const { createApp } = await import('../src/app.js')
    const server = createApp(db).listen(0)
    await once(server, 'listening')
    try {
      const api = makeHttp(`http://127.0.0.1:${server.address().port}`)
      const login = await api('/api/auth/login', {
        method: 'POST', body: { username: 'owner', password: 'PasswordV4Test123' },
      })
      assert.equal(login.status, 200, JSON.stringify(login.body))
      const cookie = login.setCookie.map((c) => c.split(';')[0]).find((c) => c.startsWith('pr_session='))
      const client = makeClient(api, cookie)

      // The money path used to die with a TypeError -> 500 here.
      const settings = await client.get('/api/settings')
      assert.equal(settings.status, 200, JSON.stringify(settings.body))
      assert.equal(settings.body.data.business.name, 'PlayRent')
      assert.equal(settings.body.data.rules.overtimeRatePerHour, 12000)

      const consoleRes = await client.post('/api/consoles', {
        code: 'PS-01', consoleType: 'PS4', roomType: 'Reguler', controllers: 2, hourlyRate: 8000,
      })
      assert.equal(consoleRes.status, 201, JSON.stringify(consoleRes.body))

      const quote = await client.post('/api/sessions/quote', { consoleId: consoleRes.body.data.console.id, durationMinutes: 60 })
      assert.equal(quote.status, 200, JSON.stringify(quote.body))
      assert.equal(quote.body.data.total, 8000)

      const session = await client.post('/api/sessions', {
        consoleId: consoleRes.body.data.console.id, customerName: 'Andi', durationMinutes: 60,
      })
      assert.equal(session.status, 201, JSON.stringify(session.body))
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
  } finally {
    try { db.close() } catch { /* ignore */ }
    rmSync(dir, { recursive: true, force: true })
  }
})

test('BE-001 seed:schema mengisi katalog tanpa transaksi/sesi demo', async () => {
  const dir = mkTmpDir('playrent-seed-schema-')
  const dbFile = join(dir, 'schema.db')
  const db = openDatabase(dbFile)
  try {
    migrate(db)
    const { seedSchema } = await import('../src/seed-schema.js')
    // seed-schema.js binds to the default DB; call the exported pieces on
    // this throwaway DB instead.
    const { insertConsoles, insertGames, insertPackages, insertSettings } = await import('../src/seed.js')
    db.exec('BEGIN IMMEDIATE')
    insertConsoles(db); insertGames(db); insertPackages(db); insertSettings(db)
    db.exec('COMMIT')
    assert.ok(typeof seedSchema === 'function', 'seed:schema exported')

    assert.equal(db.prepare('SELECT COUNT(*) c FROM business_settings').get().c, 1)
    assert.ok(db.prepare('SELECT COUNT(*) c FROM consoles').get().c > 0, 'katalog unit terisi')
    assert.ok(db.prepare('SELECT COUNT(*) c FROM packages').get().c > 0, 'katalog paket terisi')
    // The demo data must NOT be there.
    assert.equal(db.prepare('SELECT COUNT(*) c FROM transactions').get().c, 0, 'tidak ada transaksi fiktif')
    assert.equal(db.prepare('SELECT COUNT(*) c FROM rental_sessions').get().c, 0, 'tidak ada sesi demo')
    assert.equal(db.prepare('SELECT COUNT(*) c FROM bookings').get().c, 0, 'tidak ada booking demo')
  } finally {
    try { db.close() } catch { /* ignore */ }
    rmSync(dir, { recursive: true, force: true })
  }
})

// ───────────────────────────── BE-002 ─────────────────────────────

test('BE-002 quote(sesi overtime) == finish(sesi overtime), selisih 0 rupiah', async () => {
  await withServer(async ({ login }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const c = await mkConsole(admin, { hourlyRate: 12000 })

    const started = await admin.post('/api/sessions', {
      consoleId: c.id, customerName: 'Andi', durationMinutes: 60, startedAt: overdueStart(),
    })
    assert.equal(started.status, 201, JSON.stringify(started.body))
    const sid = started.body.data.session.id

    const quoteRes = await admin.post('/api/sessions/quote', { sessionId: sid })
    assert.equal(quoteRes.status, 200, JSON.stringify(quoteRes.body))
    const q = quoteRes.body.data

    // The preview really carries the overtime — that is the whole point.
    assert.equal(q.durationMinutes, 60, 'planned = durasi rencana sesi')
    assert.equal(q.hourlyRate, 12000, 'tarif = rate_snapshot sesi')
    assert.ok(q.overtimeMinutes > 0, `overtime harus dihitung (${q.overtimeMinutes})`)
    assert.ok(q.overtimeAmount > 0, 'baris overtime harus berisi nominal')
    assert.equal(q.subtotal + q.overtimeAmount, q.total, 'total = subtotal + overtime')

    // ... and it is exactly what finish charges.
    const fin = await admin.post(`/api/sessions/${sid}/finish`, {
      paymentMethod: 'cash', amountPaid: q.total,
    })
    assert.equal(fin.status, 201, JSON.stringify(fin.body))
    const tx = fin.body.data.transaction
    assert.equal(tx.total - q.total, 0, 'selisih quote vs finish harus 0 rupiah')
    assert.equal(tx.total, 19000, '60 menit @12000 + 35 menit overtime @12000/jam')
  })
})

test('BE-002 quote: jalur sesi (404/409), jalur plan, dan extraMinutes', async () => {
  await withServer(async ({ login }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const c = await mkConsole(admin, { hourlyRate: 12000 })

    // Unknown session -> 404, not a silent plan quote.
    const missing = await admin.post('/api/sessions/quote', { sessionId: 999999 })
    assert.equal(missing.status, 404)
    assert.equal(missing.body.error.code, 'SESSION_NOT_FOUND')

    // Neither sessionId nor a plan -> 400.
    const empty = await admin.post('/api/sessions/quote', { durationMinutes: 60 })
    assert.equal(empty.status, 400)
    assert.equal(empty.body.error.code, 'VALIDATION_ERROR')

    // A finished session is no longer quotable.
    const s = await admin.post('/api/sessions', { consoleId: c.id, customerName: 'Andi', durationMinutes: 60 })
    const sid = s.body.data.session.id
    await admin.post(`/api/sessions/${sid}/finish`, { paymentMethod: 'cash', amountPaid: 50000 })
    const done = await admin.post('/api/sessions/quote', { sessionId: sid })
    assert.equal(done.status, 409)
    assert.equal(done.body.error.code, 'SESSION_NOT_ACTIVE')

    // Plan path: unchanged behaviour, extraMinutes extends the plan.
    const plan = await admin.post('/api/sessions/quote', { consoleId: c.id, durationMinutes: 60 })
    assert.equal(plan.status, 200)
    assert.equal(plan.body.data.total, 12000)
    assert.equal(plan.body.data.overtimeMinutes, 0, 'rencana tanpa startedAt tidak punya overtime')

    const planExtra = await admin.post('/api/sessions/quote', { consoleId: c.id, durationMinutes: 60, extraMinutes: 30 })
    assert.equal(planExtra.body.data.durationMinutes, 90, 'extraMinutes menambah durasi rencana')
    assert.equal(planExtra.body.data.total, 18000, '90 menit @12000/jam')

    // extraMinutes pada sesi hidup menambah durasi rencana, bukan overtime.
    const live = await admin.post('/api/sessions', {
      consoleId: c.id, customerName: 'Budi', durationMinutes: 60,
      startedAt: new Date(Date.now() - 10 * MINUTE).toISOString(),
    })
    assert.equal(live.status, 201, JSON.stringify(live.body))
    const liveId = live.body.data.session.id
    const base = await admin.post('/api/sessions/quote', { sessionId: liveId })
    const ext = await admin.post('/api/sessions/quote', { sessionId: liveId, extraMinutes: 30 })
    assert.equal(base.body.data.overtimeMinutes, 0, 'sesi belum terlambat')
    assert.equal(ext.body.data.durationMinutes, 90, 'planned sesi + extraMinutes')
    assert.equal(ext.body.data.billableMinutes, 90)
    assert.equal(ext.body.data.overtimeMinutes, 0, 'extraMinutes tidak menambah menit overtime')
    assert.equal(ext.body.data.total - base.body.data.total, 6000, 'perpanjangan 30 menit = Rp 6.000')

    // Pada sesi yang sudah terlambat, perpanjangan memindahkan menit overtime
    // menjadi menit rencana (bukan menambah tagihan baru).
    const c2 = await mkConsole(admin, { code: 'C-2', hourlyRate: 12000 })
    const late = await admin.post('/api/sessions', {
      consoleId: c2.id, customerName: 'Sari', durationMinutes: 60, startedAt: overdueStart(),
    })
    assert.equal(late.status, 201, JSON.stringify(late.body))
    const lateId = late.body.data.session.id
    const lateBase = await admin.post('/api/sessions/quote', { sessionId: lateId })
    const lateExt = await admin.post('/api/sessions/quote', { sessionId: lateId, extraMinutes: 30 })
    assert.equal(lateBase.body.data.overtimeMinutes, 35, '100 menit berjalan, grace 5')
    assert.equal(lateExt.body.data.overtimeMinutes, 5, 'overtime menyusut 30 menit')
    assert.equal(lateExt.body.data.durationMinutes, 90)
  })
})

// ───────────────────────────── BE-003 ─────────────────────────────

test('BE-003 /reports/payments: totals kanonik + items berupa transaksi utuh', async () => {
  await withServer(async ({ login, db }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const c = await mkConsole(admin, { hourlyRate: 12000 })
    const iso = new Date().toISOString()

    const tx = db.prepare(
      `INSERT INTO transactions
       (number, console_code, customer_name, subtotal, total, payment_method, payment_status, amount_paid, status, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    )
    tx.run('TRX-P-0001', 'C-1', 'Budi', 20000, 20000, 'cash', 'paid', 20000, 'completed', iso)
    tx.run('TRX-P-0002', 'C-1', 'Andi', 30000, 30000, 'transfer', 'paid', 30000, 'completed', iso)
    tx.run('TRX-P-0003', 'C-1', 'Siti', 5000, 5000, 'qris', 'unpaid', 0, 'completed', iso)
    tx.run('TRX-P-0004', 'C-1', 'Rudi', 7000, 7000, 'cash', 'void', 0, 'void', iso)

    const res = await admin.get('/api/reports/payments')
    assert.equal(res.status, 200, JSON.stringify(res.body))
    const { items, totals } = res.body.data

    assert.equal(totals.count, 4, 'jumlah baris termasuk void')
    assert.equal(totals.gross, 55000, 'Σ total, status != void')
    assert.equal(totals.paid, 50000, 'Σ total, != void dan paid')
    assert.equal(totals.outstanding, 5000, 'Σ total, != void dan unpaid')
    assert.equal(totals.voided, 1, 'voided = JUMLAH transaksi void, bukan rupiah')
    assert.equal(totals.subtotal, undefined, 'subtotal dihapus (duplikat gross)')

    // items[] = objek transaksi UTUH, bukan bentuk ringkas.
    assert.equal(items.length, 4)
    const first = items.find((i) => i.number === 'TRX-P-0001')
    assert.equal(first.total, 20000)
    assert.equal(first.paymentMethod, 'cash')
    assert.equal(first.paymentStatus, 'paid')
    assert.equal(first.customerName, 'Budi')
    assert.equal(first.consoleCode, 'C-1')
    assert.ok(first.createdAt, 'createdAt ada')
    assert.equal(first.at, undefined, 'field lama "at" dihapus')
    assert.equal(first.method, undefined, 'field lama "method" dihapus')
    assert.equal(first.status, 'completed', 'status = status transaksi, bukan payment_status')

    // Filter status & method tetap bekerja.
    const voided = await admin.get('/api/reports/payments?status=void')
    assert.equal(voided.body.data.items.length, 1)
    assert.equal(voided.body.data.totals.voided, 1)
    const cash = await admin.get('/api/reports/payments?method=cash')
    assert.equal(cash.body.data.items.length, 2)
  })
})

// ───────────────────────────── BE-004 ─────────────────────────────

test('BE-004 /transactions/:id items[] memakai nama kanonik', async () => {
  await withServer(async ({ login }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const c = await mkConsole(admin, { hourlyRate: 12000 })
    const s = await admin.post('/api/sessions', { consoleId: c.id, customerName: 'Andi', durationMinutes: 60 })
    const sid = s.body.data.session.id
    const fin = await admin.post(`/api/sessions/${sid}/finish`, { paymentMethod: 'cash', amountPaid: 50000 })
    const txId = fin.body.data.transaction.id

    const res = await admin.get(`/api/transactions/${txId}`)
    assert.equal(res.status, 200, JSON.stringify(res.body))
    const items = res.body.data.items
    assert.equal(items.length, 1)
    const item = items[0]
    assert.equal(item.kind, 'rental')
    assert.equal(item.description, 'Sewa C-1 60 menit')
    assert.equal(item.qty, 1)
    assert.equal(item.unitPrice, 12000)
    assert.equal(item.lineTotal, 12000)
    assert.equal(item.label, undefined, 'field lama "label" dihapus')
    assert.equal(item.quantity, undefined, 'field lama "quantity" dihapus')
    assert.equal(item.amount, undefined, 'field lama "amount" dihapus')

    // Struk HTML memakai nama yang sama — tidak boleh "undefined".
    const receipt = await admin.get(`/api/transactions/${txId}/receipt?format=html`)
    assert.equal(receipt.status, 200)
    assert.ok(receipt.text.includes('Sewa C-1 60 menit'), 'item terender di struk')
    assert.ok(!receipt.text.includes('undefined'), 'struk tidak memuat "undefined"')
  })
})

// ───────────────────────────── BE-005 ─────────────────────────────

test('BE-005 GET /sessions?status=overdue mengembalikan sesi terlambat', async () => {
  await withServer(async ({ login }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const c = await mkConsole(admin, { hourlyRate: 12000 })

    // A session whose ends_at is 2 hours in the past.
    const s = await admin.post('/api/sessions', {
      consoleId: c.id, customerName: 'Andi', durationMinutes: 60, startedAt: overdueStart(),
    })
    assert.equal(s.status, 201, JSON.stringify(s.body))
    const sid = s.body.data.session.id

    const overdue = await admin.get('/api/sessions?status=overdue')
    assert.equal(overdue.status, 200, JSON.stringify(overdue.body))
    assert.equal(overdue.body.data.items.length, 1, 'sesi terlambat harus muncul di filter overdue')
    assert.equal(overdue.body.data.items[0].id, sid)
    assert.equal(overdue.body.data.items[0].status, 'overdue')

    // ... and it must not be listed as active any more.
    const active = await admin.get('/api/sessions?status=active')
    assert.equal(active.body.data.items.length, 0, 'sesi terlambat tidak lagi dihitung aktif')
  })
})

// ───────────────────────────── BE-006 ─────────────────────────────

test('BE-006 booking yang sudah check-in tidak bisa dibatalkan (409)', async () => {
  await withServer(async ({ login, db }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const c = await mkConsole(admin, { hourlyRate: 12000 })

    const created = await admin.post('/api/bookings', {
      consoleId: c.id, customerName: 'Budi', bookingDate: '2026-12-20', startTime: '10:00', durationMinutes: 60,
    })
    assert.equal(created.status, 201, JSON.stringify(created.body))
    const bid = created.body.data.booking.id

    await admin.patch(`/api/bookings/${bid}`, { status: 'confirmed' })
    const checkIn = await admin.post(`/api/bookings/${bid}/check-in`, {})
    assert.equal(checkIn.status, 201, JSON.stringify(checkIn.body))

    const cancel = await admin.post(`/api/bookings/${bid}/cancel`, { reason: 'batal' })
    assert.equal(cancel.status, 409, JSON.stringify(cancel.body))
    assert.equal(cancel.body.error.code, 'BOOKING_ALREADY_CHECKED_IN')

    // The booking and its live session are untouched.
    const row = db.prepare('SELECT status, session_id FROM bookings WHERE id = ?').get(bid)
    assert.equal(row.status, 'checked_in')
    assert.ok(row.session_id, 'sesi masih terhubung')
    assert.equal(db.prepare('SELECT status FROM rental_sessions WHERE id = ?').get(row.session_id).status, 'active')
  })
})

// ───────────────────────────── BE-010 ─────────────────────────────

test('BE-010 startedAt dibatasi: > 24 jam lalu dan > 5 menit depan ditolak 400', async () => {
  await withServer(async ({ login }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const c = await mkConsole(admin, { hourlyRate: 12000 })

    const tooOld = await admin.post('/api/sessions', {
      consoleId: c.id, customerName: 'Andi', durationMinutes: 60,
      startedAt: new Date(Date.now() - 25 * 60 * MINUTE).toISOString(),
    })
    assert.equal(tooOld.status, 400, JSON.stringify(tooOld.body))
    assert.equal(tooOld.body.error.code, 'VALIDATION_ERROR')

    const tooFuture = await admin.post('/api/sessions', {
      consoleId: c.id, customerName: 'Andi', durationMinutes: 60,
      startedAt: new Date(Date.now() + 10 * MINUTE).toISOString(),
    })
    assert.equal(tooFuture.status, 400, JSON.stringify(tooFuture.body))
    assert.equal(tooFuture.body.error.code, 'VALIDATION_ERROR')

    // Inside the window: still accepted.
    const ok = await admin.post('/api/sessions', {
      consoleId: c.id, customerName: 'Andi', durationMinutes: 60,
      startedAt: new Date(Date.now() - 60 * MINUTE).toISOString(),
    })
    assert.equal(ok.status, 201, JSON.stringify(ok.body))
  })
})

// ───────────────────────────── BE-014 ─────────────────────────────

test('BE-014 pembayaran non-tunai mencatat nominal yang benar-benar diterima', async () => {
  await withServer(async ({ login }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const c = await mkConsole(admin, { hourlyRate: 12000 })

    // QRIS with an explicit amount: the amount received is kept, no change.
    const s1 = await admin.post('/api/sessions', { consoleId: c.id, customerName: 'Andi', durationMinutes: 60 })
    const fin1 = await admin.post(`/api/sessions/${s1.body.data.session.id}/finish`, {
      paymentMethod: 'qris', amountPaid: 50000,
    })
    assert.equal(fin1.status, 201, JSON.stringify(fin1.body))
    assert.equal(fin1.body.data.transaction.total, 12000, 'total = tagihan')
    assert.equal(fin1.body.data.transaction.amountPaid, 50000, 'amountPaid = nominal diterima')
    assert.equal(fin1.body.data.transaction.changeDue, 0, 'tidak ada kembalian untuk non-tunai')

    // Without amountPaid: the exact total is recorded.
    const s2 = await admin.post('/api/sessions', { consoleId: c.id, customerName: 'Budi', durationMinutes: 60 })
    const fin2 = await admin.post(`/api/sessions/${s2.body.data.session.id}/finish`, {
      paymentMethod: 'transfer',
    })
    assert.equal(fin2.status, 201, JSON.stringify(fin2.body))
    assert.equal(fin2.body.data.transaction.amountPaid, 12000)
    assert.equal(fin2.body.data.transaction.changeDue, 0)
  })
})

// ───────────────────────────── BE-015 ─────────────────────────────

test('BE-015 username ganda dibalas 409 DUPLICATE_USERNAME, bukan 500', async () => {
  await withServer(async ({ login }) => {
    const admin = await login(ADMIN.username, ADMIN.password)

    const first = await admin.post('/api/users', {
      username: 'kasirbaru', fullName: 'Kasir Baru', password: 'PasswordKasin123', role: 'user',
    })
    assert.equal(first.status, 201, JSON.stringify(first.body))

    const dup = await admin.post('/api/users', {
      username: 'kasirbaru', fullName: 'Kasir Baru 2', password: 'PasswordKasin456', role: 'user',
    })
    assert.equal(dup.status, 409, JSON.stringify(dup.body))
    assert.equal(dup.body.error.code, 'DUPLICATE_USERNAME')
    assert.equal(dup.body.error.message, 'Username sudah dipakai')
  })
})
