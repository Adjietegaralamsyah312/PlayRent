// O6 pricing math (rounding, snapshot) · O8 overtime grace + rate
import test from 'node:test'
import assert from 'node:assert/strict'
import { withServer, ADMIN } from './helpers.js'
import { quote, DEFAULT_RULES } from '../src/lib/pricing.js'

const billable = (d) => Math.ceil(d / DEFAULT_RULES.roundingMinutes) * DEFAULT_RULES.roundingMinutes

test('O6 quote is table-driven, integral, and rounds up to the step', () => {
  const cases = [
    [31, 10000, 7500],
    [46, 10000, 10000],
    [60, 12000, 12000],
    [61, 12000, 15000],
    [90, 8000, 12000],
    [121, 15000, 33750],
  ]
  for (const [durationMinutes, hourlyRate, expected] of cases) {
    const q = quote({ durationMinutes, actualMinutes: durationMinutes, hourlyRate, rules: DEFAULT_RULES })
    assert.equal(q.billableMinutes, billable(durationMinutes), `billable ${durationMinutes}`)
    assert.equal(q.subtotal, Math.ceil((billable(durationMinutes) * hourlyRate) / 60))
    assert.equal(q.subtotal, expected)
    for (const k of ['subtotal', 'total', 'overtimeAmount', 'discount']) {
      assert.ok(Number.isInteger(q[k]), `${k} is integer rupiah`)
    }
    assert.equal(q.currency, 'IDR')
  }
})

test('O6 quote API mirrors the pure math and enforces the minimum duration', async () => {
  await withServer(async ({ login }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const c = (await admin.post('/api/consoles', {
      code: 'Q-1', consoleType: 'PS5', roomType: 'VIP', controllers: 4, hourlyRate: 12000,
    })).body.data.console

    const q = await admin.post('/api/sessions/quote', { consoleId: c.id, durationMinutes: 61 })
    assert.equal(q.status, 200)
    assert.equal(q.body.data.billableMinutes, 75)
    assert.equal(q.body.data.subtotal, 15000)

    const below = await admin.post('/api/sessions/quote', { consoleId: c.id, durationMinutes: 10 })
    assert.equal(below.status, 400)
    assert.equal(below.body.error.code, 'DURATION_BELOW_MINIMUM')
  })
})

test('O6 a rate change does not retro-hit a running session (rate snapshot)', async () => {
  await withServer(async ({ login, db }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const c = (await admin.post('/api/consoles', {
      code: 'Q-2', consoleType: 'PS4', roomType: 'Reguler', controllers: 2, hourlyRate: 12000,
    })).body.data.console

    const s = await admin.post('/api/sessions', { consoleId: c.id, customerName: 'Andi', durationMinutes: 60 })
    const sid = s.body.data.session.id

    await admin.patch(`/api/consoles/${c.id}`, { hourlyRate: 20000 })

    const reread = await admin.get(`/api/sessions/${sid}`)
    assert.equal(reread.body.data.session.rateSnapshot, 12000)
    assert.equal(db.prepare('SELECT rate_snapshot FROM rental_sessions WHERE id = ?').get(sid).rate_snapshot, 12000)

    const q = await admin.post('/api/sessions/quote', { consoleId: c.id, durationMinutes: 60 })
    assert.equal(q.body.data.subtotal, 20000, 'new quote uses the new rate')

    const fx = await admin.post(`/api/sessions/${sid}/finish`, { paymentMethod: 'transfer' })
    assert.equal(fx.body.data.transaction.subtotal, 12000, 'running session keeps its snapshot')
  })
})

test('O8 overtime: grace absorbs the excess, past grace charges the overtime rate', async () => {
  await withServer(async ({ login, db }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const put = await admin.put('/api/settings', {
      rules: {
        defaultHourlyRate: 15000, minDurationMinutes: 30, roundingMinutes: 15,
        overtimeRatePerHour: 30000, overtimeGraceMinutes: 10, warnMinutes: [10, 5, 1],
      },
    })
    assert.equal(put.status, 200)

    const c = (await admin.post('/api/consoles', {
      code: 'O-1', consoleType: 'PS4', roomType: 'Reguler', controllers: 2, hourlyRate: 12000,
    })).body.data.console

    // actual 65m, planned 60m, grace 10m -> no overtime
    const grace = await admin.post('/api/sessions', {
      consoleId: c.id, customerName: 'Grace', durationMinutes: 60,
      startedAt: new Date(Date.now() - 65 * 60000).toISOString(),
    })
    const gfx = await admin.post(`/api/sessions/${grace.body.data.session.id}/finish`, { paymentMethod: 'cash', amountPaid: 100000 })
    assert.equal(gfx.status, 201)
    const grow = db.prepare('SELECT overtime_minutes, overtime_amount, subtotal, total FROM transactions WHERE id = ?')
      .get(gfx.body.data.transaction.id)
    assert.equal(grow.overtime_minutes, 0)
    assert.equal(grow.overtime_amount, 0)
    assert.equal(grow.total, grow.subtotal)

    // actual ~110m, planned 60m, grace 10m -> ~40m overtime at 30k/hour
    const over = await admin.post('/api/sessions', {
      consoleId: c.id, customerName: 'Over', durationMinutes: 60,
      startedAt: new Date(Date.now() - 110 * 60000).toISOString(),
    })
    const ofx = await admin.post(`/api/sessions/${over.body.data.session.id}/finish`, { paymentMethod: 'cash', amountPaid: 100000 })
    assert.equal(ofx.status, 201)
    const orow = db.prepare('SELECT overtime_minutes, overtime_amount, subtotal, total FROM transactions WHERE id = ?')
      .get(ofx.body.data.transaction.id)
    assert.ok(orow.overtime_minutes >= 39 && orow.overtime_minutes <= 40, `overtime ${orow.overtime_minutes}`)
    assert.equal(orow.overtime_amount, Math.ceil((orow.overtime_minutes * 30000) / 60))
    assert.equal(orow.total, orow.subtotal + orow.overtime_amount)
  })
})
