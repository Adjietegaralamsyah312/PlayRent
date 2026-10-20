#!/usr/bin/env node
// PlayRent backup CLI — `npm run backup`.
//
//   npm run backup            # snapshot ./data/playrent.db
//   DB_PATH=./data/x.db npm run backup
//
// The snapshot is taken with the node:sqlite backup API (consistent even while
// the database is in WAL mode) and is then validated: integrity_check must be
// "ok", foreign_key_check must be empty and the users + business_settings
// tables must exist. A snapshot that fails validation is deleted and the CLI
// exits non-zero — a broken backup is worse than no backup.
//
// Old backups are never deleted automatically.
// Run: node src/backup.js
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { dbPath } from './config.js'
import { logAudit } from './lib/audit.js'
import {
  backupsDir, countRows, inspectDatabase, snapshotTo, stamp,
} from './lib/db-backup.js'

const main = async () => {
  if (!existsSync(dbPath)) {
    console.error(`[backup] GAGAL: database tidak ditemukan: ${dbPath}`)
    return 1
  }

  const dir = backupsDir(dbPath)
  mkdirSync(dir, { recursive: true })
  const dest = join(dir, `playrent-${stamp()}.db`)

  const source = new DatabaseSync(dbPath)
  try {
    try {
      await snapshotTo(source, dest)
    } catch (err) {
      try { rmSync(dest, { force: true }) } catch { /* ignore */ }
      console.error(`[backup] GAGAL: snapshot gagal: ${err.message}`)
      return 1
    }

    // Validate the result — never trust that a write produced a usable file.
    const check = inspectDatabase(dest)
    if (!check.ok) {
      try { rmSync(dest, { force: true }) } catch { /* ignore */ }
      console.error(`[backup] GAGAL: validasi snapshot gagal: ${check.error}`)
      console.error('[backup] file hasil dihapus, database asli tidak disentuh.')
      return 1
    }

    const bytes = statSync(dest).size
    const counts = {
      users: countRows(source, 'users'),
      transactions: countRows(source, 'transactions'),
      bookings: countRows(source, 'bookings'),
    }

    // Counts only — never names, phone numbers, hashes or session tokens.
    logAudit(source, {
      action: 'db_backup',
      entity: 'database',
      entityId: null,
      description: `Backup database dibuat (${basename(dest)})`,
      meta: {
        file: basename(dest),
        bytes,
        users: counts.users,
        transactions: counts.transactions,
        bookings: counts.bookings,
      },
    })

    console.log(`[backup] file        : ${dest}`)
    console.log(`[backup] ukuran      : ${bytes} bytes`)
    console.log(`[backup] users       : ${counts.users}`)
    console.log(`[backup] transactions: ${counts.transactions}`)
    console.log(`[backup] bookings    : ${counts.bookings}`)
    console.log(`[backup] lokasi      : ${dir}`)
    console.log('[backup] backup lama tidak dihapus otomatis.')
    return 0
  } finally {
    try { source.close() } catch { /* ignore */ }
  }
}

try {
  process.exitCode = await main()
} catch (err) {
  console.error(`[backup] GAGAL: ${err?.message || err}`)
  process.exitCode = 1
}
