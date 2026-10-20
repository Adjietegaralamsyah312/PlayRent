# RV-001 — Security & Code Review: PlayRent backend

**Reviewer:** Code Reviewer / QA (adversarial pass)
**Scope:** `server/src/**` (auth/guards, SQLi, XSS, money path, disclosure, hygiene) + `server/schema.sql` + `web/src` (XSS sinks). Read-only — nothing under review was modified.
**Method:** static review **plus** a runnable adversarial probe. Every claim below is backed by an observed status code / stored row, not by reading alone.

## How to reproduce

```sh
cd server
node tools/security-probe.mjs   # 36 checks → prints [PASS]/[FAIL] + VERDICT
npm test                        # 32/32 green (28 at RV-001), probe NOT collected
```

The probe lives in `server/tools/` (not `server/test/`) on purpose: `node --test` with no
arguments discovers the whole `test/` dir, so anything inside it is collected and counted as a
subtest even if it skips itself. Verified: `npm test` = 32 tests (28 at RV-001), no probe line.

## Verdict: **PASS** — 0 blockers, 4 majors, 0 minors (36 checks)

> **Resolved in RV-002:** all 4 majors are FIXED and the probe defect that pinned AUTH-10 to
> `ok=false` is corrected. Current verdict: **PASS, 0 blockers, 0 majors, 0 minors** (see
> “Re-verification (RV-002)” at the bottom).

No authentication bypass, no SQL injection, no stored XSS, no client-controllable money, no
secret/stack-trace disclosure. The four majors are privilege-safety and rate-limit robustness
issues that need an admin session (four eyes) to exploit — not cashier/anonymous reachable.

## Findings

| ID | Sev | File:line | Issue | Observed proof | Fix |
|----|-----|-----------|-------|----------------|-----|
| AUTH-4 | major | `routes/users.js:63-90` | `PATCH /users/:id` has no last-admin guard. `DELETE` (`:92-99`) blocks `CANNOT_DELETE_SELF` + `LAST_ADMIN`; `PATCH` allows `role` change freely. | `PATCH {role:'cashier'}` on the only admin → **200**, stored `role=cashier`; the demoter's very next admin request → **403** (immediate self-lockout). | Mirror the DELETE guards in PATCH: reject `role` off admin or `isActive:false` when `activeAdmins(db) <= 1`. |
| AUTH-5 | major | `routes/users.js:63-90` | Same route lets the last admin set `isActive:false` on itself. `DELETE` blocks self; `PATCH` does not. | `PATCH {isActive:false}` on the only admin → **200**, active admins = **0**; nobody can log in as admin afterwards. | Same guard as AUTH-4 for the `isActive` field. |
| AUTH-10 | major | `routes/auth.js:12` | Rate-limit key IP is the caller-supplied `X-Forwarded-For` first hop. Attacker controls it. | 8 failed logins, each a fresh `X-Forwarded-For` → **0×429**. | Key on `req.socket.remoteAddress`, or trust XFF only via `app.set('trust proxy', <n>)` behind a known proxy. |
| AUTH-11 | major | `routes/auth.js:28-38` | The other half of the rate-limit key is the literal submitted `username`, so case/whitespace variance makes a fresh bucket. | `'Kasir'` → 401, `'kasir '` → 401 (401, not 429, = new bucket each time). | Normalise (trim + lowercase) before keying and before lookup, or key on the resolved user id. |

**Minors: none found.**
**Notes (not findings):** `csrfGuard` (`lib/auth.js:123`) skips Origin-less requests by design —
acceptable because `SameSite=Lax` is the primary control and the API is same-origin for the SPA;
add a double-submit token only if a cross-site client is ever introduced. No `.gitignore` exists at
repo/`server`/`web` root (report only — not created here). Demo credentials appear only in
`test/helpers.js`.

## Route → guard matrix (verified live, AUTH-1/AUTH-2/AUTH-3)

| Route group | Anonymous | Cashier | Admin |
|---|---|---|---|
| `POST /api/auth/login` | public | — | — |
| `/api/auth/{logout,me,change-password}` | 401 | ok | ok |
| `/api/consoles` read | 401 | ok | ok |
| `POST/PATCH/DELETE /api/consoles` | 401 | 403 | ok |
| `/api/games` read / write | 401 / 401 | ok / 403 | ok / ok |
| `/api/sessions` read, start, extend, finish | 401 | ok | ok |
| `POST /api/sessions/:id/void` | 401 | 403 | ok |
| `/api/transactions` read, finish, receipt | 401 | ok | ok |
| `POST /api/transactions/:id/void` | 401 | 403 | ok |
| `/api/reports/*`, `/api/dashboard` | 401 | ok | ok |
| `/api/settings` read / write | 401 / 401 | ok / 403 | ok / ok |
| `/api/users/*` (whole router) | 401 | 403 | ok (minus AUTH-4/5) |
| unknown route | 404 envelope | 404 | 404 |

## Tested and holds

- **Injection:** `q`/`status`/`from`/`sort`/`order` payloads inert; row counts unchanged; no user
  string reaches `prepare`/`exec` as SQL (INJ-1, INJ-2). Mass assignment blocked: `role`, `isActive`,
  `id`, `total`, `rateSnapshot`, `price`, `hourlyRate` on create → 400, nothing stored (INJ-3, INJ-4).
- **Auth/session:** token stored as `sha256` only and looked up by hash (AUTH-7); logout deletes the
  row, replay → 401 (AUTH-6); expired → 401 `SESSION_EXPIRED` + row pruned (AUTH-8); cookie is
  httpOnly + `SameSite=Lax` + `Secure` when `NODE_ENV=production` (AUTH-14).
- **XSS:** receipt HTML escapes `< > & "` in business & customer names → `&lt;script&gt;alert(1)&lt;/script&gt;` (XSS-1);
  no `dangerouslySetInnerHTML`/`innerHTML` anywhere in `web/src` (XSS-2).
- **Money:** client-sent `total`/`subtotal`/negative `amountPaid`/negative `extraCharge`/`durationMinutes`/
  `overtimeMinutes` all rejected, nothing persisted (MONEY-1); `discount:999999` clamps to subtotal and
  total never goes negative (MONEY-2); cashier cannot apply discount/extraCharge (MONEY-3); cash
  underpay rejected (MONEY-4).
- **Concurrency (sync `DatabaseSync` + one tx):** 5 concurrent starts on one unit → exactly one 201,
  four 409 (MONEY-5); double finish → one 201 one 409, no double charge (MONEY-6); two concurrent
  finishes mint distinct TRX numbers, row count = distinct count (MONEY-7).
- **Reports:** voided transaction leaves revenue unchanged and increments `voidedCount` (MONEY-8);
  a 23:30 Jakarta close (16:30Z) lands on the 19th, not the 20th (MONEY-9).
- **Disclosure:** unexpected error → generic 500 with no stack/path/SQL (DISC-1); malformed JSON → 400
  `VALIDATION_ERROR` (DISC-2); unknown route → 404 envelope (DISC-3); CORS is not `*` + credentials
  (DISC-4); foreign-Origin write → 403 `CSRF_ORIGIN_MISMATCH` (DISC-5). `password_hash`/`password_salt`
  never appear in any response (HYG-1); login failure body is generic and identical for bad user vs bad
  password (HYG-2, AUTH-13).

## Verification status

`verified` — probe executed end-to-end (36 checks) at RV-001 and `npm test` was 28/28 green then.
Critical/high issues in this project's rubric = 0. The 4 majors were fixed and re-verified in RV-002
(`npm test` now 32/32).

---

## Re-verification (RV-002) — post-fix

**Verdict: PASS — 0 blockers, 0 majors, 0 minors (36 probe checks, 32/32 tests).**

No file under `server/src/**` was edited in this pass. The only edits were `server/tools/security-probe.mjs`
(AUTH-10 assertion) and this report.

**Probe tally:** RV-001 = `blockers=0 majors=4 minors=0`; after fix = `blockers=0 majors=0 minors=0 total=36`,
`VERDICT: PASS`. **`cd server && npm test`** = `tests 32 · pass 32 · fail 0`. The four regressions are in
`test/auth.test.js`: AUTH-4 (:89), AUTH-5 (:103), AUTH-10 (:115), AUTH-11 (:127). Probe still lives in
`tools/`, so `node --test` does not collect it (32, not 33).

| ID | Status | Proof (observed, not inferred) |
|----|--------|-------------------------------|
| AUTH-4 | **FIXED ✅** | `PATCH {role:'cashier'}` on the only admin → **409 `CANNOT_DELETE_SELF`**; stored `role=admin`; active admins stays 1; the caller's next `GET /users` → **200** (no self-lockout). |
| AUTH-5 | **FIXED ✅** | `PATCH {isActive:false}` on self → **409 `CANNOT_DELETE_SELF`**; `is_active` stays 1; active admins stays 1. |
| AUTH-10 | **FIXED ✅** | Default (unset) `TRUST_PROXY`: 8 failed logins on a fresh username, each a different `X-Forwarded-For` → 429 (socket IP used). `TRUST_PROXY=true`: same XFF ×6 → `401,401,401,401,401,429`; a different XFF → 401; exhausted XFF → 429. `config.js:26` / `app.js:17` / `.env.example:7` all wired. |
| AUTH-11 | **FIXED ✅** | After 5 failures on `kasir`, `'Kasir'` → **429** and `'kasir '` → **429**; `login_attempts` distinct keys = `['kasir']`. Credentials remain exact: `'Admin'`+correct pw → **401**, `'admin '` → **401**, `'admin'` → **200**. |

**Probe defect fixed:** AUTH-10 passed a literal `ok=false`; it now asserts the observed `spoofLimited`
result (and uses a fresh username so the check is not confounded by AUTH-9's already-full bucket).
Structure and output format are otherwise unchanged. Probe-precision note (not a code finding): AUTH-12's
`holds` proof (`'Kasir' → 429`) is the limiter firing, not a lookup proof; case-sensitivity was proven
separately above.

**Fix-pass regression checks (all observed):**
- Non-last admin can still be demoted: with 2 active admins, `PATCH {role:'cashier'}` on the other → **200**,
  stored `role=cashier`, active admins 2→1.
- Admin can still deactivate an ordinary cashier → **200**, `is_active=0`; reactivate → **200**.
- Transaction guard rolls back cleanly: rejected self-demote with `{role:'cashier', fullName:'…'}` → **409**
  and `full_name` unchanged; no half-applied PATCH.
- Concurrent cross-demotion of two admins (`Promise.all`) → **200/403**, `activeAdmins=1` — no deadlock,
  no zero-admin state (second caller is already a cashier, so `requireRole` 403s).

**New findings from the fix pass: none.** Pre-existing operational note (documented, no action):
`TRUST_PROXY=true` is only safe behind a proxy that overwrites `X-Forwarded-For`; set on a directly
exposed server it re-opens the AUTH-10 spoof.

**Verification status: `verified`.**

---

# RV-003 — Security review of the new auth surface & role model

**Reviewer:** Code Reviewer / QA (adversarial pass)
**Scope:** the role-model rewrite (`superadmin`/`user`), the new public `POST /api/auth/register`,
`PATCH /api/auth/profile`, `requireSuperAdmin` enforcement across every router, `bookings.customer_user_id`
ownership, `lib/audit.js` sanitisation, the three new CLIs (`admin-bootstrap`, `backup`, `restore`),
DB schema v2, and the frontend's role handling. Everything below is backed by an observed
status code, a stored row, or a live request against a **copy** of the dev DB
(`server/data/playrent.db` was never written to).

**Files I changed:** `server/tools/security-probe.mjs` (my probe — new RV-003 section, one date-dependent
check fixed) and this report. **No file under `server/src/**` or `web/src/**` was modified.**

## Verdict: **FAIL** — 0 blockers, 5 majors, 2 minors (69 probe checks, 63/63 tests)

No privilege escalation, no IDOR, no customer-data leak, no inactive-account login. The five majors are
**real control gaps that a customer can trigger on their own booking** and a **session-revocation gap**
that plan.md §4.3 explicitly asked for. They must be fixed before merge.

```sh
cd server
npm test                    # tests 63 · pass 63 · fail 0
node tools/security-probe.mjs   # total=69 · blockers=0 · majors=5 · minors=1 · VERDICT: FAIL
```

### Findings

| ID | Sev | File:line | Issue | Proof (observed) | Impact | Status |
|----|-----|-----------|-------|------------------|--------|--------|
| SES-4 | major | `server/src/routes/users.js:87` | `PATCH /api/users/:id {isActive:false}` deactivates the account but **does not revoke its sessions** — `DELETE` at `:126` does (`revokeAllForUser`). | Probe SES-4: rows before PATCH = **1** → PATCH → **200** → rows after PATCH = **1**. `DELETE` on the same account → rows = **0**. | Deactivation is enforced only by the `is_active` check, not by revoking the token. | OPEN |
| SES-5 | major | `server/src/routes/users.js:87` | Re-activating a deactivated account **resurrects** a session token minted before the deactivation — no login needed. | Probe SES-5: `PATCH {isActive:true}` → **200**; replay of the pre-deactivation cookie → **200 `role=user`**. | Anyone holding a token from before the deactivation walks back in the moment the account is reactivated. | OPEN |
| SES-6 | major | `server/src/db.js:40-87` | The v2 migration demotes `cashier` → `user` + `is_active=0` but **does not delete that account's `auth_sessions` rows** → plan.md §4.3 "Cabut sesi aktif" is not met at the data level. | Probe SES-6 (real v1 DB → `migrate()`): `kasir` row = `role=user, is_active=0` but **leftover session rows = 1**. Dev DB still holds `auth_sessions` id=1 and id=3 → `user_id=2` (`kasir`). | The legacy cashier's tokens survive; they are rejected today only by `is_active=0` (SES-1 proves the differential), so they revive on re-activation. | OPEN |
| IDR-9 | major | `server/src/routes/bookings.js:191` | A customer can **move their own booking onto a console the operator deactivated**. POST filters `is_active = 1` (`:136`); PATCH selects the console without that filter. | Probe IDR-9: POST on the dead console → **404 `CONSOLE_NOT_FOUND`**; PATCH the same booking → **200**, `bookings.console_id` = the dead console. | The operator's "unit out of service" decision is bypassed by the customer; `estimated_cost` is recomputed at that unit's rate. | OPEN |
| IDR-10 | major | `server/src/routes/bookings.js:186-197` | A customer can **shorten a booking below the configured minimum duration**. `validateDuration()` is called on POST (`:134`) but never on PATCH. | Probe IDR-10: `min_duration_minutes = 30`; `PATCH {durationMinutes:5}` → **200**, stored `duration_minutes = 5`. | The shop's minimum-duration rule is bypassable by an untrusted role. | OPEN |
| LOG-3 | minor | `server/src/routes/auth.js:94` | Login leaks **whether a username exists** through response time: `verifyPassword` (scrypt ≈ 120 ms) is skipped entirely when the user is not found, so the code comment "no user enumeration" only holds for the body. | Probe LOG-3: known username median **120.8 ms** vs unknown **7.7 ms** = **15.8×** (body byte-identical, LOG-1). | Username enumeration of the customer base. Mitigated: the public register already answers 409 for a taken username. Fix: verify against a dummy hash when the user is missing. | OPEN |
| HYG-3 | minor | `server/src/routes/index.js:28` | `GET /api/health` is public and returns the **absolute DB filesystem path**. | `{"success":true,"data":{"status":"ok","version":"1.0.0","db":{"ok":true,"path":"/…/server/data/playrent.db"},…}}` — no cookie. | Info disclosure (paths/usernames of the host). Fix: return only `db.ok`. | OPEN |

Also noted, **not** counted as findings: the password policy is length-only (min 8, no complexity) —
`aaaaaaaa` is accepted (probe REG-3 asserts only the length rule); and `logAudit` sanitises `meta` but not
`description`, which may carry user-controlled text (booking name, cancel reason). No `logAudit` call site
passes a raw request body — all 29 call sites use field-limited objects, and the new `users.js` call records
`credentialReset: true` instead of the password.

### Verified safe (with the method used)

- **No role escalation through the public register.** 27 body variants (`role`, `role[]`, `is_admin`,
  `isAdmin`, `role_id`, `SUPERADMIN`, ` superadmin `, `Role`, `ro\u006ce`, `rôle`, `role:null/true/0`,
  `{$ne:"user"}`, `__proto__`, `constructor.prototype`, nested `extra.role`, duplicate keys, raw-JSON
  forms) → **every one 400**, and **no `esc*` row exists** (probe REG-1). A valid registration always
  yields `role='user', is_active=1` and **sets no cookie** (REG-2). `registerSchema` is `.strict()` and the
  INSERT hardcodes `'user'` (`routes/auth.js:70-74`).
- **No escalation through the profile.** `PATCH /auth/profile` with `role` / `isActive` / `id` / `username` /
  `password` → **400** each; the row is unchanged (PRO-1). `profileSchema` is `.strict()`.
- **No escalation through `/api/users`.** `role=user` gets **403** on GET/POST/PATCH/DELETE `/api/users`,
  and the superadmin row is untouched (USR-1). `PATCH /users/:id {role:'superadmin'}` → 403.
- **No forged header or cookie changes the role.** `X-Role`, `X-User-Id`, `X-Userid`, `X-Admin`,
  `X-Forwarded-User`, `X-CSRF-Token`, `X-Real-IP`, `X-Forwarded-For`, `Authorization: Bearer …` → all
  **403** (HDR-1). Tampered/empty/garbage/`pr_session=admin` cookies → all **401** (HDR-2).
- **The frontend never reads a role from storage.** `grep` over `web/src` finds no `localStorage`/
  `sessionStorage` holding auth or role — only `sound.ts` (mute) and `Bookings.tsx` (view mode). The
  `user` object comes from `/api/auth/me` / the login response (`web/src/lib/auth.tsx:22-29`). Route guards
  (`App.tsx:65-90`) are cosmetic; the server is the enforcement point.
- **Booking ownership is server-side.** `customer_user_id` never comes from the body or query:
  POST with `customer_user_id` → **400** (IDR-2); PATCH with `customer_user_id` → **400** (IDR-8);
  `GET /api/bookings?customer_user_id=1` returns **only the caller's own** booking (IDR-4); the owner is
  `req.user.id` (`bookings.js:144`, probe IDR-3). Another customer's booking → **404** on GET / PATCH /
  cancel (IDR-5 — existence never confirmed); `check-in` → **403** (IDR-6); `status` / `discount` /
  `bookingDate` on a customer's own booking → **400** (IDR-7).
- **No customer data leaks to `role=user`.** Checked response bodies of `/api/consoles`,
  `/api/consoles/:id`, `/api/settings`, `/api/bookings`, `/api/games`, `/api/packages`: no
  `conditionNote`, `currentSession`, `payment_methods`, `overtimeRatePerHour`, `overtimeGraceMinutes`,
  `password_hash`, `password_salt`, no `customer_user_id`, and no other customer's name (DAT-1). Console
  detail exposes only `isBusy` (DAT-2); settings expose the renter subset only (DAT-3).
- **Inactive accounts really are locked out.** An unexpired session of an `is_active=0` account → **401**;
  the same token → **200** the moment `is_active=1` (differential proof, SES-1). Login with the deactivated
  account's **correct** password → **401 `INVALID_CREDENTIALS`** (LOG-2). Wrong password / deactivated /
  unknown user return a **byte-identical** body (LOG-1).
- **Perimeter intact.** All 48 protected endpoints answer **401** without a cookie (PER-1); every
  operator-only read answers **403** for `role=user` (OPS-1). No endpoint leaks customer data after the
  role change.
- **Registration cannot be squatted or used to enumerate roles.** A taken username — active *or*
  deactivated — → **409 `DUPLICATE_USERNAME`** (REG-4); the rate limit is exactly **10 / 15 min / IP** and
  a fresh `X-Forwarded-For` does not mint a bucket (REG-0, `TRUST_PROXY` off by default).
- **Injection-safe.** `'`/UNION/DROP payloads in `phone` and `fullName` are stored as literal text; the
  `users` table survives; every statement is parameterised (SQL-1).
- **CLI bootstrap is not reachable over HTTP** (no route imports it), prints no password or hash
  (verified on stdout), can only ever create `role='superadmin'` (hard-coded), and `--force` resets the
  password **and** calls `revokeAllForUser` — it writes an `admin_password_reset` audit row.
- **Backup/restore refuse bad input.** Restore rejects a future schema (`user_version=99` → *"lebih baru
  dari versi skema build ini (2)"*), a corrupt file and a plain-text file (*"file is not a database"*) with
  the live DB untouched; it takes a pre-restore snapshot first, demands the literal word `RESTORE`
  (`n` / `yes` → *"DIBATALKAN — konfirmasi tidak cocok"*, DB untouched), and clears the stale `-wal`/`-shm`
  after the atomic rename (only `live.db` remains). Backup uses the `node:sqlite` backup API, validates
  `integrity_check` + `foreign_key_check` + required tables, deletes a failed snapshot, and logs **counts
  only** — no names, phones, hashes or tokens.
- **No regression vs RV-002.** All 36 original probe checks still pass; the role rewrite did not break the
  money path, CSRF, XSS escaping, disclosure envelopes or the concurrency guarantees.

### Delegation plan (for the Leader)

| Fix | Owner | Where |
|-----|-------|-------|
| SES-4 + SES-5 | `@node-developer` | `server/src/routes/users.js` — call `revokeAllForUser(db, id)` when `isActive` flips to `false` (and on `role` demotion); keep `DELETE` behaviour. |
| SES-6 | `@node-developer` | `server/src/db.js` `rebuildUsers()` — inside the v2 step, `DELETE FROM auth_sessions WHERE user_id IN (<demoted cashier ids>)`. Note the migration is already shipped on the dev DB: add a v3 step that purges sessions of `is_active=0` accounts rather than editing v2. |
| IDR-9 | `@node-developer` | `server/src/routes/bookings.js:191` — select the console with `AND is_active = 1`, same as POST (`:136`). |
| IDR-10 | `@node-developer` | `server/src/routes/bookings.js` — call `validateDuration(durationMinutes, rules)` in the PATCH `scheduleChanged` branch. |
| LOG-3 | `@node-developer` | `server/src/routes/auth.js:94` — when the user is missing/inactive, still run one scrypt against a dummy hash+salt. |
| HYG-3 | `@node-developer` | `server/src/routes/index.js:28` — return `db: { ok }` only. |

Probe IDs to re-run afterwards: `SES-4`, `SES-5`, `SES-6`, `IDR-9`, `IDR-10`, `LOG-3` (all currently FAIL
by design — they are the regression tests for the fixes above). `node tools/security-probe.mjs` returns
`VERDICT: PASS` only when `blockers === 0 && majors === 0`; I made the verdict honest about majors in
RV-003 (it used to ignore them).

### Probe changes made in RV-003

- New section 7 (`REG-*`, `LOG-*`, `SES-*`, `HDR-*`, `PRO-*`, `USR-*`, `IDR-*`, `DAT-*`, `PER-*`, `OPS-*`,
  `SQL-*`) — 33 new checks on the role model, registration, ownership and disclosure.
- **Defect fixed:** MONEY-9 hard-coded `2026-10-19/20`, which collided with the transactions the probe had
  just created, so it failed for a reason unrelated to the timezone. It now uses a fixed quiet day
  (`2019-03-15`) and asserts exact amounts. It passes again.
- The verdict line now counts majors.

**Verification status: `verified`** (probe executed end-to-end, 69 checks; `npm test` 63/63 green;
CLI restore/backup exercised against throwaway databases; live requests against a copy of the dev DB).
**Not verified:** nothing in the RV-003 scope was left unexercised. Production-only behaviour
(`NODE_ENV=production` cookie flag) is covered by AUTH-14's child-process check, not by a live TLS server.
