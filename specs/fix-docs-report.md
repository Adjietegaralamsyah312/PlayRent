# DOC-001 — Penyelarasan dokumentasi setelah audit & perbaikan

**Agent:** @general (doc-updater) · **Tanggal:** 20 Oktober 2026
**Status:** `verified` (semua angka diverifikasi ulang dengan menjalankan perintahnya)
**Sifat pekerjaan:** dokumen saja. Tidak ada file di `server/` atau `web/` yang disentuh.

---

## 1. File yang diubah

| File | Nature | Ringkasan perubahan |
| --- | --- | --- |
| `AUDIT_HASIL.md` | **Ditulis ulang penuh** | Laporan audit final yang jujur. Klaim lama "10/10 skenario PASS, tidak ada bug" dihapus. Metode, tabel 40 temuan, perubahan API, hasil verifikasi, bagian "temuan lama yang tidak berlaku", dan risiko tersisa. |
| `specs/reports.md` | Diperbarui sebagian | §2 (tabel data + 4 paragraf baru), §4 (baris `type`). |
| `specs/dashboard.md` | Diperbarui sebagian | §1 item 5, §2 (2 baris tabel + 2 paragraf), §3 (1 baris state), §4 (1 paragraf). |
| `specs/sessions.md` | Diperbarui sebagian | §3 (tabel write + tabel jalur quote + 3 paragraf), §5, §6, §7.1, §7.2. |
| `specs/bookings.md` | Diperbarui sebagian | §2 (baris `cancel` + 1 paragraf), §3 (1 baris state). |
| `specs/database.md` | **Verifikasi** + 1 koreksi | Sudah sinkron dengan backend (bagian "Migrasi v4" + `seed:schema` sudah ada). Koreksi satu angka tentang seeder demo — detail di §2. |
| `docs/CARA-PAKAI.md` | Ditambah | Bagian baru "0. Instalasi pertama (sekali saja)" + 2 baris tabel masalah. |

Tidak disentuh (sesuai brief): `api-contract.md`, `specs/fix-*.md`, `specs/audit-*.md`, `specs/design-qa-report.md`, `specs/review-report.md`, `README.md`, dan seluruh `server/` + `web/`.

---

## 2. Ringkasan perubahan per file

### `AUDIT_HASIL.md` (rewrite)

Struktur baru: §1 Metode · §2 Ringkasan temuan · §3 Tabel BE-001…BE-018 · §4 Tabel FE-001…FE-022 · §5 Perubahan API · §6 Dua temuan yang *diterima* · §7 Hasil verifikasi final · §8 Temuan lama yang tidak berlaku · §9 Risiko tersisa · §10 Kesimpulan.

- **Tabel temuan:** 40 baris (18 BE + 22 FE), kolom `ID | severity | ringkasan 1 kalimat | status`. Ditutup ✓ = 38, Diterima = 2.
- **Perubahan API** diambil dari `api-contract.md` §Changelog kontrak: dua jalur quote (`sessionId` / `consoleId`+`durationMinutes`, `extraMinutes` = menit rencana), `items[]` = `{id, kind, description, qty, unitPrice, lineTotal}`, `totals` `/reports/payments` = `{count, gross, paid, outstanding, voided}`, 7 tipe CSV + 400 untuk type tak dikenal, kode error baru `BOOKING_ALREADY_CHECKED_IN`, migrasi v4 + `seed:schema`.
- **Angka verifikasi ditulis persis** dan **diverifikasi ulang** di sesi ini (lihat §4).
- **§8 "Temuan lama yang tidak berlaku"** mencatat bahwa versi lama mengklaim semua bersih dan itu **tidak akurat**, dengan alasannya: `seedBase()` selalu menyisipkan `business_settings` (jalur uang rusak tidak pernah tersentuh tes) dan tidak ada test untuk `/reports/payments`, `?status=overdue`, maupun quote-vs-finish.

### `specs/reports.md`

- `daily`/`weekly`/`monthly`: satu baris per periode dalam rentang, periode kosong = 0 (label minggu ISO-8601, aritmetika waktu Jakarta).
- 7 tipe CSV + 400 `VALIDATION_ERROR` untuk type tak dikenal/kosong, tanpa fallback diam-diam ke `transactions`; `daily|weekly|monthly` mengekspor agregat R2–R4, `payments` mengekspor dataset R6.
- Formula-injection guard: prefix `'` pada sel string yang diawali `= + - @`/tab/CR, angka tidak diubah.
- `GET /reports/payments`: `totals.voided` = jumlah transaksi void (bukan rupiah).
- Dicatat bahwa rentang `/reports/*` **tidak** dibatasi (batas 365 hari hanya di endpoint dashboard).

### `specs/dashboard.md`

- `revenue-chart` & `busy-hours`: bucket kosong terisi 0; tanpa `from`/`to` default **30 hari terakhir**.
- `revenueWeek` = 7 hari ISO-week berjalan (Senin–Minggu, Jakarta), bukan 7 hari bergulir; bisa menyeberang tahun kalender.
- Batas 365 hari + `from > to` → 400 `VALIDATION_ERROR`; state error khusus dengan aksi "Persempit rentang".

### `specs/sessions.md`

- `POST /sessions/quote`: dua jalur (tabel baru) — jalur **sesi** `{sessionId, extraMinutes?}` (tarif `rate_snapshot`, `actual` = menit sejak `started_at` → overtime nyata) dan jalur **rencana** `{consoleId, durationMinutes, startedAt?, extraMinutes?}` (tarif `console.hourly_rate`). `extraMinutes` selalu menambah durasi rencana. Kode error: 404/409/400/404.
- `?status=overdue` berfungsi: `markOverdue()` dijalankan sebelum filter → sesi terlambat tidak lagi muncul sebagai `active`.
- `startedAt` dibatasi 24 jam ke belakang / 5 menit ke depan → 400.
- §7.1 & §7.2: preview kini memakai quote server (`{sessionId}`), bukan estimasi client → pratinjau = tagihan.

### `specs/bookings.md`

- Cancel booking yang sudah check-in → **409 `BOOKING_ALREADY_CHECKED_IN`**, booking dan sesinya tidak disentuh, plus state error di §3.

### `specs/database.md` (verifikasi)

Bagian "Migrasi v4", `user_version = 4`, `seed:schema` sudah ada dan sinkron dengan `server/src/db.js` — **tidak ada perubahan yang diperlukan**. Koreksi satu angka yang diverifikasi dengan menjalankan seeder pada DB kosong:

| Sebelum | Sesudah | Fakta terverifikasi |
| --- | --- | --- |
| "45 finished sessions + 45 matching transactions spread over the last **45 days**" | "…0–2 sessions per day across the last **44 days** (RNG seed fixed at `42`; **31 of those 44 days** are filled)" | `node src/seed.js` pada DB kosong → `rental_sessions` 46 (45 finished + 1 live), `transactions` 45, `transaction_items` 45, `audit_logs` 45, `bookings` 2, `business_settings` 1, `users` 0; 31 hari terisi |

### `docs/CARA-PAKAI.md`

- Bagian baru **"0. Instalasi pertama (sekali saja)"**: `npm run seed:schema` (produksi: DB + katalog) vs `npm run seed` (demo: + 45 transaksi fiktif 44 hari + sesi demo yang mengunci satu unit), lalu `npm run admin:bootstrap` untuk akun Super Admin.
- 2 baris tabel "Kalau ada masalah": dashboard kosong, dan laporan berisi pendapatan fiktif.

---

## 3. Temuan yang **tidak** bisa ditutup

**Tidak ada temuan yang tertinggal terbuka.** 40 temuan sudah punya status final:

| Status | Jumlah | ID |
| --- | --- | --- |
| Ditutup ✓ | 38 | BE-001…BE-008, BE-010…BE-016, BE-018 · FE-001…FE-022 |
| **Diterima** (keputusan sadar, bukan tertinggal) | 2 | **BE-009**, **BE-017** |

Catatan untuk dua yang "Diterima" (detailnya di `AUDIT_HASIL.md` §6):

- **BE-009** (batas diskon) — kode-server sengaja dibiarkan; **kontrak** yang diselaraskan (`api-contract.md` §Pricing: cap = `subtotal + overtimeAmount + extraCharge`). Membalkahnya berarti mengubah rumus uang, di luar cakupan audit.
- **BE-017** (tipe `id` di `web/src/lib/types.ts` masih `string`, sedangkan server mengirim integer) — **tidak ditutup**. Bagian yang memengaruhi UI (`billedMinutes` → `number | null`) sudah tertutup lewat FE-012, tetapi perubahan tipe `id`/`consoleId`/`createdBy`/`transactionId`/`sessionId`/`refId` dari `string` → `number` **belum dikerjakan** karena menyentuh banyak file dan berpotensi memunculkan error kompilasi di seluruh frontend. Tidak ada bug runtime saat ini, tetapi tipenya masih berbohong. Perlu ticket tersendiri.

---

## 4. Verifikasi

| Cek | Hasil |
| --- | --- |
| `server: npm test` | **96 pass / 0 fail** (72 awal + 24 regresi baru: `server/test/fix-batch1.test.js`, `server/test/fix-batch2.test.js`) — dijalankan ulang di sesi ini |
| `server: node tools/security-probe.mjs` | **PASS**, 69 cek, 0 blocker / 0 major / 0 minor — dijalankan ulang di sesi ini |
| `web: npm run typecheck` | **0 error** — dijalankan ulang di sesi ini |
| `web: npm run build` | sukses — 485.68 kB JS (137.53 kB gzip) · 33.61 kB CSS (7.29 kB gzip) — dijalankan ulang di sesi ini |
| `node src/seed.js` pada DB kosong | `rental_sessions` 46, `transactions` 45, `transaction_items` 45, `audit_logs` 45, `bookings` 2, `business_settings` 1, `users` 0 — dipakai untuk mengoreksi angka di `specs/database.md` |
| Pemeriksaan file terlarang | `api-contract.md`, `specs/fix-*.md`, `specs/audit-*.md`, `specs/design-qa-report.md`, `specs/review-report.md` tidak berubah; tidak ada file di `server/` atau `web/` yang disentuh |

Angka **33/33 integration gate live** berasal dari integration run Leader (server hidup di DB produksi, migrasi + `seed:schema`, tanpa data demo) dan dicatat apa adanya di `AUDIT_HASIL.md` §7 beserta buktinya; angka itu **tidak** dihitung ulang di sesi dokumen ini karena memerlukan server produksi + DB produksi.

---

## 5. Catatan

- **Bahasa dokumen.** `AUDIT_HASIL.md` dan `docs/CARA-PAKAI.md` ditulis dalam Bahasa Indonesia (bahasa asli kedua file). Spec `reports.md` / `dashboard.md` / `sessions.md` / `bookings.md` / `database.md` memakai prosa **Bahasa Inggris** dengan string UI berbahasa Indonesia; tambahan di file-file itu ditulis dalam bahasa yang sama supaya tiap file tetap konsisten. Kalau Leader ingin semua spec dibahasa Indonesia, itu perlu keputusan terpisah (mengubah bahasa prosa seluruh file, bukan hanya bagian yang berubah).
- **Teks Mandarin/asing yang bocor** sempat muncul di beberapa draf saat penulisan dan sudah dibersihkan; pemindaian akhir atas file yang diubah bersih.
- **`README.md` tidak diubah** — isinya sudah sinkron (sudah menunjuk `seed:schema`, migrasi v4). Tidak ada duplikasi yang perlu dibersihkan.
