// Backup / restore helpers shared by the `backup` and `restore` CLIs.
//
// node:sqlite exposes `backup(sourceDb, destinationPath)`: it takes a
// consistent snapshot even while the source is in WAL mode. A raw file copy
// (`cp`) would miss everything still sitting in the -wal file, so it is never
// used here.
import { DatabaseSync, backup } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomBytes } from 'node:crypto'

// Schema version this build is able to open. MUST equal MIGRATIONS.length in
// src/db.js — test/be005-backup.test.js asserts the two stay in sync so a new
// migration cannot slip through unnoticed. v4 (the single business_settings
// row) is the fourth step, so the schema is now at 4.
export const CURRENT_SCHEMA_VERSION = 4

// Tables a PlayRent database must have for the snapshot to be usable.
export const REQUIRED_TABLES = ['users', 'business_settings']

// Columns the money path reads. A DB that predates them is rejected up front
// instead of blowing up with a 500 the first time an operator opens a page.
export const REQUIRED_COLUMNS = {
  business_settings: [
    'business_name', 'min_duration_minutes', 'rounding_minutes',
    'overtime_rate_per_hour', 'overtime_grace_minutes', 'default_hourly_rate',
    'warn_minutes_json', 'payment_methods_json',
  ],
}

/** Backups live next to the database they came from: <db dir>/backups. */
export const backupsDir = (dbPath) => join(dirname(dbPath), 'backups')

const pad = (n) => String(n).padStart(2, '0')
const pad3 = (n) => String(n).padStart(3, '0')

/**
 * Unique, sortable token for a backup file name: YYYYMMDD-HHMMSS-mmm-xxxxxx.
 *
 * Milliseconds plus 6 random hex chars. A second-resolution name made two
 * snapshots taken within the same second land on the same path, so the second
 * one silently overwrote the first — losing a backup without any error.
 * The random suffix also covers the (rare) case of two snapshots inside the
 * same millisecond, e.g. a loop inside one process.
 */
export function stamp(d = new Date()) {
  const time = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
    + `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
    + `-${pad3(d.getMilliseconds())}`
  return `${time}-${randomBytes(3).toString('hex')}`
}

/**
 * Read-only structural check of a SQLite file.
 * Returns { ok, error, integrity, foreignKeys, tables, userVersion }.
 * Never throws — a damaged file is reported, not raised.
 */
export function inspectDatabase(path) {
  const out = { ok: false, error: null, integrity: null, foreignKeys: [], tables: [], userVersion: null }
  let db
  try {
    db = new DatabaseSync(path)
  } catch (err) {
    out.error = `file tidak bisa dibuka: ${err.message}`
    return out
  }
  try {
    const integrity = db.prepare('PRAGMA integrity_check').get()?.integrity_check
    out.integrity = integrity ?? null
    if (integrity !== 'ok') {
      out.error = `integrity_check = ${integrity}`
      return out
    }
    out.foreignKeys = db.prepare('PRAGMA foreign_key_check').all()
    if (out.foreignKeys.length) {
      out.error = `${out.foreignKeys.length} pelanggaran foreign key`
      return out
    }
    out.tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name)
    const missing = REQUIRED_TABLES.filter((t) => !out.tables.includes(t))
    if (missing.length) {
      out.error = `tabel tidak lengkap: ${missing.join(', ')}`
      return out
    }
    for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
      if (!out.tables.includes(table)) continue
      const present = new Set(
        db.prepare('SELECT name FROM pragma_table_info(?)').all(table).map((r) => r.name),
      )
      const missingCols = columns.filter((c) => !present.has(c))
      if (missingCols.length) {
        out.error = `kolom tidak lengkap di ${table}: ${missingCols.join(', ')}`
        return out
      }
    }
    out.userVersion = db.prepare('PRAGMA user_version').get()?.user_version ?? 0
    if (out.userVersion < 1) {
      out.error = `user_version = ${out.userVersion} (minimal 1)`
      return out
    }
    if (out.userVersion > CURRENT_SCHEMA_VERSION) {
      out.error = `user_version = ${out.userVersion} lebih baru dari versi skema build ini (${CURRENT_SCHEMA_VERSION})`
      return out
    }
    out.ok = true
    return out
  } catch (err) {
    out.error = `file rusak / tidak bisa dibaca: ${err.message}`
    return out
  } finally {
    try { db.close() } catch { /* ignore */ }
  }
}

/** Consistent snapshot of an open database into `destPath`. */
export async function snapshotTo(sourceDb, destPath) {
  mkdirSync(dirname(destPath), { recursive: true })
  await backup(sourceDb, destPath)
  return destPath
}

/** Row count of a table. `table` is an internal constant, never user input. */
export function countRows(db, table) {
  return db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c
}
