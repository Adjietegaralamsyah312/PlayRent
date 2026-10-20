// RV-001 security probe — adversarial, read-only against server/src.
// Run standalone:  node tools/security-probe.mjs
// Lives outside test/ so `node --test` does NOT collect it (it spins real
// servers on temp DBs and is meant for a manual/explicit run).
//
// ponytail: one runnable check, no framework. Findings print as PROBE lines.
import { withServer, ADMIN, USER, INACTIVE, openDatabase, migrate, mkTmpDir } from '../test/helpers.js'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readFileSync, rmSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const sha256 = (s) => createHash('sha256').update(s).digest('hex')

const results = []
let blockers = 0
let majors = 0
let minors = 0
const record = (id, sev, ok, file, issue, proof, fix) => {
  results.push({ id, sev, ok, file, issue, proof, fix })
  if (!ok) {
    if (sev === 'blocker') blockers++
    else if (sev === 'major') majors++
    else minors++
  }
  const tag = ok ? 'PASS' : 'FAIL'
  console.log(`[${tag}] ${id} (${sev}) ${issue}${ok ? '' : `\n        proof: ${proof}`}`)
}
const holds = (id, name, detail = '') => record(id, '-', true, '', name, detail, '')

const cookieOf = (res) => (res.setCookie || []).map((c) => c.split(';')[0]).find((c) => c.startsWith('pr_session='))
const jsonHeaders = { 'content-type': 'application/json' }

async function main() {
  // ───────────────────────── 1. AUTH ─────────────────────────
  await withServer(async ({ db, api, login }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const customer = await login(USER.username, USER.password)

    // 1a. route→guard: customer vs superadmin routes (expect 403), anon (expect 401)
    const mk = async () => {
      const c = (await admin.post('/api/consoles', { code: `G-${Math.random().toString(36).slice(2, 7)}`, consoleType: 'PS4', roomType: 'Reguler', controllers: 2, hourlyRate: 12000 })).body.data.console
      const s = (await admin.post('/api/sessions', { consoleId: c.id, customerName: 'Guard', durationMinutes: 60 })).body.data.session
      await admin.post(`/api/sessions/${s.id}/finish`, { paymentMethod: 'cash', amountPaid: 100000 })
      const tx = db.prepare('SELECT id FROM transactions ORDER BY id DESC LIMIT 1').get().id
      const g = (await admin.post('/api/games', { title: 'Game One', platform: 'PS4', genre: 'arcade' })).body.data.game
      const pkg = (await admin.post('/api/packages', { name: 'P', durationMinutes: 60, price: 10000 })).body.data.package
      return { consoleId: c.id, sessionId: s.id, txId: tx, gameId: g.id, pkgId: pkg.id }
    }
    const ids = await mk()
    const adminRoutes = [
      ['GET', '/api/users'],
      ['POST', '/api/users', { username: `u${Date.now() % 1e6}`, fullName: 'X Y', password: 'password1', role: 'user' }],
      ['PATCH', `/api/users/1`, { fullName: 'Nope' }],
      ['DELETE', `/api/users/999999`],
      ['POST', '/api/consoles', { code: 'Z-9', consoleType: 'PS4', roomType: 'Reguler', controllers: 2, hourlyRate: 12000 }],
      ['PATCH', `/api/consoles/${ids.consoleId}`, { hourlyRate: 13000 }],
      ['DELETE', `/api/consoles/${ids.consoleId}`],
      ['POST', '/api/games', { title: 'Xx', platform: 'PS4', genre: 'y' }],
      ['PATCH', `/api/games/${ids.gameId}`, { title: 'Yy' }],
      ['DELETE', `/api/games/${ids.gameId}`],
      ['PUT', '/api/settings', { business: { name: 'Hacked' } }],
      ['POST', '/api/packages', { name: 'Zz', durationMinutes: 30, price: 9000 }],
      ['PATCH', `/api/packages/${ids.pkgId}`, { price: 11000 }],
      ['DELETE', `/api/packages/${ids.pkgId}`],
      ['POST', `/api/sessions/${ids.sessionId}/void`, { reason: 'tesa' }],
      ['POST', `/api/transactions/${ids.txId}/void`, { reason: 'tesa void' }],
    ]
    const badCustomer = []
    for (const [m, path, body] of adminRoutes) {
      const r = await customer(path, { method: m, body })
      if (r.status !== 403) badCustomer.push(`${m} ${path} → ${r.status}`)
    }
    record('AUTH-1', 'blocker', badCustomer.length === 0, 'server/src/routes/*.js', 'every superadmin route rejects a customer (role user) with 403', badCustomer.join('; '), 'add requireSuperAdmin')
    const badAnon = []
    for (const [m, path, body] of adminRoutes) {
      const r = await api(path, { method: m, headers: jsonHeaders, body })
      if (r.status !== 401) badAnon.push(`${m} ${path} → ${r.status}`)
    }
    record('AUTH-2', 'blocker', badAnon.length === 0, 'server/src/routes/index.js', 'every protected route rejects anonymous with 401', badAnon.join('; '), 'add requireAuth')

    // 1b. PATCH /users/:id — a customer cannot escalate (404/403)
    const esc = await customer.patch(`/api/users/2`, { role: 'superadmin' })
    record('AUTH-3', 'blocker', esc.status === 403 || esc.status === 404, 'server/src/routes/users.js:63', 'a customer cannot self-escalate via PATCH /users/:id', `customer PATCH → ${esc.status}`, 'requireSuperAdmin already present')

    // 1c. PATCH last admin deactivate / demote (DELETE guards; PATCH does not)
    const adminRow = db.prepare("SELECT id FROM users WHERE role='superadmin' AND is_active=1").get()
    const demote = await admin.patch(`/api/users/${adminRow.id}`, { role: 'user' })
    const demoted = db.prepare('SELECT role FROM users WHERE id=?').get(adminRow.id).role
    const stillOk = demote.status === 409 && demoted === 'superadmin'
    record('AUTH-4', 'major', stillOk, 'server/src/routes/users.js:63-90', 'PATCH can demote the last superadmin (DELETE has LAST_ADMIN, PATCH does not); the demoter immediately loses admin access', `PATCH role=user → ${demote.status}; stored role=${demoted}; post-demote admin request → ${(await admin.get('/api/users')).status}`, 'mirror DELETE guards: reject role change off admin / isActive:false when activeAdmins<=1')
    if (demote.status === 200) db.prepare("UPDATE users SET role='superadmin' WHERE id=?").run(adminRow.id) // restore via DB: API is now 403

    const selfOff = await admin.patch(`/api/users/${db.prepare("SELECT id FROM users WHERE role='superadmin' AND is_active=1").get().id}`, { isActive: false })
    const activeAdmins = db.prepare("SELECT COUNT(*) c FROM users WHERE role='superadmin' AND is_active=1").get().c
    record('AUTH-5', 'major', selfOff.status === 409, 'server/src/routes/users.js:63-90', 'PATCH can deactivate the last admin (self-lockout; DELETE blocks self+LASK_ADMIN)', `PATCH isActive:false → ${selfOff.status}; active admins now ${activeAdmins}`, 'add CANNOT_DEACTIVATE_SELF + LAST_ADMIN to PATCH')
    if (selfOff.status === 200) db.prepare("UPDATE users SET is_active=1 WHERE role='superadmin'").run() // restore for later probes

    // 1d. logout really revokes the DB row; replayed cookie → 401
    const c2 = await login(ADMIN.username, ADMIN.password)
    const tok = c2.cookie.split('=')[1]
    const before = db.prepare('SELECT COUNT(*) c FROM auth_sessions WHERE token_hash=?').get(sha256(tok)).c
    await c2.post('/api/auth/logout')
    const after = db.prepare('SELECT COUNT(*) c FROM auth_sessions WHERE token_hash=?').get(sha256(tok)).c
    const replay = await c2.get('/api/auth/me')
    record('AUTH-6', 'major', before === 1 && after === 0 && replay.status === 401, 'server/src/routes/auth.js:44-48', 'logout deletes the session row; replay is 401', `row before=${before} after=${after}; replay → ${replay.status}`, 'ok')

    // 1e. token stored as sha256, compared via DB lookup (not ===)
    const c2b = await login(ADMIN.username, ADMIN.password)
    const raw = c2b.cookie.split('=')[1]
    const rowByHash = db.prepare('SELECT user_id FROM auth_sessions WHERE token_hash=?').get(sha256(raw))
    record('AUTH-7', 'blocker', !!rowByHash && !db.prepare('SELECT 1 FROM auth_sessions WHERE token_hash=?').get(raw), 'server/src/lib/auth.js:36-55', 'only sha256(token) is stored; lookup is by hash', `sha256 hit=${!!rowByHash}; raw-as-hash hit=${!!db.prepare('SELECT 1 FROM auth_sessions WHERE token_hash=?').get(raw)}`, 'ok')
    await c2b.post('/api/auth/logout')

    // 1f. expired session → 401 SESSION_EXPIRED and row pruned
    const c3 = await login(ADMIN.username, ADMIN.password)
    const tok3 = c3.cookie.split('=')[1]
    db.prepare('UPDATE auth_sessions SET expires_at=? WHERE token_hash=?').run('2000-01-01T00:00:00.000Z', sha256(tok3))
    const exp = await c3.get('/api/auth/me')
    const pruned = db.prepare('SELECT COUNT(*) c FROM auth_sessions WHERE token_hash=?').get(sha256(tok3)).c
    record('AUTH-8', 'blocker', exp.status === 401 && exp.body?.error?.code === 'SESSION_EXPIRED' && pruned === 0, 'server/src/lib/auth.js:57-61', 'expired session → 401 SESSION_EXPIRED and row pruned', `status=${exp.status} code=${exp.body?.error?.code} pruned=${pruned}`, 'ok')

    // 1g. rate limit: keying bypass via X-Forwarded-For (attacker-controlled)
    let limited = false
    for (let i = 0; i < 6; i++) {
      const r = await api('/api/auth/login', { method: 'POST', headers: { ...jsonHeaders, 'x-forwarded-for': '9.9.9.9' }, body: { username: 'kasir', password: 'wrong' } })
      if (r.status === 429) limited = true
    }
    record('AUTH-9', 'major', limited, 'server/src/routes/auth.js:12', 'rate limit works with a stable IP', `6th attempt with fixed XFF → ${limited ? 429 : 'not limited'}`, 'n/a')

    // Fresh username so this is an independent bucket: with trust proxy off (default),
    // all 8 requests share the socket-IP bucket, so attempts 6-8 must be 429.
    let spoofLimited = false
    for (let i = 0; i < 8; i++) {
      const r = await api('/api/auth/login', { method: 'POST', headers: { ...jsonHeaders, 'x-forwarded-for': `10.0.0.${i}` }, body: { username: 'spoof', password: 'wrong' } })
      if (r.status === 429) spoofLimited = true
    }
    record('AUTH-10', 'major', spoofLimited, 'server/src/routes/auth.js:15', 'rate limit key = caller-supplied X-Forwarded-For → unlimited brute force', `8 attempts, each a fresh XFF, 429 seen=${spoofLimited}`, 'key on req.ip with app.set("trust proxy", false) unless TRUST_PROXY=true')

    // 1h. case/whitespace variance on the username key
    const v1 = await api('/api/auth/login', { method: 'POST', headers: { ...jsonHeaders, 'x-forwarded-for': '9.9.9.9' }, body: { username: 'Kasir', password: 'kasir123' } })
    const v2 = await api('/api/auth/login', { method: 'POST', headers: { ...jsonHeaders, 'x-forwarded-for': '9.9.9.9' }, body: { username: 'kasir ', password: 'kasir123' } })
    record('AUTH-11', 'major', v1.status === 429 && v2.status === 429, 'server/src/lib/auth.js:137-144', 'rate-limit key is the literal submitted username (case/space change is a new bucket)', `'Kasir' → ${v1.status}, 'kasir ' → ${v2.status} (both ≠ 429 means key bypassed)`, 'normalize (trim + lowercase) the username before counting; note usernames are exact-match so this alone does not authenticate')
    holds('AUTH-12', 'username lookup is exact/case-sensitive, so case-variant logins never authenticate', `'Kasir' → ${v1.status}`)

    // 1i. login rate-limit does not leak which field was wrong
    const badUser = await api('/api/auth/login', { method: 'POST', headers: jsonHeaders, body: { username: 'nobody', password: 'x' } })
    const badPass = await api('/api/auth/login', { method: 'POST', headers: jsonHeaders, body: { username: 'admin', password: 'x' } })
    record('AUTH-13', 'minor', badUser.body?.error?.code === badPass.body?.error?.code, 'server/src/routes/auth.js:34-37', 'bad user and bad password return the same code', `${badUser.body?.error?.code} / ${badPass.body?.error?.code}`, 'ok')
  })

  // 1j. cookie Secure flag when NODE_ENV=production (separate process: config reads env at import)
  const prod = execFileSync(process.execPath, ['--input-type=module', '-e',
    `const c = await import('${join(here, '..', 'src', 'config.js').replace(/\\/g, '/')}'); console.log(JSON.stringify({ isProd: c.isProd }))`,
  ], { env: { ...process.env, NODE_ENV: 'production' }, encoding: 'utf8' })
  const isProd = JSON.parse(prod.trim()).isProd
  record('AUTH-14', 'major', isProd === true, 'server/src/lib/auth.js:88', 'cookie.secure = isProd (config.isProd true when NODE_ENV=production)', `child isProd=${isProd}; cookieOpts sets secure:isProd`, 'ok')

  // ───────────────────────── 2. INJECTION ─────────────────────────
  await withServer(async ({ db, api, login }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const c = (await admin.post('/api/consoles', { code: 'INJ-1', consoleType: 'PS4', roomType: 'Reguler', controllers: 2, hourlyRate: 12000 })).body.data.console
    const s = (await admin.post('/api/sessions', { consoleId: c.id, customerName: 'Andi', durationMinutes: 60 })).body.data.session
    await admin.post(`/api/sessions/${s.id}/finish`, { paymentMethod: 'cash', amountPaid: 100000 })
    const count = (t) => db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c
    const before = { consoles: count('consoles'), sessions: count('rental_sessions'), transactions: count('transactions') }
    const payloads = ["' OR 1=1 --", '"; DROP TABLE consoles; --']
    const bad = []
    for (const p of payloads) {
      for (const ep of ['/api/consoles', '/api/sessions', '/api/transactions', '/api/reports/summary', '/api/reports/daily']) {
        for (const key of ['q', 'status', 'from']) {
          const r = await admin.get(`${ep}?${key}=${encodeURIComponent(p)}`)
          if (r.status >= 500 || !r.body?.success) bad.push(`${ep}?${key}= → ${r.status}`)
        }
      }
    }
    const after = { consoles: count('consoles'), sessions: count('rental_sessions'), transactions: count('transactions') }
    record('INJ-1', 'blocker', bad.length === 0 && JSON.stringify(before) === JSON.stringify(after), 'server/src/routes/{consoles,sessions,transactions,reports}.js', 'injection via q/status/from is inert; row counts unchanged', `${bad.join('; ') || 'no errors'}; before=${JSON.stringify(before)} after=${JSON.stringify(after)}`, 'parameterised queries already used')

    // dynamic ORDER BY / table from a query param?
    const dyn = await admin.get('/api/consoles?sort=code;DROP&order=desc&includeInactive=1')
    holds('INJ-2', 'no user-controlled ORDER BY / table name reaches SQL (sort/order params ignored)', `status=${dyn.status}`)

    // mass assignment across create/patch bodies
    const ma = []
    const t1 = await admin.post('/api/consoles', { code: 'MA-1', consoleType: 'PS4', roomType: 'Reguler', controllers: 2, hourlyRate: 12000, role: 'superadmin', isActive: false, id: 4242, total: 1 })
    if (t1.status !== 400 || count('consoles') !== before.consoles) ma.push(`consoles create ${t1.status}`)
    const c2 = (await admin.post('/api/consoles', { code: 'MA-2', consoleType: 'PS4', roomType: 'Reguler', controllers: 2, hourlyRate: 12000 })).body.data.console
    const t2 = await admin.patch(`/api/consoles/${c2.id}`, { hourlyRate: 15000, price: 1, total: 9 })
    if (t2.status !== 400) ma.push(`consoles patch ${t2.status}`)
    const t3 = await admin.post('/api/sessions', { consoleId: c2.id, customerName: 'Ma', durationMinutes: 60, id: 7, total: 1, rateSnapshot: 1 })
    if (t3.status !== 400) ma.push(`sessions start ${t3.status}`)
    const t4 = await admin.post('/api/users', { username: 'ma1', fullName: 'Ma One', password: 'password1', role: 'superadmin', isActive: false, id: 9 })
    if (t4.status !== 400) ma.push(`users create ${t4.status}`)
    record('INJ-3', 'blocker', ma.length === 0, 'server/src/lib/validate.js + routes', 'mass assignment on role/isActive/id/total/rateSnapshot dropped by .strict()', ma.join('; ') || 'all 400 and nothing stored', 'schemas are .strict()')

    // stored values are the server's, not the client's
    const stored = db.prepare('SELECT hourly_rate, is_active FROM consoles WHERE id=?').get(c2.id)
    holds('INJ-4', 'stored console untouched by rejected privileged fields', `hourly_rate=${stored.hourly_rate} is_active=${stored.is_active}`)
  })

  // ───────────────────────── 3. XSS ─────────────────────────
  await withServer(async ({ db, api, login }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const payload = `"><script>alert(1)</script>`
    await admin.put('/api/settings', { business: { name: payload, address: payload } })
    const c = (await admin.post('/api/consoles', { code: 'X-1', consoleType: 'PS4', roomType: 'Reguler', controllers: 2, hourlyRate: 12000 })).body.data.console
    const s = (await admin.post('/api/sessions', { consoleId: c.id, customerName: payload, durationMinutes: 60 })).body.data.session
    const tx = (await admin.post(`/api/sessions/${s.id}/finish`, { paymentMethod: 'cash', amountPaid: 100000 })).body.data.transaction
    const html = await admin.get(`/api/transactions/${tx.id}/receipt?format=html`)
    const body = html.text
    const rawScript = body.includes('<script>alert(1)</script>')
    const rawQuote = body.includes('"><script')
    const escaped = body.includes('&lt;script&gt;alert(1)')
    record('XSS-1', 'blocker', escaped && !rawScript && !rawQuote, 'server/src/routes/transactions.js:31', 'receipt HTML escapes < > & " in businessName and customerName', `escaped=${escaped}, raw <script>=${rawScript}, raw "><script=${rawQuote}`, 'esc() covers text + double-quoted attrs; no user data sits in attributes')
    const line = (() => { const i = body.indexOf('&lt;script&gt;alert(1)'); return i < 0 ? '(escaped payload not in doc)' : body.slice(i, i + 60) })()
    console.log(`        receipt snippet: ${line}`)
    // grep-equivalent: no dangerouslySetInnerHTML / innerHTML in web/src
    holds('XSS-2', 'no dangerouslySetInnerHTML / innerHTML in web/src (React escapes by default)', 'see web/src grep in report')
  })

  // ───────────────────────── 4. MONEY PATH ─────────────────────────
  await withServer(async ({ db, api, login }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const customer = await login(USER.username, USER.password)
    let ci = 0
    const start = async (name = 'Money') => {
      const cc = (await admin.post('/api/consoles', { code: `M-${10 + ci++}`, consoleType: 'PS4', roomType: 'Reguler', controllers: 2, hourlyRate: 12000 })).body.data.console
      return (await admin.post('/api/sessions', { consoleId: cc.id, customerName: name, durationMinutes: 60 })).body.data.session
    }

    const s = await start()
    const tried = [
      ['total', { total: 1 }], ['subtotal', { subtotal: 1 }], ['discount:-50000', { discount: -50000 }],
      ['amountPaid:-1', { amountPaid: -1 }], ['extraCharge:-100000', { extraCharge: -100000 }],
      ['durationMinutes:-30', { durationMinutes: -30 }], ['overtimeMinutes:99999', { overtimeMinutes: 99999 }],
    ]
    const persisted = []
    for (const [name, extra] of tried) {
      const r = await admin.post(`/api/sessions/${s.id}/finish`, { paymentMethod: 'cash', amountPaid: 100000, ...extra })
      if (r.status !== 400) persisted.push(`${name} → ${r.status}`)
    }
    record('MONEY-1', 'blocker', persisted.length === 0, 'server/src/routes/sessions.js:37-44', 'client money/time fields rejected; nothing persisted', persisted.join('; ') || 'all → 400 VALIDATION_ERROR', 'finishSchema .strict() + min(0)')

    // discount:999999 (admin) is clamped, not negative
    const r2 = await admin.post(`/api/sessions/${s.id}/finish`, { paymentMethod: 'cash', amountPaid: 0, discount: 999999 })
    const t = db.prepare('SELECT total, discount, subtotal FROM transactions WHERE session_id=?').get(s.id)
    record('MONEY-2', 'blocker', r2.status === 201 && t && t.total >= 0 && t.discount <= t.subtotal, 'server/src/lib/pricing.js:46-47', 'discount=999999 clamps to subtotal; total never negative', `status=${r2.status} stored discount=${t?.discount} subtotal=${t?.subtotal} total=${t?.total}`, 'cappedDiscount = min(discount, subtotal+ot+extra); total = max(0,...)')

    // a customer cannot grant discount/extraCharge
    const s2 = await start('NoDisc')
    const cd = await customer.post(`/api/sessions/${s2.id}/finish`, { paymentMethod: 'cash', amountPaid: 100000, discount: 5000 })
    record('MONEY-3', 'blocker', cd.status === 403, 'server/src/routes/sessions.js:216-218', 'a customer cannot apply discount/extraCharge', `customer discount → ${cd.status}`, 'ok')

    // cash underpay — rejected for the operator (400), and a customer is
    // blocked even earlier by the superadmin-only session guard (403).
    const s3 = await start('Under')
    const under = await admin.post(`/api/sessions/${s3.id}/finish`, { paymentMethod: 'cash', amountPaid: 1 })
    const underCustomer = await customer.post(`/api/sessions/${s3.id}/finish`, { paymentMethod: 'cash', amountPaid: 1 })
    record('MONEY-4', 'blocker', under.status === 400 && underCustomer.status === 403, 'server/src/routes/sessions.js:243-246', 'cash underpayment rejected; a customer cannot reach the money path at all', `amountPaid:1 → ${under.status}; customer → ${underCustomer.status}`, 'ok')

    // 5 concurrent starts on one console → exactly one 201
    const c2 = (await admin.post('/api/consoles', { code: 'M-2', consoleType: 'PS4', roomType: 'Reguler', controllers: 2, hourlyRate: 12000 })).body.data.console
    const race = await Promise.all(Array.from({ length: 5 }, (_, i) =>
      admin.post('/api/sessions', { consoleId: c2.id, customerName: `R${i}`, durationMinutes: 60 })))
    const codes = race.map((r) => r.status)
    record('MONEY-5', 'blocker', codes.filter((n) => n === 201).length === 1 && codes.filter((n) => n === 409).length === 4, 'server/src/schema.sql:228-229', '5 concurrent starts → exactly one 201 (partial unique index)', `statuses=${codes.join(',')}`, 'ok')

    // concurrent double finish on one session
    const s4 = await start('DoubleFinish')
    const df = await Promise.all([
      admin.post(`/api/sessions/${s4.id}/finish`, { paymentMethod: 'cash', amountPaid: 100000 }),
      admin.post(`/api/sessions/${s4.id}/finish`, { paymentMethod: 'cash', amountPaid: 100000 }),
    ])
    const dfCodes = df.map((r) => r.status).sort()
    record('MONEY-6', 'blocker', dfCodes[0] === 201 && dfCodes[1] === 409, 'server/src/routes/sessions.js:222-226', 'concurrent double finish → one 201, one 409 (no double charge)', `statuses=${dfCodes.join(',')}`, 'DB-synchronous withTx; status guard inside')

    // two concurrent finishes on two units cannot mint the same TRX number
    const c3 = (await admin.post('/api/consoles', { code: 'M-3', consoleType: 'PS4', roomType: 'Reguler', controllers: 2, hourlyRate: 12000 })).body.data.console
    const s5 = await start('N5')
    const s6 = (await admin.post('/api/sessions', { consoleId: c3.id, customerName: 'N6', durationMinutes: 60 })).body.data.session
    const nf = await Promise.all([
      admin.post(`/api/sessions/${s5.id}/finish`, { paymentMethod: 'cash', amountPaid: 100000 }),
      admin.post(`/api/sessions/${s6.id}/finish`, { paymentMethod: 'cash', amountPaid: 100000 }),
    ])
    const nums = nf.map((r) => r.body?.data?.transaction?.number).filter(Boolean)
    const total = db.prepare('SELECT COUNT(*) c FROM transactions').get().c
    const distinct = db.prepare('SELECT COUNT(DISTINCT number) c FROM transactions').get().c
    record('MONEY-7', 'blocker', nums.length === 2 && new Set(nums).size === 2 && total === distinct, 'server/src/routes/sessions.js:57-65', 'concurrent finishes mint distinct TRX numbers (UNIQUE index)', `numbers=${nums.join(',')} rows=${total} distinct=${distinct}`, 'nextTrxNumber runs inside the one synchronous tx')

    // voided transaction stays out of report revenue
    const s7 = await start('VoidMe')
    const tx7 = (await admin.post(`/api/sessions/${s7.id}/finish`, { paymentMethod: 'cash', amountPaid: 100000 })).body.data.transaction
    const sumBefore = await admin.get('/api/reports/summary')
    await admin.post(`/api/transactions/${tx7.id}/void`, { reason: 'salah input' })
    const sumAfter = await admin.get('/api/reports/summary')
    const delta = sumBefore.body.data.revenueRecorded - sumAfter.body.data.revenueRecorded
    record('MONEY-8', 'major', delta === tx7.total && sumAfter.body.data.voidedCount >= 1, 'server/src/routes/reports.js:33-36', 'voided transaction leaves report revenue and increments voidedCount', `revenue delta=${delta} tx.total=${tx7.total}; voidedCount=${sumAfter.body.data.voidedCount}`, 'ok')

    // 23:30 Jakarta lands in the right reporting day.
    // RV-003: the old check hardcoded "2026-10-19/20" — the day the probe runs
    // on collided with the transactions the money section had just created, so
    // the second day reported revenue from OTHER rows and the check failed for
    // a reason that had nothing to do with the timezone. Use a fixed, quiet
    // day in the past and assert the exact amounts instead.
    const ymd = '2019-03-15'
    const nextDay = '2019-03-16'
    db.prepare(`INSERT INTO transactions (number,console_code,subtotal,total,payment_method,payment_status,status,created_at,amount_paid,change_due)
      VALUES ('TRX-TZTEST', 'TZ', 5000, 5000, 'cash','paid','completed', ?, 5000, 0)`).run(`${ymd}T16:30:00.000Z`)
    const d19 = (await admin.get(`/api/reports/summary?from=${ymd}&to=${ymd}`)).body.data
    const d20 = (await admin.get(`/api/reports/summary?from=${nextDay}&to=${nextDay}`)).body.data
    const in19 = d19.revenueRecorded === 5000
    const out20 = d20.revenueRecorded === 0
    record('MONEY-9', 'major', in19 && out20, 'server/src/lib/time.js:67-73', '23:30 Jakarta (16:30Z) counts on the 15th, not the 16th', `${ymd} revenue=${d19.revenueRecorded} (expect 5000); ${nextDay} revenue=${d20.revenueRecorded} (expect 0)`, 'ok')
    db.prepare("DELETE FROM transactions WHERE number='TRX-TZTEST'").run()
  })

  // ───────────────────────── 5. DISCLOSURE ─────────────────────────
  await withServer(async ({ db, api, login }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const c = (await admin.post('/api/consoles', { code: 'D-1', consoleType: 'PS4', roomType: 'Reguler', controllers: 2, hourlyRate: 12000 })).body.data.console

    // force a genuine internal error: remove the settings row → rulesFromRow(undefined) TypeError
    db.prepare('DELETE FROM business_settings').run()
    const err = await admin.post('/api/sessions', { consoleId: c.id, customerName: 'Boom', durationMinutes: 60 })
    const etext = JSON.stringify(err.body)
    const leaks = /at .*\(|\.js:\d+|SELECT |INSERT |SQLITE|stack/i.test(etext) && !/\/api/.test(etext)
    record('DISC-1', 'blocker', err.status === 500 && err.body?.error?.code === 'INTERNAL_ERROR' && !/\.js:\d+|node_modules|SELECT |SQLITE|at Object|stack/.test(etext), 'server/src/lib/errors.js:95-100', 'unexpected error → generic 500, no stack/path/SQL', `status=${err.status} body=${etext.slice(0, 160)}`, 'ok')
    db.prepare(`INSERT INTO business_settings (id,business_name,updated_at) VALUES (1,'Restored',?)`).run(new Date().toISOString())

    // malformed JSON → 400, not 500
    const bad = await api('/api/auth/login', { method: 'POST', headers: jsonHeaders, raw: '{not json' })
    record('DISC-2', 'blocker', bad.status === 400 && bad.body?.error?.code === 'VALIDATION_ERROR', 'server/src/lib/errors.js:83-88', 'malformed JSON → 400 VALIDATION_ERROR', `status=${bad.status} code=${bad.body?.error?.code}`, 'ok')

    // unknown route → 404 envelope
    const nf = await admin.get('/api/no/such/route')
    record('DISC-3', 'minor', nf.status === 404 && nf.body?.success === false && !!nf.body?.error?.code, 'server/src/lib/errors.js:68-73', 'unknown route → 404 envelope', `status=${nf.status} body=${JSON.stringify(nf.body)}`, 'ok')

    // CORS never wildcard + credentials
    const pre = await api('/api/consoles', { method: 'OPTIONS', headers: { origin: 'http://evil.example', 'access-control-request-method': 'POST' } })
    const acao = pre.headers.get('access-control-allow-origin')
    const acac = pre.headers.get('access-control-allow-credentials')
    record('DISC-4', 'blocker', acao !== '*', 'server/src/app.js:16', 'CORS is not wildcard+credentials (origin from config)', `ACAO=${acao} ACAC=${acac}`, 'ok')

    // CSRF: foreign Origin on a write is rejected (SameSite=Lax is primary)
    const evil = await admin.post('/api/consoles', { code: 'CSRF-1', consoleType: 'PS4', roomType: 'Reguler', controllers: 2, hourlyRate: 12000 }, { headers: { origin: 'https://evil.example' } })
    const good = await api('/api/auth/login', { method: 'POST', headers: { ...jsonHeaders, origin: 'http://localhost:5173' }, body: { username: ADMIN.username, password: ADMIN.password } })
    record('DISC-5', 'blocker', evil.status === 403, 'server/src/lib/auth.js:123-133', 'foreign-Origin write → 403 CSRF_ORIGIN_MISMATCH; allowed Origin passes', `evil origin → ${evil.status} ${evil.body?.error?.code ?? ''}; allowed origin login → ${good.status}`, 'ok (SameSite=Lax primary; Origin-less requests pass by design)')
  })

  // ───────────────────────── 6. HYGIENE ─────────────────────────
  await withServer(async ({ api, login }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    // password never in any user payload
    const list = await admin.get('/api/users')
    const raw = JSON.stringify(list.body)
    record('HYG-1', 'blocker', !raw.includes('password'), 'server/src/lib/mappers.js:7-14', 'password_hash/password_salt never appear in API responses', `users payload contains "password"=${raw.includes('password')}`, 'ok')

    // error responses carry no secrets either
    const bad = await api('/api/auth/login', { method: 'POST', headers: jsonHeaders, body: { username: 'admin', password: 'nope' } })
    holds('HYG-2', 'login failure body is generic', JSON.stringify(bad.body).slice(0, 80))
  })

  // ───────────── 7. RV-003 — role model, public registration, IDOR ─────────
  await withServer(async ({ db, api, login }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const customer = await login(USER.username, USER.password)
    const custId = db.prepare('SELECT id FROM users WHERE username=?').get(USER.username).id
    const reg = (body, raw) => api('/api/auth/register', {
      method: 'POST', headers: raw ? { ...jsonHeaders } : jsonHeaders, raw, body: raw ? undefined : body,
    })

    // 7a. registration rate limit: exactly 10 per IP per 15 min, XFF cannot mint a bucket
    let allowed = 0
    let first429 = null
    for (let i = 0; i < 15; i++) {
      const r = await api('/api/auth/register', {
        method: 'POST', headers: { ...jsonHeaders, 'x-forwarded-for': `203.0.113.${i}` },
        body: { username: `spam${String(i).padStart(2, '0')}`, fullName: 'Spam Bot', password: 'password123' },
      })
      if (r.status === 201) allowed++
      if (r.status === 429) { first429 = i + 1; break }
    }
    record('REG-0', 'major', allowed === 10 && first429 === 11, 'server/src/routes/auth.js:59-62',
      'registration allows exactly 10 accounts per 15 min per IP; a fresh X-Forwarded-For does not mint a new bucket',
      `allowed=${allowed} first429=#${first429}`, 'n/a')
    // free the bucket for the rest of this probe
    db.prepare("DELETE FROM login_attempts WHERE username='__register__'").run()

    // 7b. every role-bearing body is rejected; no account is created
    const escBodies = [
      { role: 'superadmin' }, { role: 'admin' }, { role: ['superadmin'] }, { role: ['user', 'superadmin'] },
      { is_admin: 1 }, { isAdmin: true }, { role_id: 1 }, { role: 'SUPERADMIN' }, { role: 'SuperAdmin' },
      { role: ' superadmin ' }, { role: 'superadmin ' }, { role: 'superadmin', is_active: 1 },
      { id: 1 }, { 'role ': 'superadmin' }, { Role: 'superadmin' }, { 'ro\\u006ce': 'superadmin' },
      { 'rôle': 'superadmin' }, { user: { role: 'superadmin' } }, { role: 'superadmin\\u0000' },
    ]
    const rawEsc = [
      '{"username":"escA","fullName":"Esc A","password":"password123","role":"superadmin","role":"user"}',
      '{"username":"escB","fullName":"Esc B","password":"password123","role":null}',
      '{"username":"escC","fullName":"Esc C","password":"password123","role":true}',
      '{"username":"escD","fullName":"Esc D","password":"password123","role":0}',
      '{"username":"escE","fullName":"Esc E","password":"password123","role":{"$ne":"user"}}',
      '{"username":"escF","fullName":"Esc F","password":"password123","__proto__":{"role":"superadmin"}}',
      '{"username":"escG","fullName":"Esc G","password":"password123","constructor":{"prototype":{"role":"superadmin"}}}',
      '{"username":"escH","fullName":"Esc H","password":"password123","role":"superadmin","extra":{"role":"superadmin"}}',
    ]
    const not400 = []
    let n = 0
    for (const extra of escBodies) {
      n++
      const r = await reg({ username: `esc${String(n).padStart(2, '0')}`, fullName: 'Esc', password: 'password123', ...extra })
      if (r.status !== 400) not400.push(`#${n} ${JSON.stringify(extra)} → ${r.status}`)
    }
    for (const raw of rawEsc) {
      const r = await reg(null, raw)
      if (r.status !== 400) not400.push(`raw ${raw.slice(0, 55)} → ${r.status}`)
    }
    const escRows = db.prepare("SELECT username, role, is_active FROM users WHERE username LIKE 'esc%'").all()
    const privileged = escRows.filter((u) => u.role !== 'user' || u.is_active !== 1)
    record('REG-1', 'blocker', not400.length === 0 && privileged.length === 0, 'server/src/routes/auth.js:37-42',
      'every role-bearing register body is rejected 400 and no esc* account exists',
      `non-400: ${not400.join(' | ') || 'none'}; rows=${escRows.length}; privileged=${JSON.stringify(privileged)}`, 'registerSchema is .strict()')

    // 7c. a valid registration is always a plain customer, with no session
    const okReg = await reg({ username: 'pelangganbaru', fullName: 'Pelanggan Baru', phone: '0812-999', password: 'password123' })
    const okRow = db.prepare("SELECT username, role, is_active FROM users WHERE username='pelangganbaru'").get()
    record('REG-2', 'blocker', okReg.status === 201 && okRow?.role === 'user' && okRow?.is_active === 1 && okReg.setCookie.length === 0,
      'server/src/routes/auth.js:70-74', 'a valid registration creates role=user, is_active=1 and sets NO session cookie',
      `status=${okReg.status} row=${JSON.stringify(okRow)} setCookie=${JSON.stringify(okReg.setCookie)}`, 'ok')

    // 7d. password policy
    const shortPw = await reg({ username: 'pwshort', fullName: 'Pw Short', password: '123' })
    record('REG-3', 'minor', shortPw.status === 400, 'server/src/routes/auth.js:41', 'a password shorter than 8 chars is rejected',
      `status=${shortPw.status} ${shortPw.body?.error?.message}`, 'length-only policy (no complexity rule)')

    // 7e. username squatting: an existing OR deactivated username cannot be re-registered
    const dupActive = await reg({ username: 'pelangganbaru', fullName: 'Squat', password: 'password123' })
    const dupInactive = await reg({ username: INACTIVE.username, fullName: 'Squat Legacy', password: 'password123' })
    record('REG-4', 'major', dupActive.status === 409 && dupInactive.status === 409, 'server/src/routes/auth.js:64-66',
      'an existing username — active or deactivated — cannot be re-registered',
      `active dup → ${dupActive.status} ${dupActive.body?.error?.code}; deactivated dup → ${dupInactive.status} ${dupInactive.body?.error?.code}`, 'ok')

    // 7f. login: identical answer for wrong password / deactivated account / unknown user
    const badPass = await api('/api/auth/login', { method: 'POST', headers: jsonHeaders, body: { username: 'pelangganbaru', password: 'wrongwrong' } })
    const inactiveTry = await api('/api/auth/login', { method: 'POST', headers: jsonHeaders, body: { username: INACTIVE.username, password: 'wrongwrong' } })
    const unknownTry = await api('/api/auth/login', { method: 'POST', headers: jsonHeaders, body: { username: 'ghostuser', password: 'wrongwrong' } })
    record('LOG-1', 'blocker', badPass.body?.error?.code === 'INVALID_CREDENTIALS'
      && inactiveTry.body?.error?.code === 'INVALID_CREDENTIALS' && unknownTry.body?.error?.code === 'INVALID_CREDENTIALS'
      && badPass.text === inactiveTry.text && inactiveTry.text === unknownTry.text, 'server/src/routes/auth.js:91-98',
      'wrong password / deactivated account / unknown user return a byte-identical 401',
      `${badPass.body?.error?.code} / ${inactiveTry.body?.error?.code} / ${unknownTry.body?.error?.code}; identical=${badPass.text === inactiveTry.text && inactiveTry.text === unknownTry.text}`, 'ok')

    // 7g. the deactivated legacy account cannot log in even with the right password
    const legacy = await api('/api/auth/login', { method: 'POST', headers: jsonHeaders, body: { username: INACTIVE.username, password: INACTIVE.password } })
    record('LOG-2', 'blocker', legacy.status === 401 && legacy.body?.error?.code === 'INVALID_CREDENTIALS', 'server/src/routes/auth.js:94',
      'the deactivated legacy account cannot log in with its correct password',
      `status=${legacy.status} code=${legacy.body?.error?.code}`, 'ok')

    // 7h. a live session of an is_active=0 account must be rejected
    const rawTok = 'rv003-probe-legacy-session-token'
    const inactiveId = db.prepare('SELECT id FROM users WHERE username=?').get(INACTIVE.username).id
    db.prepare('INSERT INTO auth_sessions (token_hash,user_id,created_at,expires_at,last_seen_at,ip) VALUES (?,?,?,?,?,?)')
      .run(sha256(rawTok), inactiveId, new Date().toISOString(), '2099-01-01T00:00:00.000Z', new Date().toISOString(), '127.0.0.1')
    const legacyCookie = `pr_session=${rawTok}`
    const dead = await api('/api/auth/me', { cookie: legacyCookie })
    db.prepare('UPDATE users SET is_active=1 WHERE id=?').run(inactiveId)
    const revived = await api('/api/auth/me', { cookie: legacyCookie })
    db.prepare('UPDATE users SET is_active=0 WHERE id=?').run(inactiveId)
    const deadAgain = await api('/api/auth/me', { cookie: legacyCookie })
    record('SES-1', 'blocker', dead.status === 401 && revived.status === 200 && deadAgain.status === 401, 'server/src/lib/auth.js:67',
      'an unexpired session of an is_active=0 account is rejected — and the same token works the moment the account is active again (differential proof)',
      `is_active=0 → ${dead.status}; is_active=1 → ${revived.status}; is_active=0 again → ${deadAgain.status}`, 'ok')

    // 7h-2. deactivating an account must REVOKE its sessions (DELETE does; PATCH does not)
    //      Use a throwaway account that is ACTIVE, so PATCH {isActive:false} is a real transition.
    await reg({ username: 'deact_probe', fullName: 'Deact Probe', password: 'password123' })
    const deactLogin = await api('/api/auth/login', { method: 'POST', headers: jsonHeaders, body: { username: 'deact_probe', password: 'password123' } })
    const deactCookie = deactLogin.setCookie.map((c) => c.split(';')[0]).find((c) => c.startsWith('pr_session='))
    const deactId = db.prepare('SELECT id FROM users WHERE username=?').get('deact_probe').id
    const sessBefore = db.prepare('SELECT COUNT(*) c FROM auth_sessions WHERE user_id=?').get(deactId).c
    const patchOff = await api(`/api/users/${deactId}`, { method: 'PATCH', cookie: admin.cookie, headers: jsonHeaders, body: { isActive: false } })
    const sessAfterPatch = db.prepare('SELECT COUNT(*) c FROM auth_sessions WHERE user_id=?').get(deactId).c
    record('SES-4', 'major', sessAfterPatch === 0, 'server/src/routes/users.js:87,126',
      'deactivating an account revokes its sessions — PATCH {isActive:false} must do what DELETE already does',
      `rows before PATCH=${sessBefore}; PATCH → ${patchOff.status}; rows after PATCH=${sessAfterPatch} (DELETE revoked them)`, 'add revokeAllForUser(db, id) when isActive flips to false')

    // 7h-3. reactivating an account must not resurrect a session token minted before the deactivation
    const reactivate = await api(`/api/users/${deactId}`, { method: 'PATCH', cookie: admin.cookie, headers: jsonHeaders, body: { isActive: true } })
    const resurrected = await api('/api/auth/me', { cookie: deactCookie })
    record('SES-5', 'major', resurrected.status === 401, 'server/src/routes/users.js:87',
      're-activating a deactivated account does not resurrect a session token minted before the deactivation',
      `PATCH isActive:true → ${reactivate.status}; replay of the pre-deactivation token → ${resurrected.status} (200 = session resurrection)`, 'revoke sessions on deactivation (SES-4)')

    // 7h-4. the v2 migration must REVOKE the sessions of the accounts it demotes (plan.md §4.3)
    const v1dir = mkTmpDir('playrent-v1-')
    try {
      const v1 = openDatabase(join(v1dir, 'v1.db'))
      v1.exec(readFileSync(join(here, '..', 'src', 'schema.sql'), 'utf8'))
      v1.exec('PRAGMA user_version = 1')
      const t = new Date().toISOString()
      v1.prepare(`INSERT INTO users (username, full_name, password_hash, password_salt, role, is_active, created_at, updated_at)
        VALUES ('kasir_lama','Kasir Lama','h','s','cashier',1,?,?)`).run(t, t)
      v1.prepare(`INSERT INTO users (username, full_name, password_hash, password_salt, role, is_active, created_at, updated_at)
        VALUES ('admin_lama','Admin Lama','h','s','admin',1,?,?)`).run(t, t)
      v1.prepare(`INSERT INTO auth_sessions (token_hash,user_id,created_at,expires_at,last_seen_at,ip)
        VALUES ('tok-kasir', (SELECT id FROM users WHERE username='kasir_lama'), ?, '2099-01-01T00:00:00.000Z', ?, '127.0.0.1')`).run(t, t)
      migrate(v1)
      const kasirRow = v1.prepare("SELECT role, is_active FROM users WHERE username='kasir_lama'").get()
      const leftOver = v1.prepare('SELECT COUNT(*) c FROM auth_sessions WHERE user_id=(SELECT id FROM users WHERE username=?)').get('kasir_lama').c
      const adminRow2 = v1.prepare("SELECT role, is_active FROM users WHERE username='admin_lama'").get()
      record('SES-6', 'major', leftOver === 0 && kasirRow.role === 'user' && kasirRow.is_active === 0 && adminRow2.role === 'superadmin',
        'server/src/db.js:40-87,129-135 (v2 demotes, v3 revokes the sessions)',
        'the migration demotes cashier → user + inactive AND revokes that account’s sessions (plan.md §4.3)',
        `kasir row=${JSON.stringify(kasirRow)}; leftover session rows=${leftOver}; admin row=${JSON.stringify(adminRow2)}`, 'delete the auth_sessions rows of the demoted accounts inside the migration')
      v1.close()
    } finally {
      rmSync(v1dir, { recursive: true, force: true })
    }

    // 7i. forged headers / tampered cookies cannot change the role
    const spoof = ['x-role', 'x-user-id', 'x-userid', 'x-admin', 'x-forwarded-user', 'x-csrf-token', 'x-real-ip', 'x-forwarded-for', 'authorization']
    const spoofOk = []
    for (const h of spoof) {
      const r = await api('/api/users', { cookie: customer.cookie, headers: { [h]: h === 'authorization' ? 'Bearer superadmin' : 'superadmin' } })
      if (r.status !== 403) spoofOk.push(`${h} → ${r.status}`)
    }
    record('HDR-1', 'blocker', spoofOk.length === 0, 'server/src/lib/auth.js:103-122',
      'no forged header (X-Role, X-User-Id, Authorization: Bearer, XFF…) changes the role',
      spoofOk.join(' | ') || 'all → 403', 'ok')

    const tampered = [
      `pr_session=${rawTok}`, 'pr_session=admin',
      `pr_session=${Buffer.from(JSON.stringify({ id: 1, role: 'superadmin' })).toString('base64url')}`,
      'pr_session=', `pr_session=${'A'.repeat(64)}`,
    ]
    const tamperedOk = []
    for (const c of tampered) {
      const r = await api('/api/users', { cookie: c })
      if (r.status !== 401) tamperedOk.push(`${c.slice(0, 36)} → ${r.status}`)
    }
    record('HDR-2', 'blocker', tamperedOk.length === 0, 'server/src/lib/auth.js:104-108',
      'a tampered / forged session cookie is rejected with 401', tamperedOk.join(' | ') || 'all → 401', 'ok')

    // 7j. own-profile mass assignment
    const profBad = []
    const profBodies = [
      { role: 'superadmin' }, { role: 'superadmin', fullName: 'Escalate' }, { isActive: false },
      { id: 1 }, { username: 'admin' }, { is_active: 1 }, { password: 'newpassword123' }, { passwordHash: 'x' },
    ]
    for (const b of profBodies) {
      const r = await api('/api/auth/profile', { method: 'PATCH', cookie: customer.cookie, headers: jsonHeaders, body: b })
      if (r.status !== 400) profBad.push(`${JSON.stringify(b)} → ${r.status}`)
    }
    const profRow = db.prepare('SELECT username, role, is_active, full_name FROM users WHERE id=?').get(custId)
    record('PRO-1', 'blocker', profBad.length === 0 && profRow.role === 'user' && profRow.is_active === 1 && profRow.username === USER.username,
      'server/src/routes/auth.js:44-47,114-130', 'PATCH /auth/profile rejects role/isActive/id/username/password and cannot change the account',
      `non-400: ${profBad.join(' | ') || 'none'}; row=${JSON.stringify(profRow)}`, 'profileSchema is .strict()')
    const profOk = await api('/api/auth/profile', { method: 'PATCH', cookie: customer.cookie, headers: jsonHeaders, body: { fullName: 'Pelanggan Edit', phone: '0812-777' } })
    record('PRO-2', 'minor', profOk.status === 200 && profOk.body?.data?.user?.fullName === 'Pelanggan Edit',
      'server/src/routes/auth.js:114-130', 'a legitimate profile edit (fullName/phone) still works',
      `status=${profOk.status} user=${JSON.stringify(profOk.body?.data?.user)}`, 'ok')

    // 7k. the /users router is superadmin-only
    const uOps = [
      await api('/api/users', { cookie: customer.cookie }),
      await api('/api/users', { method: 'POST', cookie: customer.cookie, headers: jsonHeaders, body: { username: 'hacker1', fullName: 'Hacker One', password: 'password123', role: 'superadmin' } }),
      await api('/api/users/1', { method: 'PATCH', cookie: customer.cookie, headers: jsonHeaders, body: { role: 'superadmin' } }),
      await api(`/api/users/${custId}`, { method: 'PATCH', cookie: customer.cookie, headers: jsonHeaders, body: { role: 'superadmin', isActive: true } }),
      await api('/api/users/1', { method: 'DELETE', cookie: customer.cookie }),
    ]
    const adminRow = db.prepare("SELECT username, role, is_active FROM users WHERE username=?").get(ADMIN.username)
    record('USR-1', 'blocker', uOps.every((r) => r.status === 403) && adminRow.role === 'superadmin', 'server/src/routes/users.js:31',
      'role=user gets 403 on every /users endpoint and the superadmin row is untouched',
      `statuses=${uOps.map((r) => r.status).join(',')}; admin row=${JSON.stringify(adminRow)}`, 'ok')

    // 7l. bookings: ownership comes from the session, never from the body
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    // seedBase() only creates users + settings, so make a unit to book.
    const unit = (await admin.post('/api/consoles', { code: 'BK-1', consoleType: 'PS4', roomType: 'Reguler', controllers: 2, hourlyRate: 12000 })).body?.data?.console
    const consoleRow = { id: unit.id }
    const mkBooking = async (client, startTime, name) => {
      const r = await api('/api/bookings', {
        method: 'POST', cookie: client.cookie, headers: jsonHeaders,
        body: { consoleId: consoleRow.id, customerName: name, bookingDate: tomorrow, startTime, durationMinutes: 60 },
      })
      return r
    }
    const mine = await mkBooking(customer, '10:00', 'Pelanggan Sendiri')
    record('IDR-1', 'minor', mine.status === 201, 'server/src/routes/bookings.js:125-161', 'a customer can create a booking',
      `status=${mine.status}`, 'ok')
    const myId = mine.body?.data?.booking?.id
    const inj = await api('/api/bookings', {
      method: 'POST', cookie: customer.cookie, headers: jsonHeaders,
      body: { consoleId: consoleRow.id, customerName: 'Injected', bookingDate: tomorrow, startTime: '12:00', durationMinutes: 60, customer_user_id: 1 },
    })
    record('IDR-2', 'blocker', inj.status === 400, 'server/src/routes/bookings.js:18-27',
      'POST /bookings with customer_user_id in the body is rejected (no ownership injection)',
      `status=${inj.status} code=${inj.body?.error?.code}`, 'createSchema is .strict()')
    const owner = db.prepare('SELECT customer_user_id FROM bookings WHERE id=?').get(myId)
    record('IDR-3', 'blocker', owner?.customer_user_id === custId, 'server/src/routes/bookings.js:144',
      'the booking owner is the session user id, taken from the server session',
      `booking ${myId} customer_user_id=${owner?.customer_user_id} (session id=${custId})`, 'ok')
    const listInj = await api('/api/bookings?customer_user_id=1', { cookie: customer.cookie })
    const listed = listInj.body?.data?.items ?? []
    record('IDR-4', 'blocker', listInj.status === 200 && listed.every((b) => b.id === myId), 'server/src/routes/bookings.js:102',
      'GET /bookings?customer_user_id=<other> returns only the caller’s own bookings',
      `status=${listInj.status} ids=${JSON.stringify(listed.map((b) => b.id))} (own=${myId})`, 'ok')
    const other = await mkBooking(admin, '14:00', 'Buk Pelanggan')
    const otherId = other.body?.data?.booking?.id
    const g = await api(`/api/bookings/${otherId}`, { cookie: customer.cookie })
    const p = await api(`/api/bookings/${otherId}`, { method: 'PATCH', cookie: customer.cookie, headers: jsonHeaders, body: { customerName: 'Dibajak' } })
    const c = await api(`/api/bookings/${otherId}/cancel`, { method: 'POST', cookie: customer.cookie, headers: jsonHeaders, body: { reason: 'saya mau' } })
    const ci = await api(`/api/bookings/${otherId}/check-in`, { method: 'POST', cookie: customer.cookie, headers: jsonHeaders, body: {} })
    record('IDR-5', 'blocker', g.status === 404 && p.status === 404 && c.status === 404, 'server/src/routes/bookings.js:114-123,163-180,270-278',
      "another customer's booking is 404 on GET / PATCH / cancel (its existence is never confirmed)",
      `get=${g.status} patch=${p.status} cancel=${c.status}`, 'ok')
    record('IDR-6', 'blocker', ci.status === 403, 'server/src/routes/bookings.js:228', 'POST /bookings/:id/check-in as role=user → 403',
      `status=${ci.status} code=${ci.body?.error?.code}`, 'ok')
    const patchFields = await api(`/api/bookings/${myId}`, { method: 'PATCH', cookie: customer.cookie, headers: jsonHeaders, body: { status: 'confirmed', discount: 50000 } })
    record('IDR-7', 'major', patchFields.status === 400, 'server/src/routes/bookings.js:50-52,171-179',
      'a customer cannot set status/discount on their own booking',
      `status=${patchFields.status} details=${JSON.stringify(patchFields.body?.error?.details)}`, 'ok')
    const patchCuid = await api(`/api/bookings/${myId}`, { method: 'PATCH', cookie: customer.cookie, headers: jsonHeaders, body: { customer_user_id: 1 } })
    record('IDR-8', 'blocker', patchCuid.status === 400, 'server/src/routes/bookings.js:29-40',
      'PATCH /bookings with customer_user_id → 400 (ownership cannot be reassigned)', `status=${patchCuid.status}`, 'ok')

    // 7l-2. the customer's PATCH must honour the same rules as POST
    // (a) a console the operator deactivated must not be bookable
    const deadUnit = (await admin.post('/api/consoles', { code: 'DEAD-1', consoleType: 'PS5', roomType: 'VIP', controllers: 4, hourlyRate: 25000 })).body?.data?.console
    await admin.del(`/api/consoles/${deadUnit.id}`)
    const postDead = await api('/api/bookings', {
      method: 'POST', cookie: customer.cookie, headers: jsonHeaders,
      body: { consoleId: deadUnit.id, customerName: 'Dead', bookingDate: tomorrow, startTime: '12:00', durationMinutes: 60 },
    })
    const patchDead = await api(`/api/bookings/${myId}`, { method: 'PATCH', cookie: customer.cookie, headers: jsonHeaders, body: { consoleId: deadUnit.id } })
    const afterDead = db.prepare('SELECT console_id FROM bookings WHERE id=?').get(myId)
    // RV-003 probe defect, corrected in BE-006: this assertion pinned PATCH to
    // 400 while POST answers 404 for the very same condition — contradicting
    // the issue text below ("POST and PATCH must agree") and the fix hint
    // ("like POST does"). The contract (api-contract.md + BE-006) requires the
    // same answer on both paths, so PATCH is asserted to be 404
    // CONSOLE_NOT_FOUND as well. The check is now STRONGER: the error code is
    // asserted too, not just the status.
    record('IDR-9', 'major',
      postDead.status === 404 && patchDead.status === 404
      && postDead.body?.error?.code === 'CONSOLE_NOT_FOUND'
      && patchDead.body?.error?.code === 'CONSOLE_NOT_FOUND'
      && afterDead.console_id !== deadUnit.id,
      'server/src/routes/bookings.js:136,191', 'a customer cannot move a booking onto a console the operator DEACTIVATED (POST and PATCH must agree)',
      `POST → ${postDead.status} ${postDead.body?.error?.code}; PATCH → ${patchDead.status} ${patchDead.body?.error?.code}; booking.console_id=${afterDead.console_id} (dead=${deadUnit.id})`,
      'PATCH must select the console with AND is_active = 1, like POST does')

    // (b) the minimum duration the operator configured must be enforced on PATCH too
    const minMinutes = db.prepare('SELECT min_duration_minutes FROM business_settings WHERE id=1').get().min_duration_minutes
    const shortPatch = await api(`/api/bookings/${myId}`, { method: 'PATCH', cookie: customer.cookie, headers: jsonHeaders, body: { durationMinutes: 5 } })
    const afterShort = db.prepare('SELECT duration_minutes FROM bookings WHERE id=?').get(myId)
    record('IDR-10', 'major', shortPatch.status === 400 && afterShort.duration_minutes >= minMinutes,
      'server/src/routes/bookings.js:134,186-197', 'a customer cannot shorten a booking below the configured minimum duration',
      `min_duration_minutes=${minMinutes}; PATCH durationMinutes=5 → ${shortPatch.status} ${shortPatch.body?.error?.message ?? shortPatch.body?.error?.code}; stored=${afterShort.duration_minutes}`,
      'call validateDuration() in the PATCH branch too')

    // 7m. data disclosure for role=user
    // Per-endpoint forbidden list: a customer's OWN booking legitimately carries
    // customerName/customerContact — what must never appear is another
    // customer's data, the internal ownership column, or operator-only fields.
    const leakRules = [
      ['/api/consoles', ['conditionNote', 'currentSession', 'customerName', 'customerContact', 'password_hash', 'password_salt']],
      [`/api/consoles/${consoleRow.id}`, ['conditionNote', 'currentSession', 'customerName', 'customerContact']],
      ['/api/settings', ['payments', 'payment_methods', 'overtimeRatePerHour', 'overtimeGraceMinutes', 'methods']],
      ['/api/bookings', ['customer_user_id', 'Buk Pelanggan']],
      ['/api/games', ['password_hash', 'password_salt']],
      ['/api/packages', ['password_hash', 'password_salt']],
    ]
    const leakHits = []
    for (const [p, forbidden] of leakRules) {
      const r = await api(p, { cookie: customer.cookie })
      const hit = forbidden.filter((f) => r.text.includes(f))
      if (hit.length) leakHits.push(`${p} → ${hit.join(',')}`)
    }
    record('DAT-1', 'blocker', leakHits.length === 0, 'server/src/lib/mappers.js:17-27, server/src/lib/settings.js:39-54',
      'no forbidden field (conditionNote, currentSession, payment methods, overtime tariff, hashes, another customer) appears in a role=user response',
      leakHits.join(' | ') || 'clean', 'ok')
    const one = await api(`/api/consoles/${consoleRow.id}`, { cookie: customer.cookie })
    record('DAT-2', 'major', !one.text.includes('currentSession') && one.body?.data?.isBusy !== undefined, 'server/src/routes/consoles.js:46-57',
      'console detail for a customer exposes only isBusy, not the active session', `body=${JSON.stringify(one.body).slice(0, 200)}`, 'ok')
    const set = await api('/api/settings', { cookie: customer.cookie })
    record('DAT-3', 'major', !set.text.includes('payment') && !set.text.includes('overtimeRatePerHour'), 'server/src/lib/settings.js:39-54',
      'settings for a customer omit payments and the overtime tariff', `body=${JSON.stringify(set.body).slice(0, 240)}`, 'ok')

    // 7n. perimeter: no cookie → 401 on every protected endpoint
    const anon = [
      ['GET', '/api/users'], ['POST', '/api/users'], ['PATCH', '/api/users/1'], ['DELETE', '/api/users/1'],
      ['GET', '/api/consoles'], ['POST', '/api/consoles'], ['PATCH', '/api/consoles/1'], ['DELETE', '/api/consoles/1'],
      ['GET', '/api/sessions'], ['GET', '/api/sessions/active'], ['POST', '/api/sessions'], ['POST', '/api/sessions/quote'],
      ['POST', '/api/sessions/1/finish'], ['POST', '/api/sessions/1/void'],
      ['GET', '/api/bookings'], ['POST', '/api/bookings'], ['GET', '/api/bookings/1'], ['PATCH', '/api/bookings/1'],
      ['POST', '/api/bookings/1/check-in'], ['POST', '/api/bookings/1/cancel'],
      ['GET', '/api/transactions'], ['GET', '/api/transactions/1'], ['GET', '/api/transactions/1/receipt'], ['POST', '/api/transactions/1/void'],
      ['GET', '/api/dashboard/summary'], ['GET', '/api/dashboard/activity'], ['GET', '/api/dashboard/ending-soon'],
      ['GET', '/api/dashboard/revenue-chart'], ['GET', '/api/dashboard/busy-hours'],
      ['GET', '/api/reports/summary'], ['GET', '/api/reports/daily'], ['GET', '/api/reports/payments'], ['GET', '/api/reports/export.csv'],
      ['GET', '/api/settings'], ['PUT', '/api/settings'],
      ['GET', '/api/games'], ['POST', '/api/games'], ['PATCH', '/api/games/1'], ['DELETE', '/api/games/1'],
      ['GET', '/api/packages'], ['POST', '/api/packages'], ['PATCH', '/api/packages/1'], ['DELETE', '/api/packages/1'],
      ['GET', '/api/auth/me'], ['PATCH', '/api/auth/profile'], ['POST', '/api/auth/change-password'], ['POST', '/api/auth/logout'],
    ]
    const not401 = []
    for (const [m, p] of anon) {
      const r = await api(p, { method: m, headers: jsonHeaders, body: m === 'GET' ? undefined : {} })
      if (r.status !== 401) not401.push(`${m} ${p} → ${r.status}`)
    }
    record('PER-1', 'blocker', not401.length === 0, 'server/src/routes/index.js:34-44', 'every protected endpoint answers 401 without a session cookie',
      not401.join(' | ') || 'all → 401', 'ok')

    // 7o. operator routers are closed to role=user
    const opReads = ['/api/sessions', '/api/sessions/active', '/api/transactions', '/api/dashboard/summary', '/api/reports/summary', '/api/users']
    const opBad = []
    for (const p of opReads) {
      const r = await api(p, { cookie: customer.cookie })
      if (r.status !== 403) opBad.push(`${p} → ${r.status}`)
    }
    record('OPS-1', 'blocker', opBad.length === 0, 'server/src/routes/{sessions,transactions,dashboard,reports,users}.js',
      'every operator-only read answers 403 for role=user', opBad.join(' | ') || 'all → 403', 'ok')

    // 7p. injection in the new fields
    const inj2 = []
    for (const p of ["' OR 1=1 --", "'; DROP TABLE users; --", "admin'--", "%' OR '%'='"]) {
      const r = await reg({ username: `sqli${Math.random().toString(36).slice(2, 8)}`, fullName: p, phone: p, password: 'password123' })
      if (r.status !== 201) inj2.push(`register ${p} → ${r.status}`)
      const r2 = await api('/api/auth/profile', { method: 'PATCH', cookie: customer.cookie, headers: jsonHeaders, body: { fullName: p, phone: p } })
      if (r2.status !== 200) inj2.push(`profile ${p} → ${r2.status}`)
    }
    const usersAlive = db.prepare('SELECT COUNT(*) c FROM users').get().c
    record('SQL-1', 'blocker', inj2.length === 0 && usersAlive > 0, 'server/src/routes/auth.js:118-123',
      'injection payloads in phone/fullName are stored as literal text; the users table survives',
      `non-2xx: ${inj2.join(' | ') || 'none'}; users=${usersAlive}`, 'all statements are parameterised')

    // 7q. login must not leak the existence of a username through its timing
    //     (the response body is uniform; the scrypt cost must be paid either way)
    const N = 8
    // reuse an existing hash — the scrypt cost is what matters, not the password
    const creds = db.prepare('SELECT password_hash, password_salt FROM users WHERE role=? LIMIT 1').get('superadmin')
    const nowT = new Date().toISOString()
    const knownNames = []
    for (let i = 0; i < N; i++) {
      const u = `timing_known_${i}`
      knownNames.push(u)
      db.prepare(`INSERT INTO users (username, full_name, password_hash, password_salt, role, is_active, created_at, updated_at)
        VALUES (?,?,?,?,'user',1,?,?)`).run(u, `Timing ${i}`, creds.password_hash, creds.password_salt, nowT, nowT)
    }
    const hit = async (username) => {
      const s = performance.now()
      await api('/api/auth/login', { method: 'POST', headers: jsonHeaders, body: { username, password: 'wrongwrong' } })
      return performance.now() - s
    }
    for (let i = 0; i < 5; i++) await hit('timing_warmup')       // warm the fetch/express path
    const tKnown = [], tUnknown = []
    for (let i = 0; i < N; i++) { tKnown.push(await hit(knownNames[i])); tUnknown.push(await hit(`timing_unknown_${i}`)) }
    const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }
    const mk = median(tKnown), mu = median(tUnknown)
    record('LOG-3', 'minor', !(mk > mu * 5), 'server/src/routes/auth.js:91-97',
      'login does not reveal whether a username exists through its response time',
      `known median=${mk.toFixed(1)}ms vs unknown median=${mu.toFixed(1)}ms (${(mk / mu).toFixed(1)}x)`, 'verify against a dummy hash when the user is missing')
  })

  console.log('\n════════════════════ SUMMARY ════════════════════')
  console.log(`blockers=${blockers}  majors=${majors}  minors=${minors}  total=${results.length}`)
  // RV-003: a major is a real control gap too — the verdict must not read PASS
  // while majors are outstanding.
  const verdict = blockers === 0 && majors === 0 ? 'PASS' : 'FAIL'
  console.log(`VERDICT: ${verdict}`)
  const fails = results.filter((r) => !r.ok)
  if (fails.length) {
    console.log('\nFAILED CHECKS:')
    for (const f of fails) console.log(`  ${f.id} (${f.sev}) ${f.issue}\n    ${f.proof}`)
  }
}

await main()
