# PlayRent — Database Specification

Driver: `node:sqlite` (`DatabaseSync`), SQLite 3.53.4 bundled with Node 26.
No native dependency. Files: `server/src/schema.sql`, `server/src/db.js`, `server/src/seed.js`.

## Conventions

- **Money is `INTEGER` rupiah.** No floats anywhere in the money path — no `REAL`, no `NUMERIC`.
  `changeDue = amountPaid - total`, cash only, never negative.
- **Time is ISO-8601 UTC `TEXT`** (`new Date().toISOString()`). Never store local time.
  Jakarta-local presentation (`Asia/Jakarta`) happens at read time only, except
  `bookings.booking_date` / `bookings.start_time` which are Jakarta-local wall clock by design,
  with their UTC instants kept alongside in `started_at_epoch` / `ends_at_epoch`.
- **Boolean is `INTEGER` 0/1** with a `CHECK` so a stray `'true'` cannot enter.
- Soft delete only: `is_active` (consoles, users, games, packages) or `status` (transactions).

## Tables

| Table | Purpose | Key constraints |
| --- | --- | --- |
| `users` | Staff accounts. | `username` UNIQUE; `role CHECK IN ('superadmin','user')` (since migration v2); `phone` nullable; `password_hash`/`password_salt` NOT NULL (scrypt hex). Plaintext is never stored. |
| `auth_sessions` | Opaque session tokens behind the `pr_session` httpOnly cookie. | `token_hash` UNIQUE (sha256 of the raw token); FK `user_id` ON DELETE CASCADE; `expires_at` for the 12 h sliding TTL. |
| `login_attempts` | Rate-limit ledger. | 5 failures / 15 min per `username`+`ip` is a query over `(username, attempted_at)`. |
| `consoles` | PS units. | `code` UNIQUE; `console_type CHECK IN ('PS4','PS5')`; `status CHECK IN ('available','in_use','reserved','maintenance')`; `controllers >= 1`; `hourly_rate >= 0`. |
| `bookings` | Reservations. | `status CHECK IN ('pending','confirmed','checked_in','completed','cancelled')`; `duration_minutes > 0`; epoch columns are the conflict-test carrier; FK `session_id → rental_sessions` set on check-in; `customer_user_id → users(id)` nullable (account that made the booking, added in migration v2). |
| `rental_sessions` | Live timer + history. | `status CHECK IN ('active','overdue','finished','void')`; `planned_minutes > 0`; `rate_snapshot` freezes the hourly rate at start; `extensions_json` default `'[]'`. |
| `transactions` | Payments / receipts. | `number` UNIQUE (`TRX-YYYYMMDD-####`); `payment_method CHECK IN ('cash','transfer','qris')`; `payment_status CHECK IN ('paid','unpaid','void')`; `status CHECK IN ('completed','void')`. |
| `transaction_items` | Receipt line items. | `kind CHECK IN ('rental','overtime','extra','discount')`; FK `transaction_id` ON DELETE CASCADE. |
| `game_catalog` | Game library. | `platform CHECK IN ('PS4','PS5','both')`. |
| `business_settings` | Single row. | `id INTEGER PRIMARY KEY CHECK (id = 1)` — the CHECK physically forbids a second row. |
| `packages` | Duration bundles. | `duration_minutes > 0`; `price >= 0`; `console_type` nullable, CHECK `('PS4','PS5')` when set. |
| `audit_logs` | Operational trail for the dashboard activity feed. | `actor_id` FK nullable (system actions have no actor). |

## The two correctness guarantees

### 1. One live session per console — enforced by the DB, not by JS

```sql
CREATE UNIQUE INDEX IF NOT EXISTS ux_one_active_session_per_console
  ON rental_sessions(console_id) WHERE status IN ('active','overdue');
```

A partial unique index: it only covers rows that are `active` or `overdue`, so a console may hold
any number of `finished`/`void` rows but at most one live one. Two cashiers clicking "Mulai"
simultaneously cannot both win — the loser's INSERT fails inside the transaction.

**Exact error the app must catch** (verified, raw):

```
Error: UNIQUE constraint failed: rental_sessions.console_id
  code: ERR_SQLITE_ERROR   errcode: 2067   errstr: constraint failed
```

Map it: `errcode === 2067` on `rental_sessions` → **`409 UNIT_OCCUPIED`**.
(`SQLITE_CONSTRAINT_UNIQUE = 2067`; see also `SQLITE_CONSTRAINT_FOREIGNKEY = 787` → `409`/`400`.)

### 2. Booking overlap — pure integer arithmetic

Epoch-ms columns are filled at write time, so the conflict test never parses a string:

```sql
SELECT id, start_time, ends_at
FROM bookings
WHERE console_id = ?                 -- :consoleId
  AND status IN ('pending','confirmed')   -- checked_in became a session; cancelled frees the slot
  AND ? < ends_at_epoch              -- :newStartMs
  AND ? > started_at_epoch;          -- :newEndMs
```

Half-open interval: touching boundaries do **not** conflict. Verified behaviour —
same slot `1`, +30 min shift `1`, ends exactly 1 ms before `0`, starts exactly 1 ms after `0`,
different console `0`. On a hit return `409 BOOKING_CONFLICT` with
`details:[{conflictingBookingId, startTime, endTime}]`.

Independent of the index: `bookings(console_id, started_at_epoch, ends_at_epoch)` makes this a
range scan instead of a table scan.

## Index rationale

| Index | Why |
| --- | --- |
| `ux_one_active_session_per_console` (unique partial) | The occupancy guarantee above. |
| `idx_bookings_console_epoch` | Serves the overlap range scan. |
| `idx_bookings_console_date` | The `?date=YYYY-MM-DD` day view. |
| `idx_bookings_status`, `idx_bookings_session` | Status filters; the check-in lookup of its session. |
| `idx_bookings_customer` | Lookup of bookings made by one customer account (`customer_user_id`). |
| `idx_consoles_status_active` | Dashboard unit counts and the `?status` filter. |
| `idx_consoles_type` | `?type`/`?roomType` filters. |
| `idx_sessions_status_ends` | `GET /sessions/active` and the ending-soon poller ordered by `ends_at`. |
| `idx_sessions_console_started` | Per-unit history and utilization reports. |
| `idx_transactions_created_at` | All report date ranges and the revenue chart. |
| `idx_transactions_payment` | Recorded-vs-outstanding split and method filters. |
| `idx_transaction_items_tx` | Receipt detail join. |
| `idx_auth_sessions_expires` | Sweeping expired sessions. |
| `idx_login_attempts_user_time` | The 15-minute window count. |
| `idx_audit_created_at` | Dashboard activity feed (`ORDER BY created_at DESC LIMIT 20`). |
| `idx_games_active_platform` | Catalog filter. |
| FK indexes (`*_user_id`, `*_cashier_id`, `*_created_by`, `*_console_id`, `*_session_id`) | Every FK that appears in a JOIN is indexed; SQLite does not create these for you. |

## Migration strategy

`migrate(db)` keeps `PRAGMA user_version` as the counter and runs each entry of the `MIGRATIONS`
array in order. A plain function is wrapped in `BEGIN IMMEDIATE … COMMIT` (rollback on throw); a step
marked `.selfManaged` runs its own transaction (see *Migrasi v2* below). Step 1 is `schema.sql`,
which is written entirely with `IF NOT EXISTS`, so re-running it is a no-op.

- **Boot:** call `migrate()` once at startup. Idempotent, cheap, safe on every boot.
- **Adding a change:** append a new function to `MIGRATIONS`. Never edit a released step — a DB that
  already ran it will skip it and silently miss your edit.
- **Two kinds of step:** a plain function is wrapped by `migrate()` in `BEGIN IMMEDIATE … COMMIT`
  (rollback on throw). A step marked `.selfManaged` is called as-is and owns its own transaction —
  required when the step must toggle `PRAGMA foreign_keys`, because that pragma is a **no-op inside
  a transaction** and has to be set before `BEGIN`.
- **Rollback:** additive-first. Never drop a column in the same migration that adds its replacement.
  Keep the old column until the new one is populated and the code no longer reads it.
- **Reset:** delete the DB file and boot. `rm -f server/data/playrent.db server/data/playrent.db-wal server/data/playrent.db-shm`
  (WAL mode keeps `-wal`/`-shm` sidecars) then `node src/seed-schema.js` (production) or
  `node src/seed.js` (demo).

## Migrasi v2 — role `superadmin` / `user`

`users.role` used to be `CHECK (role IN ('admin','cashier'))`. A CHECK constraint cannot be altered in
place, so v2 **rebuilds the table**: `users` → `users_new` (new CHECK) → copy → `DROP TABLE users` →
`ALTER TABLE users_new RENAME TO users`.

**Role mapping**

| Old role | New role | `is_active` | Why |
| --- | --- | --- | --- |
| `admin` | `superadmin` | unchanged | The existing Admin becomes the single Super Admin. |
| `cashier` | `user` | forced to `0` | The cashier account can no longer log in. |

**The cashier account is soft-deleted, never dropped.** Its row stays in `users` with
`is_active = 0`, because `transactions.cashier_id`, `rental_sessions.created_by`,
`bookings.created_by` and `audit_logs.actor_id` point at it. Deleting the row would orphan that
history; `lib/auth.js` already refuses a session whose user is inactive, so the account is
effectively revoked without touching the data.

**New in v2**

- `users.phone TEXT` (nullable) — contact number of the account.
- `bookings.customer_user_id INTEGER REFERENCES users(id)` (nullable, default `NULL`) + index
  `idx_bookings_customer` — a booking can be tied to the customer account that made it.

**Data safety**

- `PRAGMA foreign_keys = OFF` is executed **before** `BEGIN IMMEDIATE` and restored to `ON` in a
  `finally` block. With enforcement on, `DROP TABLE users` would fire the
  `auth_sessions.user_id ON DELETE CASCADE` and wipe the session history.
- Everything happens in one explicit transaction: rebuild → copy → column → index → `COMMIT`.
- `PRAGMA foreign_key_check` runs after the commit and **throws** if any violation is found — a
  silently broken DB is worse than a failed boot.
- `sqlite_sequence` is repaired so the AUTOINCREMENT counter of `users` is never below `MAX(id)`.

**Guarantee: no historical row is deleted.** Verified on the dev database (before → after the
migration): `users` 2 → 2, `auth_sessions` 4 → 4, `rental_sessions` 46 → 46, `transactions` 46 → 46,
`transaction_items` 46 → 46, `bookings` 5 → 5, `audit_logs` 49 → 49, `login_attempts` 12 → 12.
`transactions.cashier_id` is still non-NULL on every row and still points at an existing user;
`PRAGMA foreign_key_check` returns no rows and `PRAGMA integrity_check` returns `ok`.

## Migrasi v4 — baris `business_settings`

`business_settings` holds exactly one row (`id = 1`) and used to be created **only** by the demo
seeder. A production database built with `migrate()` alone therefore had no settings row: every
endpoint that reads the price rules (`/settings`, `/sessions/quote`, `/sessions`, `/bookings`)
crashed with a `TypeError` and answered **500**. The only escape hatch was `npm run seed`, which
injects 44 days of fake transactions and a live demo session into the real books.

v4 appends one step to `MIGRATIONS` (`v4_businessSettings`): `INSERT OR IGNORE` of the single
default row. The values live in one place — `DEFAULT_SETTINGS_ROW` in `server/src/lib/settings.js` —
and are shared with the seeder, so a migrated DB and a seeded DB never disagree. `INSERT OR IGNORE`
means an existing row is never overwritten.

Two safety nets live next to it:

- `lib/settings.js` → `getSettingsRow(db)` returns the defaults (`DEFAULT_RULES` from
  `lib/pricing.js` + `business_name: 'PlayRent'`) when the row is missing, instead of throwing.
- `lib/settings.js` → `updateSettingsRow(db, patch)` is an **UPSERT**
  (`INSERT … ON CONFLICT(id) DO UPDATE`), so saving the settings on a row-less DB actually lands.

`CURRENT_SCHEMA_VERSION` in `server/src/lib/db-backup.js` moved 3 → 4, and `inspectDatabase()`
now also checks the columns the money path reads (`REQUIRED_COLUMNS`) — a DB that predates them
is rejected at restore time instead of failing with a 500 later.

## Seeding

`node src/seed.js` — idempotent; run it twice and every count is identical. Natural keys do the work:
`INSERT OR IGNORE` on `consoles.code`, check-then-insert on `game_catalog.title` and `packages.name`,
and the generated history is guarded by `notes = 'seed-demo'`.

`node src/seed-schema.js` (`npm run seed:schema`) is the **production** path: settings row +
catalog only — **no** transactions, **no** live session, **no** bookings, **no** accounts.

- **No account is created by the seed.** There is no `admin`/`admin123` and no `kasir`/`kasir123`
  any more — a hardcoded password in the source tree is a security hole, and the cashier role no
  longer exists. The Super Admin is created by the owner through the separate bootstrap CLI
  (`npm run admin:bootstrap`), which takes the password from the operator and hashes it with
  `lib/auth.js`.
- Demo rows therefore carry **no user reference**: `created_by` / `cashier_id` / `actor_id` are
  `NULL`, while the human-readable snapshots stay filled in — `transactions.cashier_name = 'Pemilik'`
  and `audit_logs.actor_name = 'Sistem'` — so receipts and reports still show who handled it.
- 10 consoles `PS-01`…`PS-10` (PS4/PS5, Reguler/VIP, 8 000–25 000 IDR/h); `PS-10` is `maintenance`.
- 14 popular titles, 4 duration packages, 1 `business_settings` row.
- 45 finished sessions + 45 matching transactions, 0–2 sessions per day across the last 44 days
  (the RNG seed is fixed at `42`, so the result is deterministic; 31 of those 44 days are filled),
  peak-weighted to 16:00–23:00, mixed payment methods, integer rupiah.
- One active session on `PS-03` (`notes = 'seed-demo-live'`) so the live timer has something to show.
- Two bookings: `confirmed` tomorrow 19:00 on `PS-01`, `pending` today 21:00 on `PS-08`. No overlap.
