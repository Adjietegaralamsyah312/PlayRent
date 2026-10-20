// Production-safe seed: schema + catalog only.
//
// The demo seeder (`npm run seed`) also creates 44 days of fake transactions
// and a live "Demo Live" session. That is fine for a demo and poison for a
// real installation: the fake transactions show up in every report and the
// live session squats on a console.
//
// This script writes only the master data an operator needs to start:
//   - the single business_settings row (already created by migration v4)
//   - the catalog: consoles, game catalog, duration packages
// No transactions, no sessions, no bookings, no accounts.
//
// Run: node src/seed-schema.js
import { withTx, migrate } from './db.js'
import db from './db.js'
import { insertConsoles, insertGames, insertPackages, insertSettings } from './seed.js'

export function seedSchema() {
  return withTx(db, () => {
    insertConsoles(db)
    insertGames(db)
    insertPackages(db)
    insertSettings(db)
  })
}

// node src/seed-schema.js
if (import.meta.url === `file://${process.argv[1]}`) {
  migrate(db)
  seedSchema()
  const counts = {}
  for (const t of ['consoles', 'game_catalog', 'packages', 'business_settings', 'transactions', 'rental_sessions', 'bookings', 'users']) {
    counts[t] = db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c
  }
  console.log('[seed:schema] done', JSON.stringify(counts))
}
