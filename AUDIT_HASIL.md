# Laporan Audit Profesional — PlayRent

**Tanggal:** 20 Oktober 2026
**Status:** audit + perbaikan selesai · 40 temuan audit (39 ditutup, 1 diterima) + 1 temuan tambahan yang ditemukan saat perbaikan (ditutup) · **0 terbuka**
**Cakupan:** Backend (Express 5 + `node:sqlite`), Frontend (React 19 + Vite + Tailwind v4), kontrak API, basis data, keamanan, dan spesifikasi.

---

## 1. Metode

Audit dilakukan terhadap **implementasi aktual**, bukan dokumentasi:

1. **2 subagen audit independen** — satu untuk backend (`server/src/**` vs `api-contract.md` vs pemakaian di `web/`), satu untuk frontend (`web/src/**` vs kontrak vs server yang dijalankan hidup). Masing-masing read-only terhadap kode.
   - Hasil: **18 temuan backend** (`specs/audit-be-report.md`) + **22 temuan frontend** (`specs/audit-fe-report.md`) = **40 temuan**.
2. **Kontrak kanonik** ditetapkan lebih dulu di `specs/fix-contract.md` — bentuk JSON dan semantik yang harus berlaku, supaya backend dan frontend tidak memperbaiki ke arah berbeda.
3. **3 batch perbaikan** (backend Batch 1 & 2, frontend Batch 1, 2 & 3), masing-masing dengan tes regresi sendiri:
   - `specs/fix-batch1-report.md`, `specs/fix-batch2-report.md` (backend)
   - `specs/fix-batch1-fe-report.md`, `specs/fix-batch2-fe-report.md`, `specs/fix-batch3-fe-report.md` (frontend)
4. **Verifikasi otomatis**: suite tes server, security probe, typecheck, build frontend.
5. **Integrasi live**: server dijalankan di atas DB produksi (migrasi + `seed:schema`, tanpa data demo), lalu diprovokasi langsung lewat HTTP.
6. **CI**: job `server-test` ditambahkan ke workflow GitHub Pages (`specs/fix-devops-report.md`).

---

## 2. Ringkasan temuan

| Severity | Backend | Frontend | Total |
| --- | --- | --- | --- |
| Blocker | 0 | 3 | 3 |
| Critical | 1 | 2 | 3 |
| Major | 7 | 7 | 14 |
| Minor | 10 | 10 | 20 |
| **Total** | **18** | **22** | **40** |

| Status | Jumlah |
| --- | --- |
| Ditutup ✓ | **40** (39 dari audit + 1 tambahan, lihat FE-023) |
| Diterima (disengaja, dijelaskan di §6) | 1 (BE-009) |
| **Sisa terbuka** | **0** |

---

## 3. Temuan backend (BE-001 … BE-018)

| ID | Severity | Ringkasan | Status |
| --- | --- | --- | --- |
| BE-001 | Critical | `business_settings` hanya dibuat oleh seeder demo → setiap endpoint harga balas **500** di DB produksi | Ditutup ✓ |
| BE-002 | Major | `POST /sessions/quote` selalu mengirim `actualMinutes = planned` → overtime selalu 0, preview pembayaran salah | Ditutup ✓ |
| BE-003 | Major | `GET /reports/payments` tidak cocok dengan `web/` → tab Pembayaran menampilkan "Rp 0" | Ditutup ✓ |
| BE-004 | Major | `items[]` di `GET /transactions/:id` memakai nama field berbeda → tabel "Rincian item" kosong | Ditutup ✓ |
| BE-005 | Major | `GET /sessions?status=overdue` selalu kosong; sesi terlambat tampil sebagai `active` | Ditutup ✓ |
| BE-006 | Major | Pelanggan bisa membatalkan booking yang sudah check-in → slot direbut ulang | Ditutup ✓ |
| BE-007 | Major | Laporan harian/mingguan/bulanan dan grafik pendapatan membuang hari tanpa aktivitas | Ditutup ✓ |
| BE-008 | Major | Ekspor CSV tab Mingguan/Bulanan/Pembayaran diam-diam menghasilkan CSV transaksi | Ditutup ✓ |
| BE-009 | Minor | Batas diskon bisa menghapus biaya overtime (kontrak lama menyebut *capped at subtotal*) | **Diterima** |
| BE-010 | Minor | `startedAt` dari klien tidak dibatasi → overtime bisa digelembungkan tanpa batas | Ditutup ✓ |
| BE-011 | Minor | `revenueWeek` di dashboard membuang hari terakhir tahun sebelumnya | Ditutup ✓ |
| BE-012 | Minor | `schema.sql` tidak lagi mencerminkan skema sebenarnya | Ditutup ✓ |
| BE-013 | Minor | Formula injection pada ekspor CSV (nama pelanggan dikendalikan pelanggan) | Ditutup ✓ |
| BE-014 | Minor | Pembayaran non-tunai menimpa `amountPaid` dengan total → nominal yang benar-benar diterima hilang | Ditutup ✓ |
| BE-015 | Minor | Cek username ganda adalah *check-then-act* → UNIQUE violation jadi 500, bukan 409 | Ditutup ✓ |
| BE-016 | Minor | Pemindaian tanpa batas pada dashboard | Ditutup ✓ |
| BE-017 | Minor | Tipe `id` di `web/src/lib/types.ts` bertentangan dengan API (string vs integer) | Ditutup ✓ — ternyata pemicu bug nyata, lihat FE-023 |
| BE-018 | Minor | Dua cacat kecil: pola `LIKE` tanpa escape, dan id non-numerik membalas 400 | Ditutup ✓ |

## 4. Temuan frontend (FE-001 … FE-022)

| ID | Severity | Ringkasan | Status |
| --- | --- | --- | --- |
| FE-001 | Blocker | Halaman "Sesi" crash: `list.data?.meta.total` melempar TypeError | Ditutup ✓ |
| FE-002 | Blocker | "Tambah konsol" selalu gagal: payload create mengirim `isActive` yang ditolak server | Ditutup ✓ |
| FE-003 | Blocker | Semua input di dalam modal kehilangan fokus setelah 1 karakter | Ditutup ✓ |
| FE-004 | Critical | Dialog "Selesaikan & bayar" menampilkan total yang **bukan** yang ditagih (selisih terbukti Rp 9.500) | Ditutup ✓ |
| FE-005 | Critical | `useAsync`: response lama menimpa response baru (*race* basi) | Ditutup ✓ |
| FE-006 | Major | Tabel "Rincian item" di detail transaksi: kolom kosong, "undefined", dan "Rp 0" | Ditutup ✓ |
| FE-007 | Major | Tab "Pembayaran" di Laporan: dua kartu "Rp 0" dan tiga kolom kosong | Ditutup ✓ |
| FE-008 | Major | Paginasi Transaksi tidak pernah tampil: hanya 20 transaksi pertama yang terlihat | Ditutup ✓ |
| FE-009 | Major | Ekspor CSV di Laporan mengunduh data yang salah untuk 3 dari 5 tab | Ditutup ✓ |
| FE-010 | Major | Preview harga memakai tarif konsol **terkini**, server menagih tarif `rateSnapshot` (selisih terbukti Rp 20.000) | Ditutup ✓ |
| FE-011 | Major | Daftar Booking dipotong diam-diam pada 50 baris, tanpa paginasi | Ditutup ✓ |
| FE-012 | Major | Sesi hidup menampilkan durasi "0m / 60m" (kolom `billedMinutes` = null) | Ditutup ✓ |
| FE-013 | Minor | `Switch` (tombol `role="switch"`) tidak punya *accessible name* | Ditutup ✓ |
| FE-014 | Minor | `aria-describedby` menunjuk elemen yang tidak dirender (referensi menggantung) | Ditutup ✓ |
| FE-015 | Minor | `aria-sort` diletakkan pada `<button>` di dalam `<th>`, bukan pada `<th>` | Ditutup ✓ |
| FE-016 | Minor | Grafik garis: titik hover dan tooltip tidak sejajar dengan titik data | Ditutup ✓ |
| FE-017 | Minor | Ambang "kritis" pada timer jatuh ke default 5 menit, bukan ke konfigurasi operator | Ditutup ✓ |
| FE-018 | Minor | Timeline booking: blok yang tumpang-tindih menumpuk dan saling menutupi | Ditutup ✓ |
| FE-019 | Minor | `SettingsProvider` memakai bentuk "admin" untuk pelanggan; tipe berbohong | Ditutup ✓ |
| FE-020 | Minor | Timer toast tidak dibersihkan, dan polling bisa tumpang-tindih | Ditutup ✓ |
| FE-021 | Minor | Panjang maksimum "Catatan ketersediaan" tidak sinkron dengan server (200 vs 60) | Ditutup ✓ |
| FE-022 | Minor | Cetak struk dari halaman struk bisa mencetak halaman kosong | Ditutup ✓ |
| **FE-023** | **Major** | **Ditemukan saat perbaikan (bukan dari audit awal): deep-link `/sesi/baru?consoleId=3` tidak pernah mempreselect konsol — id dari URL (string) dibandingkan dengan id API (integer) → ringkasan "Konsol" kosong & operator bisa menyewa unit yang berbeda dari yang terlihat** | Ditutup ✓ — tipe id diselaraskan ke integer (`specs/fix-batch3-fe-report.md`) |

---

## 5. Perubahan API

Ringkasan dari `api-contract.md` §Changelog kontrak. Envelope `{success, data, meta}` **tidak** berubah.

| Area | Perubahan |
| --- | --- |
| `POST /sessions/quote` | Body gained optional `sessionId`; `consoleId` + `durationMinutes` menjadi jalur "rencana". `extraMinutes` kini **selalu** menambah durasi rencana. Error: `404 SESSION_NOT_FOUND`, `409 SESSION_NOT_ACTIVE`, `400 VALIDATION_ERROR`, `404 CONSOLE_NOT_FOUND`. |
| `GET /transactions/:id` → `items[]` | Field diganti menjadi `{id, kind, description, qty, unitPrice, lineTotal}` (nama lama `label`/`quantity`/`amount` dihapus). |
| `GET /reports/payments` | `items[]` kini berisi `Transaction[]` utuh; `totals` = `{count, gross, paid, outstanding, voided}` (`recorded`/`subtotal` dihapus, `voided` = **jumlah** transaksi void). |
| `GET /reports/export.csv` | `type` menerima 7 nilai: `sessions\|transactions\|units\|daily\|weekly\|monthly\|payments`. `type` tak dikenal (atau kosong) → **400 `VALIDATION_ERROR`**, tanpa fallback diam-diam. `daily\|weekly\|monthly` mengekspor agregat yang sama dengan R2–R4; `payments` mengekspor dataset R6. |
| `GET /reports/daily\|weekly\|monthly` | Satu baris per periode dalam rentang `from..to`; periode kosong dikembalikan dengan nilai nol. |
| `GET /dashboard/summary` | `revenueWeek` kini mencakup 7 hari penuh ISO-week berjalan, termasuk hari di tahun kalender sebelumnya. |
| `GET /dashboard/revenue-chart` & `/busy-hours` | Bucket kosong terisi; jendela query dibatasi 365 hari (lebih lebar → **400 `VALIDATION_ERROR`**); tanpa `from`/`to` memakai 30 hari terakhir. |
| `POST /bookings/:id/cancel` | **Kode error baru** `BOOKING_ALREADY_CHECKED_IN` (409) bila booking sudah check-in. |
| `POST /users` | Username ganda → **409 `DUPLICATE_USERNAME`** (bukan 500). |
| Enforcement | `:id` tidak valid → **400 `VALIDATION_ERROR`** (tidak pernah 500). `?q=` dicocokkan secara literal (wildcard `LIKE` di-escape). Sel CSV dijaga dari *formula injection*. |
| Basis data | **Migrasi v4** membuat baris `business_settings`; `user_version` = 4. `schema.sql` tetap snapshot v1 beku — perubahan hanya lewat migrasi baru. Script **`npm run seed:schema`** = seeder produksi. |

---

## 6. Satu temuan yang **diterima**, bukan ditutup

| ID | Kenapa diterima |
| --- | --- |
| BE-009 | Kontrak lama menyebut diskon *capped at subtotal*. Kode-server membidik `subtotal + overtimeAmount + extraCharge` — lebih aman, dan tidak pernah membuat diskon melebihi total. **Kode tidak diubah**; kontrak yang diselaraskan (`api-contract.md` §Pricing). Tidak ada kerugian uang, hanya laporan "Diskon" yang bisa melebihi subtotal. |

> Catatan: **BE-017** awalnya tercatat "diterima" dengan alasan "tidak ada bug runtime". Saat penutupannya dibuktikan ulang, alasan itu **salah** — perbedaan `string` vs `integer` pada id justru menyebabkan bug nyata (FE-023: konsol tidak pernah terpreselect dari deep-link). Semuanya kini ditutup: `web/src/lib/types.ts` menyatakan id sebagai `number` sesuai kenyataan database, dan id dari URL dinormalisasi lewat helper `toId()`.

---

## 7. Hasil verifikasi final

| Cek | Hasil | Detail |
| --- | --- | --- |
| `server: npm test` | ✅ **96 pass / 0 fail** | 72 tes awal + 24 tes regresi baru (`server/test/fix-batch1.test.js`, `server/test/fix-batch2.test.js`) |
| `server: node tools/security-probe.mjs` | ✅ **PASS** | 69 cek · 0 blocker / 0 major / 0 minor |
| `web: npm run typecheck` | ✅ **0 error** | `tsc --noEmit` |
| `web: npm run build` | ✅ sukses | 486.28 kB JS (137.69 kB gzip) · 33.61 kB CSS (7.30 kB gzip) |
| **Integration gate live** | ✅ **33/33 PASS** | Server hidup di DB produksi (migrasi + `seed:schema`, tanpa data demo) — lihat tabel di bawah |
| CI | ✅ | Workflow GitHub Pages kini punya job `server-test` (*advisory*, paralel, tidak memblokir Pages) |

### Bukti integration gate (live HTTP)

| Yang dibuktikan | Hasil |
| --- | --- |
| `quote(sesi overtime).total == finish.total` | Selisih **Rp 0** |
| `GET /sessions?status=overdue` | Mengembalikan sesi terlambat (dulu selalu kosong) |
| `items[]` (TransactionItem) & `totals` (`/reports/payments`) | Sesuai bentuk baru |
| Ekspor CSV | 7 tipe → 200; `type` tak dikenal → **400** |
| Username ganda | **409** (dulu 500) |
| Id non-numerik | **400** (dulu 500) |

---

## 8. Temuan lama yang tidak berlaku

Versi lama `AUDIT_HASIL.md` menyatakan *"10/10 skenario PASS, tidak ada bug, celah logika, masalah keamanan, inkonsistensi database, masalah timer, perhitungan harga, konflik booking, atau masalah hak akses"* dan *"tidak ada bug produksi yang perlu diperbaiki"*. **Klaim itu tidak akurat dan telah dihapus.**

Penyebabnya: suite tes lama punya celah — `seedBase()` **selalu** menyisipkan `business_settings`, jadi jalur uang yang benar-benar rusak (BE-001) tidak pernah tersentuh tes; dan **tidak ada** test untuk `/reports/payments`, `?status=overdue`, maupun perbandingan quote-vs-finish. Bug lolos tepat karena berada di area yang tidak diuji.

Siklus desain/QA sebelumnya (DS-001…DS-006) memang menutup seluruh temuannya, tetapi design-QA bersifat visual/a11y statis dan **tidak** menangkap bug fungsional/runtime di atas. Detail siklus itu ada di `specs/design-qa-report.md`.

---

## 9. Risiko tersisa / perlu verifikasi manual

Tidak dapat diverifikasi otomatis di lingkungan tanpa browser nyata:

| Bagian | Alasan |
| --- | --- |
| Komposisi warna sebenarnya & kontras terkomposit | Perlu rendering browser nyata |
| Target sentuh 44 px di layar sentuh sungguhan | Perlu ukuran fisik layar |
| Layout 360 px & overflow horizontal | Perlu viewport 360 px nyata |
| Cetak struk 80 mm (kertas thermal) | Perlu printer thermal / preview cetak browser |
| Pengumuman layar pembaca (*screen reader*) | Perlu AT sungguhan |
| Layout saat layar diputar (landscape/portrait) | Perlu perangkat dengan akselerometer |

Perilaku baru yang perlu diketahui penggunanya:

| Perilaku | Keterangan |
| --- | --- |
| Quote memakai `sessionId` | Preview/finish memakai jalur sesi (tarif `rateSnapshot` + jam nyata) → angka pratinjau = angka tagihan |
| Rentang `/reports/*` tidak dibatasi | Endpoint laporan menerima rentang bebas; **dashboard** dibatasi 365 hari (lebih lebar → 400) |
| `revenueWeek` = 7 hari ISO-week berjalan | Senin–Minggu; bisa menyeberang tahun kalender |
| `revenue-chart` default 30 hari | Tanpa `from`/`to` jendela default adalah 30 hari terakhir (bukan 1 hari) |
| `extraMinutes` = menit rencana | Menambah durasi rencana; biaya perpanjangan = selisih dua quote |

---

## 10. Kesimpulan

40 temuan audit ditemukan (18 backend + 22 frontend) plus **1 temuan tambahan** yang muncul saat penutupannya (FE-023). **40 ditutup**, **1 diterima** dengan alasan yang disengaja (BE-009), **0 terbuka**.

Verifikasi: **96/96 tes pass**, security probe **PASS** (69 cek, 0 temuan), typecheck **0 error**, build sukses, dan **integration gate live 33/33 PASS** di DB produksi tanpa data demo. CI punya job `server-test` sebagai pagar regresi backend.

Sisa pekerjaan adalah verifikasi manual visual/cetak (§9) sebelum peluncuran produksi.

---

**File terkait:** `api-contract.md` · `specs/audit-be-report.md` · `specs/audit-fe-report.md` · `specs/fix-contract.md` · `specs/fix-batch1-report.md` · `specs/fix-batch2-report.md` · `specs/fix-batch1-fe-report.md` · `specs/fix-batch2-fe-report.md` · `specs/fix-batch3-fe-report.md` · `specs/fix-devops-report.md` · `specs/fix-docs-report.md` · `README.md` · `docs/CARA-PAKAI.md`
