// BE-001 — deploy contract: cross-site session (GitHub Pages SPA + API tunnel).
// Read specs/deploy-contract.md — that file is the source of truth.
//
// Covers: SameSite=None; Secure cookie, CORS allowlist (no wildcard),
// CSRF origin check, and the config defaults of server/src/config.js.
import test from 'node:test'
import assert from 'node:assert/strict'
import { withServer, ADMIN } from './helpers.js'
import { corsOrigins, cookieSameSite, cookieSecure, trustProxy, host, trustProxyLanWarning } from '../src/config.js'
import { sessionCookieOptions } from '../src/lib/auth.js'

const PAGES_ORIGIN = 'https://adjietegaralamsyah312.github.io'
const FOREIGN_ORIGIN = 'https://evil.example'

/**
 * Set env vars for one case, restore them afterwards — a case must never leak
 * its env into the next one.
 */
async function withEnv(vars, fn) {
  const saved = new Map()
  for (const [k, v] of Object.entries(vars)) {
    saved.set(k, process.env[k])
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  try {
    return await fn()
  } finally {
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}

/** Cookie attributes of a Set-Cookie header line (lowercased keys, raw values). */
const cookieAttrs = (raw) => Object.fromEntries(
  raw.split(';').slice(1)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const i = part.indexOf('=')
      return i === -1
        ? [part.toLowerCase(), '']
        : [part.slice(0, i).toLowerCase(), part.slice(i + 1)]
    }),
)

const sessionCookie = (res) => res.setCookie.find((c) => c.startsWith('pr_session='))

test('BE-001 cross-site login: cookie is HttpOnly; SameSite=None; Secure; path=/', async () => {
  await withEnv({
    NODE_ENV: 'production',
    CORS_ORIGIN: PAGES_ORIGIN,
    COOKIE_SAME_SITE: 'none',
    COOKIE_SECURE: 'true',
  }, async () => {
    await withServer(async ({ api }) => {
      const res = await api('/api/auth/login', {
        method: 'POST',
        headers: { origin: PAGES_ORIGIN },
        body: { username: ADMIN.username, password: ADMIN.password },
      })
      assert.equal(res.status, 200)

      const raw = sessionCookie(res)
      assert.ok(raw, 'session cookie set')
      const attrs = cookieAttrs(raw)
      assert.ok('httponly' in attrs, 'HttpOnly')
      assert.equal(attrs.samesite.toLowerCase(), 'none', 'SameSite=None')
      assert.ok('secure' in attrs, 'Secure')
      assert.equal(attrs.path, '/', 'path=/')
      assert.ok(!('domain' in attrs), 'host-only cookie: no Domain attribute')
    })
  })
})

test('BE-001 cross-site session survives: /api/auth/me returns the logged-in user', async () => {
  await withEnv({
    NODE_ENV: 'production',
    CORS_ORIGIN: PAGES_ORIGIN,
    COOKIE_SAME_SITE: 'none',
    COOKIE_SECURE: 'true',
  }, async () => {
    await withServer(async ({ api }) => {
      const login = await api('/api/auth/login', {
        method: 'POST',
        headers: { origin: PAGES_ORIGIN },
        body: { username: ADMIN.username, password: ADMIN.password },
      })
      assert.equal(login.status, 200)
      const cookie = sessionCookie(login).split(';')[0]

      const me = await api('/api/auth/me', { headers: { origin: PAGES_ORIGIN }, cookie })
      assert.equal(me.status, 200)
      assert.equal(me.body.data.user.username, ADMIN.username)
      assert.equal(me.body.data.user.role, 'superadmin')
    })
  })
})

test('BE-001 logout clears the cookie with the same attributes (SameSite/Secure/Path)', async () => {
  await withEnv({
    NODE_ENV: 'production',
    CORS_ORIGIN: PAGES_ORIGIN,
    COOKIE_SAME_SITE: 'none',
    COOKIE_SECURE: 'true',
  }, async () => {
    await withServer(async ({ api }) => {
      const login = await api('/api/auth/login', {
        method: 'POST',
        headers: { origin: PAGES_ORIGIN },
        body: { username: ADMIN.username, password: ADMIN.password },
      })
      const cookie = sessionCookie(login).split(';')[0]

      const out = await api('/api/auth/logout', {
        method: 'POST',
        headers: { origin: PAGES_ORIGIN },
        cookie,
      })
      assert.equal(out.status, 200)

      const cleared = sessionCookie(out)
      assert.ok(cleared, 'logout clears the session cookie')
      const set = cookieAttrs(sessionCookie(login))
      const clr = cookieAttrs(cleared)
      assert.equal(clr.samesite, set.samesite, 'same SameSite')
      assert.equal('secure' in clr, 'secure' in set, 'same Secure')
      assert.equal(clr.path, set.path, 'same Path')
      assert.ok('httponly' in clr, 'HttpOnly')
      // Expired in the past, otherwise the browser keeps the old cookie.
      assert.ok(Date.parse(clr.expires) <= Date.now(), 'cookie expired')
    })
  })
})

test('BE-001 register: 201, role user decided by the server, no session cookie', async () => {
  await withEnv({
    NODE_ENV: 'production',
    CORS_ORIGIN: PAGES_ORIGIN,
    COOKIE_SAME_SITE: 'none',
    COOKIE_SECURE: 'true',
  }, async () => {
    await withServer(async ({ api }) => {
      const res = await api('/api/auth/register', {
        method: 'POST',
        headers: { origin: PAGES_ORIGIN },
        body: { username: 'crosssiteuser', fullName: 'Cross Site User', password: 'RahasiaKuat123' },
      })
      assert.equal(res.status, 201)
      assert.equal(res.body.data.user.role, 'user')
      assert.equal(res.body.data.user.username, 'crosssiteuser')
      assert.equal(sessionCookie(res), undefined, 'registration sets no session cookie')
      assert.equal(res.setCookie.length, 0)
    })
  })
})

test('BE-001 CSRF: a foreign Origin on a write is rejected with 403', async () => {
  await withEnv({
    NODE_ENV: 'production',
    CORS_ORIGIN: PAGES_ORIGIN,
    COOKIE_SAME_SITE: 'none',
    COOKIE_SECURE: 'true',
  }, async () => {
    await withServer(async ({ api }) => {
      const res = await api('/api/auth/login', {
        method: 'POST',
        headers: { origin: FOREIGN_ORIGIN },
        body: { username: ADMIN.username, password: ADMIN.password },
      })
      assert.equal(res.status, 403)
      assert.equal(res.body.error.code, 'CSRF_ORIGIN_MISMATCH')
    })
  })
})

test('BE-001 CORS preflight: allowed origin is echoed, credentials are allowed', async () => {
  await withEnv({
    NODE_ENV: 'production',
    CORS_ORIGIN: PAGES_ORIGIN,
    COOKIE_SAME_SITE: 'none',
    COOKIE_SECURE: 'true',
  }, async () => {
    await withServer(async ({ api }) => {
      const res = await api('/api/auth/login', {
        method: 'OPTIONS',
        headers: { origin: PAGES_ORIGIN, 'access-control-request-method': 'POST' },
      })
      assert.equal(res.headers.get('access-control-allow-origin'), PAGES_ORIGIN)
      assert.notEqual(res.headers.get('access-control-allow-origin'), '*')
      assert.equal(res.headers.get('access-control-allow-credentials'), 'true')
    })
  })
})

test('BE-001 CORS: a foreign origin never gets Access-Control-Allow-Origin', async () => {
  await withEnv({
    NODE_ENV: 'production',
    CORS_ORIGIN: PAGES_ORIGIN,
    COOKIE_SAME_SITE: 'none',
    COOKIE_SECURE: 'true',
  }, async () => {
    await withServer(async ({ api }) => {
      const res = await api('/api/auth/login', {
        method: 'OPTIONS',
        headers: { origin: FOREIGN_ORIGIN, 'access-control-request-method': 'POST' },
      })
      assert.equal(res.headers.get('access-control-allow-origin'), null)
    })
  })
})

test('BE-001 defaults: production origin is the GitHub Pages origin (no /PlayRent path)', async () => {
  await withEnv({ NODE_ENV: 'production', CORS_ORIGIN: undefined }, () => {
    const origins = corsOrigins()
    assert.deepEqual(origins, [PAGES_ORIGIN])
    assert.ok(!origins.some((o) => o.includes('/PlayRent')), 'origin never carries the SPA path')
  })

  await withEnv({ NODE_ENV: 'development', CORS_ORIGIN: undefined }, () => {
    assert.deepEqual(corsOrigins(), ['http://localhost:5173', 'http://127.0.0.1:5173'])
  })
})

test('BE-001 invariant: SameSite=None without Secure is downgraded to Lax', async () => {
  await withEnv({
    NODE_ENV: 'production',
    CORS_ORIGIN: PAGES_ORIGIN,
    COOKIE_SAME_SITE: 'none',
    COOKIE_SECURE: 'false',
  }, async () => {
    assert.equal(cookieSecure(), false)
    await withServer(async ({ api }) => {
      const res = await api('/api/auth/login', {
        method: 'POST',
        headers: { origin: PAGES_ORIGIN },
        body: { username: ADMIN.username, password: ADMIN.password },
      })
      assert.equal(res.status, 200)
      const attrs = cookieAttrs(sessionCookie(res))
      assert.equal(attrs.samesite.toLowerCase(), 'lax', 'None without Secure would be dropped by the browser')
      assert.ok(!('secure' in attrs))
    })
  })
})

test('BE-001 config: an unknown COOKIE_SAME_SITE falls back to the default, no crash', async () => {
  await withEnv({ NODE_ENV: 'production', CORS_ORIGIN: PAGES_ORIGIN, COOKIE_SAME_SITE: 'bogus' }, () => {
    assert.equal(cookieSameSite(), 'none', 'production default')
  })
  await withEnv({ NODE_ENV: 'development', CORS_ORIGIN: PAGES_ORIGIN, COOKIE_SAME_SITE: 'bogus' }, () => {
    assert.equal(cookieSameSite(), 'lax', 'development default')
  })

  await withEnv({
    NODE_ENV: 'production',
    CORS_ORIGIN: PAGES_ORIGIN,
    COOKIE_SAME_SITE: 'bogus',
    COOKIE_SECURE: 'true',
  }, async () => {
    await withServer(async ({ api }) => {
      const res = await api('/api/auth/login', {
        method: 'POST',
        headers: { origin: PAGES_ORIGIN },
        body: { username: ADMIN.username, password: ADMIN.password },
      })
      assert.equal(res.status, 200, 'a bad env value must not break the login')
      assert.equal(cookieAttrs(sessionCookie(res)).samesite.toLowerCase(), 'none')
    })
  })
})

test('BE-001 dev: both Vite dev origins are allowed without a hardcoded host', async () => {
  await withEnv({
    NODE_ENV: 'development',
    CORS_ORIGIN: undefined,
    COOKIE_SAME_SITE: 'lax',
    COOKIE_SECURE: 'false',
  }, async () => {
    await withServer(async ({ api }) => {
      for (const origin of ['http://localhost:5173', 'http://127.0.0.1:5173']) {
        const res = await api('/api/auth/login', {
          method: 'POST',
          headers: { origin },
          body: { username: ADMIN.username, password: ADMIN.password },
        })
        assert.equal(res.status, 200, `${origin} must be an allowed origin`)
      }
    })
  })
})

test('BE-001 the API own origin is always a CSRF-allowed origin', async () => {
  await withEnv({
    NODE_ENV: 'production',
    CORS_ORIGIN: PAGES_ORIGIN,
    COOKIE_SAME_SITE: 'none',
    COOKIE_SECURE: 'true',
  }, async () => {
    await withServer(async ({ base, api }) => {
      const ownOrigin = base // http://127.0.0.1:<port> — the API serves itself
      const res = await api('/api/auth/login', {
        method: 'POST',
        headers: { origin: ownOrigin },
        body: { username: ADMIN.username, password: ADMIN.password },
      })
      assert.equal(res.status, 200)
    })
  })
})

test('BE-001 the effective cookie options are one shared source of truth', () => {
  const opts = sessionCookieOptions()
  assert.equal(opts.httpOnly, true)
  assert.equal(opts.path, '/')
  assert.ok(['lax', 'strict', 'none'].includes(opts.sameSite))
  assert.equal(typeof opts.secure, 'boolean')
})

// --- BE-002: TRUST_PROXY as a hop count (review HIGH-1) + Sec-Fetch-Site ----

const XFF_RIGHT = '9.9.9.9' // the entry the trusted proxy appended (Cloudflare)

/** A failed login for the deactivated account — counts against the rate limit. */
const failedLogin = (api, xff) => api('/api/auth/login', {
  method: 'POST',
  headers: { origin: PAGES_ORIGIN, 'x-forwarded-for': xff },
  body: { username: 'kasir', password: 'wrong' },
})

test('BE-002 TRUST_PROXY=1: the spoofable leftmost XFF entry is ignored, the rightmost one is req.ip', async () => {
  await withEnv({
    NODE_ENV: 'production',
    CORS_ORIGIN: PAGES_ORIGIN,
    COOKIE_SAME_SITE: 'none',
    COOKIE_SECURE: 'true',
    TRUST_PROXY: '1',
  }, async () => {
    await withServer(async ({ api, db }) => {
      for (let i = 1; i <= 5; i++) {
        const r = await failedLogin(api, `1.2.3.${i}, ${XFF_RIGHT}`)
        assert.equal(r.status, 401, `attempt ${i} should be 401`)
      }
      // Same rightmost entry, DIFFERENT leftmost entry. If the leftmost one
      // were used for req.ip this would open a fresh bucket and answer 401.
      const sixth = await failedLogin(api, `5.6.7.8, ${XFF_RIGHT}`)
      assert.equal(sixth.status, 429, 'a rotated leftmost entry must not mint a new bucket')
      assert.equal(sixth.body.error.code, 'RATE_LIMITED')

      const ips = db.prepare('SELECT DISTINCT ip FROM login_attempts').all().map((r) => r.ip)
      assert.deepEqual(ips, [XFF_RIGHT], 'req.ip = the rightmost XFF entry (appended by Cloudflare)')
    })
  })
})

test('BE-002 TRUST_PROXY off: X-Forwarded-For is ignored, the socket IP is the bucket key', async () => {
  await withEnv({
    NODE_ENV: 'production',
    CORS_ORIGIN: PAGES_ORIGIN,
    COOKIE_SAME_SITE: 'none',
    COOKIE_SECURE: 'true',
    TRUST_PROXY: undefined,
  }, async () => {
    await withServer(async ({ api, db }) => {
      for (let i = 1; i <= 5; i++) {
        const r = await failedLogin(api, `10.0.0.${i}`)
        assert.equal(r.status, 401, `attempt ${i} should be 401`)
      }
      const sixth = await failedLogin(api, '10.0.0.99')
      assert.equal(sixth.status, 429, 'a fresh XFF must not mint a new bucket')

      const ips = db.prepare('SELECT DISTINCT ip FROM login_attempts').all().map((r) => r.ip)
      assert.equal(ips.length, 1, 'one bucket for every caller')
      assert.ok(!ips[0].startsWith('10.0.0.'), 'the socket address is used, not the spoofed XFF')
    })
  })
})

test('BE-002 TRUST_PROXY=1: X-Forwarded-Proto makes req.protocol https', async () => {
  await withEnv({
    NODE_ENV: 'production',
    CORS_ORIGIN: PAGES_ORIGIN,
    COOKIE_SAME_SITE: 'none',
    COOKIE_SECURE: 'true',
    TRUST_PROXY: '1',
  }, async () => {
    await withServer(async ({ base, api }) => {
      const res = await api('/api/auth/login', {
        method: 'POST',
        headers: { origin: base.replace('http://', 'https://'), 'x-forwarded-proto': 'https' },
        body: { username: ADMIN.username, password: ADMIN.password },
      })
      assert.equal(res.status, 200, 'the API own origin over https must stay CSRF-allowed')
    })
  })
})

test('BE-002 trustProxy() parses TRUST_PROXY as a hop count, never as trust-all', async () => {
  const hops = async (v) => withEnv({ TRUST_PROXY: v }, () => trustProxy())
  assert.equal(await hops('true'), 1, '"true" means 1 hop, not trust-all')
  assert.equal(await hops('1'), 1)
  assert.equal(await hops('2'), 2)
  assert.equal(await hops('false'), false)
  assert.equal(await hops('0'), false)
  assert.equal(await hops(undefined), false)
  assert.equal(await hops('bogus'), false)
})

test('BE-002 CSRF: a write without Origin but with Sec-Fetch-Site: cross-site is rejected', async () => {
  await withEnv({
    NODE_ENV: 'production',
    CORS_ORIGIN: PAGES_ORIGIN,
    COOKIE_SAME_SITE: 'none',
    COOKIE_SECURE: 'true',
  }, async () => {
    await withServer(async ({ api }) => {
      const crossSite = await api('/api/auth/login', {
        method: 'POST',
        headers: { 'sec-fetch-site': 'cross-site' },
        body: { username: ADMIN.username, password: ADMIN.password },
      })
      assert.equal(crossSite.status, 403)
      assert.equal(crossSite.body.error.code, 'CSRF_ORIGIN_MISMATCH')

      const sameOrigin = await api('/api/auth/login', {
        method: 'POST',
        headers: { 'sec-fetch-site': 'same-origin' },
        body: { username: ADMIN.username, password: ADMIN.password },
      })
      assert.equal(sameOrigin.status, 200, 'same-origin must pass')

      const noBrowserHeaders = await api('/api/auth/login', {
        method: 'POST',
        body: { username: ADMIN.username, password: ADMIN.password },
      })
      assert.equal(noBrowserHeaders.status, 200, 'non-browser clients send neither header')
    })
  })
})

// --- BE-004: HOST bind address + the honest TRUST_PROXY/LAN warning (NEW-2) --

test('BE-004 HOST: unset or blank => undefined (bind all interfaces), a value => that address', async () => {
  await withEnv({ HOST: undefined }, () => {
    assert.equal(host(), undefined, 'unset keeps the current default')
  })
  await withEnv({ HOST: '' }, () => {
    assert.equal(host(), undefined, 'a blank value keeps the current default')
  })
  await withEnv({ HOST: '127.0.0.1' }, () => {
    assert.equal(host(), '127.0.0.1')
  })
})

test('BE-004 TRUST_PROXY>0: the startup warning names both the LAN spoof vector and the HOST fix', async () => {
  await withEnv({ TRUST_PROXY: '0' }, () => {
    assert.equal(trustProxyLanWarning(), null, 'no warning when no proxy is trusted')
  })
  await withEnv({ TRUST_PROXY: undefined }, () => {
    assert.equal(trustProxyLanWarning(), null, 'no warning when TRUST_PROXY is unset')
  })

  for (const hops of ['1', '2']) {
    await withEnv({ TRUST_PROXY: hops }, () => {
      const warning = trustProxyLanWarning()
      assert.ok(warning, `a warning is required for TRUST_PROXY=${hops}`)
      // Vector 1: a direct LAN request can forge X-Forwarded-For.
      assert.match(warning, /X-Forwarded-For/)
      assert.match(warning, /LAN/)
      // Vector 2: the fix — bind to loopback.
      assert.match(warning, /HOST=127\.0\.0\.1/)
      assert.match(warning, /Cloudflare Tunnel/)
      // No secret, no empty advice.
      assert.ok(warning.length > 80, 'the warning must be explicit')
    })
  }
})
