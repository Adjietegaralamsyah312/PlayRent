// PlayRent demo seed — idempotent, safe to run repeatedly.
//
// This seed creates NO login account. The Super Admin account is created by
// the owner through the separate bootstrap CLI (`npm run admin:bootstrap`),
// never with a password hardcoded in this file.
//
// Run: node src/seed.js
import { withTx, migrate } from './db.js'
import db from './db.js'

const nowIso = () => new Date().toISOString()

// deterministic RNG so re-seeding a fresh DB reproduces the same demo
let _s = 42
const rnd = () => (_s = (_s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
const pick = (a) => a[Math.floor(rnd() * a.length)]

const addMinutesIso = (iso, m) => new Date(Date.parse(iso) + m * 60000).toISOString()
const ceilRupiah = (minutes, ratePerHour) => Math.ceil((minutes * ratePerHour) / 60)

// one row per Jakarta-local day, N days back
function jakartaDay(offsetDays) {
  const d = new Date(Date.now() - offsetDays * 86400000)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d) // YYYY-MM-DD
}
const jakartaNoon = (offsetDays) => new Date(Date.now() - offsetDays * 86400000)

// ---------------------------------------------------------------------------

function insertConsoles(tx) {
  const stmt = tx.prepare(
    `INSERT OR IGNORE INTO consoles
     (code, console_type, room_type, controllers, hourly_rate, status, condition_note, is_active, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,1,?,?)`,
  )
  const rows = [
    ['PS-01', 'PS4', 'Reguler', 2, 8000, 'available', null],
    ['PS-02', 'PS4', 'Reguler', 2, 8000, 'available', null],
    ['PS-03', 'PS4', 'Reguler', 4, 10000, 'available', null],
    ['PS-04', 'PS5', 'Reguler', 2, 15000, 'available', null],
    ['PS-05', 'PS5', 'Reguler', 2, 15000, 'available', null],
    ['PS-06', 'PS5', 'Reguler', 4, 18000, 'available', null],
    ['PS-07', 'PS5', 'VIP', 4, 25000, 'available', 'Ruang ber-AC, sofa besar'],
    ['PS-08', 'PS5', 'VIP', 4, 25000, 'available', 'Ruang ber-AC, smart TV 55"'],
    ['PS-09', 'PS4', 'VIP', 4, 12000, 'available', null],
    ['PS-10', 'PS5', 'Reguler', 2, 15000, 'maintenance', 'Stick drift, menunggu sparepart'],
  ]
  const t = nowIso()
  for (const [code, type, room, ctrl, rate, status, note] of rows) {
    stmt.run(code, type, room, ctrl, rate, status, note, t, t)
  }
}

function insertGames(tx) {
  const games = [
    ['EA SPORTS FC 25', 'PS5', 'Sports', 2, 'Rak A1'],
    ['eFootball 2025', 'both', 'Sports', 2, 'Rak A2'],
    ['GTA V', 'both', 'Action', 1, 'Rak B1'],
    ['Tekken 8', 'PS5', 'Fighting', 2, 'Rak B2'],
    ['Tekken 7', 'PS4', 'Fighting', 2, 'Rak B3'],
    ['Mortal Kombat 11', 'PS4', 'Fighting', 2, 'Rak B4'],
    ['God of War Ragnarok', 'PS5', 'Action', 1, 'Rak C1'],
    ['Marvel Spider-Man 2', 'PS5', 'Action', 1, 'Rak C2'],
    ['Gran Turismo 7', 'both', 'Racing', 2, 'Rak D1'],
    ['Naruto Storm 4', 'PS4', 'Fighting', 2, 'Rak D2'],
    ['Dragon Ball FighterZ', 'PS4', 'Fighting', 2, 'Rak D3'],
    ['Minecraft', 'both', 'Sandbox', 4, 'Rak E1'],
    ['Rocket League', 'both', 'Sports', 2, 'Rak E2'],
    ['Elden Ring', 'PS5', 'RPG', 1, 'Rak F1'],
  ]
  const exists = tx.prepare('SELECT 1 FROM game_catalog WHERE title = ?')
  const ins = tx.prepare(
    `INSERT INTO game_catalog (title, platform, genre, recommended_controllers, availability_note, is_active, created_at, updated_at)
     VALUES (?,?,?,?,?,1,?,?)`,
  )
  const t = nowIso()
  for (const [title, platform, genre, ctrl, note] of games) {
    if (!exists.get(title)) ins.run(title, platform, genre, ctrl, note, t, t)
  }
}

function insertPackages(tx) {
  const rows = [
    ['Paket 1 Jam', 60, 8000, null],
    ['Paket 2 Jam', 120, 15000, null],
    ['Paket 3 Jam', 180, 21000, null],
    ['Paket VIP 2 Jam', 120, 45000, 'PS5'],
  ]
  const exists = tx.prepare('SELECT 1 FROM packages WHERE name = ?')
  const ins = tx.prepare(
    'INSERT INTO packages (name, duration_minutes, price, console_type, is_active, created_at) VALUES (?,?,?,?,1,?)',
  )
  const t = nowIso()
  for (const [name, dur, price, type] of rows) {
    if (!exists.get(name)) ins.run(name, dur, price, type, t)
  }
}

function insertSettings(tx) {
  tx.prepare(
    `INSERT OR IGNORE INTO business_settings
     (id, business_name, address, phone, receipt_footer, tax_note,
      min_duration_minutes, rounding_minutes, overtime_rate_per_hour, overtime_grace_minutes,
      default_hourly_rate, warn_minutes_json, payment_methods_json, updated_at)
     VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    'PlayRent Gaming Lounge',
    'Jl. Merdeka No. 45, Bandung, Jawa Barat',
    '0812-3456-7890',
    'Terima kasih telah bermain di PlayRent!',
    'Harga sudah termasuk pajak.',
    30, 15, 12000, 5, 15000, '[10,5,1]', '["cash","transfer","qris"]', nowIso(),
  )
}

const PAYMENTS = ['cash', 'cash', 'cash', 'transfer', 'qris']

// No user account is created by this seed, so demo rows cannot reference a
// user id. The `*_id` columns stay NULL and the human-readable snapshot
// keeps the receipt / report readable.
const CASHER_SNAPSHOT = 'Pemilik'
const ACTOR_SNAPSHOT = 'Sistem'

function seedHistory(tx) {
  const done = tx.prepare("SELECT COUNT(*) c FROM rental_sessions WHERE notes = 'seed-demo'").get().c
  if (done > 0) return
  const consoles = tx.prepare('SELECT id, code, hourly_rate FROM consoles WHERE is_active = 1').all()
  const seqByDay = new Map()

  const insSession = tx.prepare(
    `INSERT INTO rental_sessions
     (console_id, customer_name, status, started_at, ends_at, planned_minutes, billed_minutes,
      rate_snapshot, notes, created_by, finished_at, created_at, updated_at)
     VALUES (?,?,'finished',?,?,?,?,?,'seed-demo',?,?,?,?)`,
  )
  const insTx = tx.prepare(
    `INSERT INTO transactions
     (number, session_id, console_id, console_code, customer_name, cashier_id, cashier_name,
      subtotal, total, payment_method, payment_status, amount_paid, change_due, status, notes, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,'paid',?,?, 'completed','seed-demo',?)`,
  )
  const insItem = tx.prepare(
    'INSERT INTO transaction_items (transaction_id, kind, label, quantity, unit_price, amount) VALUES (?,?,?,?,?,?)',
  )
  const updSession = tx.prepare('UPDATE rental_sessions SET transaction_id = ? WHERE id = ?')
  const insAudit = tx.prepare(
    'INSERT INTO audit_logs (actor_id, actor_name, action, entity, entity_id, description, meta_json, created_at) VALUES (?,?,?,?,?,?,?,?)',
  )

  const names = ['Budi', 'Andi', 'Rizky', 'Dewi', 'Fajar', 'Siti', 'Agus', 'Nina', 'Bayu', 'Putri',
    'Wahyu', 'Indra', 'Rina', 'Tono', 'Sari', 'Dimas', 'Lina', 'Yoga', 'Maya', 'Hendra']

  for (let d = 44; d >= 1; d--) {
    const ymd = jakartaDay(d)
    const n = Math.floor(rnd() * 3) // 0..2 sessions per day
    for (let i = 0; i < n; i++) {
      const c = pick(consoles)
      // peak-weighted hour: 16:00-23:00 heavy, else 10:00-15:00
      const hour = rnd() < 0.7 ? 16 + Math.floor(rnd() * 8) : 10 + Math.floor(rnd() * 6)
      const minute = pick([0, 15, 30, 45])
      const startMs = Date.parse(`${ymd}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+07:00`)
      const planned = pick([60, 60, 120, 120, 180])
      const billed = Math.ceil(planned / 15) * 15
      const subtotal = ceilRupiah(billed, c.hourly_rate)
      const method = pick(PAYMENTS)
      const startedIso = new Date(startMs).toISOString()
      const endedIso = addMinutesIso(startedIso, planned)
      const name = pick(names)

      const sid = Number(insSession.run(
        c.id, name, startedIso, endedIso, planned, billed, c.hourly_rate, null, endedIso, startedIso, endedIso,
      ).lastInsertRowid)

      const key = ymd
      const seq = (seqByDay.get(key) || 0) + 1
      seqByDay.set(key, seq)
      const number = `TRX-${ymd.replace(/-/g, '')}-${String(seq).padStart(4, '0')}`
      const paid = method === 'cash' ? Math.ceil(subtotal / 5000) * 5000 : subtotal
      const tid = Number(insTx.run(
        number, sid, c.id, c.code, name, null, CASHER_SNAPSHOT,
        subtotal, subtotal, method, paid, paid - subtotal, endedIso,
      ).lastInsertRowid)
      insItem.run(tid, 'rental', `Sewa ${c.code} ${billed} menit`, 1, subtotal, subtotal)
      updSession.run(tid, sid)
      insAudit.run(null, ACTOR_SNAPSHOT, 'session_finished', 'rental_sessions', sid,
        `Sesi ${c.code} selesai - ${name}`, null, endedIso)
    }
  }
}

function seedLiveSession(tx) {
  const done = tx.prepare("SELECT 1 FROM rental_sessions WHERE notes = 'seed-demo-live'").get()
  if (done) return
  const c = tx.prepare("SELECT id, code, hourly_rate FROM consoles WHERE code = 'PS-03'").get()
  const startedIso = new Date(Date.now() - 20 * 60000).toISOString() // started 20 min ago
  const planned = 120
  tx.prepare(
    `INSERT INTO rental_sessions
     (console_id, customer_name, customer_contact, status, started_at, ends_at, planned_minutes,
      rate_snapshot, notes, created_by, created_at, updated_at)
     VALUES (?,?,'0812-0000-0000','active',?,?,?,?,'seed-demo-live',?,?,?)`,
  ).run(c.id, 'Demo Live', startedIso, addMinutesIso(startedIso, planned), planned, c.hourly_rate,
    null, startedIso, startedIso)
  tx.prepare("UPDATE consoles SET status = 'in_use', updated_at = ? WHERE id = ?").run(nowIso(), c.id)
}

function seedBookings(tx) {
  const done = tx.prepare("SELECT 1 FROM bookings WHERE notes = 'seed-demo'").get()
  if (done) return
  const cs = tx.prepare('SELECT id, code, hourly_rate FROM consoles WHERE is_active = 1').all()
  const ps1 = cs.find((c) => c.code === 'PS-01')
  const ps8 = cs.find((c) => c.code === 'PS-08')
  const ins = tx.prepare(
    `INSERT INTO bookings
     (console_id, customer_name, customer_contact, booking_date, start_time, duration_minutes,
      ends_at, started_at_epoch, ends_at_epoch, estimated_cost, status, notes, created_by, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,'seed-demo',?,?,?)`,
  )
  const mk = (c, name, contact, dayOffset, hhmm, dur, status) => {
    const date = jakartaDay(dayOffset) // negative offset = future day
    const epoch = Date.parse(`${date}T${hhmm}:00+07:00`)
    const endIso = new Date(epoch + dur * 60000).toISOString()
    const cost = ceilRupiah(dur, c.hourly_rate)
    const t = nowIso()
    ins.run(c.id, name, contact, date, hhmm, dur, endIso, epoch, epoch + dur * 60000, cost, status, null, t, t)
  }
  mk(ps1, 'Booking Besok', '0813-1111-2222', -1, '19:00', 120, 'confirmed')  // tomorrow
  mk(ps8, 'Booking Nanti', '0813-3333-4444', 0, '21:00', 60, 'pending')      // today later
}

export function seed() {
  const tx = db
  return withTx(tx, () => {
    insertConsoles(tx)
    insertGames(tx)
    insertPackages(tx)
    insertSettings(tx)
    seedHistory(tx)
    seedLiveSession(tx)
    seedBookings(tx)
  })
}

// node src/seed.js
if (import.meta.url === `file://${process.argv[1]}`) {
  migrate(db)
  seed()
  const counts = {}
  for (const t of ['users', 'consoles', 'game_catalog', 'packages', 'rental_sessions', 'transactions', 'transaction_items', 'bookings', 'business_settings', 'audit_logs']) {
    counts[t] = db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c
  }
  console.log('[seed] done', JSON.stringify(counts))
}
