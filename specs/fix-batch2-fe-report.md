# Laporan Perbaikan FE — Batch 2 (laporan/tabel + a11y + misc)

**Agen:** @frontend-react · **Task:** FE-FIX-2 · **Tanggal:** 20 Okt 2026
**Ruang lingkup:** hanya `web/src/**` (tidak ada `server/`, `api-contract.md`, `specs/fix-contract.md`;
`web/package.json` **tidak berubah** — nol dependency baru).
**Status verifikasi:** `verified`

---

## 1. Ringkasan

| ID | Severity | File diubah | Yang berubah | Cara verifikasi |
|---|---|---|---|---|
| **FE-006** | Major | `web/src/lib/types.ts`, `web/src/pages/TransactionDetail.tsx` | `TransactionItem` sekarang `{id, kind, description, qty, unitPrice, lineTotal}` (bentuk kanonik server §1.2) + `TransactionItemKind` = `'rental'\|'overtime'\|'extra'\|'discount'` (ikut CHECK constraint DB). Kolom tabel: **Jenis** (label Indonesia), **Item**, **Qty**, **Harga satuan**, **Jumlah** — semua terisi, tidak ada lagi `"undefined"` / `"Rp 0"`. | jsdom (payload kanonik) + E2E server nyata → §3.1 |
| **FE-007** | Major | `web/src/lib/api.ts`, `web/src/pages/Reports.tsx` | Tipe `reports.payments` → `PaymentsReport` = `{items: Transaction[]; totals:{count,gross,paid,outstanding,voided}}` (`voided` = **JUMLAH** transaksi void, bukan rupiah). Kartu ringkasan tab Pembayaran: Total tagihan (gross), Pendapatan tercatat (paid), Belum dibayar (outstanding) + **Transaksi dibatalkan** = jumlah void. Kolom Waktu/Metode/Status membaca `createdAt`/`paymentMethod`/`paymentStatus` (sudah sesuai bentuk baru). | jsdom + E2E server nyata → §3.1 |
| **FE-009** | Major | `web/src/lib/api.ts`, `web/src/pages/Reports.tsx` | `exportCsvUrl` menerima **union** `ReportCsvType = 'sessions'\|'transactions'\|'units'\|'daily'\|'weekly'\|'monthly'\|'payments'` → compiler menolak nilai tab yang salah. Tombol "Ekspor CSV" mengirim `type` = tab aktif (daily→daily, weekly→weekly, monthly→monthly, units→units, payments→payments). | jsdom (klik tab + klik ekspor) + E2E CSV 5 tipe → §3.1 |
| **FE-011** | Major | `web/src/lib/api.ts`, `web/src/pages/Bookings.tsx` | `bookings.list` → `Paginated<Booking>` (page/limit). Halaman kirim `page` + `limit` (20 baris tabel, 100 timeline = batas server) dan **status** difilter di server. `<Pagination>` memakai `meta` server. Garis total memakai `meta.total` (bukan `rows.length`) → angka jujur. Banner "kedaluwarsa" menghitung **sehari penuh** (query `status=confirmed`), bukan baris di layar. Timeline menampilkan catatan jujur bila sehari > 100 booking. | jsdom + E2E server nyata → §3.1 |
| **FE-013** | Minor | `web/src/components/Form.tsx` | `Switch`: `<label htmlFor>` (tidak bisa menamai tombol) → `<span id={fieldId}-label>` + `aria-labelledby` pada `role="switch"`. Nama aksesibel kini terbaca "Konsol aktif" dsb. | jsdom before/after → §3.2 |
| **FE-014** | Minor | `web/src/components/Form.tsx` | `aria-describedby` = `error ? errorId : helpText ? helpId : ''` (Input/Textarea/Select) — hanya menunjuk id yang benar-benar dirender (help disembunyikan saat error aktif). | jsdom before/after → §3.2 |
| **FE-015** | Minor | `web/src/components/DataTable.tsx` | `aria-sort` dipindah ke `<th>`; `<button>` dalam header mendapat `aria-label="Urutkan berdasarkan X"`. | jsdom before/after → §3.2 |
| **FE-016** | Minor | `web/src/components/Chart.tsx` | Satu pemetaan x untuk garis, titik hover, tooltip, dan label sumbu-x: **pusat kolom** `((i+0.5)/n)*w`. Titik hover diposisikan di `left:50%` **dalam** tombol kolomnya (sebelumnya dihitung terhadap lebar plot → meleset ~2%). | jsdom before/after → §3.2 |
| **FE-017** | Minor | `web/src/lib/useCountdown.ts` | Ambang "kritis" = ambang **terkecil** terkonfigurasi: `warn[warn.length-1] ?? warn[0] ?? 5` (bukan `warn[1] ?? 5`). | jsdom before/after → §3.2 |
| **FE-018** | Minor | `web/src/components/BookingTimeline.tsx` | Booking `cancelled`/`completed`/`checked_in` yang tumpang tindih tidak lagi menutupi blok aktif: blok non-aktif `z-0 opacity-60`, blok aktif `z-10` → blok aktif tetap ter-klik. | jsdom → §3.1 |
| **FE-019** | Minor | `web/src/lib/types.ts`, `web/src/lib/settings-context.tsx`, `web/src/pages/Settings.tsx` | `PublicPricingRules` (publik) dipisah dari `PricingRules` (admin + tarif overtime). `SettingsProvider` (membungkus seluruh app, pelanggan termasuk) memakai `settingsApi.getPublic()` → `CustomerSettings` (`payments` opsional). Halaman **Settings** (admin) memuat bentuk penuh sendiri via `settingsApi.get()`. Bentuk/types kini jujur. | jsdom + E2E admin/pelanggan + uji tipe negatif → §3.1, §3.3 |
| **FE-020** | Minor | `web/src/lib/toast.tsx`, `web/src/lib/usePolling.ts` | (a) `toast.tsx`: satu timer per toast, dibersihkan saat `dismiss` **dan** saat provider unmount. (b) `usePolling.ts`: tick dilewati bila request sebelumnya masih berjalan (`running` guard) → tidak ada request tumpang tindih. | jsdom before/after → §3.2 |
| **FE-021** | Minor | `web/src/pages/Games.tsx` | "Catatan ketersediaan" `maxLength={60}` (sama dengan server `z.string().max(60)`) + `helpText` menyebut batasnya. | jsdom → §3.1 |
| **FE-022** | Minor | `web/src/pages/Receipt.tsx` | Tombol "Cetak" **nonaktif** sampai `frameState === 'loaded'` → tidak lagi mencetak halaman kosong. | jsdom → §3.1 |
| **Tambahan Batch 1** | — | `web/src/components/session-dialogs.tsx` | `ExtendDialog`: bila biaya perpanjangan dihitung **0** padahal menit tambahan > 0 (sesi sudah overtime → menit overtime jadi menit rencana, jadi tidak menambah tagihan), tampilkan 1 baris catatan jujur: "Perpanjangan ini tidak menambah tagihan — waktu tersebut sudah ditagih." (tanpa redesign). | jsdom → §3.1 |

### File di luar daftar awal (deviasi sadar)

| File | Alasan |
|---|---|
| `web/src/pages/Settings.tsx` | Wajib untuk FE-019: provider global kini menyajikan bentuk **publik**, jadi halaman admin "/pengaturan" yang butuh tarif overtime + metode pembayaran memuat bentuk penuh sendiri (`settingsApi.get()`). Tanpa ini, `tsc` gagal. |
| `web/src/lib/api.ts` | Wajib untuk FE-006/007/009/011: tipe `TransactionItem`/`PaymentsReport`/`ReportCsvType` + `bookings.list` → `Paginated`. Envelope merge `request()` **tidak** disentuh (inti Batch 1). |

---

## 2. Verifikasi wajib

```
$ cd web && npm run typecheck
> node node_modules/typescript/bin/tsc --noEmit
(0 error)

$ cd web && npm run build
> node node_modules/typescript/bin/tsc --noEmit && node node_modules/vite/bin/vite.js build
vite v6.4.4 building for production...
✓ 1647 modules transformed.
dist/index.html                   0.89 kB │ gzip:   0.48 kB
dist/assets/index-UaqFMzjB.css   33.61 kB │ gzip:   7.29 kB
dist/assets/index-Bno5YZ70.js   485.68 kB │ gzip: 137.53 kB
✓ built in 18.12s
```

- Tidak ada `console.log` di `web/src/**` (`grep -rn "console\.log" src/` → 0 hasil).
- `web/package.json` **tidak berubah** → `npm ci` di CI tetap jalan.
- `git diff web/package.json` → kosong.
- File uji **tidak** masuk repo; semua skrip ada di
  `/data/data/com.termux/files/usr/tmp/opencode/fe-batch2/`
  (`checks.tsx` + `runner.cjs`, `before-checks.tsx` + `before-runner.cjs`, `e2e.mjs`,
  `negative-type.tsx`/`old-negative-type.tsx`).

---

## 3. Bukti

### 3.1 jsdom — kode baru (39 pemeriksaan, `checks.tsx`)

```
PASS  FE-006 kolom Item terisi  deskripsi item tampil
PASS  FE-006 kolom Qty terisi  tidak ada "undefined"
PASS  FE-006 kolom Jumlah terisi  line total tampil, bukan "Rp 0"
PASS  FE-006 jenis item tampil  kolom Jenis terisi
PASS  FE-007 kartu total tagihan benar  gross tampil (bukan Rp 0)
PASS  FE-007 kartu pendapatan tercatat benar  paid tampil
PASS  FE-007 voided = jumlah transaksi  voided tampil sebagai COUNT
PASS  FE-007 kolom Waktu terisi  waktu = 15 Okt 2026, 17.00
PASS  FE-007 kolom Metode terisi  metode = Tunai
PASS  FE-007 kolom Status terisi  status = Lunas
PASS  FE-009 type CSV = tab (mingguan)  type=weekly
PASS  FE-009 type CSV = tab (pembayaran)  type=payments
PASS  FE-011 kirim page & limit ke server  /api/bookings?date=2026-10-20&page=1&limit=20
PASS  FE-011 <Pagination> tampil dengan meta server  ringkasan paginasi
PASS  FE-011 total memakai meta server  garis total jujur
PASS  FE-013 switch punya nama aksesibel  aria-labelledby=_r_a_-label → "Konsol aktif"
PASS  FE-013 tanpa <label for> ke tombol  tidak ada label for yang menunjuk tombol
PASS  FE-014 aria-describedby hanya id yang dirender  describedby="_r_b_-error"
PASS  FE-014 error dideskripsikan, help disembunyikan  menunjuk elemen error
PASS  FE-015 aria-sort ada di <th>  th aria-sort=ascending
PASS  FE-015 aria-sort bukan di <button>  button tidak punya aria-sort
PASS  FE-016 titik line di pusat kolom  xs=75,225,375,525 expect=75,225,375,525
PASS  FE-016 titik hover di atas tombolnya  left=50%
PASS  FE-016 tooltip di pusat kolom yang sama  left=37.5%
PASS  FE-017 ambang tunggal [3]: 4 menit belum kritis  severity=ok
PASS  FE-017 ambang tunggal [3]: 2 menit kritis  severity=critical
PASS  FE-017 ambang tunggal [1]: 2 menit belum kritis  severity=ok
PASS  FE-017 ambang [10,5,1]: 6 menit = warn  severity=warn
PASS  FE-017 ambang [10,5,1]: 2 menit belum kritis (ambang terkecil = 1 menit)  severity=warn
PASS  FE-017 ambang [10,5,1]: 30 detik = kritis  severity=critical
PASS  FE-018 blok aktif di atas (z-10)  ...
PASS  FE-018 blok non-aktif di bawah & transparan  ...
PASS  FE-019 warnMinutes dari bentuk publik  warn=15,5,2
PASS  FE-019 provider memanggil GET /settings  /api/settings
PASS  FE-020 timer toast dibersihkan saat dismiss  clearTimeout dipanggil 1x
PASS  FE-020 polling skip tick saat request berjalan  calls=2 (lama: ~7)
PASS  FE-021 maxLength = 60  maxlength=60
PASS  FE-021 helpText menyebut batasnya  Maksimal 60 karakter. ...
PASS  FE-022 tombol Cetak nonaktif sebelum iframe siap  disabled=true
PASS  Tambahan Batch 1: catatan perpanjangan Rp 0  catatan jujur tampil

ALL CHECKS PASSED (0 failures)
```

### 3.2 jsdom — kode LAMA (git HEAD) mereproduksi bug yang sama

`before-checks.tsx` memuat file lama (`git show HEAD:web/src/...`) dan memakai **pemeriksaan yang sama**:

```
PASS  OLD FE-013 switch TIDAK punya nama aksesibel  accessible name=""
PASS  OLD FE-014 aria-describedby menggantung  describedby="_r_1_-error _r_1_-help" → hilang: _r_1_-help
PASS  OLD FE-015 aria-sort salah tempat  th=null button=ascending
PASS  OLD FE-016 titik line TIDAK di pusat kolom  xs=0,200,400,600 (pusat kolom = 75,225,375,525)
PASS  OLD FE-016 titik hover TIDAK di atas tombolnya  left=33.33333333333333%
PASS  OLD FE-017 ambang [3] menyala "kritis" lebih awal  severity=critical (ambang terkonfigurasi 3 menit)
PASS  OLD FE-017 ambang [1] menyala "kritis" 5 menit  severity=critical (ambang terkonfigurasi 1 menit)
PASS  OLD FE-020 polling tumpang tindih  calls=7 (baru: 2)

ALL OLD-CODE CHECKS PASSED — every bug reproduced on git HEAD
```

### 3.3 E2E — server nyata (`localhost:4199`, DB temporer, admin + pelanggan)

```
PASS  login admin  status=200
PASS  FE-006 items[] bentuk kanonik  {"id":45,"kind":"rental","description":"Sewa PS-10 120 menit","qty":1,"unitPrice":30000,"lineTotal":30000}
PASS  FE-006 tidak ada field lama (label/quantity/amount)  id,kind,description,qty,unitPrice,lineTotal
PASS  FE-007 totals punya count/gross/paid/outstanding/voided  {"count":20,"gross":602000,"paid":602000,"outstanding":0,"voided":0,...}
PASS  FE-007 voided = JUMLAH transaksi void (bukan rupiah)  voided=0
PASS  FE-007 items[] = objek transaksi utuh  id,number,sessionId,consoleCode,customerName,cashierName
PASS  FE-009 export.csv type=daily diterima     status=200 head=Tanggal,Pendapatan,Transaksi,Sesi,Menit
PASS  FE-009 export.csv type=weekly diterima    status=200 head=Tanggal,Pendapatan,Transaksi,Sesi,Menit
PASS  FE-009 export.csv type=monthly diterima   status=200 head=Tanggal,Pendapatan,Transaksi,Sesi,Menit
PASS  FE-009 export.csv type=units diterima     status=200 head=Kode Unit,Jenis,Ruangan,Tarif/Jam,Sesi,M
PASS  FE-009 export.csv type=payments diterima  status=200 head=No. Transaksi,Waktu,Pelanggan,Unit,Subto
PASS  FE-009 type tak dikenal → 400 (bukan fallback diam-diam)  status=400
PASS  FE-011 bookings mengembalikan meta  {"page":1,"limit":2,"total":2,"totalPages":1}
PASS  FE-011 items dipaginasi (≤ limit)  items=2
PASS  FE-011 halaman 2 ≠ halaman 1  p1=[2,1] p2=[]
PASS  FE-019 admin menerima tarif overtime  overtimeRatePerHour=12000
PASS  FE-019 admin menerima metode pembayaran  {"methods":["cash","transfer","qris"]}
PASS  register pelanggan  status=201
PASS  login pelanggan  status=200
PASS  FE-019 pelanggan tidak menerima tarif overtime  rules=minDurationMinutes,roundingMinutes,defaultHourlyRate,warnMinutes
PASS  FE-019 pelanggan tidak menerima metode pembayaran  payments=undefined
PASS  FE-019 pelanggan tetap menerima warnMinutes  warnMinutes=[10,5,1]

ALL E2E CHECKS PASSED (0 failures)
```

**Uji tipe negatif (FE-019)** — "tipe berbohong" kini dicegah compiler:

```
=== OLD (git HEAD) — Reading an admin field through the provider COMPILES ===
$ tsc --noEmit --strict old-negative-type.tsx
old exit=0                       # settings?.rules.overtimeRatePerHour → compiles (the lie)

=== NEW — the same read MUST NOT compile ===
$ tsc --noEmit --strict new-negative-type.tsx
new-negative-type.tsx(6,32): error TS2339: Property 'overtimeRatePerHour' does not exist on type 'PublicPricingRules'.
```

---

## 4. Catatan integrasi (untuk Leader)

1. **FE-009 bergantung pada BE-008** — saat Batch 2 FE dikerjakan, `server/src/routes/reports.js`
   sudah menerima 7 `type` (`sessions|transactions|units|daily|weekly|monthly|payments`) dan
   menolak `type` tak dikenal dengan **400** (terverifikasi E2E di atas). Client & server
   sekarang konsisten: tab Mingguan/Bulanan/Pembayaran mengunduh data yang benar.
2. **FE-006/FE-007 bergantung pada BE-003/BE-004** — keduanya sudah selesai di server
   (`items[]` kanonik; `totals` = `count/gross/paid/outstanding/voided`). Client sudah
   mengikuti bentuk itu; kolom waktu/metode/status di tab Pembayaran kini terisi.
3. **FE-017 — perubahan semantik yang perlu diketahui produk:** sesuai kontrak §5, "kritis"
   kini menyala pada ambang **terkecil** terkonfigurasi. Dengan konfigurasi default
   `[10,5,1]`, warna merah muncul pada ≤ 1 menit (sebelumnya ≤ 5 menit). Suara alarm
   **tidak** berubah (diatur terpisah di `components/Timer.tsx`).
4. **FE-011 — jumlah request halaman Booking naik dari 1 → 2** (daftar + query "kedaluwarsa"
   satu hari). Alasannya: banner kedaluwarsa harus menghitung **sehari penuh**, bukan
   baris di layar. Halaman tetap memakai paginasi server; timeline memakai `limit=100`
   (batas server) dan menampilkan catatan jujur bila satu hari > 100 booking.
5. **FE-019** — `SettingsProvider` kini meminta bentuk **publik**. Di runtime ini tidak
   mengubah apa pun untuk admin (server mengirim bentuk penuh ke super admin), tetapi
   tipe provider kini jujur dan halaman "/pengaturan" (admin) memuat bentuk penuh sendiri.
6. **Regresi?** Tidak ditemukan. FE-001…FE-005, FE-008, FE-010, FE-012 (Batch 1) tidak
   disentuh; `api.ts` bagian envelope `request()` tidak berubah.

## 5. Status verifikasi

**`verified`** — `npm run typecheck` 0 error, `npm run build` sukses, 39 pemeriksaan jsdom
(kode baru) + 8 pemeriksaan kode lama + 21 pemeriksaan E2E ke server nyata + 1 uji tipe
negatif lulus; tanpa dependency baru, tanpa `console.log`, `web/package.json` tidak berubah.
