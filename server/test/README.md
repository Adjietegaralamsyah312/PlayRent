# Backend tests

`node:test` + `node:assert/strict` + global `fetch`. No new dependencies.

## Run

```sh
npm test                 # everything (all *.test.js + the manual smoke run)
npm run test:smoke       # just the original manual smoke script
node --test test/pricing.test.js   # a single file
```

Every file is self-contained: `withServer()` opens a unique throwaway SQLite
DB, migrates it, seeds the two demo users + the single settings row, listens on
a random port, and always closes/deletes on the way out. `node:test` runs each
file in its own process, so files never share state.

> Node 26 note: passing a bare directory (`node --test test/`) is resolved as a
> module and fails. Use `node --test` (auto-discovery) or an explicit file/glob.

## plan.md section O → file map

| plan.md item | File |
| --- | --- |
| O1 login valid/invalid | `auth.test.js` |
| O2 admin vs cashier permissions | `auth.test.js` |
| O3 unit create/update + persistence | `consoles.test.js` |
| O4 session snapshot + `in_use` | `sessions.test.js` |
| O5 no double-booking (sequential / concurrent / after finish) | `sessions.test.js` |
| O6 pricing + rate snapshot | `pricing.test.js` |
| O7 extend | `sessions.test.js` |
| O8 overtime grace + rate | `pricing.test.js` |
| O9 timer survives reload | `timer.test.js` |
| O10 booking overlaps / cancel / checked-in | `bookings.test.js` |
| O10 finish frees the unit | `sessions.test.js` |
| O11 void (admin-only, frees unit, audit) | `sessions.test.js` |
| O12 transactions: change, numbering, insufficient, finish-once, server totals | `transactions.test.js` |
| O13 reports: Jakarta bounds, paid/unpaid/void, CSV bytes | `reports.test.js` |
| O14 validation / malformed JSON / 404 / generic 500 | `validation.test.js` |
| N security: SQLi sinks + mass assignment | `security.test.js` |

## BE-005 (plan.md §8) → file map

| Kriteria | Test |
| --- | --- |
| K1–K3 login benar/salah, seluruh modul terbuka | `be005-criteria.test.js` |
| K4–K6 unit, sesi rental, timer konsisten | `be005-criteria.test.js` |
| K7–K8 booking (409 konflik), transaksi + laporan | `be005-criteria.test.js` |
| K9–K11 kasir nonaktif, seed tanpa akun, sesi dicabut | `be005-criteria.test.js` |
| K12–K15 endpoint 401, integritas historis, role dari browser | `be005-criteria.test.js` |
| K16 build/typecheck/probe/test lama utuh | `be005-criteria.test.js` |
| K17–K19 register (201/400/409/429) | `be005-criteria.test.js` |
| K20–K22 batas role user, booking milik sendiri, data tersanitasi | `be005-criteria.test.js` |
| K23 CLI `admin:bootstrap` | `be005-criteria.test.js` |
| K24 CLI backup & restore (valid, rusak, batal, positif) | `be005-backup.test.js` |
| C1–C3 audit log lengkap, password tak pernah bocor | `be005-backup.test.js` |

> CLI test memanggil `src/backup.js`, `src/restore.js`, `src/seed.js`, dan
> `src/admin-bootstrap.js` sebagai proses anak dengan `DB_PATH` temporer —
> database development tidak pernah disentuh.


## Contract nuance

`POST /api/sessions/:id/finish` uses a **strict** zod schema. A client-supplied
`total` is rejected with `400 VALIDATION_ERROR` rather than silently ignored.
`transactions.test.js` asserts the rejection **and** that a normal finish stores
the server-computed total — the server never trusts a client amount.
