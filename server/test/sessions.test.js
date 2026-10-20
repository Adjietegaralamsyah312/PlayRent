// O4 session snapshot · O5 no double-booking · O7 extend · O10 finish frees unit · O11 void
import test from 'node:test'
import assert from 'node:assert/strict'
import { withServer, ADMIN, USER } from './helpers.js'

const SIXTY_MS = 60 * 60000

async function mkConsole(admin, overrides = {}) {
  const res = await admin.post('/api/consoles', {
    code: 'C-1', consoleType: 'PS4', roomType: 'Reguler', controllers: 2, hourlyRate: 12000, ...overrides,
  })
  assert.equal(res.status, 201)
  return res.body.data.console
}

test('O4 start session snapshots rate and duration; unit becomes in_use', async () => {
  await withServer(async ({ login, db }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const c = await mkConsole(admin, { hourlyRate: 12000 })

    const res = await admin.post('/api/sessions', { consoleId: c.id, customerName: 'Andi', durationMinutes: 60 })
    assert.equal(res.status, 201)
    const s = res.body.data.session
    assert.equal(s.status, 'active')
    assert.equal(s.rateSnapshot, 12000)
    assert.equal(s.plannedMinutes, 60)
    assert.equal(Date.parse(s.endsAt) - Date.parse(s.startedAt), SIXTY_MS)

    const detail = await admin.get(`/api/consoles/${c.id}`)
    assert.equal(detail.body.data.console.status, 'in_use')

    // A live unit is not offered as available.
    const avail = await admin.get('/api/consoles?status=available')
    assert.ok(!avail.body.data.items.some((i) => i.id === c.id))

    const row = db.prepare('SELECT rate_snapshot, status FROM rental_sessions WHERE id = ?').get(s.id)
    assert.deepEqual({ ...row }, { rate_snapshot: 12000, status: 'active' })
  })
})

test('O5 second start on a live unit is rejected with 409 UNIT_OCCUPIED', async () => {
  await withServer(async ({ login }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const c = await mkConsole(admin)
    const first = await admin.post('/api/sessions', { consoleId: c.id, customerName: 'Andi', durationMinutes: 60 })
    assert.equal(first.status, 201)

    const second = await admin.post('/api/sessions', { consoleId: c.id, customerName: 'Budi', durationMinutes: 60 })
    assert.equal(second.status, 409)
    assert.equal(second.body.error.code, 'UNIT_OCCUPIED')
  })
})

test('O5 five concurrent starts yield exactly one active session', async () => {
  await withServer(async ({ login, db }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const c = await mkConsole(admin)

    const results = await Promise.all(Array.from({ length: 5 }, (_, i) =>
      admin.post('/api/sessions', { consoleId: c.id, customerName: `Pemain ${i}`, durationMinutes: 60 })))
    const created = results.filter((r) => r.status === 201)
    const conflicts = results.filter((r) => r.status === 409)
    assert.equal(created.length, 1, 'exactly one start wins')
    assert.equal(conflicts.length, 4)
    assert.ok(conflicts.every((r) => r.body.error.code === 'UNIT_OCCUPIED'))

    const live = db.prepare(
      "SELECT COUNT(*) c FROM rental_sessions WHERE console_id = ? AND status IN ('active','overdue')",
    ).get(c.id)
    assert.equal(live.c, 1)
  })
})

test('O5 a finished unit can be started again', async () => {
  await withServer(async ({ login }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const c = await mkConsole(admin)
    const s1 = await admin.post('/api/sessions', { consoleId: c.id, customerName: 'Andi', durationMinutes: 60 })
    const fx = await admin.post(`/api/sessions/${s1.body.data.session.id}/finish`, { paymentMethod: 'cash', amountPaid: 50000 })
    assert.equal(fx.status, 201)

    const s2 = await admin.post('/api/sessions', { consoleId: c.id, customerName: 'Budi', durationMinutes: 60 })
    assert.equal(s2.status, 201)
    assert.equal(s2.body.data.session.consoleId, c.id)
  })
})

test('O7 extend adds billed time, can be repeated, and refuses a finished session', async () => {
  await withServer(async ({ login }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const c = await mkConsole(admin, { hourlyRate: 12000 })
    const s = await admin.post('/api/sessions', { consoleId: c.id, customerName: 'Andi', durationMinutes: 60 })
    const id = s.body.data.session.id
    const endsAt0 = s.body.data.session.endsAt

    const ext = await admin.post(`/api/sessions/${id}/extend`, { extraMinutes: 30 })
    assert.equal(ext.status, 200)
    const s1 = ext.body.data.session
    assert.equal(s1.plannedMinutes, 90)
    assert.equal(s1.billedMinutes, 90) // 90 is already a multiple of the 15-min rounding
    assert.equal(s1.extensions.length, 1)
    assert.equal(Date.parse(s1.endsAt) - Date.parse(endsAt0), 30 * 60000)

    const ext2 = await admin.post(`/api/sessions/${id}/extend`, { extraMinutes: 15 })
    assert.equal(ext2.body.data.session.plannedMinutes, 105)
    assert.equal(ext2.body.data.session.extensions.length, 2)

    await admin.post(`/api/sessions/${id}/finish`, { paymentMethod: 'cash', amountPaid: 100000 })
    const after = await admin.post(`/api/sessions/${id}/extend`, { extraMinutes: 30 })
    assert.equal(after.status, 409)
    assert.equal(after.body.error.code, 'SESSION_NOT_ACTIVE')
  })
})

test('O10 finishing frees the unit and bumps its updated_at', async () => {
  await withServer(async ({ login, db }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const c = await mkConsole(admin)
    const before = db.prepare('SELECT updated_at FROM consoles WHERE id = ?').get(c.id).updated_at

    const s = await admin.post('/api/sessions', { consoleId: c.id, customerName: 'Andi', durationMinutes: 60 })
    const sid = s.body.data.session.id
    assert.equal((await admin.get(`/api/consoles/${c.id}`)).body.data.console.status, 'in_use')

    await new Promise((r) => setTimeout(r, 5))
    const fx = await admin.post(`/api/sessions/${sid}/finish`, { paymentMethod: 'cash', amountPaid: 50000 })
    assert.equal(fx.status, 201)

    const after = db.prepare('SELECT status, updated_at FROM consoles WHERE id = ?').get(c.id)
    assert.equal(after.status, 'available')
    assert.ok(after.updated_at >= before, 'updated_at advanced')

    const available = await admin.get('/api/consoles?status=available')
    assert.ok(available.body.data.items.some((i) => i.id === c.id))
  })
})

test('O11 void frees the unit, records the reason, and is superadmin-only', async () => {
  await withServer(async ({ login, db }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const user = await login(USER.username, USER.password)
    const c = await mkConsole(admin)
    const s = await admin.post('/api/sessions', { consoleId: c.id, customerName: 'Andi', durationMinutes: 60 })
    const sid = s.body.data.session.id

    const denied = await user.post(`/api/sessions/${sid}/void`, { reason: 'Pelanggan membatalkan' })
    assert.equal(denied.status, 403)

    const ok = await admin.post(`/api/sessions/${sid}/void`, { reason: 'Pelanggan membatalkan' })
    assert.equal(ok.status, 200)
    assert.equal(ok.body.data.session.status, 'void')

    const row = db.prepare('SELECT void_reason FROM rental_sessions WHERE id = ?').get(sid)
    assert.equal(row.void_reason, 'Pelanggan membatalkan')
    assert.equal(db.prepare('SELECT status FROM consoles WHERE id = ?').get(c.id).status, 'available')
    assert.equal(db.prepare("SELECT COUNT(*) c FROM audit_logs WHERE action = 'session_voided'").get().c, 1)
  })
})
