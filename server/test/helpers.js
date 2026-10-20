// Shared test harness. Boots the real app on an isolated throwaway DB.
// No test framework — node:test + node:assert/strict + global fetch only.
//
// Contract: withServer(fn) opens a unique temp DB, migrates, seeds the two
// demo users + the single business_settings row, listens on a random port,
// and ALWAYS closes the server and deletes the DB in a finally block.
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { randomBytes } from 'node:crypto'

// --- env must be set BEFORE importing app/db (config.js reads it at import) --
process.env.NODE_ENV = process.env.NODE_ENV || 'development'
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173'

/** Prefer os.tmpdir(); fall back to $PREFIX/tmp/opencode on locked-down Termux. */
export function mkTmpDir(prefix = 'playrent-') {
  try {
    return mkdtempSync(join(tmpdir(), prefix))
  } catch {
    const base = join(process.env.PREFIX || '/tmp', 'tmp', 'opencode')
    mkdirSync(base, { recursive: true })
    return mkdtempSync(join(base, prefix))
  }
}

// The db.js module opens its default DB at import time — point it at a
// throwaway so the real ./data/playrent.db is never touched.
const BOOT_DIR = mkTmpDir('playrent-boot-')
process.env.DB_PATH = join(BOOT_DIR, 'boot.db')
process.on('exit', () => { try { rmSync(BOOT_DIR, { recursive: true, force: true }) } catch { /* ignore */ } })

const { openDatabase, migrate } = await import('../src/db.js')
const { createApp } = await import('../src/app.js')
const { hashPassword } = await import('../src/lib/auth.js')

// Re-exported so a test can build a throwaway DB at its own path without
// importing ../src/db.js directly (that would evaluate config.js before this
// file had a chance to point DB_PATH at a scratch directory).
export { openDatabase, migrate }

// Passwords are generated at runtime: no credential is hardcoded in the repo.
// Roles: 'superadmin' (operator) and 'user' (customer). The 'kasir' account
// mirrors the migrated legacy row — role 'user', deactivated, must not log in.
const randomPassword = () => randomBytes(24).toString('base64url')

export const ADMIN = { username: 'admin', password: randomPassword() }
export const USER = { username: 'pelanggan', password: randomPassword() }
export const INACTIVE = { username: 'kasir', password: randomPassword() }

// Hashed once per process; the same salt is reused for every throwaway DB.
const ADMIN_HASH = hashPassword(ADMIN.password)
const USER_HASH = hashPassword(USER.password)
const INACTIVE_HASH = hashPassword(INACTIVE.password)

/** Insert the minimum fixtures every route needs. */
export function seedBase(db) {
  const t = new Date().toISOString()
  const insUser = db.prepare(
    `INSERT INTO users (username, full_name, password_hash, password_salt, role, is_active, phone, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  )
  insUser.run(ADMIN.username, 'Admin PlayRent', ADMIN_HASH.hash, ADMIN_HASH.salt, 'superadmin', 1, '0812-000-000', t, t)
  insUser.run(USER.username, 'Pelanggan PlayRent', USER_HASH.hash, USER_HASH.salt, 'user', 1, '0812-111-111', t, t)
  // Deactivated legacy account: same generic 401 as a wrong password.
  insUser.run(INACTIVE.username, 'Kasir PlayRent', INACTIVE_HASH.hash, INACTIVE_HASH.salt, 'user', 0, null, t, t)

  // Migration v4 already creates the settings row — upsert so the test
  // fixture stays authoritative instead of colliding with it.
  db.prepare(
    `INSERT INTO business_settings
     (id, business_name, address, phone, receipt_footer, tax_note,
      min_duration_minutes, rounding_minutes, overtime_rate_per_hour, overtime_grace_minutes,
      default_hourly_rate, warn_minutes_json, payment_methods_json, updated_at)
     VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       business_name = excluded.business_name, address = excluded.address,
       phone = excluded.phone, receipt_footer = excluded.receipt_footer,
       tax_note = excluded.tax_note, min_duration_minutes = excluded.min_duration_minutes,
       rounding_minutes = excluded.rounding_minutes,
       overtime_rate_per_hour = excluded.overtime_rate_per_hour,
       overtime_grace_minutes = excluded.overtime_grace_minutes,
       default_hourly_rate = excluded.default_hourly_rate,
       warn_minutes_json = excluded.warn_minutes_json,
       payment_methods_json = excluded.payment_methods_json,
       updated_at = excluded.updated_at`,
  ).run(
    'PlayRent Test', '', '', 'Terima kasih!', '',
    30, 15, 12000, 5, 15000, '[10,5,1]', '["cash","transfer","qris"]', t,
  )
}

/** Low-level request. Returns { status, body, text, headers, setCookie }. */
export function makeHttp(base) {
  return async function request(path, opts = {}) {
    const { method = 'GET', body, cookie, headers = {}, raw } = opts
    const h = { ...headers }
    let payload
    if (raw !== undefined) {
      payload = raw
      if (h['content-type'] === undefined) h['content-type'] = 'application/json'
    } else if (body !== undefined) {
      payload = JSON.stringify(body)
      if (h['content-type'] === undefined) h['content-type'] = 'application/json'
    }
    if (cookie) h.cookie = cookie
    const res = await fetch(`${base}${path}`, { method, headers: h, body: payload })
    const text = await res.text()
    let json = null
    try { json = JSON.parse(text) } catch { /* non-JSON (csv/html) */ }
    const setCookie = res.headers.getSetCookie?.() ?? []
    return { status: res.status, body: json, text, headers: res.headers, setCookie }
  }
}

/** Cookie-aware client returned by login(). Callable, plus get/post/patch/put/del. */
export function makeClient(request, cookie) {
  const client = (path, opts = {}) => request(path, { ...opts, cookie: opts.cookie ?? cookie })
  client.cookie = cookie
  client.get = (p, o) => client(p, { ...o, method: 'GET' })
  client.post = (p, b, o) => client(p, { ...o, method: 'POST', body: b })
  client.patch = (p, b, o) => client(p, { ...o, method: 'PATCH', body: b })
  client.put = (p, b, o) => client(p, { ...o, method: 'PUT', body: b })
  client.del = (p, o) => client(p, { ...o, method: 'DELETE' })
  return client
}

export async function withServer(fn) {
  const dir = mkTmpDir('playrent-test-')
  const dbFile = join(dir, 'test.db')
  const db = openDatabase(dbFile)
  migrate(db)
  seedBase(db)

  const app = createApp(db)
  const server = app.listen(0)
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}`
  const api = makeHttp(base)
  const login = async (username, password) => {
    const res = await api('/api/auth/login', { method: 'POST', body: { username, password } })
    const cookie = res.setCookie.map((c) => c.split(';')[0]).find((c) => c.startsWith('pr_session='))
    const client = makeClient(api, cookie)
    client.user = res.body?.data?.user
    client.loginResponse = res
    return client
  }

  try {
    return await fn({ base, db, dbFile, api, login })
  } finally {
    await new Promise((resolve) => server.close(resolve))
    try { db.close() } catch { /* ignore */ }
    try { rmSync(dir, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}
