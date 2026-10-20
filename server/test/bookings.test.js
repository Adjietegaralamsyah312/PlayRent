// O10 booking overlap matrix + cancel + checked_in no longer blocks
import test from 'node:test'
import assert from 'node:assert/strict'
import { withServer, ADMIN } from './helpers.js'

const DAY = '2026-11-15'

test('O10 booking conflicts are half-open (touch ok) and scoped per unit', async () => {
  await withServer(async ({ login }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const A = (await admin.post('/api/consoles', { code: 'B-1', consoleType: 'PS4', roomType: 'Reguler', controllers: 2, hourlyRate: 10000 })).body.data.console
    const B = (await admin.post('/api/consoles', { code: 'B-2', consoleType: 'PS4', roomType: 'Reguler', controllers: 2, hourlyRate: 10000 })).body.data.console
    const book = (consoleId, startTime, durationMinutes = 60) =>
      admin.post('/api/bookings', { consoleId, customerName: 'Pelanggan', bookingDate: DAY, startTime, durationMinutes })

    const b1 = await book(A.id, '10:00', 60) // 10:00–11:00
    assert.equal(b1.status, 201)

    const sameSlot = await book(A.id, '10:00', 60)
    assert.equal(sameSlot.status, 409)
    assert.equal(sameSlot.body.error.code, 'BOOKING_CONFLICT')
    assert.ok(Array.isArray(sameSlot.body.error.details) && sameSlot.body.error.details.length >= 1)
    assert.equal(sameSlot.body.error.details[0].conflictingBookingId, b1.body.data.booking.id)

    assert.equal((await book(A.id, '09:30', 60)).status, 409, 'starts before, overlaps')
    assert.equal((await book(A.id, '10:30', 60)).status, 409, 'starts inside')

    const touching = await book(A.id, '11:00', 60) // 11:00–12:00 touches 11:00
    assert.equal(touching.status, 201, 'touching boundary is allowed')

    const otherUnit = await book(B.id, '10:00', 60)
    assert.equal(otherUnit.status, 201, 'same slot on another unit is fine')

    // Cancel frees the slot.
    assert.equal((await admin.post(`/api/bookings/${b1.body.data.booking.id}/cancel`, { reason: 'Batal' })).status, 200)
    assert.equal((await book(A.id, '10:00', 60)).status, 201, 'slot reusable after cancel')
  })
})

test('O10 a checked-in booking no longer blocks the slot', async () => {
  await withServer(async ({ login }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const B = (await admin.post('/api/consoles', { code: 'B-9', consoleType: 'PS5', roomType: 'VIP', controllers: 4, hourlyRate: 12000 })).body.data.console
    const book = () => admin.post('/api/bookings', {
      consoleId: B.id, customerName: 'Pelanggan', bookingDate: DAY, startTime: '14:00', durationMinutes: 60,
    })

    const b = await book()
    assert.equal(b.status, 201)
    const id = b.body.data.booking.id

    assert.equal((await admin.patch(`/api/bookings/${id}`, { status: 'confirmed' })).status, 200)
    const checkIn = await admin.post(`/api/bookings/${id}/check-in`, {})
    assert.equal(checkIn.status, 201, 'confirmed booking checks in')

    const again = await book()
    assert.equal(again.status, 201, 'checked_in no longer counts as a conflict')
  })
})
