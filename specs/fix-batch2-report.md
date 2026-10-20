# Laporan Perbaikan Batch 2 — Laporan, Ekspor, dan Ketahanan

**Agent:** @node-developer · **Task:** BE-FIX-2 · **Tanggal:** 20 Okt 2026
**Kontrak:** `specs/fix-contract.md` (FROZEN) §4 + §6 · **Audit:** `specs/audit-be-report.md`
**Status verifikasi:** **`verified`**

---

## 1. Ringkasan

| ID | Status | File inti yang diubah |
| --- | --- | --- |
| BE-007 | ✅ selesai | `server/src/routes/reports.js`, `server/src/routes/dashboard.js`, `server/src/lib/time.js` |
| BE-008 | ✅ selesai | `server/src/routes/reports.js` |
| BE-011 | ✅ selesai | `server/src/routes/dashboard.js`, `server/src/lib/time.js` |
| BE-012 | ✅ selesai (tanpa migrasi baru) | `server/src/schema.sql` (komentar saja) + `server/test/fix-batch2.test.js` |
| BE-013 | ✅ selesai | `server/src/lib/csv.js` |
| BE-016 | ✅ selesai | `server/src/routes/dashboard.js` |
| BE-018a | ✅ selesai | `server/src/lib/validate.js`, `server/src/routes/{users,consoles,games,sessions,bookings,transactions}.js` |
| BE-018b | ✅ selesai | `server/src/lib/validate.js` |

Tidak ada file `web/` yang disentuh. `specs/fix-contract.md` tidak disentuh.
`api-contract.md` **diperbarui** (satu-satunya file kontrak yang boleh saya sentuh).
Tidak ada dependency baru. `pricing.js`, `errors.js`, `mapTransaction`, dan `schema.sql`
(isi) tidak diubah.

---

## 2. Tabel: temuan → file → perubahan → cara verifikasi

| ID | File yang diubah | Apa yang berubah | Cara verifikasi |
| --- | --- | --- | --- |
| **BE-007** | `server/src/lib/time.js`, `server/src/routes/reports.js`, `server/src/routes/dashboard.js` | Helper baru `periodLabels(from, to, bucket)` (`lib/time.js`) membangun **daftar label periode** untuk rentang `from..to`: `day` → `YYYY-MM-DD`, `week` → ISO `YYYY-Www`, `month` → `YYYY-MM`. `bucketItems()` di `reports.js` membuat bucket untuk **seluruh periode** lebih dulu, lalu mengisi dari baris → periode kosong tampil dengan `revenue/transactions/sessions/minutes = 0`. `GET /dashboard/revenue-chart` memakai `periodLabels` yang sama → satu bucket per periode (hari/minggu/bulan sesuai `groupBy`), periode sepi tetap ada dengan 0. Perhitungan periode tetap pada **waktu Jakarta** (`jakartaDateStr`/`isoWeekStr`/`jakartaMonthStr`), label minggu = ISO-8601 (2026-W01 dimulai 2025-12-29, jadi bisa lintas tahun). | "BE-007 laporan harian mengisi periode kosong dengan 0" (rentang 5 hari, 1 hari berisi → 5 baris, 4 di antaranya nol) · "BE-007 laporan mingguan & bulanan mengisi periode kosong" (Maret→Mei 2026: 5 minggu + 3 bulan, hanya 1 berisi) · "BE-007 revenue-chart mengisi bucket kosong per hari" (5 bucket, sumbu-x tidak melompat) |
| **BE-008** | `server/src/routes/reports.js` | Whitelist `type` jadi `sessions\|transactions\|units\|daily\|weekly\|monthly\|payments` (`EXPORT_TYPES`). `type` tak dikenal **atau kosong** → **400 `VALIDATION_ERROR`** dengan pesan yang menyebutkan daftar type yang valid — **tidak ada** fallback diam-diam ke `transactions`. `weekly`/`monthly` memakai `bucketItems()` yang **sama persis** dengan R2–R4 (agregasi + periode kosong) dengan kolom yang sama (`Tanggal, Pendapatan, Transaksi, Sesi, Menit`). `payments` memakai `paymentsData()` yang **sama persis** dengan `GET /reports/payments` (termasuk filter `method`/`status`), dengan kolom transaksi. Nama file tetap `playrent-{type}-{from}-{to}.csv` + BOM. | "BE-008 ekspor CSV weekly/monthly memakai agregasi, bukan daftar transaksi" (ada label `2026-W19` + minggu kosong, header `Tanggal/Pendapatan/Sesi`, **tidak ada** `No. Transaksi`, filename `playrent-weekly-…`) · "BE-008 ekspor CSV payments memakai data /reports/payments" (ada `TRX-20260510-0001` + `Status Bayar`, filename `playrent-payments-…`) · "BE-008 type ekspor tak dikenal -> 400 VALIDATION_ERROR" (`type=bogus` → 400 + pesan menyebut "bogus"; `type` kosong → 400) |
| **BE-011** | `server/src/lib/time.js`, `server/src/routes/dashboard.js` | Helper baru `isoWeekRange()` mengembalikan **7 hari ISO-week berjalan** (Senin–Minggu) sebagai `YYYY-MM-DD` Jakarta. `GET /dashboard/summary` sekarang menghitung `revenueWeek` dari **rentang ISO week itu** (bukan dari filter bulan UTC), jadi hari dari tahun sebelumnya ikut terhitung. Query dibatasi ke 7 hari (lihat BE-016). `revenueMonth` memakai helper baru `jakartaMonthRange()` (bulan kalender Jakarta berjalan, ≤ 31 hari). Filter lama `substr(created_at,1,7) >= '<tahun>-01'` **dihapus** — itu akar bug-nya. | "BE-011 revenueWeek mencakup 7 hari utuh, termasuk saat lintasi batas tahun" — jam server di-mock ke **2026-01-02** (ISO week 2026-W01 = 2025-12-29 … 2026-01-04); transaksi Rp 8.000 tanggal **2025-12-29** + Rp 5.000 tanggal 2026-01-02 → `revenueWeek = 13000` (dengan kode lama: 5000) · `revenueMonth = 5000` (bulan berjalan tetap benar) |
| **BE-012** | `server/src/schema.sql` (komentar saja), `server/test/fix-batch2.test.js` | **Isi `schema.sql` tidak diubah** (masih `role IN ('admin','cashier')` — snapshot v1). Ditambahkan **komentar header** "SNAPSHOT v1 — JANGAN DIEDIT … perubahan lewat migrasi baru di `MIGRATIONS`", sekaligus menjelaskan bahwa snapshot ini **sengaja berbeda** dari skema efektif. **Verifikasi (bukan asumsi)**: skema hasil migrasi dibandingkan dengan `api-contract.md` — `users.role CHECK (role IN ('superadmin','user'))` ✓, `users.phone` ada ✓, `bookings.customer_user_id` ada ✓, `user_version = 4` ✓, dan CHECK benar-benar menolak `cashier` saat insert ✓. **Semua cocok → tidak ada migrasi v5 yang diperlukan.** | "BE-012 skema hasil migrasi cocok api-contract; schema.sql tetap snapshot v1" (memakai `pragma_table_info` + `sqlite_master.sql` + uji constraint CHECK) |
| **BE-013** | `server/src/lib/csv.js` | `escapeCell()` kini memberi prefix `'` pada sel **string** yang diawali `=`, `+`, `-`, `@`, tab, atau CR (rekomendasi OWASP), lalu di-escape seperti biasa. Angka asli (tipe `number`) tidak diubah — prefix hanya berlaku pada teks. Berlaku untuk **semua** jenis ekspor (satu fungsi, dipakai bersama). | "BE-013 formula injection pada ekspor CSV dicegah" (nama pelanggan `=cmd\|'/c calc'!A1` → sel menjadi `'=cmd\|'/c calc'!A1`; tidak ada sel yang diawali `=` tanpa prefix; nama biasa `Budi Santoso` tidak berubah) |
| **BE-016** | `server/src/routes/dashboard.js` | Helper `boundedRange(from, to)` dipakai `revenue-chart` **dan** `busy-hours`: jendela maksimum **365 hari** → lebih lebar = **400 `VALIDATION_ERROR`** ("Rentang tanggal terlalu lebar (N hari). Maksimal 365 hari per permintaan."); `from` > `to` → 400 juga. Tanpa `from`/`to` → jendela default **30 hari terakhir** (sebelumnya `busy-hours` membaca **seluruh riwayat** sesi: `startIso '0000'` … `endIso '9999'`). `GET /dashboard/summary` tidak lagi menarik "semua transaksi sejak Januari" ke memori: `revenueWeek` = query 7 hari, `revenueMonth` = query ≤ 31 hari. | "BE-016 query dashboard dibatasi: rentang terlalu lebar -> 400" (`revenue-chart` & `busy-hours` dengan rentang 2020-01-01…2026-10-20 → 400 + pesan "terlalu lebar"; rentang 364 hari → 200) · "BE-016 busy-hours tanpa rentang tidak lagi membaca seluruh riwayat" (sesi 2 tahun lalu tidak dihitung, sesi kemarin dihitung) |
| **BE-018a** | `server/src/lib/validate.js`, `server/src/routes/{users,consoles,games,sessions,bookings,transactions}.js` | Helper baru `likePattern(term)` di `lib/validate.js` meng-escape `%`, `_`, `\` → pola `%\...%`. Semua route yang memakai `?q=` sekarang memakai `LIKE ? ESCAPE '\'` + `likePattern(q)`: `users`, `consoles`, `games`, `sessions`, `bookings`, `transactions`. `?q=%` tidak lagi mengembalikan seluruh tabel. | "BE-018a wildcard LIKE dari pengguna diperlakukan sebagai karakter literal" (`?q=%` → 0 baris, `?q=PS_01` → 0 baris, `?q=PS-01` → 1 baris, `?q=PS-0` → 2 baris, `transactions?q=%` → 0 baris) |
| **BE-018b** | `server/src/lib/validate.js` | `idParam` diperketat: `z.preprocess` menolak apa pun yang bukan **integer desimal positif** (`/^\d+$/`), jadi `abc`, `1.5`, `1e2`, `0x10`, `0`, `-1` → **400 `VALIDATION_ERROR`** (bukan 500, dan bukan lagi "diarahkan" ke baris lain lewat `Number('1e2') = 100`). `id` yang valid tapi tidak ada tetap `404 SESSION_NOT_FOUND` dsb. | "BE-018b id non-numerik -> 400 VALIDATION_ERROR" (`/api/sessions/abc`, `/api/consoles/abc`, `/api/bookings/abc`, `/api/transactions/abc` → 400 `VALIDATION_ERROR`; `/api/sessions/1e2`, `/0x10`, `/1.5` → 400) |

### File yang ikut berubah (pelengkap / konsumen)

| File | Mengapa |
| --- | --- |
| `server/src/lib/time.js` | Menambah `periodLabels`, `isoWeekRange`, `jakartaMonthRange`, `daysBetween`, `shiftYmd`; `isoWeekStr`/`jakartaMonthStr` di-refactor ke inti Y/M/D yang sama (perilaku **tidak** berubah — `isoWeekStr` & `jakartaMonthStr` tetap label yang sama). |
| `server/src/routes/reports.js` | `bucketItems()` + `paymentsData()` diekstrak ke tingkat modul supaya endpoint **dan** ekspor CSV memakai **satu** sumber data (isi ekspor dijamin identik dengan isi laporan). |
| `server/src/routes/dashboard.js` | `rangeFor()` (yang mengembalikan `null`/seluruh riwayat) diganti `boundedRange()`; import `AppError` + helper `time.js` baru. |
| `server/src/lib/validate.js` | Header file diubah jadi "zod helpers + input sanitising" (kini memuat `likePattern`). |

### Yang **tidak** diubah (sesuai §6 fix-contract)

`server/src/lib/pricing.js` · `server/src/lib/errors.js` (envelope) · `mapTransaction` ·
`server/src/schema.sql` **isi** · `server/src/db.js` (migrasi v1–v4) · `web/` ·
`specs/fix-contract.md` · dependency (`package.json` server tidak berubah di Batch 2).

---

## 3. Hasil `npm test` (verbatim)

```
$ cd server && npm test
ℹ tests 96
ℹ suites 0
ℹ pass 96
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 37419.528215
```

**96 lulus / 0 gagal** = 83 tes lama (semua tetap lulus, **tidak ada** yang dihapus/di-skip)
+ 13 tes regresi baru (`server/test/fix-batch2.test.js`).
Smoke test di dalamnya: **110/110 checks passed**.

Probe keamanan:

```
$ node tools/security-probe.mjs
blockers=0  majors=0  minors=0  total=69
VERDICT: PASS
```

### Bukti bahwa tes benar-benar menangkap bug (mutation check)

Setiap perbaikan sengaja **dibalik** sementara, lalu tes dijalankan — supaya jelas tes
regresi ini bukan sekadar "hijau" karena kebetulan:

| Mutasi (kode dikembalikan ke versi lama) | Hasil |
| --- | --- |
| `csv.js` tanpa guard formula injection | **BE-013 GAGAL** ✓ |
| `summary` kembali ke filter `substr(created_at,1,7) >= '<tahun>-01'` | **BE-011 GAGAL** ✓ |
| `bucketItems` tanpa pra-generasi periode kosong | **BE-007 harian/mingguan/bulanan GAGAL** ✓ |
| `revenue-chart` tanpa pra-generasi bucket kosong | **BE-007 revenue-chart GAGAL** ✓ |
| `type` ekspor unknown → fallback (tanpa 400) | **BE-008 GAGAL** ✓ |
| `boundedRange` tanpa cap 365 hari | **BE-016 GAGAL** ✓ |
| `busy-hours` default → seluruh riwayat | **BE-016 GAGAL** ✓ |
| `consoles.js` kembali ke `LIKE ?` tanpa escape | **BE-018a GAGAL** ✓ |
| `idParam` kembali ke `z.coerce.number()` | **BE-018b GAGAL** ✓ |

Semua mutasi sudah **dibalik kembali** dan diverifikasi (`grep` sisa penanda mutasi = kosong;
`npm test` = 96/96).

---

## 4. Perubahan `api-contract.md` (sinkron dengan implementasi)

| Bagian | Yang diubah |
| --- | --- |
| Header | Ditambah versi `2026-10-20 (Batch 1 + Batch 2)`. |
| §Enforcement (baru) | `:id` non-numerik → `400 VALIDATION_ERROR` (bukan 500/404); `?q=` dicocokkan **literal** (wildcard LIKE di-escape). |
| §S1 | Body `POST /sessions/quote`: `sessionId?` / `consoleId`+`durationMinutes` / `startedAt?` / `extraMinutes?`; tabel dua jalur (sesi: `rate_snapshot` + waktu nyata · plan: `console.hourly_rate` + `startedAt`); `extraMinutes` = menit rencana; error `404 SESSION_NOT_FOUND` / `409 SESSION_NOT_ACTIVE` / `400 VALIDATION_ERROR` / `404 CONSOLE_NOT_FOUND`. |
| §S5 / §S7 | Batas `startedAt` (24 jam ke belakang / 5 menit ke depan) dan `amountPaid` non-tunai. |
| §T2 | `items[]` = `{id, kind, description, qty, unitPrice, lineTotal}` (nama lama dihapus). |
| §Bookings | Kode error baru `BOOKING_ALREADY_CHECKED_IN` (409) + daftar lengkap kode error bookings. |
| §U2 | `409 DUPLICATE_USERNAME`. |
| §D1 | `revenueWeek` = 7 hari ISO-week berjalan (bisa mulai tahun sebelumnya); `revenueMonth` = bulan kalender Jakarta. |
| §D4 / §D5 | Bucket kosong ikut dikembalikan; jendela maksimum **365 hari** (lebih lebar → 400), default **30 hari terakhir**; `from > to` → 400. |
| §R2–R4 | Satu baris per periode dalam `from..to`; periode kosong = 0; label ISO/Jakarta. |
| §R6 | `totals` = `{count, gross, paid, outstanding, voided}`; `items[]` = Transaction penuh. |
| §R7 | `type` = `sessions\|transactions\|units\|daily\|weekly\|monthly\|payments`; type tak dikenal/kosong → 400; `daily/weekly/monthly` = agregasi yang sama dengan R2–R4; `payments` = dataset R6; **formula injection dicegah** (prefix `'`). |
| §Pricing | Cap diskon diklarifikasi = `subtotal + overtimeAmount + extraCharge` (**kontrak yang diselaraskan dengan kode — kode tidak diubah**), + contoh angka. |
| §Schema & migrations (baru) | `user_version = 4`, tabel migrasi v1–v4, "`schema.sql` = snapshot v1 beku", catatan `seed` (demo) vs **`seed:schema`** (produksi). |
| **§Changelog kontrak** (baru, di akhir) | Ringkasan 11 baris perubahan versi ini, tanggal 20 Okt 2026. |

---

## 5. Catatan & follow-up

1. **BE-011 — interpretasi "7 hari terakhir utuh".** Implementasi memakai **7 hari ISO-week
   berjalan (Senin–Minggu)** — sama dengan label `isoWeekStr` yang sudah dipakai kode
   lama, dan sama dengan usulan fix di `audit-be-report.md` (BE-011). "Hari terakhir tahun
   sebelumnya hilang" hanya bermakna untuk minggu ISO (2026-W01 dimulai 2025-12-29), jadi
   inireading yang konsisten. Kalau produk ternyata mau **7 hari bergulir** (hari ini +
   6 hari sebelumnya), itu perubahan semantik → perlu keputusan Leader.
2. **BE-016 — rentang laporan (`/reports/*`) belum dibatasi.** Brief_be-016 menyebut
   dashboard, jadi hanya endpoint dashboard yang diberi cap 365 hari. Endpoint laporan
   masih menerima rentang bebas → satu permintaan sangat lebar menghasilkan banyak baris
   (untuk `daily`, satu baris per hari). Endpoint laporan hanya untuk Super Admin dan
   memakai indeks `idx_transactions_created_at`. Kalau mau dibatasi juga, cukup menambah
   cap yang sama pada `resolveRange()` di `routes/reports.js` — **tidak dikerjakan** karena
   di luar scope & berisiko memutus halaman Laporan.
3. **BE-016 — dampak ke client.** `GET /dashboard/revenue-chart` & `/busy-hours` kini bisa
   membalas 400 bila rentang > 365 hari. Halaman Dashboard (web) mengirim rentang 7 hari
   secara default → tidak terpengaruh. Kalau ada UI yang memperbolehkan rentang > 1 tahun,
   **frontend** harus menampilkan pesan error tersebut (bukan pesan generik).
4. **BE-016 — default `revenue-chart` berubah.** Tanpa `from`/`to`, jendela default
   sebelumnya "hari ini" (1 bucket), sekarang "30 hari terakhir" (30 bucket), disamakan
   dengan `busy-hours` sesuai usulan audit. Web selalu mengirim `from`/`to` → tidak
   terpengaruh.
5. **BE-012 — tidak ada migrasi v5.** Skema efektif setelah migrasi **sudah** cocok dengan
   `api-contract.md` (role `superadmin`/`user`, `users.phone`, `bookings.customer_user_id`),
   dan sudah diverifikasi lewat assertion di `server/test/fix-batch2.test.js`. Kalau nanti
   ada perubahan skema, harus lewat **migrasi baru** (append di `MIGRATIONS`), **bukan**
   mengedit `schema.sql` (v1) maupun langkah v2/v3/v4.
6. **BE-018a — `sessions.js:77` (`nextTrxNumber`) tidak di-escape.** Polanya
   `TRX-YYYYMMDD-%` dibuat dari tanggal server, bukan dari input pengguna → tidak ada
   wildcard dari user yang bisa masuk. `reports.js` sendiri **tidak memakai LIKE** sama
   sekali, jadi tidak ada yang perlu di-escape di sana.
7. **BE-018b — `?q=` pada `?q=1e2` dsb.** `idParam` sudah ketat, tetapi `?q=` tetap
   menerima string apa pun (murni teks) — perilaku itu benar dan tidak diubah.
8. **Batch 1 utuh.** Semua perubahan Batch 1 (quote sessionId, `/reports/payments`
   totals, `items[]` nama baru, migrasi v4, `BOOKING_ALREADY_CHECKED_IN`, `DUPLICATE_USERNAME`,
   batas `startedAt`, `amountPaid` non-tunai) **tidak** disentuh; `npm test` 83 tes lama
   tetap hijau tanpa diedit/skip.
9. **Di luar scope tapi relevan untuk Leader:** `specs/reports.md` dan `specs/dashboard.md`
   masih mendeskripsikan perilaku lama (bucket tanpa periode kosong, `type` ekspor
   `sessions|transactions|units|daily`). Saya tidak menyentuhnya (specs selain
   `fix-contract.md` tidak masuk brief Batch 2) — perlu pembaruan supaya tidak
   menyesatkan.

---

## 6. Status verifikasi

**`verified`**

- `cd server && npm test` → **96 pass / 0 fail** (83 lama + 13 regresi baru).
- `node tools/security-probe.mjs` → **PASS**, 0 blocker / 0 major / 0 minor (69 cek).
- **Mutation check** terhadap 9 perilaku yang diperbaiki → tes regresi gagal seperti
  seharusnya (tabel di §3), lalu mutasi dibalik dan `npm test` diulang sampai 96/96.
- Tidak ada `console.log` di kode produksi yang diubah (dicek dengan grep).
- Tidak ada dependency baru; `web/` tidak disentuh; `pricing.js`, `errors.js`,
  `mapTransaction`, `schema.sql` (isi), `db.js` (migrasi v1–v4) tidak diubah.
- `api-contract.md` diperbarui dan sinkron dengan implementasi (11 area), plus bagian
  "Changelog kontrak" baru.
