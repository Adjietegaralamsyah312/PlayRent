// O1 login valid/invalid · O2 superadmin vs user permissions
import test from 'node:test'
import assert from 'node:assert/strict'
import { withServer, ADMIN, USER } from './helpers.js'

test('O1 login: bad credentials are generic, good credentials set an httpOnly Lax cookie', async () => {
  await withServer(async ({ api, db }) => {
    const bad = await api('/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'nope' } })
    assert.equal(bad.status, 401)
    assert.equal(bad.body.error.code, 'INVALID_CREDENTIALS')

    const ghost = await api('/api/auth/login', { method: 'POST', body: { username: 'does-not-exist', password: 'nope' } })
    assert.equal(ghost.status, 401)
    // No user enumeration: unknown user and wrong password are indistinguishable.
    assert.equal(ghost.body.error.code, bad.body.error.code)
    assert.equal(ghost.body.error.message, bad.body.error.message)

    const ok = await api('/api/auth/login', { method: 'POST', body: ADMIN })
    assert.equal(ok.status, 200)
    const raw = ok.setCookie.find((c) => c.startsWith('pr_session='))
    assert.ok(raw, 'session cookie set')
    assert.match(raw, /HttpOnly/i)
    assert.match(raw, /SameSite=Lax/i)
    assert.equal(ok.body.data.user.role, 'superadmin')
    assert.ok(!JSON.stringify(ok.body).includes('password'), 'password never returned')

    const sessionRow = db.prepare('SELECT COUNT(*) c FROM auth_sessions').get()
    assert.equal(sessionRow.c, 1)
  })
})

test('O1 login: 6th failed attempt for one username+ip is rate limited', async () => {
  await withServer(async ({ api }) => {
    for (let i = 1; i <= 5; i++) {
      const r = await api('/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'wrong' } })
      assert.equal(r.status, 401, `attempt ${i} should be 401`)
    }
    const sixth = await api('/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'wrong' } })
    assert.equal(sixth.status, 429)
    assert.equal(sixth.body.error.code, 'RATE_LIMITED')
  })
})

test('O2 permissions: user is forbidden on superadmin routes, superadmin allowed, anonymous 401', async () => {
  await withServer(async ({ api, login }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const customer = await login(USER.username, USER.password)

    // --- customer denied ---
    const cConsole = await customer.post('/api/consoles', {
      code: 'C-01', consoleType: 'PS4', roomType: 'Reguler', controllers: 2, hourlyRate: 10000,
    })
    assert.equal(cConsole.status, 403)
    assert.equal(cConsole.body.error.code, 'FORBIDDEN')

    const cUsers = await customer.get('/api/users')
    assert.equal(cUsers.status, 403)

    // --- superadmin allowed ---
    const aConsole = await admin.post('/api/consoles', {
      code: 'A-01', consoleType: 'PS5', roomType: 'VIP', controllers: 4, hourlyRate: 20000,
    })
    assert.equal(aConsole.status, 201)
    const aUsers = await admin.get('/api/users')
    assert.equal(aUsers.status, 200)
    assert.ok(aUsers.body.data.items.length >= 2)

    // customer forbidden to void a transaction; superadmin allowed
    const s = await admin.post('/api/sessions', { consoleId: aConsole.body.data.console.id, customerName: 'Budi', durationMinutes: 60 })
    const sid = s.body.data.session.id
    const fx = await admin.post(`/api/sessions/${sid}/finish`, { paymentMethod: 'cash', amountPaid: 100000 })
    const txId = fx.body.data.transaction.id

    const customerVoid = await customer.post(`/api/transactions/${txId}/void`, { reason: 'Tidak boleh' })
    assert.equal(customerVoid.status, 403)

    const adminVoid = await admin.post(`/api/transactions/${txId}/void`, { reason: 'Salah input oleh kasir' })
    assert.equal(adminVoid.status, 200)
    assert.equal(adminVoid.body.data.transaction.status, 'void')

    // --- anonymous denied on a protected route ---
    const anon = await api('/api/consoles')
    assert.equal(anon.status, 401)
  })
})

// --- regression: AUTH-4/5 (PATCH admin guards), AUTH-10/11 (rate-limit keying) ---

test('AUTH-4 PATCH cannot demote the only superadmin; DB is unchanged', async () => {
  await withServer(async ({ db, login }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const id = db.prepare("SELECT id FROM users WHERE role='superadmin' AND is_active=1").get().id
    const r = await admin.patch(`/api/users/${id}`, { role: 'user' })
    assert.equal(r.status, 409)
    assert.equal(r.body.error.code, 'CANNOT_DELETE_SELF')
    assert.equal(db.prepare('SELECT role FROM users WHERE id=?').get(id).role, 'superadmin')
    assert.equal(db.prepare("SELECT COUNT(*) c FROM users WHERE role='superadmin' AND is_active=1").get().c, 1)
    // the rejected caller is still an admin (no self-lockout)
    assert.equal((await admin.get('/api/users')).status, 200)
  })
})

test('AUTH-5 PATCH cannot self-deactivate the last superadmin; active superadmins stay 1', async () => {
  await withServer(async ({ db, login }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const id = db.prepare("SELECT id FROM users WHERE role='superadmin' AND is_active=1").get().id
    const r = await admin.patch(`/api/users/${id}`, { isActive: false })
    assert.equal(r.status, 409)
    assert.equal(r.body.error.code, 'CANNOT_DELETE_SELF')
    assert.equal(db.prepare('SELECT is_active FROM users WHERE id=?').get(id).is_active, 1)
    assert.equal(db.prepare("SELECT COUNT(*) c FROM users WHERE role='superadmin' AND is_active=1").get().c, 1)
  })
})

test('AUTH-10 rate-limit keys on the socket IP, not a caller-supplied X-Forwarded-For', async () => {
  await withServer(async ({ api }) => {
    for (let i = 1; i <= 5; i++) {
      const r = await api('/api/auth/login', { method: 'POST', headers: { 'x-forwarded-for': `10.0.0.${i}` }, body: { username: 'kasir', password: 'wrong' } })
      assert.equal(r.status, 401, `attempt ${i} with a fresh XFF should still count`)
    }
    const sixth = await api('/api/auth/login', { method: 'POST', headers: { 'x-forwarded-for': '10.0.0.99' }, body: { username: 'kasir', password: 'wrong' } })
    assert.equal(sixth.status, 429)
    assert.equal(sixth.body.error.code, 'RATE_LIMITED')
  })
})

test('AUTH-11 rate-limit bucket normalises username (case/whitespace share one bucket)', async () => {
  await withServer(async ({ db, api }) => {
    for (let i = 0; i < 5; i++) {
      assert.equal((await api('/api/auth/login', { method: 'POST', body: { username: 'kasir', password: 'wrong' } })).status, 401)
    }
    const upper = await api('/api/auth/login', { method: 'POST', body: { username: 'Kasir', password: 'wrong' } })
    const spaced = await api('/api/auth/login', { method: 'POST', body: { username: 'kasir ', password: 'wrong' } })
    assert.equal(upper.status, 429)
    assert.equal(upper.body.error.code, 'RATE_LIMITED')
    assert.equal(spaced.status, 429)
    // the bucket key written is normalised (only 'kasir'), and the failed variants
    // were never even recorded — auth lookup itself stays exact-match/case-sensitive.
    const keys = db.prepare('SELECT DISTINCT username FROM login_attempts').all().map((r) => r.username)
    assert.deepEqual(keys, ['kasir'])
  })
})
