# Laporan Perbaikan Batch 1 — Uang & Integritas Data

**Agent:** @node-developer · **Task:** BE-FIX-1 · **Tanggal:** 20 Okt 2026
**Kontrak:** `specs/fix-contract.md` (FROZEN) · **Audit:** `specs/audit-be-report.md`
**Status verifikasi:** **`verified`**

---

## 1. Ringkasan

| ID | Status | File inti yang diubah |
| --- | --- | --- |
| BE-001 | ✅ selesai | `server/src/db.js`, `server/src/lib/settings.js`, `server/src/lib/db-backup.js`, `server/src/seed.js`, `server/src/seed-schema.js` (baru), `server/package.json`, `README.md` |
| BE-002 | ✅ selesai | `server/src/routes/sessions.js` |
| BE-003 | ✅ selesai | `server/src/routes/reports.js` |
| BE-004 | ✅ selesai | `server/src/routes/transactions.js` |
| BE-005 | ✅ selesai | `server/src/routes/sessions.js` |
| BE-006 | ✅ selesai | `server/src/routes/bookings.js` |
| BE-010 | ✅ selesai | `server/src/routes/sessions.js` |
| BE-014 | ✅ selesai | `server/src/routes/sessions.js` |
| BE-015 | ✅ selesai | `server/src/routes/users.js` |

Tidak ada file `web/` yang disentuh. `api-contract.md` **tidak** disentuh (Batch 2) — daftar
perubahan bentuk JSON ada di §4.

---

## 2. Tabel: temuan → file → apa yang berubah → cara verifikasi

| ID | File yang diubah | Apa yang berubah | Cara verifikasi |
| --- | --- | --- | --- |
| **BE-003** | `server/src/routes/reports.js` | `GET /reports/payments`: `items` = `rows.map(mapTransaction)` (objek transaksi UTUH, bukan `{at, method, status}`). `totals` = `{count, gross, paid, outstanding, voided}`; `voided` = **count** transaksi void (sebelumnya Σ rupiah). `subtotal` **dihapus**. `byMethod` dipertahankan sebagai tambahan (hanya baris non-void). Filter `method` & `status` tetap bekerja. | `test/fix-batch1.test.js` → "BE-003 /reports/payments: totals kanonik + items berupa transaksi utuh" |
| **BE-004** | `server/src/routes/transactions.js` | `itemsFor()` kini mengembalikan `{id, kind, description, qty, unitPrice, lineTotal}` (`description`←`label`, `qty`←`quantity`, `lineTotal`←`amount`). `renderReceiptHtml` **dan** `renderReceiptText` diperbarui ke nama baru (satu sumber nama). `GET /transactions/:id` otomatis ikut. | "BE-004 /transactions/:id items[] memakai nama kanonik" (termasuk assertion: struk HTML tidak memuat "undefined") |
| **BE-002** | `server/src/routes/sessions.js` | `POST /sessions/quote` dipecah 2 jalur sesuai tabel kontrak §2. **Jalur `sessionId`**: planned = `session.planned_minutes + extraMinutes`, `hourlyRate` = `session.rate_snapshot`, `actual` = `minutesBetween(session.started_at, now)` → overtime nyata. **Jalur plan**: planned = `durationMinutes + extraMinutes`, tarif = `console.hourly_rate`, `actual` = `startedAt ? max(0, minutesBetween(startedAt, now)) : planned`. Body schema menambah `sessionId` (opsional) dan membuat `consoleId`/`durationMinutes` opsional di level zod; handler menegakkan "salah satu wajib". 404 `SESSION_NOT_FOUND` / 409 `SESSION_NOT_ACTIVE` / 400 `VALIDATION_ERROR` (tanpa sessionId **dan** tanpa plan). `extraMinutes` **selalu** menambah durasi rencana — tidak pernah menjadi menit overtime. | "BE-002 quote(sesi overtime) == finish(sesi overtime), selisih 0 rupiah" + "BE-002 quote: jalur sesi (404/409), jalur plan, dan extraMinutes" |
| **BE-001** | `server/src/db.js`, `server/src/lib/settings.js`, `server/src/lib/db-backup.js`, `server/src/seed.js`, `server/src/seed-schema.js` (baru), `server/package.json`, `README.md` | ① **Migrasi baru `v4_businessSettings`** di append ujung `MIGRATIONS` (v1/v2/v3 **tidak** disentuh): `INSERT OR IGNORE` baris `id = 1` dengan default yang **identik** dengan `seed.js`. ② Nilai default dipindah ke satu sumber kebenaran: `DEFAULT_SETTINGS_ROW` di `lib/settings.js`, dipakai bersama oleh migrasi **dan** seeder. ③ `getSettingsRow(db)` fallback ke baris default (`DEFAULT_RULES` + `business_name: 'PlayRent'`) bila baris hilang — tidak lagi `TypeError` → 500. ④ `updateSettingsRow(db, patch)` = **UPSERT** (`INSERT … ON CONFLICT(id) DO UPDATE`); route `PUT /settings` memakainya (sebelumnya `UPDATE` biasa yang diam-diam update 0 baris). ⑤ `CURRENT_SCHEMA_VERSION` 3 → **4**; `inspectDatabase()` kini juga mengecek `REQUIRED_COLUMNS` (kolom yang dibaca jalur uang) → restore DB lama ditolak saat itu, bukan 500 saat boot. ⑥ Script baru **`npm run seed:schema`** (`server/src/seed-schema.js`): baris settings + katalog (10 unit, 14 game, 4 paket) — **tanpa** 44 hari transaksi fiktif, **tanpa** sesi demo aktif, tanpa booking, tanpa akun. `npm run seed` tetap = seeder demo. ⑦ `README.md`: jalur instalasi produksi diarahkan ke `seed:schema`; tabel migrasi ditulis `user_version = 4` + baris v4. `specs/database.md` += bagian "Migrasi v4". | "BE-001 migrasi v4: DB tanpa seed punya baris business_settings dan jalur uang tidak 500" (boot app nyata di DB yang tidak pernah di-seed: `/settings`, `/sessions/quote`, `/sessions` semua bukan 500) + "BE-001 seed:schema mengisi katalog tanpa transaksi/sesi demo" + `node src/seed-schema.js` dijalankan 2× → jumlah identik |
| **BE-005** | `server/src/routes/sessions.js` | `GET /sessions` **dan** `GET /sessions/active` memanggil `markOverdue(db)` sebelum filter/diagram. `?status=overdue` tidak lagi kosong; sesi terlambat tidak lagi muncul sebagai "aktif". | "BE-005 GET /sessions?status=overdue mengembalikan sesi terlambat" (overdue 1 item, active 0 item) |
| **BE-006** | `server/src/routes/bookings.js` | `POST /bookings/:id/cancel` → **409 `BOOKING_ALREADY_CHECKED_IN`** bila `status = 'checked_in'` **atau** `session_id` terisi. Booking + sesi tak tersentuh. (Kode error baru: `lib/errors.js` **tidak** disentuh — `AppError` menerima message eksplisit.) | "BE-006 booking yang sudah check-in tidak bisa dibatalkan (409)" |
| **BE-010** | `server/src/routes/sessions.js` | `POST /sessions` body `startedAt` dibatasi lewat `zod.refine`: tolak **400 `VALIDATION_ERROR`** bila > 24 jam ke belakang atau > 5 menit ke depan. Batas disengaja (lebar) agar entri larut tetap bisa. | "BE-010 startedAt dibatasi: > 24 jam lalu dan > 5 menit depan ditolak 400" |
| **BE-014** | `server/src/routes/sessions.js` | `finish` non-tunai (`transfer`/`qris`): `amountPaid` = `body.amountPaid` bila > 0, else `total`; `changeDue` tetap **0**. Tunai tidak berubah (`amountPaid >= total` wajib, kembalian = selisih). | "BE-014 pembayaran non-tunai mencatat nominal yang benar-benar diterima" |
| **BE-015** | `server/src/routes/users.js` | `POST /users`: `INSERT` dibungkus try/catch → `isUniqueViolation(err, 'users')` → **409 `DUPLICATE_USERNAME`** (bukan 500). | "BE-015 username ganda dibalas 409 DUPLICATE_USERNAME, bukan 500" |

### File yang ikut berubah (pelengkap / konsumen)

| File | Mengapa |
| --- | --- |
| `server/test/helpers.js` | `seedBase()` memakai `INSERT` biasa → bentrok PK dengan baris hasil migrasi v4. Diganti **UPSERT** (fixture test tetap berkuasa). Nilai aturan tidak berubah. |
| `server/test/be006-rv003.test.js` | Mengasumsikan `user_version = 3` → **diupdate** ke 4 (tes tetap ada, tidak di-skip, tidak dihapus). |
| `server/tools/security-probe.mjs` | Pemicu DISC-1 (hapus baris settings →|TypeError) **tidak berlaku lagi** karena BE-001. Pemicu diganti (`DROP TABLE rental_sessions` → error driver asli) sehingga intent cek ("error internal → 500 generik, tanpa bocor stack/SQL") tetap diuji. Assertion tidak dilonggarkan. |
| `server/src/seed.js` | `insertSettings` memakai `DEFAULT_SETTINGS_ROW`; `insertConsoles/insertGames/insertPackages` di-`export` agar dipakai `seed-schema.js`. Perilaku lain tidak berubah. |
| `server/src/routes/settings.js` | `PUT /settings` memakai `updateSettingsRow` (UPSERT). Bentuk response & audit (`before`/`after`) tidak berubah. |

---

## 3. Hasil `npm test` (verbatim)

```
$ cd server && npm test
ℹ tests 83
ℹ suites 0
ℹ pass 83
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 43374.700504
```

**83 lulus / 0 gagal** = 72 tes lama (semua tetap lulus, 1 di-update) + 11 tes regresi baru
(`server/test/fix-batch1.test.js`). Smoke test di dalamnya: **110/110 checks passed**.

Probe keamanan (tambahan, di luar `npm test`):

```
$ node tools/security-probe.mjs
blockers=0  majors=0  minors=0  total=69
VERDICT: PASS
```

---

## 4. Daftar perubahan bentuk JSON (untuk pembaruan `api-contract.md` — Batch 2)

> `api-contract.md` **tidak** disentuh di Batch 1. Daftar di bawah adalah bahan untuk
> pembaruan kontrak di Batch 2.

### 4.1 `GET /reports/payments` — §R6

```jsonc
{
  "items": [ /* Transaction[] — objek transaksi UTUH (mapTransaction) */ ],
  "totals": {
    "count": 4,          // jumlah baris (termasuk void)
    "gross": 55000,      // Σ total, status != 'void'
    "paid": 50000,       // Σ total, status != 'void' AND payment_status = 'paid'
    "outstanding": 5000, // Σ total, status != 'void' AND payment_status = 'unpaid'
    "voided": 1,         // JUMLAH transaksi void (count, bukan rupiah)
    "byMethod": { "cash": { "count": 1, "total": 20000 }, "transfer": {}, "qris": {} } // tambahan, opsional
  }
}
```

- **Dihapus:** `totals.recorded`, `totals.subtotal`; field item `at`, `method`.
- **`items[]` kini `Transaction[]`** — `createdAt`, `paymentMethod`, `paymentStatus`, `number`,
  `customerName`, `consoleCode`, `total`, `status` (= status transaksi, bukan payment_status), dll.
- Nama `gross`/`paid`/`outstanding` sengaja disamakan dengan `GET /transactions` (yang tidak berubah).

### 4.2 `GET /transactions/:id` — §T2

```jsonc
"items": [
  { "id": 1, "kind": "rental", "description": "Sewa PS-01 60 menit", "qty": 1, "unitPrice": 8000, "lineTotal": 8000 }
]
```

- **Dihapus:** `label`, `quantity`, `amount`. `kind` tetap ada.
- Struk HTML/teks memakai nama yang sama (satu sumber).

### 4.3 `POST /sessions/quote` — §S1

**Body (baru, `sessionId` opsional):**

```jsonc
{
  "sessionId": 12,        // opsional — pratinjau SESI YANG SEDANG BERJALAN
  "consoleId": 1,         // wajib bila sessionId tidak ada
  "durationMinutes": 60,  // wajib bila sessionId tidak ada
  "startedAt": "2026-10-20T10:00:00Z", // opsional (hanya jalur plan)
  "extraMinutes": 30      // opsional — menit tambahan pada durasi rencana
}
```

**Response tidak berubah bentuknya:** `{durationMinutes, billableMinutes, hourlyRate, subtotal,
overtimeMinutes, overtimeAmount, discount, total, currency:'IDR'}`.

**Semantik baru (wajib didokumentasikan):**

| | jalur `sessionId` (sesi hidup) | jalur plan (tanpa `sessionId`) |
|---|---|---|
| `planned` | `session.planned_minutes + (extraMinutes ?? 0)` | `durationMinutes + (extraMinutes ?? 0)` |
| `hourlyRate` | `session.rate_snapshot` | `console.hourly_rate` |
| `actual` | `minutesBetween(session.started_at, now)` | `startedAt ? max(0, minutesBetween(startedAt, now)) : planned` |

- `sessionId` tidak ada → sesi wajib ada (**404 `SESSION_NOT_FOUND`**) dan berstatus
  `active`/`overdue` (**409 `SESSION_NOT_ACTIVE`**).
- Tanpa `sessionId` **dan** tanpa (`consoleId` + `durationMinutes`) → **400 `VALIDATION_ERROR`**.
- `extraMinutes` **selalu** menambah durasi rencana; menit overtime hanya muncul dari
  `actual > planned`. Konsekuensi yang perlu diketahui client: pada sesi yang **sudah terlambat**,
  perpanjangan memindahkan menit overtime menjadi menit rencana — kalau tarif sewa == tarif
  overtime, total **tidak berubah** (selisih = 0). Kalau tarif overtime > tarif sewa, total bisa
  justru turun. FE-004/FE-010 sebaiknya menampilkan selisih apa adanya, bukan mengarang biaya
  tambahan.
- `discount` & `extraCharge` tetap tidak bisa diparameterkan di quote (ditagih di `finish`).

### 4.4 Migrasi v4 + `seed:schema`

- `MIGRATIONS` di `server/src/db.js` kini 4 langkah; `PRAGMA user_version` = **4**;
  `CURRENT_SCHEMA_VERSION` di `server/src/lib/db-backup.js` = **4**.
- `business_settings` baris `id = 1` dibuat oleh migrasi → **baris default** tersedia di setiap
  DB produksi, tanpa perlu seeder. `GET /settings` tidak lagi 500 di DB kosong.
- `GET /settings` fallback (bila baris hilang): `business.name = 'PlayRent'`, aturan =
  `DEFAULT_RULES` (`minDurationMinutes 30`, `roundingMinutes 15`, `overtimeRatePerHour 10000`,
  `overtimeGraceMinutes 0`, `defaultHourlyRate 10000`, `warnMinutes [10,5,1]`).
- **Script baru:** `npm run seed:schema` → `server/src/seed-schema.js` (baris settings + katalog
  minimum; **tanpa** transaksi fiktif & **tanpa** sesi demo). `npm run seed` tetap = seeder demo.

### 4.5 Kode error baru

| Kode | HTTP | Endpoint | Kapan |
| --- | --- | --- | --- |
| `BOOKING_ALREADY_CHECKED_IN` | 409 | `POST /bookings/:id/cancel` | Booking sudah `checked_in` (punya sesi hidup). Pesan: "Booking sudah check-in dan tidak bisa dibatalkan". |

---

## 5. Catatan & follow-up untuk Batch 2 / Leader

1. **FE-004/FE-010 — biaya perpanjangan pada sesi terlambat.** Dengan tarif sewa == tarif overtime
   (kondisi default fixture/test: 12.000/jam), `quote({sessionId, extraMinutes})` − `quote({sessionId})`
   = **Rp 0** untuk sesi yang sudah overtime, karena 30 menit overtime dipindah menjadi 30 menit
   rencana. Client sebaiknya menampilkan selisih apa adanya (boleh 0), bukan menghitung sendiri.
   Bila produk ingin "biaya perpanjangan" selalu positif untuk sesi terlambat, itu **perubahan
   kontrak §2** dan perlu keputusan Leader (bukan perbaikan server sepihak).
2. **BE-014 — nominal non-tunai di bawah total.** Kontrak §2/§4 menetapkan `amountPaid` = nominal
   diterima tanpa validasi minimum; jadi `qris` Rp 1 untuk tagihan Rp 8.000 tercatat `paid` dengan
   `amount_paid = 1`. Saya implementasikan **persis** kontrak (tidak menambah validasi sendiri).
   Bila ingin ditolak → `400 INSUFFICIENT_PAYMENT` (butuh konfirmasi kontrak).
3. **Nilai default `business_settings`.** `business_name` = `'PlayRent'` (sesuai literal kontrak
   §3), alamat/telepon mengikuti `seed.js` (identik dengan seeder, sesuai kontrak). Keduanya
   placeholder — pemilik wajib menggantinya lewat halaman **Pengaturan**. Sudah ditulis di README.
4. **`GET /reports/payments` — `totals.count` termasuk void**, `gross` tidak. Sudah sesuai kontrak
   §1.1, tapi perlu dicatat di §R6 karena `GET /transactions` memakai basis hitung yang sama.
5. **Belum dikerjakan (Batch 2, sesuai brief):** BE-007, BE-008, BE-011, BE-012, BE-013, BE-016,
   BE-018a, BE-018b. Tidak ada file yang bentrok dengan Batch 2 — `routes/reports.js` hanya saya
   ubah di handler `/payments` (§1.1).
6. **`specs/database.md`** saya tambah 1 bagian ("Migrasi v4") agar spesifikasi basis data tidak
   menyimpang dari `user_version = 4`. `api-contract.md` sengaja tidak disentuh.

---

## 6. Status verifikasi

**`verified`**

- `cd server && npm test` → **83 pass / 0 fail** (72 lama + 11 regresi baru).
- `node tools/security-probe.mjs` → **PASS**, 0 blocker / 0 major / 0 minor (69 cek).
- `node src/seed-schema.js` diuji 2× pada DB kosong → idempotent, 0 transaksi / 0 sesi / 0 booking.
- Tidak ada `console.log` di kode produksi (hanya di entry point CLI, mengikuti pola `seed.js`).
- Tidak ada dependency baru; `web/` tidak disentuh; `pricing.js`, `errors.js`, `schema.sql`, dan
  `mapTransaction` tidak diubah.
