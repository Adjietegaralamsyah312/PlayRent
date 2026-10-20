// O13 reports: Jakarta-day bounds, paid vs unpaid vs void, and CSV bytes
import test from 'node:test'
import assert from 'node:assert/strict'
import { withServer, ADMIN } from './helpers.js'
import { jakartaLocalToUtc } from '../src/lib/time.js'

const D = '2026-05-10'
const D2 = '2026-05-11'
const at = (ymd, hhmm) => new Date(jakartaLocalToUtc(ymd, hhmm)).toISOString()

function fixtures(db, consoleId) {
  const tx = db.prepare(
    `INSERT INTO transactions
     (number, console_code, customer_name, subtotal, total, payment_method, payment_status, amount_paid, status, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  )
  const mkTx = (number, iso, total, { paymentStatus = 'paid', status = 'completed', method = 'cash', customer = 'Pelanggan' } = {}) =>
    tx.run(number, 'R-1', customer, total, total, method, paymentStatus, status === 'void' ? 0 : total, status, iso)

  mkTx('TRX-D-0001', at(D, '10:00'), 20000, { customer: 'Smith, "Bob"\nJr' })
  mkTx('TRX-D-0002', at(D, '23:30'), 30000, { method: 'transfer' })
  mkTx('TRX-D-0003', at(D, '12:00'), 5000, { paymentStatus: 'unpaid' })
  mkTx('TRX-D-0004', at(D, '14:00'), 7000, { status: 'void', paymentStatus: 'void' })
  mkTx('TRX-E-0001', at(D2, '00:30'), 4000)

  const sess = db.prepare(
    `INSERT INTO rental_sessions
     (console_id, customer_name, status, started_at, ends_at, planned_minutes, billed_minutes, rate_snapshot, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  )
  sess.run(consoleId, 'Pelanggan', 'finished', at(D, '09:00'), at(D, '10:00'), 60, 60, 12000, at(D, '09:00'), at(D, '09:00'))
  sess.run(consoleId, 'Pelanggan', 'finished', at(D, '20:00'), at(D, '21:30'), 90, 90, 12000, at(D, '20:00'), at(D, '20:00'))
  sess.run(consoleId, 'Pelanggan', 'void', at(D, '08:00'), at(D, '09:00'), 60, null, 12000, at(D, '08:00'), at(D, '08:00'))
}

test('O13 summary counts paid vs outstanding vs void on Jakarta-day bounds', async () => {
  await withServer(async ({ login, db, base }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const c = (await admin.post('/api/consoles', { code: 'R-1', consoleType: 'PS4', roomType: 'Reguler', controllers: 2, hourlyRate: 12000 })).body.data.console
    fixtures(db, c.id)

    const s = (await admin.get(`/api/reports/summary?from=${D}&to=${D}`)).body.data
    assert.equal(s.revenueRecorded, 50000, 'paid totals only')
    assert.equal(s.revenueOutstanding, 5000, 'unpaid excluded from recorded')
    assert.equal(s.transactionCount, 3, 'void excluded')
    assert.equal(s.voidedCount, 1)
    assert.equal(s.sessionsCount, 2, 'void session excluded')
    assert.equal(s.totalMinutes, 150)

    // 23:30 Jakarta is inside D; 00:30 Jakarta is inside D2 — bounds are inclusive and local.
    const d2 = (await admin.get(`/api/reports/summary?from=${D2}&to=${D2}`)).body.data
    assert.equal(d2.revenueRecorded, 4000)
    assert.equal(d2.transactionCount, 1)

    const daily = (await admin.get(`/api/reports/daily?from=${D}&to=${D}`)).body.data.items.find((i) => i.date === D)
    assert.equal(daily.revenue, 50000)
    assert.equal(daily.transactions, 2)
    assert.equal(daily.sessions, 2)
    assert.equal(daily.minutes, 150)

    // CSV: BOM + CRLF + RFC-4180 quoting of a value with comma/quote/newline.
    const res = await fetch(`${base}/api/reports/export.csv?type=transactions&from=${D}&to=${D}`, { headers: { cookie: admin.cookie } })
    assert.match(res.headers.get('content-type'), /text\/csv/)
    const bytes = new Uint8Array(await res.arrayBuffer())
    assert.deepEqual([bytes[0], bytes[1], bytes[2]], [0xef, 0xbb, 0xbf], 'UTF-8 BOM present')
    const text = new TextDecoder().decode(bytes)
    assert.ok(text.includes('\r\n'), 'CRLF line endings')
    assert.ok(text.includes('No. Transaksi'), 'Indonesian header label')
    assert.ok(text.includes('"Smith, ""Bob""\nJr"'), 'quotes doubled, inner newline preserved')
  })
})
