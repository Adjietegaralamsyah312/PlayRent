// O9 the running timer survives reload and counts down monotonically
import test from 'node:test'
import assert from 'node:assert/strict'
import { withServer, ADMIN } from './helpers.js'

test('O9 reload keeps endsAt and remainingSeconds counts down', async () => {
  await withServer(async ({ login }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const c = (await admin.post('/api/consoles', {
      code: 'T-1', consoleType: 'PS5', roomType: 'VIP', controllers: 4, hourlyRate: 12000,
    })).body.data.console

    const started = await admin.post('/api/sessions', { consoleId: c.id, customerName: 'Andi', durationMinutes: 60 })
    const { id, endsAt } = started.body.data.session

    // A brand-new client simulates a page reload.
    const reloaded = await login(ADMIN.username, ADMIN.password)
    const detail = await reloaded.get(`/api/sessions/${id}`)
    assert.equal(detail.status, 200)
    assert.equal(detail.body.data.session.endsAt, endsAt, 'deadline is server-owned and unchanged')

    const first = (await reloaded.get('/api/sessions/active')).body.data.items.find((i) => i.id === id)
    assert.ok(first, 'session appears on the active board')
    assert.equal(typeof first.remainingSeconds, 'number')
    assert.ok(Math.abs(first.remainingSeconds - 3600) <= 5, `starts near 3600s (${first.remainingSeconds})`)

    await new Promise((r) => setTimeout(r, 1200))

    const second = (await reloaded.get('/api/sessions/active')).body.data.items.find((i) => i.id === id)
    assert.ok(second.remainingSeconds < first.remainingSeconds, 'remaining time decreased')
    const elapsed = first.remainingSeconds - second.remainingSeconds
    assert.ok(elapsed >= 0.5 && elapsed <= 3, `~1s elapsed (${elapsed})`)
    assert.equal(second.endsAt, endsAt)
  })
})
