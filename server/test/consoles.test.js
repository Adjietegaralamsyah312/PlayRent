// O3 create + update a unit (persistence verified through fresh requests)
import test from 'node:test'
import assert from 'node:assert/strict'
import { withServer, ADMIN } from './helpers.js'

const NEW_CONSOLE = {
  code: 'PS-77', consoleType: 'PS5', roomType: 'VIP', controllers: 4,
  hourlyRate: 20000, conditionNote: 'Baru',
}

test('O3 console: create, read back, patch, and re-read (persistence)', async () => {
  await withServer(async ({ login, api, db }) => {
    const admin = await login(ADMIN.username, ADMIN.password)

    const create = await admin.post('/api/consoles', NEW_CONSOLE)
    assert.equal(create.status, 201)
    const id = create.body.data.console.id
    assert.equal(create.body.data.console.code, 'PS-77')

    // Read back through an independent request.
    const read1 = await admin.get(`/api/consoles/${id}`)
    assert.equal(read1.status, 200)
    assert.equal(read1.body.data.console.hourlyRate, 20000)
    assert.equal(read1.body.data.console.controllers, 4)

    const patch = await admin.patch(`/api/consoles/${id}`, { hourlyRate: 25000, controllers: 2 })
    assert.equal(patch.status, 200)

    // Persistence must be proven by re-reading, not by trusting the PATCH body.
    const read2 = await admin.get(`/api/consoles/${id}`)
    assert.equal(read2.body.data.console.hourlyRate, 25000)
    assert.equal(read2.body.data.console.controllers, 2)

    // And via a brand-new client session too.
    const fresh = await login(ADMIN.username, ADMIN.password)
    const read3 = await fresh.get(`/api/consoles/${id}`)
    assert.equal(read3.body.data.console.hourlyRate, 25000)

    const row = db.prepare('SELECT hourly_rate, controllers FROM consoles WHERE id = ?').get(id)
    assert.deepEqual({ ...row }, { hourly_rate: 25000, controllers: 2 })
  })
})

test('O3 console: duplicate code is rejected with 409 DUPLICATE_CODE', async () => {
  await withServer(async ({ login, db }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const first = await admin.post('/api/consoles', NEW_CONSOLE)
    assert.equal(first.status, 201)

    const dup = await admin.post('/api/consoles', { ...NEW_CONSOLE, roomType: 'Reguler' })
    assert.equal(dup.status, 409)
    assert.equal(dup.body.error.code, 'DUPLICATE_CODE')

    // The duplicate was not stored — the original is untouched.
    const count = db.prepare('SELECT COUNT(*) c FROM consoles WHERE code = ?').get('PS-77')
    assert.equal(count.c, 1)
    const stored = db.prepare('SELECT room_type FROM consoles WHERE code = ?').get('PS-77')
    assert.equal(stored.room_type, 'VIP')
  })
})
