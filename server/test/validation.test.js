// O14 validation, malformed input, unknown route, and generic 500
import test from 'node:test'
import assert from 'node:assert/strict'
import { withServer, ADMIN } from './helpers.js'

test('O14 malformed bodies are rejected with a validation envelope', async () => {
  await withServer(async ({ login, base }) => {
    const admin = await login(ADMIN.username, ADMIN.password)

    const missing = await admin.post('/api/sessions', {})
    assert.equal(missing.status, 400)
    assert.equal(missing.body.success, false)
    assert.equal(missing.body.error.code, 'VALIDATION_ERROR')
    assert.ok(Array.isArray(missing.body.error.details) && missing.body.error.details.length > 0)
    assert.ok(missing.body.error.details.every((d) => typeof d.path === 'string' && typeof d.message === 'string'))

    const wrongType = await admin.post('/api/consoles', {
      code: 'Z-1', consoleType: 'PS4', roomType: 'Reguler', controllers: 'abc', hourlyRate: 10000,
    })
    assert.equal(wrongType.status, 400)
    assert.equal(wrongType.body.error.code, 'VALIDATION_ERROR')

    const malformed = await fetch(`${base}/api/consoles`, {
      method: 'POST', headers: { cookie: admin.cookie, 'content-type': 'application/json' }, body: '{ not json',
    })
    assert.equal(malformed.status, 400)
    const mBody = await malformed.json()
    assert.equal(mBody.error.code, 'VALIDATION_ERROR')
  })
})

test('O14 unknown route → 404 envelope; internal failure → generic 500 with no leaks', async () => {
  await withServer(async ({ login, db, api }) => {
    const admin = await login(ADMIN.username, ADMIN.password)

    const missing = await api('/api/definitely-not-a-route', { cookie: admin.cookie })
    assert.equal(missing.status, 404)
    assert.equal(missing.body.success, false)
    assert.equal(missing.body.error.code, 'NOT_FOUND')

    db.exec('DROP TABLE consoles')
    const origError = console.error
    console.error = () => {}
    let broken
    try {
      broken = await admin.get('/api/consoles')
    } finally {
      console.error = origError
    }
    assert.equal(broken.status, 500)
    assert.equal(broken.body.success, false)
    assert.equal(broken.body.error.code, 'INTERNAL_ERROR')
    assert.equal(broken.body.error.message, 'Terjadi kesalahan pada server')
    assert.ok(!broken.text.includes('/data/data/'), 'no filesystem paths leaked')
    assert.ok(!/\bat .+:\d+/.test(broken.text), 'no stack frames leaked')
  })
})
