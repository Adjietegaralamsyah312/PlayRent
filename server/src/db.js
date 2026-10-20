// PlayRent data layer — node:sqlite (built-in). No native deps.
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { dbPath } from './config.js'
import { DEFAULT_SETTINGS_ROW } from './lib/settings.js'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * Open a DatabaseSync with the pragmas this app relies on.
 * WAL + busy_timeout let two operators' tabs hit the same file safely.
 */
export function openDatabase(path = dbPath) {
  const db = new DatabaseSync(path)
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA busy_timeout = 5000')
  db.exec('PRAGMA synchronous = NORMAL')
  return db
}

// --- v2: roles superadmin/user ---------------------------------------------
// Self-managed step (see `selfManaged` below): it owns its own transaction
// because `PRAGMA foreign_keys` is a NO-OP inside a transaction — it must be
// toggled OFF *before* BEGIN so `users` can be rebuilt without firing the
// ON DELETE CASCADE of auth_sessions, and turned back ON afterwards.

const hasColumn = (db, table, column) =>
  db.prepare('SELECT COUNT(*) AS c FROM pragma_table_info(?) WHERE name = ?').get(table, column).c > 0

/**
 * Rebuild `users` so the role CHECK accepts only ('superadmin','user').
 * A CHECK constraint cannot be altered in place, hence the table rebuild.
 *   role 'admin'   -> 'superadmin' (is_active preserved)
 *   role 'cashier' -> 'user' + is_active = 0 (soft delete: the row stays so
 *                     transactions.cashier_id / created_by keep pointing at a
 *                     real user — no history row is ever deleted).
 */
function rebuildUsers(db) {
  // Already rebuilt (crash between COMMIT and the user_version bump): the new
  // CHECK is in place, so re-copying would demote 'superadmin' to 'user'.
  // Skip instead. Tested by the CHECK text, not by a column, because that is
  // exactly what the rebuild changes.
  const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get()?.sql || ''
  if (!sql.includes('superadmin')) {
    db.exec(`
    CREATE TABLE users_new (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT    NOT NULL UNIQUE,
      full_name     TEXT    NOT NULL,
      password_hash TEXT    NOT NULL,
      password_salt TEXT    NOT NULL,
      role          TEXT    NOT NULL CHECK (role IN ('superadmin','user')),
      is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
      phone         TEXT,
      created_at    TEXT    NOT NULL,
      updated_at    TEXT    NOT NULL
    );

    INSERT INTO users_new
      (id, username, full_name, password_hash, password_salt, role, is_active, phone, created_at, updated_at)
    SELECT id, username, full_name, password_hash, password_salt,
           CASE role WHEN 'admin' THEN 'superadmin' ELSE 'user' END,
           CASE role WHEN 'admin' THEN is_active ELSE 0 END,
           NULL, created_at, updated_at
    FROM users;

    DROP TABLE users;
    ALTER TABLE users_new RENAME TO users;
  `)

    // AUTOINCREMENT counter: SQLite carries it across the rename, but repair
    // it explicitly so the next INSERT can never collide with an existing id.
    const maxId = db.prepare('SELECT COALESCE(MAX(id), 0) AS m FROM users').get().m
    const seq = db.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'users'").get()
    if (!seq) {
      db.prepare("INSERT INTO sqlite_sequence(name, seq) VALUES ('users', ?)").run(maxId)
    } else if (Number(seq.seq) < maxId) {
      db.prepare("UPDATE sqlite_sequence SET seq = ? WHERE name = 'users'").run(maxId)
    }
  }

  // Additive safety net for a users table that already has the new CHECK but
  // no phone column.
  if (!hasColumn(db, 'users', 'phone')) db.exec('ALTER TABLE users ADD COLUMN phone TEXT')
}

/** Link a booking to the customer account that made it (nullable). */
function addBookingCustomer(db) {
  if (!hasColumn(db, 'bookings', 'customer_user_id')) {
    db.exec('ALTER TABLE bookings ADD COLUMN customer_user_id INTEGER REFERENCES users(id)')
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_bookings_customer ON bookings(customer_user_id)')
}

function v2_superadmin(db) {
  db.exec('PRAGMA foreign_keys = OFF')
  try {
    db.exec('BEGIN IMMEDIATE')
    try {
      rebuildUsers(db)
      addBookingCustomer(db)
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  } finally {
    // Restore enforcement whatever happened — leaving it OFF would silently
    // disable FK checks for the rest of the process.
    db.exec('PRAGMA foreign_keys = ON')
  }

  // Loud failure beats a silently broken DB.
  const violations = db.prepare('PRAGMA foreign_key_check').all()
  if (violations.length > 0) {
    throw new Error(`migration v2 left ${violations.length} foreign key violation(s): ${JSON.stringify(violations)}`)
  }
}
v2_superadmin.selfManaged = true

// --- v3: revoke the sessions of deactivated accounts -----------------------
// plan.md §4.3 "Cabut sesi aktif". The v2 step demoted `cashier` → `user`
// with is_active = 0 but left its auth_sessions rows behind. Those rows are
// rejected at runtime (resolveSession checks is_active) yet they spring back
// to life the moment the account is re-activated — a session resurrection.
// Deleting the rows closes that door for good.
//
// Idempotent and narrow: only the sessions of users who are NOT active are
// removed. A signed-in customer's own sessions are never touched.
// (Added as a new step — v1/v2 are shipped and must not be edited.)

function v3_revokeInactiveSessions(db) {
  db.prepare('DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM users WHERE is_active = 0)').run()
}

// --- v4: the single business_settings row -----------------------------------
// BE-001: the settings row was only ever created by the demo seeder, so a
// production DB built with migrate() alone had NO settings row — every
// endpoint that reads the price rules (/settings, /sessions/quote,
// /sessions, /bookings) died with a TypeError -> 500, and the only way out
// was `npm run seed`, which injected 44 days of fake transactions and a live
// demo session into the real books.
//
// The migration writes one default row (same values the seeder uses) so a
// fresh install is usable without any demo data. Idempotent: INSERT OR IGNORE
// never overwrites an existing row.

function v4_businessSettings(db) {
  const d = DEFAULT_SETTINGS_ROW
  db.prepare(
    `INSERT OR IGNORE INTO business_settings
     (id, business_name, address, phone, receipt_footer, tax_note,
      min_duration_minutes, rounding_minutes, overtime_rate_per_hour, overtime_grace_minutes,
      default_hourly_rate, warn_minutes_json, payment_methods_json, updated_at)
     VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    d.business_name, d.address, d.phone, d.receipt_footer, d.tax_note,
    d.min_duration_minutes, d.rounding_minutes, d.overtime_rate_per_hour,
    d.overtime_grace_minutes, d.default_hourly_rate, d.warn_minutes_json,
    d.payment_methods_json, new Date().toISOString(),
  )
}

// Each entry bumps user_version by one, in order. Add new steps at the end;
// never edit a shipped step (a DB that already ran it will skip it).
//
// Two kinds of step:
//   plain function  -> migrate() wraps it in BEGIN IMMEDIATE / COMMIT / ROLLBACK
//   .selfManaged    -> migrate() calls it as-is; the step owns its transaction
const MIGRATIONS = [
  function v1_schema(db) {
    db.exec(readFileSync(join(here, 'schema.sql'), 'utf8'))
  },
  v2_superadmin,
  v3_revokeInactiveSessions,
  v4_businessSettings,
]

/** Idempotent. Safe to call on every boot. */
export function migrate(db) {
  const from = db.prepare('PRAGMA user_version').get().user_version
  for (let v = from; v < MIGRATIONS.length; v++) {
    const step = MIGRATIONS[v]
    if (step.selfManaged) {
      // The step ran (and committed) its own transaction — bumping
      // user_version here keeps the counter in one place.
      step(db)
      db.exec(`PRAGMA user_version = ${v + 1}`)
      continue
    }
    db.exec('BEGIN IMMEDIATE')
    try {
      step(db)
      db.exec(`PRAGMA user_version = ${v + 1}`)
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  }
  return { applied: MIGRATIONS.length - from, version: MIGRATIONS.length }
}

// Nesting via SAVEPOINT: the outer call owns BEGIN/COMMIT, inner calls use
// sp_1, sp_2, ... so a failed inner step only rolls back its own work.
// DatabaseSync is synchronous: an async fn would corrupt the shared depth
// counter (the inner code keeps running after COMMIT). Fail loudly instead.
function runSync(fn, db) {
  const out = fn(db)
  if (out && typeof out.then === 'function') {
    throw new Error('withTx callback must be synchronous')
  }
  return out
}

let depth = 0
export function withTx(db, fn) {
  if (depth === 0) {
    db.exec('BEGIN IMMEDIATE')
    depth = 1
    try {
      const out = runSync(fn, db)
      db.exec('COMMIT')
      depth = 0
      return out
    } catch (err) {
      db.exec('ROLLBACK')
      depth = 0
      throw err
    }
  }
  const sp = `sp_${depth}`
  depth += 1
  db.exec(`SAVEPOINT ${sp}`)
  try {
    const out = runSync(fn, db)
    db.exec(`RELEASE ${sp}`)
    depth -= 1
    return out
  } catch (err) {
    db.exec(`ROLLBACK TO ${sp}`)
    db.exec(`RELEASE ${sp}`)
    depth -= 1
    throw err
  }
}

const db = openDatabase()
export default db
