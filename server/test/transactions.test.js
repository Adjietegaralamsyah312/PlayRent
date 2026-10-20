// O12 transactions: change due, numbering, insufficiency, finish-once, server-owned totals
import test from 'node:test'
import assert from 'node:assert/strict'
import { withServer, ADMIN } from './helpers.js'

async function mkConsole(admin, code, hourlyRate = 12000) {
  const res = await admin.post('/api/consoles', { code, consoleType: 'PS4', roomType: 'Reguler', controllers: 2, hourlyRate })
  assert.equal(res.status, 201)
  return res.body.data.console
}

test('O12 cash change, transfer exactness, and insufficient payment', async () => {
  await withServer(async ({ login }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const c = await mkConsole(admin, 'X-1')

    const s1 = await admin.post('/api/sessions', { consoleId: c.id, customerName: 'Andi', durationMinutes: 60 })
    const cash = await admin.post(`/api/sessions/${s1.body.data.session.id}/finish`, { paymentMethod: 'cash', amountPaid: 20000 })
    assert.equal(cash.status, 201)
    const tx1 = cash.body.data.transaction
    assert.equal(tx1.total, 12000)
    assert.equal(tx1.amountPaid, 20000)
    assert.equal(tx1.changeDue, 8000)
    assert.equal(tx1.paymentStatus, 'paid')
    assert.equal(tx1.status, 'completed')
    assert.match(tx1.number, /^TRX-\d{8}-\d{4}$/)

    const s2 = await admin.post('/api/sessions', { consoleId: c.id, customerName: 'Budi', durationMinutes: 60 })
    const trf = await admin.post(`/api/sessions/${s2.body.data.session.id}/finish`, { paymentMethod: 'transfer' })
    const tx2 = trf.body.data.transaction
    assert.equal(tx2.amountPaid, tx2.total)
    assert.equal(tx2.changeDue, 0)
    assert.notEqual(tx2.number, tx1.number)

    const s3 = await admin.post('/api/sessions', { consoleId: c.id, customerName: 'Cici', durationMinutes: 60 })
    const s3id = s3.body.data.session.id
    const under = await admin.post(`/api/sessions/${s3id}/finish`, { paymentMethod: 'cash', amountPaid: 1000 })
    assert.equal(under.status, 400)
    assert.equal(under.body.error.code, 'INSUFFICIENT_PAYMENT')
    assert.equal((await admin.get(`/api/sessions/${s3id}`)).body.data.session.status, 'active', 'session stays open')
  })
})

test('O12 finish is idempotent-guarded and totals are server-owned (client total ignored)', async () => {
  await withServer(async ({ login, db }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const c = await mkConsole(admin, 'X-2')

    const s = await admin.post('/api/sessions', { consoleId: c.id, customerName: 'Andi', durationMinutes: 60 })
    const sid = s.body.data.session.id
    assert.equal((await admin.post(`/api/sessions/${sid}/finish`, { paymentMethod: 'cash', amountPaid: 50000 })).status, 201)
    const again = await admin.post(`/api/sessions/${sid}/finish`, { paymentMethod: 'cash', amountPaid: 50000 })
    assert.equal(again.status, 409)
    assert.equal(again.body.error.code, 'SESSION_ALREADY_FINISHED')

    // A client-supplied total must not be accepted, let alone persist.
    const s2 = await admin.post('/api/sessions', { consoleId: c.id, customerName: 'Budi', durationMinutes: 60 })
    const s2id = s2.body.data.session.id
    const forged = await admin.post(`/api/sessions/${s2id}/finish`, { paymentMethod: 'cash', amountPaid: 50000, total: 999999999 })
    assert.equal(forged.status, 400)
    assert.equal(forged.body.error.code, 'VALIDATION_ERROR')
    assert.equal(db.prepare('SELECT COUNT(*) c FROM transactions WHERE session_id = ?').get(s2id).c, 0)
    assert.equal((await admin.get(`/api/sessions/${s2id}`)).body.data.session.status, 'active')

    const real = await admin.post(`/api/sessions/${s2id}/finish`, { paymentMethod: 'cash', amountPaid: 50000 })
    assert.equal(real.body.data.transaction.total, 12000)
    assert.notEqual(real.body.data.transaction.total, 999999999)
  })
})
