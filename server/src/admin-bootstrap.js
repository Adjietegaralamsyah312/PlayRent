// Super Admin bootstrap CLI — creates the FIRST superadmin, or resets the
// password of the existing one with --force.
//
//   npm run admin:bootstrap            # interactive (TTY) or env vars (CI)
//   npm run admin:bootstrap -- --force # reset the password of the existing superadmin
//
// TTY:  prompts for username (default "admin") and the password twice, no echo.
// CI:   reads ADMIN_USERNAME / ADMIN_PASSWORD from the environment.
//
// The password is never printed, never logged, and never stored in plaintext.
// This CLI is local-only: it exposes no HTTP endpoint.
import db, { migrate } from './db.js'
import { hashPassword, revokeAllForUser } from './lib/auth.js'
import { logAudit } from './lib/audit.js'
import { isUniqueViolation } from './lib/errors.js'
import { dbPath } from './config.js'

const USERNAME_RE = /^[a-z0-9._]{3,32}$/
const MIN_PASSWORD = 8

const fail = (message) => {
  console.error(`[admin:bootstrap] GAGAL: ${message}`)
  process.exit(1)
}

/** Read one line from the TTY. `echo: false` hides the keystrokes. */
const prompt = (question, { echo = true } = {}) => new Promise((resolve, reject) => {
  const stdin = process.stdin
  process.stdout.write(question)
  if (stdin.isTTY) stdin.setRawMode(true)
  stdin.resume()
  stdin.setEncoding('utf8')

  let value = ''
  const cleanup = () => {
    stdin.off('data', onData)
    if (stdin.isTTY) stdin.setRawMode(false)
    stdin.pause()
  }
  const onData = (chunk) => {
    for (const ch of chunk) {
      if (ch === '\r' || ch === '\n') {
        cleanup()
        process.stdout.write('\n')
        return resolve(value)
      }
      if (ch === '\u0003') { // Ctrl-C
        cleanup()
        process.stdout.write('\n')
        return reject(new Error('dibatalkan'))
      }
      if (ch === '\u007f' || ch === '\b') {
        value = value.slice(0, -1)
        if (echo) process.stdout.write('\b \b')
        continue
      }
      if (ch < ' ') continue
      value += ch
      if (echo) process.stdout.write(ch)
    }
  }
  stdin.on('data', onData)
})

const readCredentials = async () => {
  const isTTY = Boolean(process.stdin.isTTY && process.stdout.isTTY)
  if (!isTTY) {
    const password = process.env.ADMIN_PASSWORD ?? ''
    const username = (process.env.ADMIN_USERNAME ?? '').trim() || 'admin'
    if (!password) fail('ADMIN_PASSWORD belum diisi (mode non-interaktif).')
    return { username, password }
  }
  const username = (await prompt('Username Super Admin [admin]: ')).trim() || 'admin'
  const first = await prompt('Kata sandi: ', { echo: false })
  const second = await prompt('Ulangi kata sandi: ', { echo: false })
  if (first !== second) fail('Konfirmasi kata sandi tidak cocok.')
  return { username, password: first }
}

const main = async () => {
  const force = process.argv.includes('--force')
  const { username, password } = await readCredentials()

  if (!USERNAME_RE.test(username)) {
    fail('Username hanya boleh huruf kecil, angka, titik, dan garis bawah, 3–32 karakter.')
  }
  if (!password || password.length < MIN_PASSWORD) {
    fail(`Kata sandi minimal ${MIN_PASSWORD} karakter.`)
  }

  migrate(db)

  const superadmins = db.prepare(
    "SELECT id, username, full_name FROM users WHERE role = 'superadmin' ORDER BY id ASC",
  ).all()

  if (superadmins.length === 0) {
    const { hash, salt } = hashPassword(password)
    const now = new Date().toISOString()
    let id
    try {
      const info = db.prepare(
        `INSERT INTO users
         (username, full_name, password_hash, password_salt, role, is_active, phone, created_at, updated_at)
         VALUES (?,?,?,?,'superadmin',1,NULL,?,?)`,
      ).run(username, 'Super Admin', hash, salt, now, now)
      id = Number(info.lastInsertRowid)
    } catch (err) {
      if (isUniqueViolation(err, 'users')) fail(`Username "${username}" sudah dipakai akun lain.`)
      throw err
    }
    logAudit(db, {
      actorId: id, actorName: username, action: 'admin_bootstrap',
      entity: 'users', entityId: id, description: 'Akun Super Admin pertama dibuat',
      meta: { source: 'cli' },
    })
    console.log(`[admin:bootstrap] Super Admin "${username}" berhasil dibuat.`)
    console.log('[admin:bootstrap] Silakan masuk dengan username tersebut.')
    return
  }

  if (!force) {
    console.error(
      `[admin:bootstrap] Super Admin sudah ada (${superadmins.map((u) => `"${u.username}"`).join(', ')}). ` +
      'Jalankan ulang dengan --force untuk mengatur ulang kata sandi.',
    )
    process.exit(1)
  }

  // --force: reset the password of the existing superadmin, never create a duplicate.
  const target = superadmins.find((u) => u.username === username) ?? superadmins[0]
  const { hash, salt } = hashPassword(password)
  db.prepare(
    `UPDATE users SET password_hash = ?, password_salt = ?, is_active = 1, updated_at = ? WHERE id = ?`,
  ).run(hash, salt, new Date().toISOString(), target.id)
  revokeAllForUser(db, target.id)
  logAudit(db, {
    actorId: target.id, actorName: target.username, action: 'admin_password_reset',
    entity: 'users', entityId: target.id, description: 'Kata sandi Super Admin diatur ulang lewat CLI',
    meta: { source: 'cli', force: true },
  })
  console.log(`[admin:bootstrap] Kata sandi Super Admin "${target.username}" berhasil diatur ulang.`)
  console.log('[admin:bootstrap] Semua sesi lama akun tersebut sudah dihentikan.')
}

try {
  await main()
} catch (err) {
  console.error(`[admin:bootstrap] GAGAL: ${err?.message || err}`)
  console.error(`[admin:bootstrap] db=${dbPath}`)
  process.exit(1)
}
