# PlayRent — API Contract (frozen)

Base path `/api`. All responses use the envelope in `ARCHITECTURE.md`.
Auth is a cookie (`pr_session`, httpOnly, SameSite=Lax, path=/). Not a Bearer token.

Legend: 🔓 public · 👤 logged-in customer (`user`) · 🔑 Super Admin only (`superadmin`)

**Roles.** Exactly two: `superadmin` and `user`. There is no `cashier` role — it was removed
from the code and from the schema (`users.role CHECK (role IN ('superadmin','user'))`).
The role is always decided by the server, never by a request body.

**Enforcement.** `requireAuth` + `requireSuperAdmin` run in the router, so a customer
requesting an operator endpoint gets `403 FORBIDDEN` (not `404`, not a hidden button).
Ownership violations on bookings answer **`404`** so the existence of someone else's
booking is never confirmed.

---

## Access matrix (per endpoint group)

| Endpoint group | 🔓 anon | 👤 customer | 🔑 Super Admin | Notes |
| --- | --- | --- | --- | --- |
| `GET /health` | ✅ | ✅ | ✅ | Public. `db:{ok}` only — no database location |
| `POST /auth/register` | ✅ | ✅ | ✅ | Public. No session, no cookie |
| `POST /auth/login` | ✅ | ✅ | ✅ | |
| `POST /auth/logout` | ❌ 401 | ✅ | ✅ | Needs a valid session |
| `GET /auth/me` | ❌ 401 | ✅ | ✅ | |
| `PATCH /auth/profile` | ❌ 401 | ✅ (own) | ✅ (own) | `fullName`, `phone` only |
| `POST /auth/change-password` | ❌ 401 | ✅ (own) | ✅ (own) | Revokes the account's other sessions |
| `GET /users*` | ❌ 401 | ❌ 403 | ✅ | Whole group is Super Admin only |
| `POST/PATCH/DELETE /users*` | ❌ 401 | ❌ 403 | ✅ | |
| `GET /consoles`, `GET /consoles/:id` | ❌ 401 | ✅ **sanitized** | ✅ | Customer sees no `conditionNote`, no `currentSession` |
| `POST/PATCH/DELETE /consoles*` | ❌ 401 | ❌ 403 | ✅ | |
| `GET /sessions*` | ❌ 401 | ❌ 403 | ✅ | Whole group is operator only — money path |
| `POST /sessions*` (quote, extend, finish, void) | ❌ 401 | ❌ 403 | ✅ | |
| `GET /bookings`, `GET /bookings/:id` | ❌ 401 | ✅ (own only) | ✅ (all) | Another customer's booking → `404` |
| `POST /bookings` | ❌ 401 | ✅ (own) | ✅ | `customer_user_id` comes from the session |
| `PATCH /bookings/:id` | ❌ 401 | ✅ (own, limited fields) | ✅ | Customer may not set `status` / `discount` |
| `POST /bookings/:id/cancel` | ❌ 401 | ✅ (own) | ✅ | Another customer's booking → `404` |
| `POST /bookings/:id/check-in` | ❌ 401 | ❌ **403** | ✅ | Starting a rental session is an operator action |
| `GET /transactions*` | ❌ 401 | ❌ 403 | ✅ | Whole group is operator only |
| `POST /transactions/:id/void` | ❌ 401 | ❌ 403 | ✅ | |
| `GET /dashboard*` | ❌ 401 | ❌ 403 | ✅ | |
| `GET /games`, `GET /packages` | ❌ 401 | ✅ | ✅ | Public catalogue reads |
| `POST/PATCH/DELETE /games*`, `/packages*` | ❌ 401 | ❌ 403 | ✅ | |
| `GET /settings` | ❌ 401 | ✅ (subset) | ✅ (full) | Customer gets no `payments`, no overtime tariff |
| `PUT /settings` | ❌ 401 | ❌ 403 | ✅ | |

Status codes on a refused request: **401** when there is no valid session, **403** when the
session is valid but the role is too low, **404** when the resource exists but belongs to
someone else.

---

## Auth — `/api/auth`

| # | M | Endpoint | Role | Body | Returns |
| --- | --- | --- | --- | --- | --- |
| A0 | POST | `/auth/register` | 🔓 | `{username, fullName, phone?, password}` | `201 {user}` — **no auto-login, no cookie**. `400 VALIDATION_ERROR` (bad shape, or any unknown field such as `role`), `409 DUPLICATE_USERNAME`, `429 RATE_LIMITED` after 10 registrations / 15 min / IP |
| A1 | POST | `/auth/login` | 🔓 | `{username, password}` | `{user}` + sets cookie. `401 INVALID_CREDENTIALS` on bad creds **or on a deactivated account** (identical response — no user enumeration). `429 RATE_LIMITED` after 5 failures / 15 min per username+IP |
| A2 | POST | `/auth/logout` | 👤 | — | `{ok:true}`, clears cookie + revokes session row |
| A3 | GET | `/auth/me` | 👤 | — | `{user}`. `401` if session missing/expired |
| A4 | POST | `/auth/change-password` | 👤 | `{currentPassword, newPassword}` | `{ok:true}`, revokes all other sessions of that user. `400 INVALID_CREDENTIALS` if the current password is wrong |
| A5 | PATCH | `/auth/profile` | 👤 | `{fullName?, phone?}` | `{user}` — own profile only. Any other field (`role`, `isActive`, `username`, `password`, `id`) → `400` |

`user` = `{id, username, fullName, role: 'superadmin'|'user', isActive, phone, createdAt}` — **never** `password_hash`.

**Registration rules (A0).** `username` matches `^[a-z0-9._]{3,32}$`; `fullName` 2–80 chars;
`phone` optional, ≤ 40 chars; `password` ≥ 8 chars. The body is validated with `.strict()`,
so `role` (or any other unknown key) is rejected with `400` — a client can never ask for a
privileged account. The new row is always `role = 'user'`, `is_active = 1`, and is written to
`audit_logs` as `user_registered`. There is **no** public route to `superadmin`: a customer is
promoted either by an existing Super Admin (`PATCH /users/:id`) or by the local
`npm run admin:bootstrap` CLI.

Session TTL: **12 hours** sliding (each authenticated request extends `expires_at`). Expired sessions return `401 SESSION_EXPIRED`. Sessions of a deactivated account are rejected at runtime and deleted by migration v3.

---

## Users — `/api/users` (all 🔑)

| # | M | Endpoint | Body / Query | Returns |
| --- | --- | --- | --- | --- |
| U1 | GET | `/users` | `?q&role&isActive` | `{items}` |
| U2 | POST | `/users` | `{username, fullName, password, role}` | `201 {user}` |
| U3 | PATCH | `/users/:id` | partial `{fullName?, role?, isActive?, password?}` | `{user}` |
| U4 | DELETE | `/users/:id` | — | soft deactivate. `409 CANNOT_DELETE_SELF` / `409 LAST_ADMIN` |

`role` ∈ `superadmin | user`. A customer gets `403` on every endpoint in this group.
Changing an account's role, active flag, or password **revokes all of that account's
sessions**.

---

## Consoles (PS units) — `/api/consoles`

| # | M | Endpoint | Role | Body / Query | Returns |
| --- | --- | --- | --- | --- | --- |
| C1 | GET | `/consoles` | 👤 | `?status&type&roomType&q&includeInactive` | `{items}` — **sanitized for a customer** (see below) |
| C2 | GET | `/consoles/:id` | 👤 | — | `{console}` + `currentSession` (nullable) — **for a customer: `{console}` (sanitized) + `isBusy: boolean`, no `currentSession`** |
| C3 | POST | `/consoles` | 🔑 | `{code, consoleType:'PS4'\|'PS5', roomType:'Reguler'\|'VIP', controllers, hourlyRate, status, conditionNote}` | `201 {console}`. `409 DUPLICATE_CODE` |
| C4 | PATCH | `/consoles/:id` | 🔑 | partial | `{console}`. Reject `status:'available'` if an active session exists → `409 UNIT_OCCUPIED` |
| C5 | DELETE | `/consoles/:id` | 🔑 | — | soft deactivate. `409 UNIT_OCCUPIED` if active session |

`console` = `{id, code, consoleType, roomType, controllers, hourlyRate, status, conditionNote, isActive, createdAt}`

**Sanitized shape for a customer** (`role = 'user'`): the same fields **minus
`conditionNote`** (internal maintenance note) and **minus `createdAt`**. On `C2` the
`currentSession` key is not sent at all — a customer only learns whether the unit is busy
(`isBusy`), never who is playing on it.

`status` ∈ `available | in_use | reserved | maintenance` (Indonesian labels live in the frontend only).

---

## Live rental sessions — `/api/sessions` (all 🔑)

| # | M | Endpoint | Role | Body / Query | Returns |
| --- | --- | --- | --- | --- | --- |
| S1 | POST | `/sessions/quote` | 🔑 | `{consoleId, durationMinutes, startedAt?, extraMinutes?}` | `{durationMinutes, billableMinutes, hourlyRate, subtotal, overtimeMinutes, overtimeAmount, discount, total, currency:'IDR'}` — **pure, no writes** |
| S2 | GET | `/sessions` | 🔑 | `?status=active\|overdue\|finished\|void&consoleId&from&to&q&page&limit` | `{items, meta}` |
| S3 | GET | `/sessions/active` | 🔑 | — | `{items}` each with `remainingSeconds` computed server-side (for pollers/fallback) |
| S4 | GET | `/sessions/:id` | 🔑 | — | `{session, console, transaction?}` |
| S5 | POST | `/sessions` | 🔑 | `{consoleId, customerName, customerContact?, durationMinutes, notes?, startedAt?}` | `201 {session}`. Server sets `ends_at = started_at + durationMinutes`, sets console `in_use`, writes `audit_logs`. `409 UNIT_OCCUPIED` if the unit already has an active session. `400 DURATION_BELOW_MINIMUM` |
| S6 | POST | `/sessions/:id/extend` | 🔑 | `{extraMinutes}` | `{session}` — pushes `ends_at` forward by `extraMinutes`, appends `extensions[]`. `409 SESSION_NOT_ACTIVE` |
| S7 | POST | `/sessions/:id/finish` | 🔑 | `{paymentMethod:'cash'\|'transfer'\|'qris', amountPaid, discount?, discountReason?, extraCharge?, notes?}` | `201 {transaction}` and frees the console. Computes **all** amounts server-side. `409 SESSION_ALREADY_FINISHED`. `400 INSUFFICIENT_PAYMENT` for cash. |
| S8 | POST | `/sessions/:id/void` | 🔑 | `{reason}` | `{session}` status `void`, console back to `available`. Reason recorded in `audit_logs`. |

The whole group is operator-only: a customer never sees the session board, the quotes, or
the money path (`403`).

`session` = `{id, consoleId, consoleCode, customerName, customerContact, status, startedAt, endsAt, plannedMinutes, billedMinutes, extensions:[{minutes, at, byUserId}], notes, rateSnapshot, createdBy, finishedAt, transactionId}`

- `status` ∈ `active | overdue | finished | void`. `overdue` is computed on read (`Date.now() > ends_at`), also persisted by the read path for reporting.
- `rateSnapshot` is the `hourlyRate` **at the moment the session started** — later setting changes must never rewrite it.
- Warning thresholds (`warnMinutes`, default `[10,5,1]`) come from `/settings`; the frontend computes which threshold has been crossed.

---

## Bookings — `/api/bookings`

| # | M | Endpoint | Role | Body / Query | Returns |
| --- | --- | --- | --- | --- | --- |
| B1 | GET | `/bookings` | 👤 | `?date=YYYY-MM-DD&from&to&status&consoleId&q` | `{items, meta}` — a customer gets **only their own** (`customer_user_id` is taken from the session, never from the query string) |
| B2 | GET | `/bookings/:id` | 👤 | — | `{booking}`. Another customer's booking → `404` |
| B3 | POST | `/bookings` | 👤 | `{consoleId, customerName, customerContact?, bookingDate, startTime:'HH:mm', durationMinutes, notes?, discount?}` | `201 {booking}`. `409 BOOKING_CONFLICT` with `details:[{conflictingBookingId, startTime, endTime}]`. A customer may not send `discount` → `400` |
| B4 | PATCH | `/bookings/:id` | 👤 | partial `{customerName?, contact?, bookingDate?, startTime?, durationMinutes?, status?, notes?, consoleId?}` | `{booking}`. Any schedule field change re-runs the conflict check. A customer may only change `customerName`, `customerContact`/`contact`, `consoleId`, `startTime`, `durationMinutes`, `notes`; `status` and `discount` are operator decisions → `400` |
| B5 | POST | `/bookings/:id/check-in` | 🔑 | `{durationMinutes?}` | `201 {session}` — creates a rental session and marks booking `checked_in`. `409 BOOKING_NOT_CONFIRMED` / `409 UNIT_OCCUPIED` |
| B6 | POST | `/bookings/:id/cancel` | 👤 | `{reason?}` | `{booking}` status `cancelled` — releases the time slot immediately. Another customer's booking → `404` |

`status` ∈ `pending | confirmed | checked_in | completed | cancelled`.

**Ownership rules.** A customer-created booking stores `customer_user_id = <session user id>`
and `created_by = <session user id>`; the client cannot inject either (a body carrying
`customer_user_id` is rejected with `400`). A customer reading or cancelling a booking that
is not theirs gets `404 BOOKING_NOT_FOUND` — never `403`, so the API does not confirm that
the booking exists.

**Conflict rule (must live in SQL, not JS):** for the same `console_id`, a `pending|confirmed` booking conflicts when
`newStart < existingEnd AND newEnd > existingStart` on the same date. Reuse `started_at`/`ends_at` epoch-ms columns
internally so the overlap test is pure integer arithmetic. `checked_in` bookings are excluded (they became sessions).
Cancelled bookings never occupy a slot.

**Auto-complete rule:** a `confirmed` booking whose window has fully passed is surfaced as `expired` in the UI
(computed field `isExpired: true`) and can be cancelled or completed by the operator. Never auto-delete.

---

## Transactions — `/api/transactions` (all 🔑)

| # | M | Endpoint | Role | Body / Query | Returns |
| --- | --- | --- | --- | --- | --- |
| T1 | GET | `/transactions` | 🔑 | `?from&to&method&status&q&page&limit` | `{items, meta, totals:{count, gross, paid, outstanding}}` |
| T2 | GET | `/transactions/:id` | 🔑 | — | `{transaction, items, session, cashier, console}` |
| T3 | POST | `/transactions/:id/void` | 🔑 | `{reason}` | `{transaction}` status `void`. Never deletes. Writes `audit_logs`. |
| T4 | GET | `/transactions/:id/receipt` | 🔑 | `?format=html` | **HTML** (not JSON) — self-contained printable receipt, `@page { size: 80mm auto }`, inline CSS, uses `business_settings`. Auto-triggers `window.print()` behind a `?print=1` flag only. |

`transaction` = `{id, number, sessionId, consoleCode, customerName, cashierName, createdAt, subtotal, extraCharge, discount, discountReason, total, paymentMethod, paymentStatus:'paid'|'unpaid'|'void', amountPaid, changeDue, status:'completed'|'void', voidReason, voidBy, voidedAt}`

> `cashierName` / `transactions.cashier_id` are **historical DB column names** kept for
> backwards compatibility with existing rows. They are not a role: no account has role
> `cashier` any more, and the field holds the name snapshot of whoever recorded the
> transaction.

`number` format: `TRX-YYYYMMDD-####` (daily sequence, generated inside the same DB transaction).

**Money stored as INTEGER rupiah.** No floats anywhere in the money path. `changeDue = amountPaid - total` (cash only, `0` otherwise, never negative → `400 INSUFFICIENT_PAYMENT`).

---

## Dashboard — `/api/dashboard` (all 🔑)

| # | M | Endpoint | Role | Returns |
| --- | --- | --- | --- | --- |
| D1 | GET | `/dashboard/summary` | 🔑 | `{units:{total,available,inUse,reserved,maintenance}, today:{sessions, revenue, transactions}, range:{revenueToday, revenueWeek, revenueMonth}}` |
| D2 | GET | `/dashboard/activity` | 🔑 | `{items:[{type:'session_started'\|'session_finished'\|'booking_created'\|'transaction_voided', at, description, actor, refId}]}` last 20, from `audit_logs` |
| D3 | GET | `/dashboard/ending-soon` | 🔑 | `{items:[{sessionId, consoleCode, customerName, endsAt, remainingSeconds, severity:'warn'\|'critical'\|'overdue'}]}` |
| D4 | GET | `/dashboard/revenue-chart` | 🔑 | `?from&to&groupBy=day\|week\|month` → `{buckets:[{label, revenue, transactions}]}` |
| D5 | GET | `/dashboard/busy-hours` | 🔑 | `?from&to` → `{hours:[{hour:0..23, sessions, revenue}]}` |

All numbers are `SELECT`ed from the DB. **Zero hardcoded figures.**

---

## Games — `/api/games`

| # | M | Endpoint | Role | Body / Query |
| --- | --- | --- | --- | --- |
| G1 | GET | `/games` | 👤 | `?platform&genre&q&includeInactive` |
| G2 | POST | `/games` | 🔑 | `{title, platform:'PS4'\|'PS5'\|'both', genre, recommendedControllers, availabilityNote, isActive}` |
| G3 | PATCH | `/games/:id` | 🔑 | partial |
| G4 | DELETE | `/games/:id` | 🔑 | soft deactivate |

---

## Reports — `/api/reports` (all 🔑)

| # | M | Endpoint | Role | Query | Returns |
| --- | --- | --- | --- | --- | --- |
| R1 | GET | `/reports/summary` | 🔑 | `?from&to` | `{revenueRecorded, revenueOutstanding, transactionCount, sessionsCount, totalMinutes, avgPerTransaction, voidedCount}`. **Recorded vs outstanding are separate fields — never merged.** |
| R2 | GET | `/reports/daily` | 🔑 | `?from&to` | `{items:[{date, revenue, transactions, sessions, minutes}]}` |
| R3 | GET | `/reports/weekly` | 🔑 | `?from&to` | same shape, ISO-week buckets labelled `2026-W42` |
| R4 | GET | `/reports/monthly` | 🔑 | `?from&to` | same shape, labelled `2026-10` |
| R5 | GET | `/reports/units` | 🔑 | `?from&to` | `{items:[{consoleId, code, consoleType, roomType, sessions, minutes, revenue, utilizationPct}]}` |
| R6 | GET | `/reports/payments` | 🔑 | `?from&to&method&status` | `{items, totals}` |
| R7 | GET | `/reports/export.csv` | 🔑 | `?type=sessions\|transactions\|units\|daily&from&to&…` | `text/csv; charset=utf-8`, BOM-prefixed so Excel reads UTF-8, filename `playrent-{type}-{from}-{to}.csv`. Columns fixed per `type` — see `csv.js`. |

`from`/`to` are **inclusive Jakarta-local dates** (`YYYY-MM-DD`) converted server-side to UTC instants for the query. If omitted: `from` = first day of current Jakarta month, `to` = today.

---

## Business settings — `/api/settings`

| # | M | Endpoint | Role | Body |
| --- | --- | --- | --- | --- |
| P1 | GET | `/settings` | 👤 | `{business:{name, address, phone, receiptFooter, taxNote}, rules:{minDurationMinutes, roundingMinutes, overtimeRatePerHour, overtimeGraceMinutes, defaultHourlyRate, warnMinutes:[10,5,1]}, payments:{methods:['cash','transfer','qris']}}` |
| P2 | PUT | `/settings` | 🔑 | merges the same shape. Writes `audit_logs` with a before/after diff. **Only affects future transactions** — active sessions keep their `rateSnapshot`. |
| P3 | GET | `/packages` | 👤 | `{items}` |
| P4 | POST | `/packages` | 🔑 | `{name, durationMinutes, price, consoleType:null\|'PS4'\|'PS5', isActive}` |
| P5 | PATCH | `/packages/:id` | 🔑 | partial |
| P6 | DELETE | `/packages/:id` | 🔑 | soft deactivate |

**Sanitized shape for a customer (P1).** The same `business` block, but `rules` is reduced to
`minDurationMinutes`, `roundingMinutes`, `defaultHourlyRate`, `warnMinutes` — and the whole
`payments` block is **omitted**. The overtime tariff and grace period are operator numbers,
and the accepted payment methods are not the renter's business.

---

## Health

`GET /api/health` 🔓 → `{status:'ok'|'degraded', version, db:{ok}, uptimeSeconds}`

The absolute location of the database file is **never** part of the response — the endpoint
is public and that location is host information. `db.ok` is enough for a health check.

---

## Pricing algorithm (single source of truth: `server/src/lib/pricing.js`)

```
billableMinutes = roundUp(durationMinutes, rules.roundingMinutes)   // default round to 15
if durationMinutes < rules.minDurationMinutes            -> 400 DURATION_BELOW_MINIMUM
subtotal        = ceil(billableMinutes / 60 * hourlyRate)
overtimeMinutes = max(0, actualMinutes - plannedMinutes - rules.overtimeGraceMinutes)
overtimeAmount  = ceil(overtimeMinutes / 60 * rules.overtimeRatePerHour)
discount        = request.discount (Super Admin only, capped at subtotal)
total           = max(0, subtotal + overtimeAmount + extraCharge - discount)
```

- `hourlyRate` = the console's `hourlyRate` **snapshotted at session start**.
- Rounding direction is always **up** (favours neither party ambiguously; documented in README).
- The frontend may call `/sessions/quote` on every keystroke; the server recomputes at `finish` and that value is authoritative.
- `pricing.js` must expose `quote({durationMinutes, actualMinutes, hourlyRate, rules, discount, extraCharge})` as a **pure function** with no DB access → directly unit-testable.
- A customer may not set a discount: `POST /bookings` with `discount` → `400`; `PATCH /bookings/:id` with `status` or `discount` → `400`.
