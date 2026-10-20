-- PlayRent canonical schema. Idempotent: safe to run on every boot.
-- Money = INTEGER rupiah. Time = ISO-8601 UTC TEXT (new Date().toISOString()).
-- driver: node:sqlite DatabaseSync (no native deps).
--
-- ===========================================================================
-- SNAPSHOT v1 — JANGAN DIEDIT.
-- This file is migration step 1 (v1_schema) and is FROZEN: it has already
-- shipped, so a DB that ran it will never run it again. Any change to the
-- schema must be a NEW migration step appended to MIGRATIONS in src/db.js
-- (v2_superadmin, v3_revokeInactiveSessions, v4_businessSettings, ...), never
-- an edit here.
--
-- This snapshot is intentionally the ORIGINAL v1 shape and therefore differs
-- from the live schema: `users.role` still allows ('admin','cashier') and
-- `users.phone` / `bookings.customer_user_id` do not exist yet. Migration v2
-- rebuilds `users` for the shipped roles ('superadmin','user') and adds both
-- columns. The effective schema after migrating is what api-contract.md
-- documents — not this file.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,
  full_name     TEXT    NOT NULL,
  password_hash TEXT    NOT NULL,          -- scrypt hex
  password_salt TEXT    NOT NULL,          -- 16-byte hex
  role          TEXT    NOT NULL CHECK (role IN ('admin','cashier')),
  is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL
);

-- ---------------------------------------------------------------------------
-- auth_sessions  (opaque token, httpOnly cookie pr_session)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auth_sessions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash   TEXT    NOT NULL UNIQUE,     -- sha256(token) hex
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TEXT    NOT NULL,
  expires_at   TEXT    NOT NULL,
  last_seen_at TEXT    NOT NULL,
  ip           TEXT,
  user_agent   TEXT
);

-- ---------------------------------------------------------------------------
-- login_attempts  (5 failures / 15 min lockout per username+ip)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS login_attempts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  username     TEXT    NOT NULL,
  ip           TEXT,
  succeeded    INTEGER NOT NULL DEFAULT 0 CHECK (succeeded IN (0,1)),
  attempted_at TEXT    NOT NULL
);

-- ---------------------------------------------------------------------------
-- consoles  (PS units)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS consoles (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT    NOT NULL UNIQUE,
  console_type  TEXT    NOT NULL CHECK (console_type IN ('PS4','PS5')),
  room_type     TEXT    NOT NULL,
  controllers   INTEGER NOT NULL DEFAULT 2 CHECK (controllers >= 1),
  hourly_rate   INTEGER NOT NULL CHECK (hourly_rate >= 0),
  status        TEXT    NOT NULL DEFAULT 'available'
                        CHECK (status IN ('available','in_use','reserved','maintenance')),
  condition_note TEXT,
  is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL
);

-- ---------------------------------------------------------------------------
-- bookings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bookings (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  console_id       INTEGER NOT NULL REFERENCES consoles(id),
  customer_name    TEXT    NOT NULL,
  customer_contact TEXT,
  booking_date     TEXT    NOT NULL,        -- 'YYYY-MM-DD' Jakarta-local
  start_time       TEXT    NOT NULL,        -- 'HH:mm' Jakarta-local
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  ends_at          TEXT    NOT NULL,        -- ISO-UTC derived
  started_at_epoch INTEGER NOT NULL,        -- ms epoch, for integer overlap test
  ends_at_epoch    INTEGER NOT NULL,        -- ms epoch, for integer overlap test
  estimated_cost   INTEGER NOT NULL DEFAULT 0,
  status           TEXT    NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','confirmed','checked_in','completed','cancelled')),
  notes            TEXT,
  discount         INTEGER NOT NULL DEFAULT 0,
  session_id       INTEGER REFERENCES rental_sessions(id),
  created_by       INTEGER REFERENCES users(id),
  created_at       TEXT    NOT NULL,
  updated_at       TEXT    NOT NULL
);

-- ---------------------------------------------------------------------------
-- rental_sessions  (live timer)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rental_sessions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  console_id     INTEGER NOT NULL REFERENCES consoles(id),
  customer_name  TEXT    NOT NULL,
  customer_contact TEXT,
  status         TEXT    NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active','overdue','finished','void')),
  started_at     TEXT    NOT NULL,          -- ISO-UTC
  ends_at        TEXT    NOT NULL,          -- ISO-UTC (started_at + planned)
  planned_minutes INTEGER NOT NULL CHECK (planned_minutes > 0),
  billed_minutes INTEGER,
  extensions_json TEXT   NOT NULL DEFAULT '[]',
  rate_snapshot  INTEGER NOT NULL,          -- hourlyRate frozen at start
  notes          TEXT,
  booking_id     INTEGER REFERENCES bookings(id),
  created_by     INTEGER REFERENCES users(id),
  finished_at    TEXT,
  transaction_id INTEGER,                   -- id of the payment transaction
  void_reason    TEXT,
  created_at     TEXT    NOT NULL,
  updated_at     TEXT    NOT NULL
);

-- ---------------------------------------------------------------------------
-- transactions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  number           TEXT    NOT NULL UNIQUE, -- TRX-YYYYMMDD-####
  session_id       INTEGER REFERENCES rental_sessions(id),
  console_id       INTEGER,
  console_code     TEXT,
  customer_name    TEXT,
  cashier_id       INTEGER REFERENCES users(id),
  cashier_name     TEXT,
  subtotal         INTEGER NOT NULL DEFAULT 0,
  extra_charge     INTEGER NOT NULL DEFAULT 0,
  discount         INTEGER NOT NULL DEFAULT 0,
  discount_reason  TEXT,
  overtime_minutes INTEGER NOT NULL DEFAULT 0,
  overtime_amount  INTEGER NOT NULL DEFAULT 0,
  total            INTEGER NOT NULL DEFAULT 0,
  payment_method   TEXT    NOT NULL CHECK (payment_method IN ('cash','transfer','qris')),
  payment_status   TEXT    NOT NULL DEFAULT 'paid'
                           CHECK (payment_status IN ('paid','unpaid','void')),
  amount_paid      INTEGER NOT NULL DEFAULT 0,
  change_due       INTEGER NOT NULL DEFAULT 0,
  status           TEXT    NOT NULL DEFAULT 'completed'
                           CHECK (status IN ('completed','void')),
  void_reason      TEXT,
  void_by          INTEGER REFERENCES users(id),
  voided_at        TEXT,
  notes            TEXT,
  created_at       TEXT    NOT NULL
);

-- ---------------------------------------------------------------------------
-- transaction_items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transaction_items (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  kind           TEXT    NOT NULL CHECK (kind IN ('rental','overtime','extra','discount')),
  label          TEXT    NOT NULL,
  quantity       INTEGER NOT NULL DEFAULT 1,
  unit_price     INTEGER NOT NULL DEFAULT 0,
  amount         INTEGER NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------------
-- game_catalog
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS game_catalog (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  title                   TEXT    NOT NULL,
  platform                TEXT    NOT NULL CHECK (platform IN ('PS4','PS5','both')),
  genre                   TEXT,
  recommended_controllers INTEGER,
  availability_note       TEXT,
  is_active               INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at              TEXT    NOT NULL,
  updated_at              TEXT    NOT NULL
);

-- ---------------------------------------------------------------------------
-- business_settings  (single row, id = 1)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS business_settings (
  id                     INTEGER PRIMARY KEY CHECK (id = 1),
  business_name          TEXT    NOT NULL DEFAULT 'PlayRent',
  address                TEXT    DEFAULT '',
  phone                  TEXT    DEFAULT '',
  receipt_footer         TEXT    DEFAULT '',
  tax_note               TEXT    DEFAULT '',
  min_duration_minutes   INTEGER NOT NULL DEFAULT 30,
  rounding_minutes       INTEGER NOT NULL DEFAULT 15,
  overtime_rate_per_hour INTEGER NOT NULL DEFAULT 10000,
  overtime_grace_minutes INTEGER NOT NULL DEFAULT 0,
  default_hourly_rate    INTEGER NOT NULL DEFAULT 10000,
  warn_minutes_json      TEXT    NOT NULL DEFAULT '[10,5,1]',
  payment_methods_json   TEXT    NOT NULL DEFAULT '["cash","transfer","qris"]',
  updated_at             TEXT    NOT NULL
);

-- ---------------------------------------------------------------------------
-- packages  (duration bundles)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS packages (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT    NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  price            INTEGER NOT NULL CHECK (price >= 0),
  console_type     TEXT    CHECK (console_type IS NULL OR console_type IN ('PS4','PS5')),
  is_active        INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at       TEXT    NOT NULL
);

-- ---------------------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id    INTEGER REFERENCES users(id),
  actor_name  TEXT,
  action      TEXT    NOT NULL,
  entity      TEXT,
  entity_id   INTEGER,
  description TEXT,
  meta_json   TEXT,
  created_at  TEXT    NOT NULL
);

-- ===========================================================================
-- INDEXES
-- ===========================================================================

-- THE occupancy guarantee: at most one live session per console.
CREATE UNIQUE INDEX IF NOT EXISTS ux_one_active_session_per_console
  ON rental_sessions(console_id) WHERE status IN ('active','overdue');

-- bookings: conflict check support
CREATE INDEX IF NOT EXISTS idx_bookings_console_date ON bookings(console_id, booking_date);
CREATE INDEX IF NOT EXISTS idx_bookings_console_epoch ON bookings(console_id, started_at_epoch, ends_at_epoch);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_session ON bookings(session_id);

-- consoles
CREATE INDEX IF NOT EXISTS idx_consoles_status_active ON consoles(status, is_active);
CREATE INDEX IF NOT EXISTS idx_consoles_type ON consoles(console_type, room_type);

-- rental_sessions
CREATE INDEX IF NOT EXISTS idx_sessions_status_ends ON rental_sessions(status, ends_at);
CREATE INDEX IF NOT EXISTS idx_sessions_console_started ON rental_sessions(console_id, started_at);
CREATE INDEX IF NOT EXISTS idx_sessions_created_by ON rental_sessions(created_by);
CREATE INDEX IF NOT EXISTS idx_sessions_booking ON rental_sessions(booking_id);
CREATE INDEX IF NOT EXISTS idx_sessions_transaction ON rental_sessions(transaction_id);

-- transactions
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_payment ON transactions(payment_status, status);
CREATE INDEX IF NOT EXISTS idx_transactions_session ON transactions(session_id);
CREATE INDEX IF NOT EXISTS idx_transactions_cashier ON transactions(cashier_id);
CREATE INDEX IF NOT EXISTS idx_transactions_console ON transactions(console_id);
CREATE INDEX IF NOT EXISTS idx_transaction_items_tx ON transaction_items(transaction_id);

-- auth
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_login_attempts_user_time ON login_attempts(username, attempted_at);

-- games / audit
CREATE INDEX IF NOT EXISTS idx_games_active_platform ON game_catalog(is_active, platform);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id);
