// BE-005 — backup/restore CLI (K24) + audit-log completeness (plan.md §7).
import test from 'node:test'
import assert from 'node:assert/strict'
import { copyFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import {
  withServer, ADMIN, USER, INACTIVE, seedBase, mkTmpDir, openDatabase, migrate,
} from './helpers.js'
import { CURRENT_SCHEMA_VERSION } from '../src/lib/db-backup.js'

const serverDir = fileURLToPath(new URL('..', import.meta.url))
const backupsOf = (dbFile) => join(dbFile, '..', 'backups')

/** Run a server CLI with a throwaway DB_PATH. */
const runCli = (script, { dbPath, args = [], env = {}, input = '' } = {}) => spawnSync(
  process.execPath,
  [join(serverDir, 'src', script), ...args],
  { env: { ...process.env, DB_PATH: dbPath, ...env }, input, encoding: 'utf8' },
)

/** A ready-to-use database with the demo accounts, at an arbitrary path. */
const makeDb = (file) => {
  const db = openDatabase(file)
  migrate(db)
  seedBase(db)
  db.close()
  return file
}

// ───────────────────────────── K24 ─────────────────────────────

test('K24 Backup: hasil backup valid (integrity ok) dan isinya sama dengan DB sumber', async () => {
  const dir = mkTmpDir('playrent-backup-')
  const dbFile = makeDb(join(dir, 'app.db'))

  const r = runCli('backup.js', { dbPath: dbFile })
  assert.equal(r.status, 0, `backup harus sukses: ${r.stderr}`)

  const dirOf = backupsOf(dbFile)
  const files = readdirSync(dirOf).filter((f) => f.startsWith('playrent-'))
  assert.equal(files.length, 1, 'satu file backup dibuat')
  const backupFile = join(dirOf, files[0])

  const db = openDatabase(backupFile)
  try {
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok')
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0)
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((t) => t.name)
    assert.ok(tables.includes('users') && tables.includes('business_settings'))
    assert.equal(db.prepare('SELECT COUNT(*) c FROM users').get().c, 3, 'isi backup sama dengan DB sumber')
  } finally {
    db.close()
  }

  // ringkasan dicetak, data sensitif tidak
  assert.match(r.stdout, /users\s*:\s*3/)
  assert.ok(!r.stdout.includes(ADMIN.password))
  assert.ok(!r.stdout.includes(USER.password))
  assert.ok(!r.stdout.includes('password'))

  // backup lama tidak dihapus otomatis
  const r2 = runCli('backup.js', { dbPath: dbFile })
  assert.equal(r2.status, 0)
  const files2 = readdirSync(dirOf).filter((f) => f.startsWith('playrent-'))
  assert.equal(files2.length, 2, 'backup lama tetap ada')
  assert.notEqual(files2[0], files2[1], 'dua backup berturut-turut harus punya nama berbeda')

  // kedua file benar-benar ada di disk dan sama-sama valid
  for (const f of files2) {
    const p = join(dirOf, f)
    assert.ok(existsSync(p), `file backup harus ada: ${f}`)
    const bdb = openDatabase(p)
    try {
      assert.equal(bdb.prepare('PRAGMA integrity_check').get().integrity_check, 'ok', `backup ${f} valid`)
      assert.equal(bdb.prepare('SELECT COUNT(*) c FROM users').get().c, 3, `backup ${f} berisi data sumber`)
    } finally {
      bdb.close()
    }
  }
  assert.equal(readdirSync(dirOf).filter((f) => f.startsWith('playrent-')).length, 2, 'tidak ada file sisa setelah menutup kedua backup')
})

test('K24 Restore: file rusak ditolak tanpa menimpa, konfirmasi salah ketik -> batal', async () => {
  const dir = mkTmpDir('playrent-restore-')
  const dbFile = makeDb(join(dir, 'app.db'))
  const db = openDatabase(dbFile)
  db.prepare('UPDATE users SET is_active = 0 WHERE username = ?').run(USER.username)
  const before = {
    users: db.prepare('SELECT COUNT(*) c FROM users').get().c,
    inactive: db.prepare('SELECT is_active FROM users WHERE username = ?').get(USER.username).is_active,
  }
  db.close()

  // --- file rusak ---
  const broken = join(dir, 'broken.db')
  writeFileSync(broken, Buffer.from('ini bukan database sqlite, sama sekali bukan'))
  const neg = runCli('restore.js', { dbPath: dbFile, args: [broken], input: 'RESTORE\n' })
  assert.equal(neg.status, 1, 'file rusak harus ditolak')
  assert.match(neg.stderr + neg.stdout, /DITOLAK/i)
  assert.match(neg.stderr + neg.stdout, /tidak diubah/i)

  const after = openDatabase(dbFile)
  try {
    assert.equal(after.prepare('SELECT COUNT(*) c FROM users').get().c, before.users, 'DB asli tidak berubah')
    assert.equal(after.prepare('SELECT is_active FROM users WHERE username = ?').get(USER.username).is_active, before.inactive)
  } finally {
    after.close()
  }

  // --- konfirmasi salah ketik ---
  const bk = runCli('backup.js', { dbPath: dbFile })
  assert.equal(bk.status, 0)
  const backupFile = join(backupsOf(dbFile), readdirSync(backupsOf(dbFile)).find((f) => f.startsWith('playrent-')))

  // --- file dari "masa depan": user_version > versi skema build ini ---
  const future = join(dir, 'future.db')
  copyFileSync(backupFile, future)
  const fdb = openDatabase(future)
  fdb.exec(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION + 1}`)
  fdb.close()
  const negFuture = runCli('restore.js', { dbPath: dbFile, args: [future], input: 'RESTORE\n' })
  assert.equal(negFuture.status, 1, 'file versi masa depan harus ditolak')
  assert.match(negFuture.stderr + negFuture.stdout, /DITOLAK/i)
  assert.match(negFuture.stderr + negFuture.stdout, /tidak diubah/i)

  const cancel = runCli('restore.js', { dbPath: dbFile, args: [backupFile], input: 'y\n' })
  assert.equal(cancel.status, 0, 'pembatalan bukan error')
  assert.match(cancel.stdout, /DIBATALKAN/i)

  const after2 = openDatabase(dbFile)
  try {
    assert.equal(after2.prepare('SELECT COUNT(*) c FROM users').get().c, before.users, 'DB asli tidak berubah setelah pembatalan')
    assert.equal(after2.prepare('SELECT is_active FROM users WHERE username = ?').get(USER.username).is_active, before.inactive)
  } finally {
    after2.close()
  }
})

test('K24 Restore: file valid memulihkan data lama (positif) dan mencatat audit', async () => {
  const dir = mkTmpDir('playrent-restore-ok-')
  const dbFile = makeDb(join(dir, 'app.db'))

  const bk = runCli('backup.js', { dbPath: dbFile })
  assert.equal(bk.status, 0)
  const backupFile = join(backupsOf(dbFile), readdirSync(backupsOf(dbFile)).find((f) => f.startsWith('playrent-')))

  // ubah DB setelah backup
  const changed = openDatabase(dbFile)
  changed.prepare('UPDATE users SET is_active = 0 WHERE username = ?').run(USER.username)
  changed.prepare('DELETE FROM users WHERE username = ?').run(INACTIVE.username)
  changed.close()

  const r = runCli('restore.js', { dbPath: dbFile, args: [backupFile], input: 'RESTORE\n' })
  assert.equal(r.status, 0, `restore harus sukses: ${r.stderr}`)
  assert.match(r.stdout, /OK/)

  const restored = openDatabase(dbFile)
  try {
    assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check, 'ok')
    assert.equal(restored.prepare('SELECT COUNT(*) c FROM users').get().c, 3, 'data lama kembali')
    assert.equal(restored.prepare('SELECT is_active FROM users WHERE username = ?').get(USER.username).is_active, 1)
    const audit = restored.prepare("SELECT action, meta_json FROM audit_logs WHERE action = 'db_restore'").all()
    assert.equal(audit.length, 1, 'audit db_restore tercatat')
    const meta = JSON.parse(audit[0].meta_json)
    assert.ok(meta.from && meta.to && 'backupTaken' in meta, 'meta/from/to/backupTaken ada')
  } finally {
    restored.close()
  }

  // backup pra-restore dibuat
  assert.ok(readdirSync(backupsOf(dbFile)).some((f) => f.startsWith('pre-restore-')), 'backup pra-restore ada')
})

// ───────────────────────────── Bagian C: audit log ─────────────────────────────

test('K24 Skema: CURRENT_SCHEMA_VERSION = jumlah migrasi di db.js', () => {
  // Kalau ada migrasi baru, konstanta ini harus ikut naik — kalau tidak, restore
  // bisa menerima (atau menolak) file versi yang salah.
  const dir = mkTmpDir('playrent-version-')
  const db = openDatabase(join(dir, 'version.db'))
  try {
    migrate(db)
    const version = db.prepare('PRAGMA user_version').get().user_version
    assert.equal(version, CURRENT_SCHEMA_VERSION, 'restore.js harus memakai versi skema yang sama dengan db.js')
  } finally {
    db.close()
  }
})

test('C1 Audit log mencatat seluruh operasi sensitif', async () => {
  await withServer(async ({ login, db }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const customer = await login(USER.username, USER.password)

    // hak akses: buat akun, ubah role, nonaktifkan
    const created = await admin.post('/api/users', {
      username: 'audituser', fullName: 'Audit User', password: 'PasswordAudit123', role: 'user',
    })
    assert.equal(created.status, 201, JSON.stringify(created.body))
    const uid = created.body.data.user.id
    await admin.patch(`/api/users/${uid}`, { role: 'superadmin' })
    await admin.del(`/api/users/${uid}`)

    // pengaturan usaha
    await admin.put('/api/settings', { business: { name: 'PlayRent Audit' } })

    // unit: buat lalu nonaktifkan
    const c = (await admin.post('/api/consoles', {
      code: 'C-1', consoleType: 'PS4', roomType: 'Reguler', controllers: 2, hourlyRate: 12000,
    })).body.data.console
    await admin.del(`/api/consoles/${c.id}`)

    // booking: buat, ubah, batalkan (unit aktif terpisah)
    const c3 = (await admin.post('/api/consoles', {
      code: 'C-3', consoleType: 'PS4', roomType: 'Reguler', controllers: 2, hourlyRate: 12000,
    })).body.data.console
    const booking = (await admin.post('/api/bookings', {
      consoleId: c3.id, customerName: 'Budi', bookingDate: '2026-12-20', startTime: '10:00', durationMinutes: 60,
    })).body.data.booking
    assert.ok(booking, 'booking dibuat')
    await admin.patch(`/api/bookings/${booking.id}`, { status: 'confirmed' })
    await admin.post(`/api/bookings/${booking.id}/cancel`, { reason: 'batal oleh audit' })

    // transaksi: buat lalu batalkan
    const c2 = (await admin.post('/api/consoles', {
      code: 'C-2', consoleType: 'PS5', roomType: 'VIP', controllers: 4, hourlyRate: 20000,
    })).body.data.console
    const s = (await admin.post('/api/sessions', { consoleId: c2.id, customerName: 'Budi', durationMinutes: 60 })).body.data.session
    const tx = (await admin.post(`/api/sessions/${s.id}/finish`, { paymentMethod: 'cash', amountPaid: 100000 })).body.data.transaction
    await admin.post(`/api/transactions/${tx.id}/void`, { reason: 'salah input kasir' })

    // perubahan password sendiri
    await customer.post('/api/auth/change-password', {
      currentPassword: USER.password, newPassword: 'PasswordGanti567',
    })

    const actions = db.prepare('SELECT DISTINCT action FROM audit_logs').all().map((r) => r.action)
    const required = [
      'user_created', 'user_updated', 'user_deactivated', 'settings_updated',
      'console_deactivated', 'booking_created', 'booking_updated', 'booking_cancelled',
      'transaction_voided', 'password_changed', 'session_started', 'session_finished',
    ]
    for (const a of required) assert.ok(actions.includes(a), `audit action ${a} harus ada`)

    // perubahan hak akses (role) tercatat sebagai field yang berubah
    const roleAudit = db.prepare("SELECT meta_json FROM audit_logs WHERE action = 'user_updated'").all()
    const metas = roleAudit.map((r) => JSON.parse(r.meta_json || '{}'))
    assert.ok(metas.some((m) => Array.isArray(m.changed) && m.changed.includes('role')), 'perubahan role tercatat di audit')
  })
})

test('C2 Audit log CLI: db_backup, db_restore, admin_bootstrap, admin_password_reset', async () => {
  const dir = mkTmpDir('playrent-audit-cli-')
  const dbFile = makeDb(join(dir, 'app.db'))

  // backup
  const bk = runCli('backup.js', { dbPath: dbFile })
  assert.equal(bk.status, 0)
  let db = openDatabase(dbFile)
  const backupAudit = db.prepare("SELECT meta_json FROM audit_logs WHERE action = 'db_backup'").all()
  assert.equal(backupAudit.length, 1, 'audit db_backup tercatat')
  const meta = JSON.parse(backupAudit[0].meta_json)
  assert.ok(meta.file && meta.bytes > 0 && meta.users === 3 && meta.transactions === 0, 'meta backup benar')
  db.close()

  // restore
  const backupFile = join(backupsOf(dbFile), readdirSync(backupsOf(dbFile)).find((f) => f.startsWith('playrent-')))
  const rs = runCli('restore.js', { dbPath: dbFile, args: [backupFile], input: 'RESTORE\n' })
  assert.equal(rs.status, 0)
  db = openDatabase(dbFile)
  assert.equal(db.prepare("SELECT COUNT(*) c FROM audit_logs WHERE action = 'db_restore'").get().c, 1, 'audit db_restore tercatat')
  db.close()

  // bootstrap + reset password admin
  const dir2 = mkTmpDir('playrent-audit-boot-')
  const db2 = makeDb(join(dir2, 'boot.db'))
  // hapus superadmin bawaan supaya bootstrap bisa membuat yang baru
  const d = openDatabase(db2)
  d.prepare("DELETE FROM users WHERE role = 'superadmin'").run()
  d.close()
  const first = runCli('admin-bootstrap.js', { dbPath: db2, env: { ADMIN_USERNAME: 'owner', ADMIN_PASSWORD: 'PasswordOwner123' } })
  assert.equal(first.status, 0, first.stderr)
  const force = runCli('admin-bootstrap.js', { dbPath: db2, args: ['--force'], env: { ADMIN_USERNAME: 'owner', ADMIN_PASSWORD: 'PasswordOwner456' } })
  assert.equal(force.status, 0, force.stderr)
  const d2 = openDatabase(db2)
  try {
    const actions = d2.prepare('SELECT DISTINCT action FROM audit_logs').all().map((r) => r.action)
    assert.ok(actions.includes('admin_bootstrap'), 'audit admin_bootstrap tercatat')
    assert.ok(actions.includes('admin_password_reset'), 'audit admin_password_reset tercatat')
  } finally {
    d2.close()
  }
})

test('C3 Password, hash, dan token sesi tidak pernah muncul di audit_logs', async () => {
  const SECRET = 'SecretAuditValue-9f3a-ZZZ'
  const SECRET2 = 'SecretAuditValue-2nd-Pass'
  const SECRET3 = 'SecretAuditValue-3rd-Pass'

  await withServer(async ({ login, db }) => {
    const admin = await login(ADMIN.username, ADMIN.password)
    const customer = await login(USER.username, USER.password)
    const token = admin.cookie.split('=')[1]

    // akun dibuat dengan password, lalu password-nya diganti, lalu password sendiri diganti
    const created = await admin.post('/api/users', {
      username: 'audi', fullName: 'Audi', password: SECRET, role: 'user',
    })
    assert.equal(created.status, 201, JSON.stringify(created.body))
    const uid = db.prepare("SELECT id FROM users WHERE username = 'audi'").get().id
    await admin.patch(`/api/users/${uid}`, { password: SECRET2 })
    await customer.post('/api/auth/change-password', {
      currentPassword: USER.password, newPassword: SECRET3,
    })
    await admin.put('/api/settings', { business: { name: 'Audit' } })

    // seluruh baris audit
    const rows = db.prepare('SELECT * FROM audit_logs').all()
    assert.ok(rows.length > 0, 'ada baris audit')
    const dump = JSON.stringify(rows)
    assert.ok(!dump.includes(SECRET), 'password akun baru tidak boleh muncul di audit_logs')
    assert.ok(!dump.includes(SECRET2), 'password hasil reset tidak boleh muncul di audit_logs')
    assert.ok(!dump.includes(SECRET3), 'password baru tidak boleh muncul di audit_logs')
    assert.ok(!dump.includes(ADMIN.password), 'password admin tidak boleh muncul di audit_logs')
    assert.ok(!dump.includes(USER.password), 'password pelanggan tidak boleh muncul di audit_logs')
    assert.ok(!dump.includes(token), 'token sesi tidak boleh muncul di audit_logs')
    assert.ok(!dump.includes('password_hash') && !dump.includes('password_salt'), 'nama kolom hash tidak boleh muncul')

    // meta_json: tidak boleh memuat kunci kredensial
    for (const row of rows) {
      if (!row.meta_json) continue
      assert.ok(!/password|token|secret|salt|hash/i.test(row.meta_json), `meta_json memuat kunci sensitif: ${row.meta_json}`)
    }
  })
})
