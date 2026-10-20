// BE-006 — regression tests for the RV-003 findings.
//
//   SES-4, SES-5 — deactivating an account revokes its sessions, and
//                  re-activating it never revives a token minted before
//   SES-6       — the v3 migration purges the sessions of INACTIVE accounts
//                  only; a signed-in customer's session survives
//   IDR-9       — a booking cannot be moved onto a console the operator
//                  deactivated (POST and PATCH must agree)
//   IDR-10      — a booking cannot be shortened below the configured minimum
//   LOG-3       — login timing no longer reveals whether a username exists
//   HYG-3       — the public /api/health response carries no filesystem path
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { withServer, ADMIN, USER, openDatabase, migrate, mkTmpDir } from './helpers.js'

const here = fileURLToPath(new URL('.', import.meta.url))
const TOMORROW = new Date(Date.now() + 86400000).toISOString().slice(0, 10)

const cookieOf = (res) => res.setCookie.map((c) => c.split(';')[0]).find((c) => c.startsWith('pr_session='))
const sessionCount = (db, userId) =>
  db.prepare('SELECT COUNT(*) AS c FROM auth_sessions WHERE user_id = ?').get(userId).c

// --- SES-4 / SES-5 -------------------------------------------------------------

test('SES-4 deactivating an account revokes its sessions', async () => {
  await withServer(async ({ db, api, login }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const reg = await api('/api/auth/register', {
      method: 'POST', body: { username: 'sesdeact', fullName: 'Ses Deact', password: 'password123' },
    })
    assert.equal(reg.status, 201)

    const li = await api('/api/auth/login', { method: 'POST', body: { username: 'sesdeact', password: 'password123' } })
    assert.equal(li.status, 200)
    const cookie = cookieOf(li)
    const uid = db.prepare('SELECT id FROM users WHERE username = ?').get('sesdeact').id
    assert.equal(sessionCount(db, uid), 1, 'one live session before the deactivation')
    assert.equal((await api('/api/auth/me', { cookie })).status, 200)

    const off = await admin.patch(`/api/users/${uid}`, { isActive: false })
    assert.equal(off.status, 200)
    assert.equal(sessionCount(db, uid), 0, 'the deactivation revoked every session')
    assert.equal((await api('/api/auth/me', { cookie })).status, 401, 'the old cookie is dead')

    // the audit trail records HOW MANY sessions were cut (a count, never a token)
    const audit = db.prepare(
      "SELECT meta_json FROM audit_logs WHERE action = 'user_updated' AND entity_id = ? ORDER BY id DESC LIMIT 1",
    ).get(uid)
    const meta = JSON.parse(audit.meta_json)
    assert.equal(meta.sessionsRevoked, 1)
    assert.ok(!JSON.stringify(meta).toLowerCase().includes('pr_session'))
  })
})

test('SES-5 re-activating an account does not resurrect a pre-deactivation token', async () => {
  await withServer(async ({ db, api, login }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    await api('/api/auth/register', {
      method: 'POST', body: { username: 'sesreact', fullName: 'Ses React', password: 'password123' },
    })
    const li = await api('/api/auth/login', { method: 'POST', body: { username: 'sesreact', password: 'password123' } })
    const cookie = cookieOf(li)
    const uid = db.prepare('SELECT id FROM users WHERE username = ?').get('sesreact').id

    assert.equal((await admin.patch(`/api/users/${uid}`, { isActive: false })).status, 200)
    assert.equal((await admin.patch(`/api/users/${uid}`, { isActive: true })).status, 200)

    assert.equal((await api('/api/auth/me', { cookie })).status, 401, 'the old token stays dead')
    assert.equal(sessionCount(db, uid), 0)

    // a fresh login still works — the account is usable again
    const again = await api('/api/auth/login', { method: 'POST', body: { username: 'sesreact', password: 'password123' } })
    assert.equal(again.status, 200)
    assert.equal(sessionCount(db, uid), 1)
  })
})

test('SES-4 a role change revokes the target account sessions as well', async () => {
  await withServer(async ({ db, api, login }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    await api('/api/auth/register', {
      method: 'POST', body: { username: 'sesrole', fullName: 'Ses Role', password: 'password123' },
    })
    const li = await api('/api/auth/login', { method: 'POST', body: { username: 'sesrole', password: 'password123' } })
    const cookie = cookieOf(li)
    const uid = db.prepare('SELECT id FROM users WHERE username = ?').get('sesrole').id
    assert.equal(sessionCount(db, uid), 1)

    const demote = await admin.patch(`/api/users/${uid}`, { role: 'superadmin' })
    assert.equal(demote.status, 200)
    assert.equal(sessionCount(db, uid), 0, 'the role change revoked the sessions')
    assert.equal((await api('/api/auth/me', { cookie })).status, 401)
  })
})

// --- SES-6 ---------------------------------------------------------------------

test('SES-6 the v3 migration purges the sessions of inactive accounts only', async () => {
  const dir = mkTmpDir('playrent-v3-')
  try {
    const db = openDatabase(join(dir, 'v1.db'))
    // A v1 database: the legacy role set, one active admin and one cashier.
    db.exec(readFileSync(join(here, '..', 'src', 'schema.sql'), 'utf8'))
    db.exec('PRAGMA user_version = 1')
    const t = new Date().toISOString()
    const insUser = db.prepare(
      `INSERT INTO users (username, full_name, password_hash, password_salt, role, is_active, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    )
    insUser.run('admin_lama', 'Admin Lama', 'h', 's', 'admin', 1, t, t)
    insUser.run('kasir_lama', 'Kasir Lama', 'h', 's', 'cashier', 1, t, t)
    const insSess = db.prepare(
      `INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at, last_seen_at, ip)
       VALUES (?,(SELECT id FROM users WHERE username = ?),?, '2099-01-01T00:00:00.000Z', ?, '127.0.0.1')`,
    )
    insSess.run('tok-admin', 'admin_lama', t, t)
    insSess.run('tok-kasir', 'kasir_lama', t, t)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM auth_sessions').get().c, 2)

    const res = migrate(db)
    assert.equal(res.version, 4, 'the schema is now at version 4 (v4 adds the business_settings row)')
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 4)

    // The cashier was demoted to an inactive 'user' → its session is gone.
    const kasir = db.prepare("SELECT role, is_active FROM users WHERE username = 'kasir_lama'").get()
    assert.equal(kasir.role, 'user')
    assert.equal(kasir.is_active, 0)
    assert.equal(
      db.prepare("SELECT COUNT(*) AS c FROM auth_sessions WHERE user_id = (SELECT id FROM users WHERE username = 'kasir_lama')").get().c,
      0, 'the inactive account has no session left',
    )
    // The active admin keeps its session — a signed-in customer is never cut off.
    assert.equal(
      db.prepare("SELECT COUNT(*) AS c FROM auth_sessions WHERE user_id = (SELECT id FROM users WHERE username = 'admin_lama')").get().c,
      1, 'the active account keeps its session',
    )
    db.close()

    // Idempotent: running migrate() again changes nothing.
    const db2 = openDatabase(join(dir, 'v1.db'))
    migrate(db2)
    assert.equal(db2.prepare('PRAGMA user_version').get().user_version, 4)
    assert.equal(db2.prepare('SELECT COUNT(*) AS c FROM auth_sessions').get().c, 1)
    db2.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// --- IDR-9 / IDR-10 ------------------------------------------------------------

test('IDR-9 a customer cannot move a booking onto a console the operator deactivated', async () => {
  await withServer(async ({ db, login }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const customer = await login(USER.username, USER.password)
    const live = (await admin.post('/api/consoles', {
      code: 'RV-LIVE', consoleType: 'PS4', roomType: 'Reguler', controllers: 2, hourlyRate: 12000,
    })).body.data.console
    const dead = (await admin.post('/api/consoles', {
      code: 'RV-DEAD', consoleType: 'PS4', roomType: 'Reguler', controllers: 2, hourlyRate: 12000,
    })).body.data.console
    assert.equal((await admin.del(`/api/consoles/${dead.id}`)).status, 200, 'the unit is out of service')

    const book = await customer.post('/api/bookings', {
      consoleId: live.id, customerName: 'Pelanggan', bookingDate: TOMORROW, startTime: '10:00', durationMinutes: 60,
    })
    assert.equal(book.status, 201)
    const id = book.body.data.booking.id

    // POST already refused the dead unit — PATCH must refuse it the same way.
    const post = await customer.post('/api/bookings', {
      consoleId: dead.id, customerName: 'Pelanggan', bookingDate: TOMORROW, startTime: '12:00', durationMinutes: 60,
    })
    assert.equal(post.status, 404)
    assert.equal(post.body.error.code, 'CONSOLE_NOT_FOUND')

    const patch = await customer.patch(`/api/bookings/${id}`, { consoleId: dead.id })
    assert.equal(patch.status, 404)
    assert.equal(patch.body.error.code, 'CONSOLE_NOT_FOUND')
    assert.equal(
      db.prepare('SELECT console_id FROM bookings WHERE id = ?').get(id).console_id,
      live.id, 'the booking did not move',
    )
  })
})

test('IDR-10 a customer cannot shorten a booking below the configured minimum duration', async () => {
  await withServer(async ({ db, login }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const customer = await login(USER.username, USER.password)
    const unit = (await admin.post('/api/consoles', {
      code: 'RV-DUR', consoleType: 'PS4', roomType: 'Reguler', controllers: 2, hourlyRate: 12000,
    })).body.data.console
    const min = db.prepare('SELECT min_duration_minutes FROM business_settings WHERE id = 1').get().min_duration_minutes
    assert.equal(min, 30)

    const book = await customer.post('/api/bookings', {
      consoleId: unit.id, customerName: 'Pelanggan', bookingDate: TOMORROW, startTime: '10:00', durationMinutes: 60,
    })
    assert.equal(book.status, 201)
    const id = book.body.data.booking.id

    const short = await customer.patch(`/api/bookings/${id}`, { durationMinutes: 5 })
    assert.equal(short.status, 400)
    assert.equal(short.body.error.code, 'DURATION_BELOW_MINIMUM')
    assert.equal(
      db.prepare('SELECT duration_minutes FROM bookings WHERE id = ?').get(id).duration_minutes,
      60, 'the stored duration is unchanged',
    )

    // a duration at or above the minimum is still accepted
    const fine = await customer.patch(`/api/bookings/${id}`, { durationMinutes: 60 })
    assert.equal(fine.status, 200)
    assert.equal(db.prepare('SELECT duration_minutes FROM bookings WHERE id = ?').get(id).duration_minutes, 60)
  })
})

// --- LOG-3 ---------------------------------------------------------------------

test('LOG-3 login timing does not reveal whether a username exists', async () => {
  await withServer(async ({ db, api }) => {
    const N = 7
    const creds = db.prepare('SELECT password_hash, password_salt FROM users WHERE username = ?').get(USER.username)
    const t = new Date().toISOString()
    const ins = db.prepare(
      `INSERT INTO users (username, full_name, password_hash, password_salt, role, is_active, created_at, updated_at)
       VALUES (?,?,?,?,'user',1,?,?)`,
    )
    // A distinct username per sample: the rate-limit bucket is per username.
    for (let i = 0; i < N; i++) ins.run(`timing_known_${i}`, `Timing ${i}`, creds.password_hash, creds.password_salt, t, t)

    const hit = async (username) => {
      const start = performance.now()
      const r = await api('/api/auth/login', { method: 'POST', body: { username, password: 'wrongwrong' } })
      assert.equal(r.status, 401)
      return performance.now() - start
    }
    // Warm up the fetch/express path and the one-off dummy hash.
    await hit('timing_warmup')
    await hit('timing_warmup')

    const known = []
    const unknown = []
    for (let i = 0; i < N; i++) {
      known.push(await hit(`timing_known_${i}`))
      unknown.push(await hit(`timing_unknown_${i}`))
    }
    const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }
    const mk = median(known)
    const mu = median(unknown)

    // The miss path pays the scrypt cost too (it was ~7 ms before the fix).
    assert.ok(mu > 20, `unknown median ${mu.toFixed(1)}ms — the dummy scrypt did not run`)
    // …so the two paths are close (they were 16x apart before the fix).
    assert.ok(mk <= mu * 4, `known ${mk.toFixed(1)}ms vs unknown ${mu.toFixed(1)}ms (${(mk / mu).toFixed(1)}x)`)
  })
})

// --- HYG-3 ---------------------------------------------------------------------

test('HYG-3 the public /api/health response carries no filesystem path', async () => {
  await withServer(async ({ api, dbFile }) => {
    const h = await api('/api/health')
    assert.equal(h.status, 200)
    assert.equal(h.body.data.status, 'ok')
    assert.equal(h.body.data.db.ok, true)
    assert.ok(h.body.data.version, 'version is still published (the login footer uses it)')
    assert.equal(typeof h.body.data.uptimeSeconds, 'number')
    assert.ok(!('path' in h.body.data.db), 'db.path must not be exposed')
    assert.ok(!h.text.includes(dbFile), 'the absolute DB path must not leak')
  })
})

test('SES-4 a no-op isActive PATCH does not log the caller out of its own session', async () => {
  await withServer(async ({ db, api, login }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const uid = db.prepare("SELECT id FROM users WHERE role = 'superadmin' AND is_active = 1").get().id
    // already active -> re-asserting it changes nothing, so nothing is revoked
    const noop = await admin.patch(`/api/users/${uid}`, { isActive: true })
    assert.equal(noop.status, 200)
    assert.equal((await admin.get('/api/users')).status, 200, 'the caller keeps its session')
  })
})
