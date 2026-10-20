#!/usr/bin/env node
// PlayRent restore CLI — `npm run restore -- <file>`.
//
//   npm run restore -- ./data/backups/playrent-20261019-120000-481-3f9c2a.db
//   DB_PATH=./data/tmp-restore.db npm run restore -- <file>
//
// Order of operations (nothing is overwritten before every check passes):
//   1. validate the source file  — integrity_check, foreign_key_check,
//      required tables, user_version within this build's schema version
//   2. take a pre-restore backup of the current database
//   3. ask for an explicit confirmation: the operator must type RESTORE
//   4. replace the database atomically (copy to .tmp, then rename) and drop the
//      stale -wal / -shm files
//   5. write the audit entry
//
// Exit codes: 0 = restored, 0 = cancelled by the operator (wrong word),
// 1 = refused (invalid source, missing file, I/O error). The database is left
// untouched in every non-zero case.
//
// Run: node src/restore.js <file>
import { copyFileSync, existsSync, mkdirSync, rmSync, renameSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { dbPath } from './config.js'
import { logAudit } from './lib/audit.js'
import { backupsDir, inspectDatabase, snapshotTo, stamp } from './lib/db-backup.js'

const CONFIRM_WORD = 'RESTORE'

const usage = () => {
  console.log('Pakai: npm run restore -- <file-backup.db>')
  console.log('       DB_PATH=./data/tmp.db npm run restore -- <file-backup.db>')
}

/** Read one line from stdin (works for a TTY and for a pipe). */
const readLine = () => new Promise((resolveLine) => {
  const stdin = process.stdin
  let buf = ''
  const finish = (value) => {
    stdin.pause()
    stdin.removeListener('data', onData)
    resolveLine(value)
  }
  const onData = (chunk) => {
    buf += chunk
    const nl = buf.indexOf('\n')
    if (nl >= 0) finish(buf.slice(0, nl))
  }
  stdin.setEncoding('utf8')
  stdin.on('data', onData)
  stdin.on('end', () => finish(buf))
  stdin.on('error', () => finish(buf))
  stdin.resume()
})

/**
 * Best-effort check whether something else is holding the database right now.
 * In WAL mode BEGIN EXCLUSIVE only fails while another connection writes, so
 * this is a hint — the warning is printed either way.
 */
const looksBusy = (path) => {
  let db
  try {
    db = new DatabaseSync(path)
    db.exec('PRAGMA busy_timeout = 500')
    db.exec('BEGIN EXCLUSIVE')
    db.exec('ROLLBACK')
    return false
  } catch {
    return true
  } finally {
    try { db?.close() } catch { /* ignore */ }
  }
}

const main = async () => {
  const arg = process.argv[2]
  if (!arg || arg === '--help' || arg === '-h') {
    usage()
    return arg ? 0 : 1
  }
  const source = resolve(arg)
  if (!existsSync(source)) {
    console.error(`[restore] DITOLAK: file tidak ditemukan: ${source}`)
    console.error('[restore] database tidak diubah.')
    return 1
  }

  // 1 ── validate the source before touching anything.
  const check = inspectDatabase(source)
  if (!check.ok) {
    console.error(`[restore] DITOLAK: validasi file backup gagal — ${check.error}`)
    console.error('[restore] database tidak diubah.')
    return 1
  }
  console.log(`[restore] validasi OK  : integrity=${check.integrity}, user_version=${check.userVersion}`)

  // 2 ── safety net: snapshot the current database before overwriting it.
  let backupTaken = null
  if (existsSync(dbPath)) {
    const dir = backupsDir(dbPath)
    mkdirSync(dir, { recursive: true })
    const prePath = join(dir, `pre-restore-${stamp()}.db`)
    const live = new DatabaseSync(dbPath)
    try {
      await snapshotTo(live, prePath)
      backupTaken = prePath
    } catch (err) {
      console.error(`[restore] GAGAL: backup pra-restore gagal: ${err.message}`)
      console.error('[restore] database tidak diubah.')
      return 1
    } finally {
      try { live.close() } catch { /* ignore */ }
    }
    console.log(`[restore] backup pra-restore: ${prePath}`)
  }

  // 3 ── explicit confirmation.
  console.log('[restore] PERINGATAN: hentikan server API (npm start) sebelum melanjutkan.')
  console.log('[restore] PERINGATAN: file -wal/-shm yang lama akan dihapus.')
  if (existsSync(dbPath) && looksBusy(dbPath)) {
    console.log('[restore] PERINGATAN: database terkunci — server kemungkinan sedang berjalan.')
  }
  process.stdout.write(`[restore] Ketik ${CONFIRM_WORD} untuk melanjutkan: `)
  const answer = (await readLine()).trim()
  if (answer !== CONFIRM_WORD) {
    console.log(`\n[restore] DIBATALKAN — konfirmasi tidak cocok. Database tidak diubah.`)
    return 0
  }

  // 4 ── atomic replace.
  const tmp = `${dbPath}.tmp`
  try {
    copyFileSync(source, tmp)
    renameSync(tmp, dbPath)
  } catch (err) {
    try { rmSync(tmp, { force: true }) } catch { /* ignore */ }
    console.error(`[restore] GAGAL: database tidak bisa ditimpa: ${err.message}`)
    return 1
  }
  for (const suffix of ['-wal', '-shm']) {
    try { rmSync(`${dbPath}${suffix}`, { force: true }) } catch { /* ignore */ }
  }

  // 5 ── audit (the restored database is the live one now).
  try {
    const db = new DatabaseSync(dbPath)
    try {
      logAudit(db, {
        action: 'db_restore',
        entity: 'database',
        entityId: null,
        description: 'Database dipulihkan dari backup',
        meta: { from: source, to: dbPath, backupTaken },
      })
    } finally {
      try { db.close() } catch { /* ignore */ }
    }
  } catch (err) {
    console.error(`[restore] PERINGATAN: audit log tidak bisa ditulis: ${err.message}`)
  }

  console.log(`[restore] OK — database dipulihkan dari ${source}`)
  console.log(`[restore] target        : ${dbPath}`)
  return 0
}

try {
  process.exitCode = await main()
} catch (err) {
  console.error(`[restore] GAGAL: ${err?.message || err}`)
  process.exitCode = 1
}
