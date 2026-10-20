// Plan N security: parameterised SQL sinks + no mass assignment
import test from 'node:test'
import assert from 'node:assert/strict'
import { withServer, ADMIN } from './helpers.js'

const PAYLOADS = [
  "' OR 1=1 --",
  "'; DROP TABLE consoles; --",
  '%',
  "1' UNION SELECT username, password_hash FROM users --",
  "\\' OR '1'='1",
]

test('N SQL injection via query params cannot alter data or schema', async () => {
  await withServer(async ({ login, db }) => {
    const admin = await login(ADMIN.username, ADMIN.password)

    // Real, non-empty data so a working injection would have something to return or delete.
    const c = (await admin.post('/api/consoles', { code: 'S-1', consoleType: 'PS4', roomType: 'Reguler', controllers: 2, hourlyRate: 12000 })).body.data.console
    const s = await admin.post('/api/sessions', { consoleId: c.id, customerName: 'Andi', durationMinutes: 60 })
    await admin.post(`/api/sessions/${s.body.data.session.id}/finish`, { paymentMethod: 'cash', amountPaid: 50000 })
    await admin.post('/api/bookings', { consoleId: c.id, customerName: 'Budi', bookingDate: '2026-11-20', startTime: '10:00', durationMinutes: 60 })

    const count = (t) => db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c
    const before = { consoles: count('consoles'), sessions: count('rental_sessions'), transactions: count('transactions'), bookings: count('bookings') }

    const endpoints = ['/api/consoles', '/api/sessions', '/api/transactions', '/api/bookings']
    for (const payload of PAYLOADS) {
      for (const ep of endpoints) {
        const res = await admin.get(`${ep}?q=${encodeURIComponent(payload)}`)
        assert.equal(res.status, 200, `${ep} q=${payload}`)
        assert.equal(res.body.success, true)
        assert.ok(Array.isArray(res.body.data.items), 'envelope shape intact')
      }
    }

    assert.deepEqual(
      { consoles: count('consoles'), sessions: count('rental_sessions'), transactions: count('transactions'), bookings: count('bookings') },
      before,
      'row counts unchanged after injection attempts',
    )
  })
})

test('N mass assignment: unknown/privileged fields are rejected, never stored', async () => {
  await withServer(async ({ login, db }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const base = { code: 'M-1', consoleType: 'PS4', roomType: 'Reguler', controllers: 2, hourlyRate: 12000 }

    const create = await admin.post('/api/consoles', { ...base, id: 999, isActive: false, role: 'admin' })
    assert.equal(create.status, 400)
    assert.equal(create.body.error.code, 'VALIDATION_ERROR')
    assert.equal(db.prepare('SELECT COUNT(*) c FROM consoles').get().c, 0)
    assert.equal(db.prepare('SELECT COUNT(*) c FROM consoles WHERE id = 999').get().c, 0)

    const okCreate = await admin.post('/api/consoles', base)
    assert.equal(okCreate.status, 201)
    const id = okCreate.body.data.console.id

    const patch = await admin.patch(`/api/consoles/${id}`, { role: 'admin', isActive: 'nope' })
    assert.equal(patch.status, 400)
    assert.equal(patch.body.error.code, 'VALIDATION_ERROR')

    const row = db.prepare('SELECT is_active FROM consoles WHERE id = ?').get(id)
    assert.equal(row.is_active, 1, 'stored row untouched by rejected payload')
  })
})
