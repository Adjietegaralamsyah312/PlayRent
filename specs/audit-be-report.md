# Audit Backend PlayRent — RV-BE-001

**Mode:** Audit saja (READ-ONLY pada `server/`). Tidak ada file implementasi yang diubah.
**Tanggal:** 20 Oktober 2026
**Objek audit:** `server/src/**` (11 route, 10 lib, db/schema/seed/CLI) vs `api-contract.md` (beku) vs `web/src/lib/{api,types}.ts` + pemakaian di `web/src/pages/**`.
**Baseline:** `cd server && npm test` → 72/72 PASS (verified ulang, tidak ada file yang saya ubah). `git status --porcelain` → kosong.

> **`AUDIT_HASIL.md` dinyatakan TIDAK dapat diandalkan.** Klaim §3 "Tidak ada bug, celah logika, masalah keamanan, inkonsistensi database, masalah timer, perhitungan harga, konflik booking, atau masalah hak akses yang ditemukan" bertentangan dengan 18 temuan di bawah ini, 8 di antaranya bisa direproduksi dengan HTTP biasa terhadap server yang sedang berjalan. Contoh paling jelas: sesi yang `ends_at`-nya sudah lewat **tetap muncul di filter `status=active`** dan **tidak pernah muncul di `status=overdue`**, dan preview pembayaran operator menunjukkan nominal yang berbeda dari nominal yang benar-benar ditagih.

---

## 1. Ringkasan Temuan

| Severity | Jumlah | ID |
|---|---|---|
| Blocker | 0 | — |
| Critical | 1 | BE-001 |
| Major | 7 | BE-002 … BE-008 |
| Minor | 10 | BE-009 … BE-018 |
| **Total** | **18** | |

---

## 2. Tabel Temuan

### BE-001 — `business_settings` hanya dibuat oleh seeder demo → jalur uang 500 di DB produksi

| | |
|---|---|
| **Severity** | **Critical** |
| **Lokasi** | `server/src/db.js:144-150` (daftar `MIGRATIONS`), `server/src/seed.js:101-116` (`insertSettings`), `server/src/lib/settings.js:3-4` (`getSettingsRow`), `server/src/lib/settings.js:10-12` (`rulesFromRow`) |

**Ringkasan.** Baris tunggal `business_settings` (id=1) tidak pernah dibuat oleh migrasi — hanya oleh `seed.js` — sehingga setiap endpoint yang membaca aturan harga melempar `TypeError` dan membalas **500 INTERNAL_ERROR**.

**Dampak nyata.**
1. Instalasi produksi yang benar ("migrate, jangan pakai data demo") **tidak bisa dipakai sama sekali**: `GET /settings`, `POST /sessions/quote`, `POST /sessions`, `POST /bookings` semuanya 500. Operator tidak bisa membuat sesi sewa, tidak bisa mengambil harga, halaman pengaturan kosong error.
2. Satu-satunya jalan keluar adalah `npm run seed` — dan seed itu juga mengisi **44 hari transaksi fiktif** (`seedHistory`, `server/src/seed.js:126-191`), 10 unit demo, 14 game, 4 paket, plus **sesi "Demo Live" aktif di PS-03** (`server/src/seed.js:193-207`). Semua data fiktif itu langsung masuk ke `GET /reports/summary`, `/reports/daily`, `/dashboard/summary` → **pemilik melihat pendapatan yang tidak pernah terjadi**, dan PS-03 terisi bayangan sehingga tidak bisa disewakan.

**Bukti reproduksi** (DB baru, `migrate()` saja tanpa seed):
```
$ node -e "process.env.DB_PATH='/tmp/fresh.db'; import('./server/src/db.js').then(async m=>{
    const db=m.openDatabase('/tmp/fresh.db'); m.migrate(db);
    console.log('business_settings rows =', db.prepare('SELECT COUNT(*) c FROM business_settings').get().c);
    db.close()})"
business_settings rows = 0

$ node -e "... boot app on that db, login, then:"
GET /api/settings        -> 500 {"code":"INTERNAL_ERROR"}
POST /api/sessions/quote -> 500 {"code":"INTERNAL_ERROR"}
POST /api/sessions       -> 500 {"code":"INTERNAL_ERROR"}
# server log: TypeError: Cannot read properties of undefined (reading 'business_name')
#             at settingsToApi (server/src/lib/settings.js:24:17)
```

**Usulan Fix.**
- Tambah migrasi baru `v4_businessSettings` di `server/src/db.js` (versi shipped tidak boleh diedit): `INSERT OR IGNORE INTO business_settings (id, business_name, …, updated_at) VALUES (1, 'PlayRent', …)` dengan default yang sama dengan `seed.js:114`. Naikkan `CURRENT_SCHEMA_VERSION` di `server/src/lib/db-backup.js:16` dari 3 → 4.
- `lib/db-backup.js:19` — `REQUIRED_TABLES` sudah memuat `business_settings`; tambahkan juga pemeriksaan kolom `min_duration_minutes` agar restore DB lama/v1 langsung ditolak, bukan 500 saat boot.
- Pisahkan data demo dari data schema: `npm run seed` → `npm run seed:schema` (baris settings + katalog minimum) dan `npm run seed:demo` (44 hari transaksi + sesi Demo Live), dan perbarui `README.md:146,188,218,308` supaya jalur instalasi produksi tidak pernah menyuntikkan transaksi fiktif.
- Tambahkan guard di `lib/settings.js:3`: `getSettingsRow` mengembalikan default bila baris tidak ada (atau lempar `AppError(503,'SETTINGS_MISSING')` dengan pesan jelas, bukan `TypeError`).

---

### BE-002 — `POST /sessions/quote` tidak pernah bisa mengembalikan baris overtime → preview pembayaran salah

| | |
|---|---|
| **Severity** | **Major** |
| **Lokasi** | `server/src/routes/sessions.js:92-100` (handler quote), `server/src/lib/pricing.js:41-44` (perhitungan overtime), `server/src/routes/sessions.js:232` (actualMinutes saat finish), `web/src/components/session-dialogs.tsx:244,251-254` |

**Ringkasan.** Quote mengirim `actualMinutes = planned`, sehingga `overtimeMinutes = max(0, actual − planned − grace)` **selalu 0** — endpoint mana pun yang menampilkan overtime dari hasil quote akan selalu menampilkan Rp 0.

**Dampak nyata.** Dialog "Selesaikan Pembayaran" (`web/src/components/session-dialogs.tsx`) mengambil `estimate.overtimeAmount` dari quote dan menghitung `total = subtotal + overtimeAmount + charge − discount`. Karena `overtimeAmount` selalu 0, operator **tidak pernah melihat baris "Kelebihan"** dan menampilkan nominal yang berbeda dari yang benar-benar ditagih di `finish`. Pada skrip saya: preview **Rp 14.000**, tagihan sebenarnya **Rp 13.000** (selisih Rp 1.000) — dan untuk sesi yangstarted 5 jam lalu, preview Rp 4.000 vs tagihan Rp 57.000. Pelanggan handing-over Rp 14.000 untuk tagihan Rp 13.000, atau vice versa; struk tidak cocok dengan yang_CUSTOMER_.

**Bukti reproduksi:**
```
$ curl -s -b cookies -X POST localhost:4000/api/sessions/quote \
    -H 'content-type: application/json' -d '{"consoleId":1,"durationMinutes":60,"extraMinutes":31}'
{"durationMinutes":91,"billableMinutes":105,"hourlyRate":8000,"subtotal":14000,
 "overtimeMinutes":0,"overtimeAmount":0,"discount":0,"total":14000,"currency":"IDR"}
# preview dialog = Rp 14.000
$ curl -s -b cookies -X POST localhost:4000/api/sessions/1/finish \
    -H 'content-type: application/json' -d '{"paymentMethod":"cash","amountPaid":14000}'
{"subtotal":8000,"total":13000,...}   # -> tagihan sebenarnya Rp 13.000
# transaction_items: rental 8000 + "Overtime 25 menit" 5000
```

**Usulan Fix.**
- Di `routes/sessions.js:92-100`, jangan pakai `actualMinutes: planned`. Terima `extraMinutes` sebagai durasi overtime yang dipratinjau dan hitung overtime dengan tarif overtime (`rules.overtimeRatePerHour`), kurangi grace — sama seperti `finish` — sehingga quote dan finish memakai rumus yang sama.
- Tambahkan parameter `graceMinutes`/`overtimeRatePerHour` ke hasil quote (frontend sudah.room untuk `overtimeMinutes`/`overtimeAmount`), dan beri tahu frontend lewat `api-contract.md` §S1 bahwa `extraMinutes` = menit overtime yang akan ditagih.
- Tambahkan uji yang membandingkan hasil `quote` dengan hasil `finish` untuk sesi overtime (lihat §4).

---

### BE-003 — `GET /reports/payments` tidak cocok dengan `web/` → tab Pembayaran menampilkan "Rp 0"

| | |
|---|---|
| **Severity** | **Major** |
| **Lokasi** | `server/src/routes/reports.js:118-146`, `web/src/lib/api.ts:211`, `web/src/pages/Reports.tsx:204,208,212`, `web/src/pages/Reports.tsx:77-83` |

**Ringkasan.** Backend mengembalikan `totals: {count, recorded, outstanding, voided, subtotal, byMethod}` dan `items[]` berfield `{at, method, status}`; frontend membaca `totals.gross`, `totals.paid`, `items[].createdAt`, `items[].paymentMethod`, `items[].paymentStatus`.

**Dampak nyata.** Di tab "Pembayaran" pada halaman Laporan, dua kartu ringkasan selalu **"Rp 0"** ("Total tagihan" dan "Pendapatan tercatat") meski ada transaksi — karena `formatIDR(undefined)` → `"Rp 0"`. Kartu ketiga ("Belum dibayar") benar, jadi layar menampilkan `Rp 0 / Rp 0 / Rp 4.000` — angka yang saling bertentangan. Tabel di bawahnya: kolom Waktu kosong/tidak valid (formatTanggal `undefined`), kolom Metode kosong, dan badge Status menerima `undefined`. Laporan pembayaran — fungsi utama tab itu — praktis tidak bisa dibaca.

**Bukti reproduksi:**
```
$ curl -s -b cookies 'localhost:4000/api/reports/payments?from=2026-01-01&to=2026-12-31'
totals = {"count":1,"recorded":8000,"outstanding":0,"voided":0,"subtotal":8000,
          "byMethod":{"cash":{"count":1,"total":8000}, ...}}
items[0] = {"id":1,"at":"2026-10-20T12:57:21.845Z","number":"TRX-20261020-0001",
            "customerName":"Budi","consoleCode":"PS-01","method":"cash","status":"paid","total":8000}
# frontend: totals.gross === undefined -> "Rp 0"; totals.paid === undefined -> "Rp 0"
```

**Usulan Fix.** Pilih satu nama kanonik dan terapkan di kedua sisi. Disarankan: **backend** mengembalikan `totals: {count, gross, paid, outstanding, voided}` (padanan `GET /transactions` yang sudah memakai `gross/paid/outstanding`, jadi konsisten) dan `items[]` memakai field `Transaction` yang sama (`createdAt`, `paymentMethod`, `paymentStatus`) supaya `web/src/lib/api.ts:211` bisa memakai `Transaction[]` tanpa tipuan. Update `api-contract.md` §R6 agar konsisten dengan §T1.

---

### BE-004 — `GET /transactions/:id` `items[]` memakai nama field berbeda → tabel "Rincian item" kosong

| | |
|---|---|
| **Severity** | **Major** |
| **Lokasi** | `server/src/routes/transactions.js:16-19`, `web/src/lib/types.ts:117-123`, `web/src/pages/TransactionDetail.tsx:78-83` |

**Ringkasan.** Backend mengembalikan `{id, kind, label, quantity, unitPrice, amount}`; `TransactionItem` di frontend mendeklarasikan `{id, description, qty, unitPrice, lineTotal}`.

**Dampak nyata.** Halaman detail transaksi: kolom "Item" kosong (menampilkan `undefined` → sel kosong), kolom "Qty" menampilkan teks **"undefined"**, kolom "Jumlah" menampilkan **"Rp 0"** (padanan `lineTotal` tidak ada). Hanya "Harga satuan" yang benar. Rincian item yang sebenarnya (mis. "Sewa PS-01 60 menit", "Overtime 25 menit", "Diskon") tidak pernah tampil — padahal struk HTML (`routes/transactions.js:34-38`) merendernya dengan benar. Detail transaksi dan struk jadi dua tampilan berbeda dari data yang sama.

**Bukti reproduksi:**
```
$ curl -s -b cookies localhost:4000/api/transactions/1
"items": [{"id":1,"kind":"rental","label":"Sewa PS-01 60 menit","quantity":1,"unitPrice":8000,"amount":8000}]
# frontend kolom: i.description -> undefined ; i.qty -> undefined ; i.lineTotal -> undefined
```

**Usulan Fix.** Samakan di `server/src/routes/transactions.js:16-19` → `{id, kind, description: label, qty: quantity, unitPrice, lineTotal: amount}` (pertahankan `kind` untuk klasifikasi), atau ubah `web/src/lib/types.ts:117-123` + `TransactionDetail.tsx:78-83` agar memakai `label/quantity/amount`. Jika memakai nama yang sama, `api-contract.md` §T2 perlu menyebut bentuk `items[]` (saat ini tidak).

---

### BE-005 — Filter `GET /sessions?status=overdue` selalu kosong; sesi terlambat tampil sebagai `active`

| | |
|---|---|
| **Severity** | **Major** |
| **Lokasi** | `server/src/routes/sessions.js:49-53` (`markOverdue`), `server/src/routes/sessions.js:148` (hanya dipanggil di `GET /:id`), `server/src/routes/sessions.js:103-128` (`GET /` tanpa `markOverdue`) |

**Ringkasan.** `markOverdue()` (ubah status `active` → `overdue`) hanya dipanggil di handler `GET /sessions/:id`; list `GET /sessions` dan `GET /sessions/active` tidak pernah memanggilnya.

**Dampak nyata.** Papan sesi adalah layar utama operator.bau Filter **"Terlambat" (`status=overdue`) selalu mengembalikan array kosong**, sedangkan sesi yang `ends_at`-nya sudah 2 jam lalu justru muncul di filter **"Aktif"**. Operator yang menyaring sesi terlambat melihat papan kosong dan tidak tahu ada pelanggan yang belum pulang. Kontrak api-contract.md §S juga menyatakan `overdue` "dihitung saat baca … juga dipersist oleh jalur baca untuk pelaporan" — jalur baca yang dimaksud tidak mengimplementasinya.

**Bukti reproduksi:**
```
# sesi dibuat 60 menit lalu, ends_at 2 jam lalu, kolom status masih 'active'
GET /api/sessions?status=active   -> [{"id":1,"status":"active"}]
GET /api/sessions?status=overdue  -> []
GET /api/sessions/active          -> [{"status":"active","remainingSeconds":-7200}]
# (setelah GET /api/sessions/1 barisnya berubah jadi "overdue")
```

**Usulan Fix.**
- Panggil `markOverdue(db)` di awal handler `GET /sessions` dan `GET /sessions/active` (memperbaiki daftar **dan** filter), atau
- lebih baik: jangan simpan status `overdue` sama sekali — hitung `overdue` di lapisan SQL (`WHERE (status='active' AND ends_at < :now)`) supaya filter dan daftar selalu konsisten, dan hapus `markOverdue` beserta efek sampingnya pada baris. Kontrak §S perlu diperbarui sesuai pilihan.
- Tambahkan regression test: sesi dengan `ends_at` di masa lalu harus muncul di `status=overdue` dan tidak di `status=active`.

---

### BE-006 — Pelanggan bisa membatalkan booking yang sudah check-in → slot direbut ulang

| | |
|---|---|
| **Severity** | **Major** |
| **Lokasi** | `server/src/routes/bookings.js:278-297` (cancel), `server/src/routes/bookings.js:61-71` (`findConflicts`), `server/src/routes/sessions.js:308-327` |

**Ringkasan.** `POST /bookings/:id/cancel` hanya menolak status `cancelled`; booking `checked_in` (yang sudah punya sesi hidup) tetap bisa dibatalkan oleh pemiliknya.

**Dampak nyata.** Pelanggan check-in (sesi aktif, unit `in_use`), lalu menekan "Batalkan": booking jadi `cancelled` → **slot waktu dilepas** (booking `cancelled` tidak lagi dihitung `findConflicts`), **sesi tetap hidup**, unit tetap `in_use`. Konsekuensi:
1. Pelanggan berikutnya **berhasil membuat booking untuk slot yang sama (201)** — sudah saya buktikan di bawah.
2. Pelanggan yang membatalkan tetap harus membayar sesi yang sedang berjalan (sesi tidak ikut dibatalkan).
3. Setelah sesi pertama selesai, unit `available` padahal ada booking aktif milik orang lain → check-in berikutnya bentrok `409 UNIT_OCCUPIED` atau, lebih buruk, tertukar dengan pelanggan yang salah.

**Bukti reproduksi:**
```
POST /api/bookings (pelanggan)                 -> 201
PATCH /api/bookings/1 {"status":"confirmed"}    -> 200 (admin)
POST /api/bookings/1/check-in                   -> 201, session 1
POST /api/bookings/1/cancel {"reason":"batal"}  -> 200  booking.status = "cancelled"
   sesi masih:  {"id":1,"status":"active"}      unit masih: {"id":1,"status":"in_use"}
POST /api/bookings (pelanggan, slot sama)       -> 201   <-- slot ganda diterima
```

**Usulan Fix.**
- Di `routes/bookings.js:278-297`, tolak pembatalan booking yang statusnya `checked_in` dengan `409 BOOKING_ALREADY_CHECKED_IN` (tambahkan kodenya di `lib/errors.js`) — pembatalan harus lewat void sesi (`POST /sessions/:id/void`) yang sudah membebaskan unit secara konsisten.
- Bila pembatalan `checked_in` tetap diizinkan, `POST /sessions/:id/void` harus menandai booking terkait `cancelled` **dan** membebaskan slot dalam satu transaksi.
- Tambahkan regression test untuk rangkaian di atas.

---

### BE-007 — Laporan harian/mingguan & grafik pendapatan membuang hari tanpa aktivitas

| | |
|---|---|
| **Severity** | **Major** |
| **Lokasi** | `server/src/routes/reports.js:57-86` (`bucketReport`), `server/src/routes/reports.js:208-219` (ekspor `daily`), `server/src/routes/dashboard.js:131-141` (`revenue-chart`) |

**Ringkasan.** Bucket laporan dibangun hanya dari baris yang ada (`Map` diisi saat iterasi), tanpa pernah menghasilkan bucket untuk hari/jam tanpa transaksi.

**Dampak nyata.** Laporan "Harian" untuk rentang 7 hari dengan aktivitas pada 3 hari hanya mengembalikan **3 baris** — 4 hari tanpa transaksi tidak pernah muncul. Operator tidak bisa membedakan "hari tutup" dari "hari hilang", dan total yang tertera tidak penjumlahan seluruh hari sehingga angka terlihat utuh padahal tidak. Grafik pendapatan di Dashboard (`web/src/pages/Dashboard.tsx:239`) memakai `buckets.map(...)` → batang untuk hari sepi tidak ada, sehingga sumbu-x **melompati hari** (Senin lalu Kamis) dan grafik terlihat tidak proporsional — grafik pendapatan harian yang salah adalah masalah kredibilitas untuk pemilik usaha. Kontrak §R2/R3/D4 tidak menyatakan apakah hari kosong wajib ada, jadi ini harus diputuskan eksplisit.

**Bukti reproduksi:**
```
$ curl -s -b cookies 'localhost:4000/api/reports/daily?from=2026-03-01&to=2026-03-07'
items = [{"date":"2026-03-01","revenue":8000,...},{"date":"2026-03-03",...},{"date":"2026-03-05",...}]
# 2026-03-02 / 03-04 / 03-06 / 03-07 tidak ada sama sekali
$ curl -s -b cookies 'localhost:4000/api/dashboard/revenue-chart?from=2026-03-01&to=2026-03-07'
buckets = [{"label":"2026-03-01",...},{"label":"2026-03-03",...},{"label":"2026-03-05",...}]
```

**Usulan Fix.**
- Di `bucketReport`, pre-generasi bucket untuk **seluruh rentang** (`for` dari `from` sampai `to`) lalu isi dari baris; sama untuk `revenue-chart` (`groupBy=day`). Untuk `groupBy=week|month` prerelease daftar label unik dari rentang.
- Tambahkan parameter `?includeEmpty=true|false` (default `true` untuk harian) bila ingin kompatibilitas; perbarui `api-contract.md` §R2/R3/D4 untuk menyatakan perilaku.
- Regression test: rentang 10 hari dengan 1 transaksi → 10 baris, 9 di antaranya nol.

---

### BE-008 — Ekspor CSV untuk tab Mingguan/Bulanan/Pembayaran diam-diam menghasilkan CSV transaksi

| | |
|---|---|
| **Severity** | **Major** |
| **Lokasi** | `server/src/routes/reports.js:149` (whitelist type), `web/src/pages/Reports.tsx:86` (`type: tab`), `web/src/pages/Reports.tsx:23-30` (nilai tab) |

**Ringkasan.** Backend hanya menerima `type ∈ {sessions, transactions, units, daily}`; frontend mengirim `type` = tab aktif, yang bisa `weekly`, `monthly`, atau `payments` → jatuh ke default `transactions`.

**Dampak nyata.** Di tab "Mingguan" operator menekan "Ekspor CSV" → file yang berisi **baris per transaksi**, bukan agregasi mingguan. Nama file memang jujur (`playrent-transactions-…csv`), tetapi teks UI di bawah tombol berbunyi *"Ekspor mengikuti tab yang sedang aktif"* — jadi operator mengira mengunduh laporan mingguan dan justru mengunduh daftar transaksi mentah. Kontrak §R7 memang tidak menyebut `weekly/monthly`, jadi **halaman Laporan tidak punya ekspor untuk agregasi mingguan/bulanan sama sekali** — tombolnya ada, dan hasilnya justru salah.

**Bukti reproduksi:**
```
GET /api/reports/export.csv?type=weekly&from=2026-03-01&to=2026-03-07
 -> Content-Disposition: attachment; filename="playrent-transactions-2026-03-01-2026-03-07.csv"
 -> header: No. Transaksi,Waktu,Pelanggan,Unit,Subtotal,...
GET /api/reports/export.csv?type=monthly  -> sama (fallback transactions)
GET /api/reports/export.csv?type=payments  -> sama (fallback transactions)
```

**Usulan Fix.**
- Backend: tambahkan `weekly` dan `monthly` ke whitelist `type` dan reuse `bucketReport` yang sama dengan `daily` (perbaiki BE-007 lebih dulu agar hari kosong ikut ekspor); `payments` boleh memakai dataset yang sama dengan `transactions`.
- Frontend: disabled tombol ekspor pada tab yang belum punya padanan, sampai backend mendukungnya.
- Backend **tidak boleh diam-diam fallback**: kalau `type` tak dikenal, balas `400 VALIDATION_ERROR` dengan daftar type yang valid, bukan mengganti diam-diam ke `transactions` — fallback diam-diam inilah yang membuat bug ini tak terlihat.

---

### BE-009 — Batas diskon bisa menghapus biaya overtime (kontrak: capped at subtotal)

| | |
|---|---|
| **Severity** | Minor |
| **Lokasi** | `server/src/lib/pricing.js:46`, `api-contract.md:267` |

**Ringkasan.** Kontrak menyatakan `discount = request.discount (Super Admin only, capped at subtotal)`; implementasi membatasi pada `subtotal + overtimeAmount + extra`.

**Dampak.** Diskon Rp 8.000 pada sesi ber-subtotal Rp 8.000 dengan overtime Rp 5.000 menghasilkan total **Rp 0** (bukan Rp 5.000 seperti kontrak). Selisih coached Rp 5.000 per transaksi — diskon tidak pernah exceeds total, jadi tidak ada kerugian, tetapi laporan "Diskon" bisa melebihi subtotal dan membingungkan. Reproduksi: `discount=999999999` → `discount=8000, total=0` (terkonfirmasi).

**Usulan Fix.** Ubah baris `pricing.js:46` menjadi `Math.min(Math.max(0, asInt(discount)), subtotal)` agar sesuai kontrak, atau perbarui `api-contract.md:267` bila capping di total memang yang diinginkan — dan tambahkan kasus uji yang mengunci pilihan tersebut.

---

### BE-010 — `startedAt` dari klien tidak dibatasi → overtime bisa digelembungkan tanpa batas

| | |
|---|---|
| **Severity** | Minor |
| **Lokasi** | `server/src/routes/sessions.js:174`, `server/src/routes/sessions.js:232`, `web/src/pages/SessionStart.tsx:85` |

**Ringkasan.** `POST /sessions` menerima `startedAt` dari body tanpa batas bawah/tetangga; `finish` memakai `started_at` itu sebagai dasar `actualMinutes`.

**Dampak.** Satu sentuhan salah pada input "Mulai" (atau client's clock yang meleset beberapa jam) membuat pelanggan ditagih overtime fantastis. Terbukti: `startedAt` 5 jam lalu pada paket 30 menit → tagihan **Rp 57.000** (Rp 4.000 sewa + Rp 53.000 "Overtime 265 menit"), dan tidak ada preview yang bisa memperingatkan (lihat BE-002). Karena hanya Super Admin yang bisa memulai sesi, dampaknya bukan iterate malware, melainkan kesalahan input dengan konsekuensi uang.

**Usulan Fix.** Batasi `startedAt` (mis. tidak lebih dari 4 jam ke belakang dan tidak lebih dari 5 menit ke depan), atau abaikan `startedAt` untuk perhitungan overtime dan pakai `min(started_at, now)` sebagai batas bawah. Tambahkan `ponytail:`-style catatan di kode jika batasannya disengaja.

---

### BE-011 — `revenueWeek` di dashboard membuang hari terakhir tahun sebelumnya

| | |
|---|---|
| **Severity** | Minor |
| **Lokasi** | `server/src/routes/dashboard.js:49-50` |

**Ringkasan.** Query week's revenue memfilter `substr(created_at,1,7) >= "<tahun>-01"` (bulan **UTC**) lalu mencocokkan `isoWeekStr(created_at) === week` (minggu **Jakarta**).

**Dampak.** Pada 1–4 Januari, transaksi tanggal 29–31 Desember tahun sebelumnya (yang secara ISO masih termasuk minggu berjalan, contoh 2025-12-31 → `2026-W01`) tidak pernah ikut dihitung → **"Pendapatan minggu ini" kurang Rp 8.000** pada jenis itu. Terbukti lewat simulasi parameter (`week=2026-W01`, baris `2025-12-31` → 0 baris terpilih, padahal `isoWeekStr` = `2026-W01`).

**Usulan Fix.** Jangan pakai filter berbasis bulan UTC. Ambil baris dalam rentang ISO week berjalan (`started_at >= awal minggu && < awal minggu + 7 hari`, dihitung dari label minggu), atau turunkan `isoWeekStr` ke SQL via `strftime`. Sekalian hilangkan pemuatan semua transaksi sejak Januari ke memori (lihat BE-016).

---

### BE-012 — `schema.sql` tidak lagi mencerminkan skema sebenarnya

| | |
|---|---|
| **Severity** | Minor |
| **Lokasi** | `server/src/schema.sql:14`, `server/src/schema.sql:8-18`, `server/src/db.js:40-87`, `server/src/db.js:90-95` |

**Ringkasan.** `schema.sql` menyebut dirinya "canonical schema", tetapi masih menulis `role TEXT NOT NULL CHECK (role IN ('admin','cashier'))` — bukan `('superadmin','user')` seperti kontrak — dan tidak punya kolom `users.phone` maupun `bookings.customer_user_id`.

**Dampak.** Skemaeffectivey benar setelah migrasi v2/v3 dijalankan, jadi tidak ada bug runtime. Tetapi: (a) siapa pun yang membuat DB dari `schema.sql` saja (dokumentasi, perkakas, DB baru di lingkungan lain) mendapat CHECK role lawas dan tidak punya `phone`/`customer_user_id` → aplikasi gagal di route apa pun yang menyentuh kedua kolom itu; (b) `api-contract.md:8-9` menyatakan CHECK-nya `('superadmin','user')` — jadi dokumen beku dan berkas implementasi berbeda; (c) `specs/database.md` & `lib/db-backup.js:16` harus dijaga sinkron manual.

**Usulan Fix.** Perbarui `schema.sql` agar sama persis dengan hasil migrasi (role CHECK baru + kolom `phone` + `customer_user_id`), dan jadikan `schema.sql` **v4** (mulai migrasi v1.sql lalu v2.sql agar DB lama tidak rusak). Tambahkan assertion di `server/test/` yang membandingkan `PRAGMA table_info` tiap tabel terhadap `schema.sql` sehingga drift ketahuan otomatis.

---

### BE-013 — Formula injection pada ekspor CSV (nama pelanggan dikendalikan pelanggan)

| | |
|---|---|
| **Severity** | Minor |
| **Lokasi** | `server/src/lib/csv.js:3-7`, `server/src/routes/reports.js:169-183` |

**Ringkasan.** `escapeCell` hanya meng-escape `"`, `,`, newline dan spasi tepi; nilai yang diawali `=`, `+`, `-`, `@` tetap formula untuk Excel/Sheets.

**Dampak.** Pelanggan membuat booking dengan `customerName` = `=HYPERLINK("http://evil.tld","klik")` (diverifikasi: `POST /api/bookings` → 201). Ekspor CSV sesi memuat nilai itu apa adanya; ketika operator membuka file di Excel, formula dieksekusi (hyperlink phising / exfiltrasi data pada Excel versi lama). Dampak terbatas pada mesin operator, tapi cukup untuk disebut.

**Usulan Fix.** Di `csv.js`, awali sel yang diawali `=`, `+`, `-`, `@`, tab, atau CR dengan `'` (prefix apos) — atau konversikan ke `="..."` — sesuai recommendations OWASP untuk CSV export. Tambahkan regression test.

---

### BE-014 — Pembayaran non-tunai menimpa `amountPaid` dengan total → nominal yang benar-benar diterima hilang

| | |
|---|---|
| **Severity** | Minor |
| **Lokasi** | `server/src/routes/sessions.js:243-252`, `server/src/routes/sessions.js:261-266` |

**Ringkasan.** Untuk `transfer`/`qris`, `amountPaid` diabaikan dan diganti `q.total` (walau `amountPaid` dikirim di body).

**Dampak.** Transfer Rp 50.000 untuk tagihan Rp 8.000 tercatat sebagai `amount_paid = 8000`; kelebihan Rp 42.000 hilang dari buku besar (tidak ada `changeDue` untuk non-tunai, sesuai kontrak). Terbukti: `{"paymentMethod":"qris","amountPaid":50000}` → `amountPaid: 8000, changeDue: 0, total: 8000`.

**Usulan Fix.** Untuk non-tunai, simpan `amountPaid` yang dikirim operator (dibatasi ≥ total), dan catat kelebihan sebagai `notes` atau field baru — atau, jika excess memang tidak boleh ada, balas `400` agar operator mencatat nominal yang benar.

---

### BE-015 — Cek username ganda adalah check-then-act → UNIQUE violation jadi 500, bukan 409

| | |
|---|---|
| **Severity** | Minor |
| **Lokasi** | `server/src/routes/auth.js:65-75`, `server/src/routes/users.js:47-55` |

**Ringkasan.** `SELECT 1 FROM users WHERE username = ?` lalu `INSERT` — keduanya di luar transaksi, tanpa penanganan `isUniqueViolation` seperti yang dilakukan pada `POST /consoles` (`routes/consoles.js:70-75`).

**Dampak.** Dua permintaan registrasi dengan username sama yang tiba bersamaan (atau proses kedua — mis. CLI/worker) membuat `INSERT` gagal dengan `UNIQUE constraint failed: users.username` → **`500 INTERNAL_ERROR`**, bukan `409 DUPLICATE_USERNAME` seperti kontrak §A0. Pada server satu-proses (Node sinkron) race-nya belum terpicu, jadi severity Minor — tapi jalur error yang salah sudah pasti ada.

**Usulan Fix.** Bungkus `INSERT` dengan try/catch → `isUniqueViolation(err, 'users')` → `409 DUPLICATE_USERNAME` (pola yang sudah dipakai di `routes/consoles.js:70-75` dan `admin-bootstrap.js:108-111`), dan/atau jalankan SELECT+INSERT dalam `withTx`.

---

### BE-016 — Pemindaian tanpa batas pada dashboard

| | |
|---|---|
| **Severity** | Minor |
| **Lokasi** | `server/src/routes/dashboard.js:48-50`, `server/src/routes/dashboard.js:144-151` |

**Ringkasan.** `GET /dashboard/summary` menarik **semua** transaksi sejak 1 Januari (`substr(created_at,1,7) >= '2026-01'`) ke memori JS; `GET /dashboard/busy-hours` tanpa `from`/`to` menarik **semua** sesi (`startIso:'0000', endIso:'9999'`).

**Dampak.** Waktu muat dan pemakaian memori dashboard naik linier dengan riwayat; setelah 1–2 tahun data (ratusan ribu baris) halaman dashboard BIAS nearing timeout. `dashboard/summary` juga memuat kolom `total` penuh untuk setiap baris padahal hanya `total` yang dipakai.

**Usulan Fix.** Batasi query `revenueWeek` ke rentang ISO minggu berjalan saja (perbaiki BE-011 sekalian), dan beri `busy-hours` default range yang sama dengan `revenue-chart` (30 hari terakhir) alih-alih seluruh riwayat. Tambahkan indeks `transactions(created_at)` — sudah ada (`idx_transactions_created_at`).

---

### BE-017 — Tipe `id` di `web/src/lib/types.ts` bertentangan dengan API (string vs integer)

| | |
|---|---|
| **Severity** | Minor |
| **Lokasi** | `web/src/lib/types.ts:18,67,71,76,78,208` vs `server/src/lib/mappers.js:8,42-59` |

**Ringkasan.** Backend mengembalikan `id`, `consoleId`, `createdBy`, `transactionId`, `sessionId` sebagai **integer** SQLite; frontend mendeklarasikannya `string`.

**Dampak.** `tsc --noEmit` hijau tetapi tipenya berbohong — semua `===` antara id dari API dan id dari `useParams()` (string) akan gagal diam-diam. Saat ini pemakaiannya kebetulan aman (perbandingan selalu antar-dua nilai dari API), tapi perubahan kecil di frontend bisa langsung merusak. `RentalSession.billedMinutes` juga dideklarasikan `number` padahal `NULL` untuk sesi yang masih jalan → tabel sesi menampilkan "0m / 60m"; `ActivityItem.refId` dideklarasikan `string` padahal bisa `NULL`.

**Usulan Fix.** Ubah tipe frontend ke `number` (`id: number` dsb.) dan `billedMinutes: number | null`, `refId: number | null`; atau konversi ke string di mapper server. Tambahkan satu uji tipe yang memanggil API nyata dan membandingkan bentuk JSON dengan `types.ts`.

---

### BE-018 — Dua cacat kecil: pola `LIKE` tanpa escape, dan id non-numerik membalas 400

| | |
|---|---|
| **Severity** | Minor |
| **Lokasi** | `server/src/routes/consoles.js:38`, `server/src/routes/sessions.js:113`, `server/src/routes/transactions.js:152`, `server/src/routes/bookings.js:99`; `server/src/lib/validate.js:20` |

**Ringkasan.** (a) Kata kunci pencarian disisipkan apa adanya ke `LIKE '%q%'`, sehingga `%` dan `_` dari pengguna berfungsi sebagai wildcard — `?q=%` mengembalikan semua baris (bukan hasil pencarian). (b) `GET /api/sessions/abc` membalas `400 VALIDATION_ERROR`, bukan `404 SESSION_NOT_FOUND` seperti kontrak §S4 mengisyaratkan.

**Dampak.** (a) menganggur: operator mengetik `%` dan melihat seluruh basis data koneksi — membingungkan, bukan berbahaya (endpoint admin). (b) klien yang memakai URL dari taksonomi lain mendapat 400 di mana 404 yang diharapkan; kode frontend membedakan keduanya.

**Usulan Fix.** (a) escape `%`, `_`, `\` pada input pencarian sebelum dimasukkan ke `LIKE` (dan pakai `ESCAPE '\'`). (b) samakan dengan pola yang dipakai route lain: tangkap hasil parse dan balas `404` dengan kode entitas yang sesuai, atau terima string id dan validasi manual.

---

## 3. Perbandingan Kontrak vs Implementasi

### 3a. Mismatch frontend ↔ backend (semua sudah diverifikasi lewat HTTP nyata)

| # | Endpoint | Yang dibaca frontend | Yang dikirim backend | Dampak |
|---|---|---|---|---|
| M1 | `GET /reports/payments` | `totals.gross`, `totals.paid` | `totals.recorded` (+ `voided`,`subtotal`,`byMethod`) | 2 kartu "Rp 0" (BE-003) |
| M2 | `GET /reports/payments` | `items[].createdAt` | `items[].at` | kolom tanggal kosong/tidak valid |
| M3 | `GET /reports/payments` | `items[].paymentMethod` | `items[].method` | kolom metode kosong |
| M4 | `GET /reports/payments` | `items[].paymentStatus` | `items[].status` | badge status `undefined` |
| M5 | `GET /reports/payments` | `items: Transaction[]` | bentuk `{id,at,number,…}` | tipe `api.ts:211` tidak jujur |
| M6 | `GET /transactions/:id` | `items[].description` | `items[].label` | kolom Item kosong (BE-004) |
| M7 | `GET /transactions/:id` | `items[].qty` | `items[].quantity` | teks "undefined" |
| M8 | `GET /transactions/:id` | `items[].lineTotal` | `items[].amount` | kolom Jumlah "Rp 0" |
| M9 | `GET /reports/export.csv` | `type` = tab (`daily/weekly/monthly/units/payments`) | hanya `sessions/transactions/units/daily` | fallback ke `transactions` (BE-008) |
| M10 | semua endpoint | `id: string` | `id: number` | tipuan tipe (BE-017) |
| M11 | `GET /sessions` | `billedMinutes: number` | `null` untuk sesi hidup | kolom durasi "0m / 60m" |
| M12 | `GET /dashboard/activity` | `refId: string` | `entity_id` nullable | tipuan tipe |
| M13 | `GET /consoles/:id` (pelanggan) | `{console, currentSession}` | `{console, isBusy}` | sesuai kontrak §C2, tapi tipe `api.ts:128` belum memuat `isBusy` |
| M14 | `POST /sessions/quote` | `overtimeAmount` untuk pratinjau | selalu `0` | preview salah (BE-002) |
| M15 | `GET /sessions?status=overdue` | sesi terlambat | `[]` | filter mati (BE-005) |
| M16 | `GET /sessions?status=active` | hanya sesi aktif | memuat sesi terlambat | filter salah (BE-005) |
| M17 | `GET /reports/daily|weekly` | 1 baris per periode | hanya periode terisi | hari hilang (BE-007) |
| M18 | `GET /dashboard/revenue-chart` | 1 bucket per hari | hanya hari terisi | grafik melompat hari (BE-007) |

### 3b. Mismatch `api-contract.md` ↔ implementasi server

| # | Klausul kontrak | Implementasi | Catatan |
|---|---|---|---|
| K1 | §S1 body `startedAt?` | diterima lalu **diabaikan** di quote | quote tak bisa mempratinjau overtime (BE-002) |
| K2 | §pricing "discount capped at subtotal" | dibatasi `subtotal+overtime+extra` | BE-009 |
| K3 | §B "Conflict rule (must live in SQL, not JS)" | overlap dihitung di SQL ✓, tetapi **penegakan tetap check-then-act di luar transaksi** | Single-process sinkron membuatnya aman secara praktis; proses kedua (CLI/worker) bisa meloloskan double-booking |
| K4 | §Auth "`users.role CHECK (role IN ('superadmin','user'))`" | `schema.sql:14` masih `('admin','cashier')` | BE-012 |
| K5 | §R7 `type=sessions\|transactions\|units\|daily` | sesuai, tapi UI menawarkan weekly/monthly/payments | BE-008 |
| K6 | §D "Zero hardcoded figures" | `reports.js:9` `OPERATING_HOURS_PER_DAY = 16` (angka tetap untuk kapasitas unit) | minor, tidak tercatat di kontrak |
| K7 | §S "`overdue` … also persisted by the read path for reporting" | hanya `GET /sessions/:id` yang mem-persistensi | BE-005 |
| K8 | §T `paymentStatus:'paid'\|'unpaid'\|'void'` | tidak ada alur yang pernah membuat `unpaid` | `outstanding` selalu 0 |
| K9 | §S5 "server sets ends_at = started_at + durationMinutes" | ✓ sesuai | — |
| K10 | §B5 check-in → booking `checked_in` | ✓; tetapi booking **tidak pernah** di-set `completed` setelah sesi selesai | status `completed` hanya di-set manual lewat PATCH |

**Yang sudah benar (terverifikasi, tidak perlu diubah).** Matriks otorisasi (401/403/404 benar sesuai tabel akses), anti-mass-assignment (`role`/`status`/`discount`/`customer_user_id` ditolak 400), IDOR booking (404 bukan 403), rate limit login 5×/15 mnt & register 10×/15 mnt (429), index unik satu sesi aktif per unit (409 `UNIT_OCCUPIED` — pesan SQLite "UNIQUE constraint failed: rental_sessions.console_id" memang terpetakan dengan benar), penomoran transaksi harian `TRX-YYYYMMDD-####` (urutan 0001…0012 benar), `cookie` httpOnly/SameSite=Lax, guard origin CSRF, body 1 MB, JSON rusak → 400, `/health` tidak membocorkan lokasi DB, hash scrypt + perbandingan timing-safe, sanitasi secret pada `audit_logs.meta`.

---

## 4. Skenario Uji Manual (per temuan)

> Prasyarat: `cd server && npm run seed && npm run admin:bootstrap && npm start` (port 4000). Login admin ke `cookies.txt` (`curl -c cookies.txt -X POST localhost:4000/api/auth/login -H 'content-type: application/json' -d '{"username":"admin","password":"…"}'`). Pelanggan: daftar lewat `POST /api/auth/register` lalu login ke `cookies-user.txt`.

**BE-001 — money path 500 di DB tanpa seed**
```bash
cd server
DB_PATH=/tmp/fresh-playrent.db node -e "
  import('./src/db.js').then(async m=>{const db=m.openDatabase('/tmp/fresh-playrent.db');m.migrate(db);
  console.log('settings rows =',db.prepare('SELECT COUNT(*) c FROM business_settings').get().c);db.close()})"
# hentikan server, jalankan dengan DB_PATH=/tmp/fresh-playrent.db, login, lalu:
curl -s -b cookies.txt localhost:4000/api/settings            # diharapkan 500 saat ini
curl -s -b cookies.txt -X POST localhost:4000/api/sessions/quote \
  -H 'content-type: application/json' -d '{"consoleId":1,"durationMinutes":60}'
```
Yang benar: keduanya 200 dengan baris settings yang ada.

**BE-002 — preview ≠ tagihan**
```bash
# buat sesi 60 menit, lalu majukan started_at 90 menit ke belakang & ends_at 30 menit ke belakang
curl -s -b cookies.txt localhost:4000/api/sessions/active
curl -s -b cookies.txt -X POST localhost:4000/api/sessions/quote -H 'content-type: application/json' \
  -d '{"consoleId":1,"durationMinutes":60,"extraMinutes":31}'      # overtimeAmount = 0 (bug)
curl -s -b cookies.txt -X POST localhost:4000/api/sessions/1/finish -H 'content-type: application/json' \
  -d '{"paymentMethod":"cash","amountPaid":14000}'                  # total = 13000
```

**BE-003 — tab Pembayaran**
```bash
curl -s -b cookies.txt 'localhost:4000/api/reports/payments?from=2026-01-01&to=2026-12-31'
# buka http://localhost:5173/laporan → tab Pembayaran: dua kartu "Rp 0"
```

**BE-004 — rincian item transaksi**
```bash
curl -s -b cookies.txt localhost:4000/api/transactions/1 | grep -o '"items":\[.*\]'
# buka /transaksi/1 → kolom Item kosong, Qty "undefined", Jumlah "Rp 0"
```

**BE-005 — filter terlambat**
```bash
# sesi dengan ends_at di masa lalu (mis. ubah lewat SQL pada DB dev)
curl -s -b cookies.txt 'localhost:4000/api/sessions?status=overdue'   # [] (bug)
curl -s -b cookies.txt 'localhost:4000/api/sessions?status=active'    # memuat sesi terlambat
```

**BE-006 — batalkan booking yang sudah check-in**
```bash
curl -s -b cookies-user.txt -X POST localhost:4000/api/bookings -H 'content-type: application/json' \
  -d '{"consoleId":1,"customerName":"Budi","bookingDate":"2026-11-01","startTime":"19:00","durationMinutes":120}'
curl -s -b cookies.txt -X PATCH localhost:4000/api/bookings/1 -H 'content-type: application/json' -d '{"status":"confirmed"}'
curl -s -b cookies.txt -X POST localhost:4000/api/bookings/1/check-in -H 'content-type: application/json' -d '{}'
curl -s -b cookies-user.txt -X POST localhost:4000/api/bookings/1/cancel -H 'content-type: application/json' -d '{"reason":"batal"}'
curl -s -b cookies-user.txt -X POST localhost:4000/api/bookings -H 'content-type: application/json' \
  -d '{"consoleId":1,"customerName":"Andi","bookingDate":"2026-11-01","startTime":"19:00","durationMinutes":120}'  # 201 (bug)
```

**BE-007 — hari kosong hilang**
```bash
curl -s -b cookies.txt 'localhost:4000/api/reports/daily?from=2026-03-01&to=2026-03-07'   # hanya hari ada transaksi
curl -s -b cookies.txt 'localhost:4000/api/dashboard/revenue-chart?from=2026-03-01&to=2026-03-07'
```

**BE-008 — ekspor CSV salah tab**
```bash
curl -s -D- -o /tmp/w.csv -b cookies.txt 'localhost:4000/api/reports/export.csv?type=weekly&from=2026-03-01&to=2026-03-07'
head -1 /tmp/w.csv     # header "No. Transaksi,…" (bukan agregasi mingguan)
```

**BE-009 / BE-010 — diskon & startedAt**
```bash
curl -s -b cookies.txt -X POST localhost:4000/api/sessions/quote -H 'content-type: application/json' -d '{"consoleId":1,"durationMinutes":30}'
curl -s -b cookies.txt -X POST localhost:4000/api/sessions -H 'content-type: application/json' \
  -d '{"consoleId":2,"customerName":"Siti","durationMinutes":30,"startedAt":"2026-10-20T00:00:00.000Z"}'
curl -s -b cookies.txt -X POST localhost:4000/api/sessions/2/finish -H 'content-type: application/json' -d '{"paymentMethod":"cash","amountPaid":1000000}'
```

**BE-011 — minggu ISO lintas tahun**
```bash
# sisipkan transaksi bercreated_at 2025-12-31T10:00:00Z, lalu jalankan dashboard/summary
# pada 2026-01-01 (ISO week 2026-W01) — revenueWeek harus memuatnya, saat ini tidak
```

**BE-013 — CSV formula**
```bash
curl -s -b cookies-user.txt -X POST localhost:4000/api/bookings -H 'content-type: application/json' \
  -d '{"consoleId":1,"customerName":"=HYPERLINK(\"http://evil.tld\",\"x\")","bookingDate":"2026-12-01","startTime":"10:00","durationMinutes":60}'
curl -s -b cookies.txt 'localhost:4000/api/reports/export.csv?type=sessions&from=2026-01-01&to=2026-12-31' | grep HYPERLINK
```

**BE-014 — non-tunai**
```bash
curl -s -b cookies.txt -X POST localhost:4000/api/sessions/3/finish -H 'content-type: application/json' \
  -d '{"paymentMethod":"qris","amountPaid":50000}'   # amountPaid tersimpan 8000
```

**BE-015 — username ganda**
```bash
# dua POST /api/auth/register bersamaan dengan username sama → 500 (harusnya 409)
```

**BE-018 — pencarian & id**
```bash
curl -s -b cookies.txt 'localhost:4000/api/consoles?q=%'        # mengembalikan semua unit
curl -s -b cookies.txt localhost:4000/api/sessions/abc          # 400 (harusnya 404)
```

---

## 5. Ringkasan

| Severity | Jumlah | ID |
|---|---|---|
| Blocker | 0 | — |
| Critical | 1 | BE-001 |
| Major | 7 | BE-002, BE-003, BE-004, BE-005, BE-006, BE-007, BE-008 |
| Minor | 10 | BE-009 … BE-018 |
| **Total** | **18** | |

**Cakupan mismatch kontrak/frontend↔backend:** 18 (M1–M18) + 10 klausul kontrak yang tidak terpenuhi/berbeda (K1–K10).

**Yang sudah benar dan tidak perlu diubah:** otorisasi (401/403/404), anti-mass-assignment, IDOR, rate limit, index unik sesi-per-unit, penomoran transaksi, cookie & CSRF, batas body, penanganan JSON rusak, redaksi secret di audit log, sanitasi `conditionNote`/`currentSession` untuk pelanggan, sanitasi `payments` di `/settings`.

**Test coverage yang menyembunyikan bug ini (bukan "test kurang" generik):**
- `server/test/helpers.js:58` `seedBase()` selalu menyisipkan baris `business_settings` → BE-001 mustahil terpicu di suite.
- Tidak ada test yang memanggil `GET /reports/payments` dan memeriksa bentuk `totals`/`items` → BE-003 lolos.
- Tidak ada test yang membandingkan `quote()` dengan hasil `finish()` untuk sesi overtime → BE-002 lolos.
- Tidak ada test untuk `GET /sessions?status=overdue` → BE-005 lolos.
- `server/test/` tidak memanggil `GET /transactions/:id` → BE-004 lolos.
- Tidak ada test yang membandingkan bentuk JSON API dengan `web/src/lib/types.ts` (tipe di `web` dicek hanya lewat `tsc`, yang tidak bisa mendeteksi field yang tidak pernah dipanggil).

---

## HASIL AKHIR

**Jumlah temuan: 18** (Blocker 0 · Critical 1 · Major 7 · Minor 10), plus 18 mismatch frontend↔backend dan 10 klausul kontrak yang tidak terpenuhi.

**Blocker/Critical:**
- **BE-001 (Critical)** — baris `business_settings` hanya dibuat oleh seeder demo, sehingga DB produksi yang dimigrasi tanpa seed membuat seluruh jalur uang (`/settings`, `/sessions/quote`, `/sessions`, `/bookings`) membalas 500; jalan keluar الوحيد (`npm run seed`) menyuntikkan 44 hari transaksi fiktif dan satu sesi demo aktif ke pembukuan produksi.

**Tidak layak push** — satu temuan Critical mematikan jalur uang pada instalasi produksi dan 7 temuan Major merusak tampilan yang dilihat operator setiap hari (preview pembayaran tidak sama dengan tagihan, dua tabel laporan/rincian kosong, filter "terlambat" mati, slot booking bisa direbut ganda, laporan harian menghapus hari kosong, ekspor CSV mingguan salah isi); perbaiki BE-001..BE-008 lalu audit ulang.
