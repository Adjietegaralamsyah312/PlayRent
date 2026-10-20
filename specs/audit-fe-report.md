# Audit Frontend PlayRent — RV-FE-001

**Mode:** Audit saja (READ-ONLY pada `web/`). Tidak ada file implementasi yang diubah.
**Tanggal:** 20 Oktober 2026
**Objek audit:** `web/src/**` (2 entry, 15 lib, 20 komponen, 21 halaman) vs `api-contract.md` (beku) vs `server/src/**` yang dijalankan hidup.
**Baseline:** `cd server && npm test` → 72/72 PASS; `cd web && npm run typecheck` → 0 error. `git status --porcelain` → kosong (tidak ada file repo yang saya sentuh).

> **`AUDIT_HASIL.md` (klaim "semua bersih") dan `specs/design-qa-report.md` (73 KB) tidak menangkap apa pun di bawah ini.** Design-QA fokus pada visual/a11y statis; audit ini fokus pada **bug fungsional/runtime**: uang yang ditagih ≠ uang yang ditampilkan, response basi yang menimpa response baru, dan layar yang benar-benar crash.
> **Ada overlap dengan `specs/audit-be-report.md` (RV-BE-001).** Akar masalah `BE-002/003/004` ikut teriak di sisi FE; temuan FE-004, FE-006, FE-007, FE-009, FE-011 adalah **manifestasi FE** dari akar yang sama dan **tetap butuh perbaikan sisi FE** — kalau hanya server yang diperbaiki, FE tetap salah baca field.

---

## 1. Ringkasan Temuan

| Severity | Jumlah | ID |
|---|---|---|
| Blocker | 3 | FE-001 … FE-003 |
| Critical | 2 | FE-004, FE-005 |
| Major | 7 | FE-006 … FE-012 |
| Minor | 10 | FE-013 … FE-022 |
| **Total** | **22** | |

**Mismatch Frontend↔Backend:** 14 (M1–M14) + 3 jebakan kontrak (K1–K3).
**Perbedaan Harga Client vs Server:** 2 penyebab (P1, P2), terbukti selisih hingga **Rp 20.000** per sesi.

---

## 2. Tabel Temuan

### FE-001 — Halaman "Sesi" crash: `list.data?.meta.total` melempar TypeError

| | |
|---|---|
| **Severity** | **Blocker** |
| **Lokasi** | `web/src/lib/api.ts:80` (akar: `request()` membuang `meta`), `web/src/pages/Sessions.tsx:97` (titik crash), `web/src/pages/Transactions.tsx:69,210` (gejala sama, tidak crash) |

**Ringkasan.** `api.ts` hanya mengembalikan `json.data`, padahal kontrak beku (`ARCHITECTURE.md:45-50`) menetapkan envelope `{ success, data, meta }` dengan `meta` **di level envelope** — sementara tipe FE `Paginated<T> = {items, meta}` (`lib/types.ts:242`)achus menganggap `meta` ada **di dalam `data`**. Di `Sessions.tsx:97` ekspresi `list.data?.meta.total` memakai optional chaining hanya pada `list.data`; karena `list.data` non-null tapi `list.data.meta` `undefined`, `.total` di atas `undefined` → **TypeError**.

**Dampak nyata.**
1. Halaman **Sesi** (`/sesi`) — layar utama operator — **blank/putus** begitu data sesi selesai dimuat. Tidak ada error boundary di `App.tsx`, jadi error ini merambat ke root React dan **memotong seluruh aplikasi**.
2. Halaman **Transaksi** (`/transaksi`) tidak crash, tapi `meta` selalu `undefined` → blok paginasi `{meta && meta.total > 0 && …}` tidak pernah tampil → **operator hanya melihat 20 transaksi pertama** dari rentang 7 hari, tanpa ada tombol untuk ke halaman berikutnya (lihat FE-008).

**Bukti reproduksi** (server hidup, `GET /api/sessions?page=1&limit=2`):
```
envelope top-level keys : [ 'success', 'data', 'meta' ]
envelope.meta            : {"page":1,"limit":2,"total":46,"totalPages":23}
data keys                : [ 'items' ]
data.meta                : undefined  <-- FE membaca data.meta.total
FE expression THROWS     : TypeError: Cannot read properties of undefined (reading 'total')
```

**Usulan Fix.**
- `lib/api.ts`: ubah `request()` agar meta ikut dikembalikan — misalnya `request<T>()` mengembalikan `json.data` seperti sekarang, tapi tambahkan varian `requestWithMeta` yang mengembalikan `{ ...json.data, meta: json.meta }`; atau ubah `Envelope` handling agar `meta` di-merge ke `data` saat `json.data` berupa objek.
- `lib/types.ts`: `Paginated<T>` tetap `{items, meta}` — konsisten setelah di-merge.
- `Sessions.tsx:97` dan `Transactions.tsx:69` tidak perlu diubah kalau merge dilakukan di lapisan api (tapi `Sessions.tsx:97` sebaiknya ditulis `list.data?.meta?.total ?? rows.length` sebagai jaring pengaman).
- **Catatan:** `web/scripts/check-table-card.ts` sudah jadi pola "cek bentuk data tanpa browser" — tambahkan `check-api-envelope.ts` yang memanggil api layer nyata (atau fixture JSON) dan memastikan `data.meta` selalu terisi untuk endpoint berpaginasi.

---

### FE-002 — "Tambah konsol" selalu gagal: payload create mengirim `isActive` yang ditolak server

| | |
|---|---|
| **Severity** | **Blocker** |
| **Lokasi** | `web/src/pages/Units.tsx:111-123` (payload), `web/src/lib/api.ts:129` (tipe `Partial<ConsoleUnit>`), `server/src/routes/consoles.js:11-19` (`createSchema` `.strict()`), kontrak `api-contract.md` §C3 |

**Ringkasan.** `saveDraft()` membangun satu payload untuk create dan update, dan payload itu **selalu** berisi `isActive`. `POST /consoles` di server memakai `createSchema` `.strict()` yang **tidak punya** `isActive` (hanya `PATCH /consoles/:id` yang menerimanya) → 400 `VALIDATION_ERROR`.

**Dampak nyata.** Tombol **"Tambah konsol"** di `/unit` **selalu gagal** dengan toast "Unrecognized key(s) in object: 'isActive'". Operator tidak bisa mendaftarkan unit baru sama sekali — fitur inti aplikasi mati total. Tipe FE `consoles.create(body: Partial<ConsoleUnit>)` yang mengizinkan `isActive` justruletcher yang stumbling.

**Bukti reproduksi:**
```
payload : {"code":"AUDIT-01","consoleType":"PS4","roomType":"Reguler","controllers":2,
           "hourlyRate":25000,"status":"available","conditionNote":null,"isActive":true}
response: {"success":false,"error":{"code":"VALIDATION_ERROR",
           "message":"Unrecognized key(s) in object: 'isActive'"}}

# tanpa isActive -> 201 Created, console tersimpan
response: {"success":true,"data":{"console":{"id":11,"code":"AUDIT-02",...}}}
```

**Usulan Fix.**
- `Units.tsx:111-120`: pisahkan payload create vs update — `isActive` **hanya** ikut pada `consoles.update`, dan create tidak mengirimnya (server selalu `is_active = 1`).
- `lib/api.ts:129`: ubah `consoles.create` menjadi tipe body eksplisit (tanpa `isActive`) supaya compiler menangkap regresi ini di masa depan.

---

### FE-003 — Semua input di dalam modal kehilangan fokus setelah 1 karakter

| | |
|---|---|
| **Severity** | **Blocker** |
| **Lokasi** | `web/src/components/Modal.tsx:39-61` (effect `Overlay`), dipakai inline di `Bookings.tsx:345`, `BookingSaya.tsx:229`, `Units.tsx:247`, `Users.tsx:208,259`, `Settings.tsx:333`, `session-dialogs.tsx` (via `Sessions.tsx:230,236`, `Dashboard.tsx:309,315`, `SessionDetail.tsx:256,263`) |

**Ringkasan.** `Overlay` memasang `useEffect` dengan dependensi `[open, dismissible, onOpenChange, initialFocusRef]`. Semua halaman meneruskan `onOpenChange` sebagai **arrow inline** (`(v) => !v && setDraft(null)`), jadi identitasnya **baru setiap render**. Akibatnya effect berjalan ulang pada **setiap keystroke**: cleanup mengembalikan fokus ke elemen sebelumnya, lalu effect baru memanggil `panel.querySelector(FOCUSABLE)` → **elemen focusable pertama di panel = tombol "Tutup" (X) di header** → fokus direbut dari field yang sedang diketik.

**Dampak nyata.** Di setiap modal aplikasi (Ubah booking, Buat booking, Tambah/ Ubah konsol, Tambah game, Tambah pengguna, Perpanjang sesi, Selesaikan & bayar, Ubah sandi):
- Operator mengetik **satu karakter** → fokus lompat ke tombol **"Tutup"**.
- Ketikan berikutnya mendarat di tombol "Tutup"; menekan **Enter** pada tombol itu **menutup modal** (bukan submit).
- Jadi form modal praktis tidak bisa diisi: satu karakter per klik-kembali.

**Bukti reproduksi** (jsdom + React 19, merender `web/src/components/Modal.tsx` **asli** dengan `onOpenChange` inline seperti semua halaman):
```
modal open              : true
first focusable in panel: Tutup
activeElement after open : Tutup

activeElement after click in field: INPUT
value typed into field   : "Budi"
activeElement AFTER 1 keystroke: BUTTON | aria-label = Tutup

>>> BUG CONFIRMED: focus jumped from the text field to the "Tutup" button.
```

**Usulan Fix.**
- `Modal.tsx`: jangan dependinkan effect pada identitas `onOpenChange`. Simpan callback di `useRef` (`const cbRef = useRef(onOpenChange); cbRef.current = onOpenChange;`) danCALL `cbRef.current(false)` di dalam handler; ubah dependensi effect menjadi `[open, dismissible, initialFocusRef]`.
- Alternatif kecil: bungkus focus-steal dengan flag "hanya saat modal baru dibuka" — mis. guarda `const openedRef = useRef(false)` dan jalankan `target.focus()` hanya saat `open` berubah `false→true`.
- **Tambahan:** di `Modal`, `initialFocusRef` (kalau dipakai) dan `querySelector(FOCUSABLE)` sebaiknya **tidak** menunjuk tombol "Tutup" sebagai target pertama — beri `autoFocus`/tabindex yang lebih masuk akal pada field pertama.

---

### FE-004 — Dialog "Selesaikan & bayar" menampilkan total yang BUKAN yang ditagih (selisih terbukti Rp 9.500)

| | |
|---|---|
| **Severity** | **Critical** |
| **Lokasi** | `web/src/components/session-dialogs.tsx:240-256` (perhitungan overtime & total), `web/src/components/session-dialogs.tsx:250-256` (`subtotal + overtimeAmount + charge − discount`), pemanggil di `Sessions.tsx:236`, `Dashboard.tsx:315`, `SessionDetail.tsx:263`, `Units.tsx:298` |

**Ringkasan.** Dialog menghitung total dari `POST /sessions/quote` dengan `extraMinutes = menit lewat waktu`. Tapi server menghitung `planned = durationMinutes + extraMinutes` dan `actualMinutes = planned` (`server/src/routes/sessions.js:98-99`), sehingga `overtimeMinutes = max(0, actual − planned − grace) = 0` **selalu**. Jadi: (a) baris "Kelebihan X menit" **tidak pernah muncul**, dan (b) subtotal dihitung dari durasi yang **diperpanjang** (lalu dibulatkan ke langkah tagih), bukan dari durasi rencana + tarif overtime. Saat `finish`, server memakai `actualMinutes` asli dan tarif overtime → **angka berbeda**.

**Dampak nyata.** Operator melihat "Total Rp 37.500 · Kembalian Rp 0", lalu **`amountPaid` = 37.500** dikirim ke `POST /sessions/:id/finish`. Server menagih **Rp 28.000** dan mencatat `changeDue = Rp 9.500` — padahal operator **tidak mengembalikan kembalian apa pun** (UI bilang "Kembalian: Rp 0"). Struk yang dicetak (dari server) isi nominalnya **tidak sama** dengan uang yang diterima kasir → selisih Rp 9.500 per sesi hilang, dan laporan pendapatan tidak cocok dengan kas fisik.

**Bukti reproduksi** (server hidup; sesi 60 menit, tarif 25.000/jam, 15 menit lewat waktu):
```
CLIENT preview (quote 60 + extraMinutes 20):
  {"durationMinutes":80,"billableMinutes":90,"hourlyRate":25000,
   "subtotal":37500,"overtimeMinutes":0,"overtimeAmount":0,"total":37500}
  overtimeAmount yang dilihat operator : 0   <-- selalu 0

SERVER finish (amountPaid = 37500):
  transaction.total     : 28000
  transaction.changeDue : 9500   <-- UI sudah bilang "Kembalian: Rp 0"
  transaction_items      : [ {label:"Sewa AUDIT-02 60 menit", amount:25000},
                             {label:"Overtime 15 menit",      amount:3000} ]

>>> CASH MISMATCH: operator mengcollected 37500, struk bilang 28000 => 9500 rupiah tidak teraccounting
```
Tabel lengkap (planned 60, tarif 10.000, grace 0, pembulatan 15):
| menit lewat | preview FE | tagihan server | selisih |
|---|---|---|---|
| 1 | 12.500 | 10.167 | **2.333** |
| 5 | 12.500 | 10.834 | 1.666 |
| 14 | 12.500 | 12.334 | 166 |
| 15 | 12.500 | 12.500 | 0 |
| 16 | 15.000 | 12.667 | **2.333** |
| 20 | 15.000 | 13.334 | 1.666 |
| 100 | 27.500 | 26.667 | 833 |

**Catatan:** akar server-nya sudah dilaporkan sebagai **BE-002** di `specs/audit-be-report.md` (`quote` tidak bisa mengembalikan overtime). dependable Fix **harus di kedua sisi**: tanpa perbaikan server, FE tidak bisa menampilkan total overtime yang benar.

**Usulan Fix.**
- **FE (wajib, apa pun yang terjadi di server):** `FinishDialog` **tidak boleh** menghitung total dari `estimate.overtimeAmount`. 총 total harus datang dari server: tambah endpoint pratinjau yang menghitung `actualMinutes` (mis. `POST /sessions/:id/quote` yang tahu `started_at` + `ends_at` + `rate_snapshot` + grace), atau — minimal — tampilkan baris "Total akhir dihitung server saat sesi ditutup" dan **jangan** memakai `total` FE sebagai `amountPaid` default.
-427 FE: `amountPaid` untuk tunai sebaiknya diisi dari nilai yang dikembalikan server setelah finish (atau operator mengetik manual), bukan dari `total` pratinjau.
- Bila server tidak bisa diubah sekarang: hitung overtime **di FE** dengan rumus yang sama seperti server (`overtimeMinutes = max(0, ceil((now − endsAt)/60000) − grace)`, `overtimeAmount = ceil(overtimeMinutes × overtimeRatePerHour / 60)`, subtotal dari `plannedMinutes` saja) — dan beri `ponytail:`-style catatan bahwa ini hanya cermin server.
- **Server (BE-002):** `quote` harus menerima `actualMinutes` (atau `extraMinutes` sebagai durasi overtime) dan memakai `rules.overtimeRatePerHour` + grace, supaya `quote` dan `finish` memakai rumus yang sama.

---

### FE-005 — `useAsync`: response lama menimpa response baru (race basi)

| | |
|---|---|
| **Severity** | **Critical** |
| **Lokasi** | `web/src/lib/useAsync.ts:37-59` (`alive` ref boolean bersama, `latest.current`), dipakai di hampir semua halaman |

**Ringkasan.** `useAsync` memakai satu flag boolean `alive` untuk semua permintaan yang sedang berjalan. Ketika `deps` berubah, permintaan baru dimulai **tanpa membatalkan** permintaan lama; keduanya memakai flag yang sama, jadi keduanya dianggap "hidup". Yang resolve **terakhir** menang — termasuk kalau yang terakhir adalah **respons lama**.

**Dampak nyata.** Di setiap daftar dengan filter (Sesi, Transaksi, Booking, Game, Users, Laporan), operator mengubah filter cepat (mis. mengetik di kotak "Cari" — `useDebounced` 300 ms) → respons yang **lama** (untuk filter sebelumnya) tiba belakangan → **data filter lama tampil kembali** dan menggantikan data yang benar. Operator bisa melihat sesi/transaksi yang bukan miliknya filter, atau meng Think dia sedang melihat hari yang berbeda. Risiko operasional nyata:afiOperator mengambil keputusan (mis. "cek-in" atau "batalkan") berdasarkan data yang salah filter.

**Bukti reproduksi** (jsdom + React 19, memakai `web/src/lib/useAsync.ts` **asli**; respons baru tiba lebih dulu, respons lama tiba belakangan):
```
after mount (filter=1)   : { data: null, loading: true, filter: 1 }
after filter=2 (req2 out): { data: null, loading: true, filter: 2 }
after NEW response       : { label: 'NEW (filter=2)' }
after LATE OLD response  : { label: 'OLD (filter=1)' }

>>> BUG CONFIRMED: the stale response (filter=1) overwrote the fresh one (filter=2).
```

**Usulan Fix.**
- `useAsync.ts`: ganti flag boolean dengan **token per permintaan** — `const seq = useRef(0)`, di dalam `reload` Ambil `const my = ++seq.current`, dan hanya tulis state kalau `my === seq.current` (pola "latest request wins"). Ini menutup race tanpa perlu `AbortController`.
- Tambahkan `AbortController` per permintaan + `signal` ke `api.request()` sebagai pengaman kedua (membatalkan request lama benar-benar berhenti di jaringan).
- `usePolling` (yang memanggil `fn` tanpa menunggu) perlu **`enabled` + guard yang sama** agar hasil polling yang telat tidak menimpa hasil manual reload.

---

### FE-006 — Tabel "Rincian item" di detail transaksi: kolom kosong, "undefined", dan "Rp 0"

| | |
|---|---|
| **Severity** | **Major** |
| **Lokasi** | `web/src/lib/types.ts:117-123` (tipe `TransactionItem`), `web/src/pages/TransactionDetail.tsx:78-83` (kolom), `web/src/lib/api.ts:175` |

**Ringkasan.** FE menganggap `transaction_items` = `{id, description, qty, unitPrice, lineTotal}`. Server mengirim `{id, kind, label, quantity, unitPrice, amount}` (`server/src/routes/transactions.js:16-19`, dipakai juga oleh renderer struk HTML di baris 34-38). Tiga dari empat nama field tidak cocok.

**Dampak nyata.** Di `/transaksi/:id`: kolom **"Item"** kosong (nama game/deskripsi tidak pernah tampil), kolom **"Qty"** menampilkan teks literal **"undefined"**, kolom **"Jumlah"** menampilkan **"Rp 0"**. Yang benar hanya "Harga satuan". Detail transaksi dan struk (yang dirender server dengan benar) jadi **dua tampilan berbeda dari data yang sama** — operator tidak bisa memverifikasi rincian tagihan dari layar, hanya dari struk cetak.

**Bukti reproduksi:**
```
server items[0]          : {"id":45,"kind":"rental","label":"Sewa PS-10 120 menit",
                             "quantity":1,"unitPrice":30000,"amount":30000}
FE renders item.description : undefined
FE renders String(item.qty) : "undefined"
FE renders item.unitPrice   : 30000
FE renders item.lineTotal   : undefined   <-- server mengirim item.amount = 30000
```

**Usulan Fix.**
- `lib/types.ts`: ganti `TransactionItem` menjadi `{ id: string; kind: 'rental'|'overtime'|'extra'|'discount'; label: string; quantity: number; unitPrice: number; amount: number }`.
- `TransactionDetail.tsx:78-83`: sesuaikan render — `i.label`, `String(i.quantity)`, `formatIDR(i.amount)`.
- **Root cause di server sudah dilaporkan sebagai BE-004**; kalau tim memutuskan mengganti nama field di server (agar sama dengan FE), bentuk baris `transaction_items` di `server/src/schema.sql` dan renderer struk ikut berubah — **pilih satu arah, jangan dua-duanya**.

---

### FE-007 — Tab "Pembayaran" di Laporan: dua kartu "Rp 0" dan tiga kolom kosong

| | |
|---|---|
| **Severity** | **Major** |
| **Lokasi** | `web/src/lib/api.ts:211` (tipe), `web/src/pages/Reports.tsx:199-213` (kartu), `web/src/pages/Reports.tsx:77-83` (kolom tabel) |

**Ringkasan.** `GET /reports/payments` mengembalikan `totals: {count, recorded, outstanding, voided, subtotal, byMethod}` dan `items[]` berbentuk `{id, at, number, customerName, consoleCode, method, status, total}`. FE membaca `totals.gross` / `totals.paid` (tidak ada) dan `item.createdAt` / `item.paymentMethod` / `item.paymentStatus` (tidak ada).

**Dampak nyata.** Di `/laporan` → tab **Pembayaran**:
- Kartu "Total tagihan" → **Rp 0**; kartu "Pendapatan tercatat" → **Rp 0** (padahal `recorded` = Rp 602.000 pada data uji).
- Tabel: kolom **Waktu** kosong (tidak pernah ada tanggal), kolom **Metode** kosong, badge **Pembayaran** tanpa label.
- Yang benar hanya kolom Nomor, Pelanggan, dan Total.
→ Operator melihat "Rp 0" untuk hari yang矗帽 ramai —看上去 layar salah, bukan data salah.

**Bukti reproduksi:**
```
data.totals keys : [ 'count','recorded','outstanding','voided','subtotal','byMethod' ]
FE reads totals.gross : undefined   <-- expected a number
FE reads totals.paid  : undefined   <-- expected a number
server totals.recorded: 602000
items[0] keys     : [ 'id','at','number','customerName','consoleCode','method','status','total' ]
FE reads item.createdAt    : undefined  <-- server mengirim item.at
FE reads item.paymentMethod: undefined  <-- server mengirim item.method
FE reads item.paymentStatus: undefined  <-- server mengirim item.status
```

**Usulan Fix.**
- `lib/api.ts:211`: ganti tipe dengan bentuk server yang sebenarnya (`totals: {count, recorded, outstanding, voided, subtotal, byMethod}` dan tipe item `{id, at, number, customerName, consoleCode, method, status, total}`).
- `Reports.tsx:204,208` → pakai `totals.recorded` (dan tambahkan kartu `voided`/`byMethod` bila berguna); `Reports.tsx:77-83` → `t.at`, `t.method`, `t.status`.
- Root cause server sudah dilaporkan sebagai **BE-003**; sama seperti FE-006, FE tetap harus adapting ke bentuk yang benar-benar dikirim server.

---

### FE-008 — Paginasi Transaksi tidak pernah tampil: hanya 20 transaksi pertama yang terlihat

| | |
|---|---|
| **Severity** | **Major** |
| **Lokasi** | `web/src/pages/Transactions.tsx:69` (`const meta = list.data?.meta`), `web/src/pages/Transactions.tsx:210-214` (blok paginasi), akar: `web/src/lib/api.ts:80` |

**Ringkasan.** `meta` envelope dibuang oleh `api.request()` (akar sama dengan FE-001), sehingga `meta` selalu `undefined` → kondisi render `{meta && meta.total > 0 && …}` tidak pernah benar → **komponen `Pagination` tidak pernah dirender**.

**Dampak nyata.** Rentang default `/transaksi` adalah 7 hari (`Transactions.tsx:39`). Dengan 45 transaksi pada data uji (limit default server 20/halaman), operator hanya melihat **20 transaksi pertama** dan **tidak punya cara** membuka halaman 2 — tidak ada tombol, tidak ada angka halaman, tidak ada indikator "halaman 1 dari 3". Transaksi yang tidak terlihat hilang tanpa jejak: kasir bisa thinksutuk "hari ini tidak ada transaksi" padahal ada.

**Bukti reproduksi:**
```
GET /api/transactions?page=1&limit=2
envelope.meta : {"page":1,"limit":2,"total":45,"totalPages":23}
data.meta     : undefined   <-- FE membaca list.data?.meta
=> {meta && meta.total > 0 && <Pagination/>}  ->  false  ->  paginasi tidak ada
```

**Usulan Fix.** Sama dengan FE-001: perbaiki pembuangan `meta` di lapisan api (`web/src/lib/api.ts:80`). Setelah itu `Transactions.tsx:210` langsung hidup tanpa perubahan lain. Tambahkan juga `Pagination` dengan `mode` "load-more" sebagai alternatif untuk layar HP.

---

### FE-009 — Ekspor CSV di Laporan mengunduh data yang salah untuk 3 dari 5 tab

| | |
|---|---|
| **Severity** | **Major** |
| **Lokasi** | `web/src/pages/Reports.tsx:86` (`reports.exportCsvUrl({ type: tab, ... })`), `web/src/lib/api.ts:212`, `server/src/routes/reports.js:149` |

**Ringkasan.** `exportCsvUrl` mengirim `type` = nilai tab aktif (`daily|weekly|monthly|units|payments`). Server hanya menerima `sessions|transactions|units|daily`; nilai lain **di-fallback diam-diam** ke `transactions`.

**Dampak nyata.** Di `/laporan` → tab **Mingguan**: tombol "Ekspor CSV" mengunduh CSV **transaksi**, bukan rekap mingguan. Tab **Bulanan** dan **Pembayaran** sama. File yang diunduh terlihat "benar" (ada header, ada isi) sehingga operator believesinyalah itu laporan mingguan — lalu mengimpornya ke spreadsheet untuk decisions. Root cause server sudah dilaporkan sebagai **BE-008**; sisi FE-nya: jangan pernah mengirim `type` yang tidak didukung, dan/atau tampilkan nama file apa yang sebenarnya diunduh.

**Bukti reproduksi:**
```
server: const type = ['sessions','transactions','units','daily'].includes(req.query.type)
              ? req.query.type : 'transactions'
FE   : type = tab  ->  'weekly' | 'monthly' | 'payments'  ->  dipetakan ke 'transactions'
```

**Usulan Fix.**
- `Reports.tsx:86`: petakan tab → type CSV yang valid (`daily→daily`, `units→units`, `payments→transactions`) dan untuk `weekly`/`monthly` yang tidak didukung: nonaktifkan tombol "Ekspor CSV" dengan tooltip "Ekspor mingguan/bulanan belum tersedia", atau request CSV `daily` dengan label yang benar.
- `api.ts:212`: ubah parameter `type` dari `string` menjadi union `'sessions'|'transactions'|'units'|'daily'` supaya compiler menolak nilai tab yang salah.

---

### FE-010 — Preview harga memakai tarif konsol TERKINI, server menagih tarif `rateSnapshot` (selisih terbukti Rp 20.000)

| | |
|---|---|
| **Severity** | **Major** |
| **Lokasi** | `web/src/components/session-dialogs.tsx:60` & `:79-80` (quote tanpa tarif sesi), `web/src/components/session-dialogs.tsx:244` (FinishDialog), `server/src/routes/sessions.js:99` (quote pakai `c.hourly_rate`), `server/src/routes/sessions.js:237` (finish pakai `s.rate_snapshot`) |

**Ringkasan.** `POST /sessions/quote` mengambil tarif dari **baris konsol saat ini**; `POST /sessions/:id/finish` menagih `s.rate_snapshot` (tarif saat sesi mulai). Kontrak menyatakan tegas: "rateSnapshot is the hourlyRate **at the moment the session started** — later setting changes must never rewrite it" (`api-contract.md` §S). Preview dan tagihan memakai dua sumber tarif yang berbeda.

**Dampak nyata.** Kalau operator mengubah tarif unit (aksi normal di `/unit`) **selama** sesi berjalan, preview di dialog "Selesaikan & bayar" (dan "Tambahan biaya" di dialog Perpanjang) menunjukkan tarif baru, sedangkan server menagih tarif lama. Pada data uji: tarif naik 25.000 → 45.000, preview **Rp 45.000**, tagihan server **Rp 25.000**, `changeDue` **Rp 20.000** — dan operator sudah_div told "Kembalian: Rp 0".

**Bukti reproduksi:**
```
unit AUDIT-02 current hourlyRate = 25000
session rateSnapshot              = 25000
console rate now                  = 45000     (operator menaikkan tarif)
PREVIEW (quote) total             = 45000     (memakai tarif konsol SEKARANG)
SERVER  charged total             = 25000     (memakai rateSnapshot)
cash gap                          = 20000
server changeDue                  = 20000     <-- UI sudah bilang "Kembalian: Rp 0"
```

**Usulan Fix.**
- `FinishDialog`/`ExtendDialog` harus memakai tarif sesi, bukan tarif konsol. Karena `sessions.get(id)` sudah mengembalikan `rateSnapshot` (FE type `RentalSession.rateSnapshot` sudah ada), hitung preview **di FE** dari `rateSnapshot` (atau minta endpoint quote yang menerima `hourlyRate`/`sessionId`).
- Bila server tidak bisa diubah: kirim `sessions.quote` hanya untuk `billableMinutes`/`overtime` dan **ganti** `hourlyRate`-nya dengan `session.rateSnapshot` saat menghitung subtotal FE.

---

### FE-011 — Daftar Booking dipotong diam-diam pada 50 baris, tanpa paginasi

| | |
|---|---|
| **Severity** | **Major** |
| **Lokasi** | `web/src/pages/Bookings.tsx:66` (`bookings.list({ date })` tanpa `page`/`limit`), `web/src/pages/BookingSaya.tsx:42` (`bookings.list()`), `web/src/pages/Beranda.tsx:22` (`bookings.list()`), `server/src/routes/bookings.js:91` (limit default 50) |

**Ringkasan.** Endpoint `GET /bookings` menerima `page`/`limit` (default 50) dan mengembalikan `meta.total`. FE tidak pernah mengirim keduanya dan tidak pernah membaca `meta`, dan tidak ada UI paginasi di halaman mana pun yang memakainya.

**Dampak nyata.** Pada hari yang ramai (>50 booking) — mis. acara, akhir pekan — **booking ke-51 dan seterusnya tidak pernah tampil** di `/booking` maupun `/booking-saya`. Operator thinks slot itu kosong dan bisa membuat booking bentrok; pelanggan thinks booking-nya hilang. "Total N booking pada tanggal ini" (`Bookings.tsx:337`) ikut menghitung hanya baris yang terpotong, jadi angkanya **tidak knows** bahwa ada yang hilang.

**Bukti reproduksi:**
```
GET /api/bookings        -> envelope.meta {"page":1,"limit":50,"total":2,"totalPages":1}
GET /api/bookings (UMUM) -> server: const limit = Math.min(100, Math.max(1, parseInt(req.query.limit,10) || 50))
                             FE tidak pernah mengirim limit -> selalu 50
```

**Usulan Fix.**
- `Bookings.tsx`: kirim `page`/`limit` dan render `<Pagination>` memakai `meta` (setelah FE-001 diperbaiki); atau, untuk layar jadwal yang berbasis hari, minta server mengembalikan `meta.total` dan tampilkan peringatan "menampilkan 50 dari N" plus tombol "Muat lebih banyak".
- `BookingSaya.tsx`/`Beranda.tsx`: minimal beri tahu kalau `meta.total > items.length`.

---

### FE-012 — Sesi hidup menampilkan durasi "0m / 60m" (kolom `billedMinutes` = null)

| | |
|---|---|
| **Severity** | **Major** |
| **Lokasi** | `web/src/pages/Sessions.tsx:135` (`formatDurationShort(s.billedMinutes) / formatDurationShort(s.plannedMinutes)`), `web/src/lib/types.ts:72` (`billedMinutes: number`), `server/src/lib/mappers.js:52` (null untuk sesi hidup) |

**Ringkasan.** `billed_minutes` di DB bernilai `NULL` sampai sesi ditutup (server mengisinya saat `finish`). FEendem把它 sebagai `number` dan merender langsung.

**Dampak nyata.** Di `/sesi` setiap sesi yang sedang berjalan tampil di kolom Durasi sebagai **"0m / 60m"** — terlihat seperti durasi tagih nol, bukan "belum dihitung". Operator yang terburu-buru bisa salah baca dan mengira sesi tidak tertagih. Tipe `billedMinutes: number` juga memaksa FE untuk tidak memeriksa `null`.

**Bukti reproduksi:**
```
GET /api/sessions -> {"id":46,...,"status":"active","plannedMinutes":120,"billedMinutes":null,...}
FE: formatDurationShort(null) -> "0m"  ->  "0m / 2j"
```

**Usulan Fix.**
- `lib/types.ts`: `billedMinutes: number | null`.
- `Sessions.tsx:135` (dan wherever else `billedMinutes` dirender): tampilkan `"— / 2j"` atau `"2j (rencana)"` saat `billedMinutes == null`; tampilkan `"0m / 60m"` **hanya** bila session sudah `finished` dan benar-benar 0.

---

### FE-013 — `Switch` (tombol role="switch") tidak punya accessible name

| | |
|---|---|
| **Severity** | **Minor** |
| **Lokasi** | `web/src/components/Form.tsx:238-250` (`<label htmlFor={fieldId}>` → `<button id={fieldId} role="switch">`), dipakai di `Units.tsx:272`, `Settings.tsx:353`, `Users.tsx:252`, `Games.tsx:149`, `Games.tsx:235` |

**Ringkasan.** `<label for>` **tidak** menamai elemen non-form-control; komponen `<label>` hanya bisa menamai `button`, `input`, `select`, `textarea`, `meter`, `output`, `progress`. Tombol switch berisi `<span>` tanpa teks → **accessible name kosong**; pembaca layar hanya membacakan "switch".

**Dampak.** Tombol "Konsol aktif", "Paket aktif", "Akun aktif", "Hanya pengguna aktif", "Tampilkan game nonaktif" — semua tanpa nama yang bisa dibacakan/diakses.

**Usulan Fix.** `Form.tsx`: ganti `<label htmlFor>` dengan `<span id={descId}>` + `aria-labelledby={descId}` pada tombolnya (atau `aria-label={label}`), dan beri `aria-describedby` ke deskripsi.

---

### FE-014 — `aria-describedby` menunjuk elemen yang tidak dirender (referensi menggantung)

| | |
|---|---|
| **Severity** | **Minor** |
| **Lokasi** | `web/src/components/Form.tsx:66` (`describedBy` selalu menyertakan `helpId` bila `helpText` ada), `web/src/components/Form.tsx:40` (`helpText` hanya dirender bila `!error`) — sama di `Form.tsx:115` untuk `Textarea` |

**Ringkasan.** `describedBy = [error ? errorId : null, helpText ? helpId : null]` — jadi ketika field punya **helpText dan error sekaligus**, `aria-describedby` menunjuk `#…-help` yang **tidak ada di DOM** (karena `FieldShell` menyembunyikan helpText saat error aktif).

**Dampak.** Pembaca layar mengabaikan id yang tidak ada; beberapa screen reader diam-diam-read "aria-describedby target not found" (error log browser). Bukan crash, tapi deskripsi bantuan hilang tepat di momen field salah.

**Usulan Fix.** `Form.tsx`: hitung `describedBy` **setelah** menentukan apakah helpText dirender (`error ? errorId : helpText ? helpId : null`), atau selalu render elemen help dengan `hidden` alih-alih unmount.

---

### FE-015 — `aria-sort` diletakkan pada `<button>` di dalam `<th>`, bukan pada `<th>`

| | |
|---|---|
| **Severity** | **Minor** |
| **Lokasi** | `web/src/components/DataTable.tsx:108` |

**Ringkasan.** `aria-sort` adalah properti yang valid pada elemen berperan `columnheader` (`<th>`), bukan pada `button`.

**Dampak.** Urutan kolom yang diumumkan pembaca layar tidak terbaca benar. (Kolom yang sortable pun saat ini belum ada pemakai di halaman mana pun — jadi dampaknya nol sampai sorting diaktifkan.)

**Usulan Fix.** Pindahkan `aria-sort` ke `<th>`; tombol di dalamnya cukup `aria-label` seperti "Urutkan berdasarkan X".

---

### FE-016 — Grafik garis: titik hover dan tooltip tidak sejajar dengan titik data

| | |
|---|---|
| **Severity** | **Minor** |
| **Lokasi** | `web/src/components/Chart.tsx:72` (`atX` = `i/(n-1)*w`), `Chart.tsx:145` (dot memakai `atX`), `Chart.tsx:154` (tooltip memakai `(hover+0.5)/n`) |

**Ringkasan.** Sumbu-x garis memakai `i/(n-1)` (titik pertama di x=0, terakhir di x=w), sedangkan target klik/baris memakai lebar sel `w/n` (tombol ke-i di tengah `[(i+0.5)/n]`). Untuk `type="line"` (dipakai di "Jam tersibuk" di Dashboard) **titik data tidak berada di atas tombolnya** — ujung pertama di tepi kiri, ujung terakhir di tepi kanan.

**Dampak.** Tooltip muncul sedikit di samping titik yang disorot; di 24 titik (grafik jam tersibuk) selisihnya sampai ~2% lebar grafik. Kosmetik, tapi terasa "salah pas".

**Usulan Fix.** Samakan `atX` dengan pusat sel: `((i + 0.5) / n) * box.w` untuk line, atau pakai `n-1` untuk kedua-duanya (ganti `n` dengan `n-1` di perhitungan tooltip).

---

### FE-017 — Ambang "kritis" pada timer jatuh ke default 5 menit, bukan ke konfigurasi operator

| | |
|---|---|
| **Severity** | **Minor** |
| **Lokasi** | `web/src/lib/useCountdown.ts:37-44` (`const second = warn[1] ?? 5`) |

**Ringkasan.** `warnMinutes` diurutkan menurun → `[top, second, …]`. `top` = `warn[0] ?? 10`, `second` = `warn[1] ?? 5`. Kalau operator mengonfigurasi ambang hanya `[3]`, maka `top = 3`, `second = 5` (fallback) → **"kritis" menyala pada sisa ≤ 5 menit**, padahal ambang terkonfigurasi 3 menit. Kalau ambang `[15, 3]`, `second = 3` ✓.

**Dampak.** Gelombang "danger" (merah, + suara critical) menyala lebih awal dari yang dikonfigurasi; alarm bunyi pada menit yang tidak diminta. Untuk ambang tunggal `[1]`, "kritis" menyala 5 menit — jauh sebelum ambang 1 menit.

**Usulan Fix.** `useCountdown.ts`: `second` sebaiknya `warn[warn.length - 1] ?? warn[0] ?? 5` (ambang terkecil yang dikonfigurasi), atau fall back ke `top` bila hanya ada satu ambang.

---

### FE-018 — Timeline booking: blok yang tumpang-tindih menumpuk dan saling menutupi

| | |
|---|---|
| **Severity** | **Minor** |
| **Lokasi** | `web/src/components/BookingTimeline.tsx:113-148` (semua booking di lane yang sama dirender pada `left`/`width` yang sama) |

**Ringkasan.** Server hanya menolak konflik untuk status `pending|confirmed`. Booking `cancelled`, `completed`, atau `checked_in` **boleh** berada di slot yang sama, dan FE merender semuanya di lane yang sama pada posisi absolut yang sama.

**Dampak.** Dua blok tepat bertumpuk; yang dirender belakangan menutupi yang sebelumnya → booking yang ditutup **tidak bisa diklik** (operator tidak bisa membuka/membatalkannya). Label jam juga menumpuk.

**Usulan Fix.** `BookingTimeline.tsx`: kelompokkan booking per lane berdasarkan overlap dan beri offset vertikal (sub-lane) — minimal: render blok yang `cancelled`/`completed` dengan opasitas lebih rendah dan letakkan di atas (z-index) blok aktif, atau pecah lane menjadi baris tambahan saat terjadi overlap.

---

### FE-019 — `SettingsProvider` memakai bentuk "admin" untuk pelanggan; tipe berbohong

| | |
|---|---|
| **Severity** | **Minor** |
| **Lokasi** | `web/src/lib/settings-context.tsx:23` (`settingsApi.get()`), `web/src/lib/api.ts:218-220` (tipe `Settings`), `server/src/lib/settings.js:39-54` (`settingsToPublicApi`) |

**Ringkasan.** `SettingsProvider` membungkus **seluruh** aplikasi (termasuk halaman pelanggan) dan memanggil `GET /settings`. Untuk sesi pelanggan, server mengembalikan subset: `rules` **tanpa** `overtimeRatePerHour`/`overtimeGraceMinutes` dan **tanpa** blok `payments` — tapi FE mengetikanya sebagai `Settings` (bentuk admin) yang menyatakan keduanya wajib.

**Dampak.** Di runtime, untuk pelanggan: `settings.rules.overtimeRatePerHour === undefined` dan `settings.payments === undefined`, padahal tipenya `number`/objek. Saat ini tidak ada halaman pelanggan yang membacanya (hanya `warnMinutes`, `minDurationMinutes`, `roundingMinutes`, `defaultHourlyRate` — semuanya ada di subset publik), jadi **belum meledak** — tetapi ini bom waktu: satu pembaca baru `settings.rules.overtimeRatePerHour` di halaman pelanggan akan menghasilkan `NaN`/`undefined` yang lolos `tsc`.

**Bukti reproduksi:**
```
CUSTOMER GET /settings -> data.rules keys: ['minDurationMinutes','roundingMinutes','defaultHourlyRate','warnMinutes']
                       -> data.payments: undefined
FE reads settings.payments?.methods -> undefined
```

**Usulan Fix.** `settings-context.tsx`: ganti `settingsApi.get()` dengan `settingsApi.getPublic()` untuk `SettingsProvider` dan pindahkan pemuatan `Settings` penuh ke halaman `Settings` (admin) saja; atau ubah tipe `Settings` sehingga `rules.overtimeRatePerHour`/`rules.overtimeGraceMinutes` opsional dan `payments` tetap opsional seperti sekarang.

---

### FE-020 — Timer toast tidak dibersihkan, dan polling bisa tumpang-tindih

| | |
|---|---|
| **Severity** | **Minor** |
| **Lokasi** | `web/src/lib/toast.tsx:56` (`window.setTimeout(() => dismiss(id), duration)` tanpa clear), `web/src/lib/usePolling.ts:14` (`run()` tidak menunggu `fn` selesai) |

**Ringkasan.** (a) `setTimeout` toast tidak pernah di-cancel — toast yang ditutup manual tetap punya timer yang hidup sampai kedaluwarsa, dan timer tetap berjalan setelah komponen unmount. (b) `usePolling` memanggil `fn` tanpa menunggu; jika permintaan lebih lama dari interval, beberapa permintaan berjalan bersamaan dan **yang resolve belakangan yang menulis state** (rasa FE-005).

**Dampak.** (a) timer bocor kecil; (b) pada `SessionDetail` (interval 15 s) dan `Dashboard` (30 s) dengan jaringan lambat, respons polling yang telat bisa menimpa respons manual `reload()` → tampilan sesaat salah. Tidak merusak data server.

**Usulan Fix.** `toast.tsx`: simpan handle timer per toast dan bersihkan saat `dismiss`/unmount. `usePolling.ts`: simpan flag "sedang berjalan" sehingga tick berikutnya dilewati kalau permintaan sebelumnya belum selesai, atau teruskan `AbortSignal`.

---

### FE-021 — Panjang maksimum "Catatan ketersediaan" tidak sinkron dengan server (200 vs 60)

| | |
|---|---|
| **Severity** | **Minor** |
| **Lokasi** | `web/src/pages/Games.tsx:230` (`maxLength={200}`), `server/src/routes/games.js:14` (`availabilityNote: z.string().max(60)`) |

**Ringkasan.** Field mengizinkan 200 karakter di UI, server menolak >60 dengan `400 VALIDATION_ERROR`.

**Dampak.** Operator mengetik catatan 61–200 karakter → Simpan gagal dengan pesan validasi server yang tidak menjelaskan batasnya ("Data tidak valid"). Data yang diketik hilang (tidak ada draft recovery).

**Usulan Fix.** `Games.tsx:230`: `maxLength={60}` + `helpText` yang menyebut batasnya (pola yang sama sudah dipakai di halaman lain, mis. `Settings.tsx:206`).

---

### FE-022 — Cetak struk dari halaman struk bisa mencetak halaman kosong

| | |
|---|---|
| **Severity** | **Minor** |
| **Lokasi** | `web/src/pages/Receipt.tsx:36-41` (`win.focus(); win.print()`), `web/src/pages/Receipt.tsx:27-34` (timeout 15 s → state 'error') |

**Ringkasan.** Tombol "Cetak" memanggil `print()` pada `contentWindow` iframe **tanpa menunggu** iframe selesai memuat. Kalau operator menekan "Cetak" dalam <1 detik setelah halaman dibuka, yang tercetak adalah halaman kosong (iframe masih loading). Selain itu, `window.print()` di iframe **tidak** respect `@media print` halaman induk — dokumen yang dicetak adalah HTML server (itu memang yang dikehendaki), tetapi tidak ada fallback jika `contentWindow` belum siap.

**Dampak.** Cukup sering terjadi pada jaringan lambat/LAN: struk keluar kosong. Operator harusReload dan cetak ulang — atau lebih buruk,_PRINT_, sudah keluar dan tidak ada isinya.

**Usulan Fix.** `Receipt.tsx`: disable tombol "Cetak" sampai `frameState === 'loaded'` (state itu sudah ada), atau tunda `print()` sampai event `load` iframe berikutnya.

---

## 3. Mismatch Frontend ↔ Backend

Semua mismatch di bawah **diverifikasi lewat HTTP nyata** ke server yang sedang berjalan (login admin + satu akun pelanggan), bukan lewat pembacaan kode saja.

| # | Endpoint | Yang FE kirim / harap | Yang BE benar-benar lakukan | File:line FE | File:line BE | Dampak |
|---|---|---|---|---|---|---|
| M1 | envelope (semua endpoint berpaginasi) | `data.meta` berisi `{total,page,limit}` | `meta` ada di **level envelope**; `data` hanya berisi `items` | `web/src/lib/api.ts:80` | `server/src/lib/errors.js:56-60` (kontrak `ARCHITECTURE.md:49`) | **FE-001** (crash) + **FE-008** (paginasi mati) |
| M2 | `GET /sessions` | `list.data.meta.total` | `data.meta` = `undefined` | `web/src/pages/Sessions.tsx:97` | `server/src/routes/sessions.js:125-127` | TypeError → layar Sesi blank |
| M3 | `GET /transactions` | `list.data.meta` | `undefined` (meta di envelope) | `web/src/pages/Transactions.tsx:69,210` | `server/src/routes/transactions.js:169-172` | Paginasi tidak pernah tampil |
| M4 | `GET /reports/payments` | `totals.gross`, `totals.paid` | `totals: {count, recorded, outstanding, voided, subtotal, byMethod}` | `web/src/lib/api.ts:211`, `web/src/pages/Reports.tsx:204,208` | `server/src/routes/reports.js:127-145` | 2 kartu "Rp 0" (**FE-007**) |
| M5 | `GET /reports/payments` | `items[].createdAt` / `.paymentMethod` / `.paymentStatus` | `items[].at` / `.method` / `.status` | `web/src/pages/Reports.tsx:79-81` | `server/src/routes/reports.js:140-144` | 3 kolom kosong (**FE-007**) |
| M6 | `GET /transactions/:id` | `items[].description` / `.qty` / `.lineTotal` | `items[].label` / `.quantity` / `.amount` | `web/src/lib/types.ts:117-123`, `web/src/pages/TransactionDetail.tsx:79-82` | `server/src/routes/transactions.js:16-19` | "undefined" & "Rp 0" (**FE-006**) |
| M7 | `POST /consoles` | body berisi `isActive` | `createSchema` `.strict()` **tolak** `isActive` (400) | `web/src/pages/Units.tsx:111-123` | `server/src/routes/consoles.js:11-19` (kontrak §C3) | **FE-002** — Tambah konsol selalu gagal |
| M8 | `POST /sessions/quote` | `extraMinutes` = menit overtime untuk pratinjau | `extraMinutes` = **perpanjangan durasi**; `actualMinutes = planned` → `overtimeAmount` selalu 0 | `web/src/components/session-dialogs.tsx:242-244` | `server/src/routes/sessions.js:92-100`, `server/src/lib/pricing.js:41-44` | **FE-004** (otal ≠ tagihan) |
| M9 | `POST /sessions/quote` | tarif sesi (`rateSnapshot`) | memakai `consoles.hourly_rate` **saat ini** | `web/src/components/session-dialogs.tsx:60,79-80` | `server/src/routes/sessions.js:99` vs `:237` | **FE-010** (selisih Rp 20.000) |
| M10 | `GET /reports/export.csv` | `type` = tab (`daily\|weekly\|monthly\|units\|payments`) | hanya `sessions\|transactions\|units\|daily`; lain → fallback `transactions` | `web/src/pages/Reports.tsx:86` | `server/src/routes/reports.js:149` | **FE-009** (CSV salah isi) |
| M11 | `GET /sessions` | `billedMinutes: number` | `null` untuk sesi hidup | `web/src/lib/types.ts:72`, `web/src/pages/Sessions.tsx:135` | `server/src/lib/mappers.js:52` | **FE-012** ("0m / 60m") |
| M12 | `GET /consoles/:id` (pelanggan) | `{console, currentSession}` | `{console, isBusy}` | `web/src/lib/api.ts:128` | `server/src/routes/consoles.js:51-56` (kontrak §C2) | Tipe berbohong; fungsi ini belum dipakai FE (dead code) |
| M13 | `GET /settings` (pelanggan) | `Settings` (bentuk admin: `rules.overtimeRatePerHour`, `payments`) | subset: `rules` 4 field, `payments` dihapus | `web/src/lib/api.ts:218-220`, `web/src/lib/settings-context.tsx:23` | `server/src/lib/settings.js:39-54` | **FE-019** (tipe lie, belum meledak) |
| M14 | `POST /bookings` (pelanggan) | `discount` opsional di tipe FE | field `discount` **dilegah** untuk pelanggan → 400 | `web/src/lib/api.ts:159` | `server/src/routes/bookings.js:128-132` (kontrak §B3) | Jebakan kontrak: tipe FE mengizinkan `discount` untuk pelanggan. Saat ini FE tidak mengirimnya (`BookingSaya.tsx:98-105` ✓, `BookingNew.tsx:55` hanya untuk admin ✓) — **aman, tapi rapuh** |

**Jebakan kontrak tambahan (K):**

| # | Klausul | Kenapa rapuh |
|---|---|---|
| K1 | Kontrak §S1 `quote` menerima `extraMinutes?` | Artinya tidak didokumentasikan (perpanjangan durasi atau overtime?). FE|USER mengira itu overtime → FE-004. Perlu diperjelas di `api-contract.md`. |
| K2 | Kontrak §S "the frontend computes which threshold has been crossed" | FE menghitung ambang dari `warnMinutes`, tapi **kritikal** memakai fallback `5` yang tidak ada di konfigurasi (FE-017). |
| K3 | Kontrak §T2 `{transaction, items, session, cashier, console}` | Tidak menyebut nama field item → FE menebak `description/qty/lineTotal` dan tidak cocok (FE-006). Kontrak perlu menyebut `label/quantity/amount`. |

---

## 4. Perbedaan Harga Client vs Server

Ada **dua** penyebab, keduanya pada dialog pembayaran operator.

### P1 — Overtime dihitung dengan rumus yang berbeda (FE-004)

| | FE (FinishDialog) | Server (`finish`) |
|---|---|---|
| Durasi dasar | `durationMinutes = plannedMinutes` **+ `extraMinutes` (menit lewat)** | `durationMinutes = planned_minutes` (tetap) |
| Tagih sewa | `roundUp(planned + overtime) × tarif / 60` | `roundUp(planned) × tarif / 60` |
| Kelebihan | `overtimeAmount` dari quote → **selalu 0** | `ceil(overtimeMinutes × overtimeRatePerHour / 60)` |

**Angka konkret** (planned 60, tarif 10.000/jam, grace 0, pembulatan 15):

| menit lewat | preview FE | tagihan server | selisih uang |
|---|---|---|---|
| 1 | Rp 12.500 | Rp 10.167 | **Rp 2.333** |
| 5 | Rp 12.500 | Rp 10.834 | Rp 1.666 |
| 14 | Rp 12.500 | Rp 12.334 | Rp 166 |
| 15 | Rp 12.500 | Rp 12.500 | Rp 0 |
| 16 | Rp 15.000 | Rp 12.667 | **Rp 2.333** |
| 20 | Rp 15.000 | Rp 13.334 | Rp 1.666 |
| 100 | Rp 27.500 | Rp 26.667 | Rp 833 |

**Uji end-to-end di server hidup** (unit tarif 25.000, sesi 60 menit, 15 menit lewat):
```
preview FE        : Rp 37.500   (overtimeAmount 0, "Kembalian: Rp 0")
tagihan server    : Rp 28.000   (rental 25.000 + overtime 3.000)
changeDue server  : Rp 9.500    (UI sudah bilang "Kembalian: Rp 0")
=> Rp 9.500 diterima kasir tapi tidak tercatat sebagai kembalian
```

### P2 — Tarif yang dipakai preview ≠ tarif yang ditagih (FE-010)

| | FE (quote) | Server (`finish`) |
|---|---|---|
| Sumber tarif | `consoles.hourly_rate` **saat ini** | `rental_sessions.rate_snapshot` (saat sesi mulai) |

**Angka konkret** (sesi 60 menit, tarif awal 25.000 → operator menaikkan tarif ke 45.000 saat sesi berjalan):
```
preview FE       : Rp 45.000
tagihan server   : Rp 25.000
selisih          : Rp 20.000  (80% dari nilai sewa)
changeDue server : Rp 20.000  (UI sudah bilang "Kembalian: Rp 0")
```

**Yang benar-benar sama** (tidak perlu diperbaiki): `lib/pricing.ts:12-16` (`estimateCost`) **identik** dengan `server/src/lib/pricing.js:33-63` untuk subtotal — `roundUp(duration, step) × rate / 60`, sama-sama integer, sama-sama `Math.ceil`. Estimasi di kolom "Estimasi" (`BookingSaya.tsx:161`) sudah benar; hanya preview **pembayaran** yang salah. (Pemeriksa `web/scripts/check-pricing.ts` memang sudah ada dan benar — ia hanya membandingkan `estimateCost`, bukan jalur `FinishDialog`.)

---

## 5. Skenario Uji Manual

Prasyarat (server hidup, **DB terpisah** supaya data demo tidak tercemar):
```sh
cd server
cp data/playrent.db /tmp/pr.db && DB_PATH=/tmp/pr.db node src/seed.js
DB_PATH=/tmp/pr.db ADMIN_USERNAME=admin ADMIN_PASSWORD=AuditPass123 node src/admin-bootstrap.js --force
DB_PATH=/tmp/pr.db PORT=4123 node src/index.js &
curl -s -c /tmp/cookies.txt -X POST localhost:4123/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"AuditPass123"}'
```

| # | Uji | Perintah / langkah | Hasil yang diharapkan (bug) |
|---|---|---|---|
| U1 | Lihat halaman Sesi | Buka `/sesi` sebagai admin | **Halaman blank / error** — `TypeError: Cannot read properties of undefined (reading 'total')` di `Sessions.tsx:97` (FE-001) |
| U2 | Bukti bentuk envelope | `curl -s -b /tmp/cookies.txt 'localhost:4123/api/sessions?page=1&limit=2' \| head -c 300` | `meta` ada di level atas, `data` hanya berisi `items` (FE-001) |
| U3 | Tambah konsol | Di `/unit` → "Tambah konsol" → isi → Simpan | Toast **"Data tidak valid"** / `Unrecognized key(s) in object: 'isActive'` — console tidakmade (FE-002) |
| U4 | Bukti payload create | `curl -s -b /tmp/cookies.txt -X POST localhost:4123/api/consoles -H 'content-type: application/json' -d '{"code":"T-1","consoleType":"PS4","roomType":"Reguler","controllers":2,"hourlyRate":25000,"isActive":true}'` | `400 VALIDATION_ERROR` "Unrecognized key(s) in object: 'isActive'" (FE-002) |
| U5 | Ketik di modal | Buka `/booking` → klik baris → ketik 2 huruf di "Nama pelanggan" | Setelah 1 huruf, fokus lompat ke tombol **"Tutup"**; ketikan kedua mendarat di sana, Enter menutup modal (FE-003) |
| U6 | Preview ≠ tagihan | `/sesi` → sesi 60 menit → tunggu/simulasikan 15 menit lewat → "Selesaikan" → catat Total & Kembalian | Preview ≠ total struk; "Kembalian: Rp 0" padahal `changeDue` server Rp 9.500 (FE-004) |
| U7 | Bukti numerik P1 | `curl -s -b /tmp/cookies.txt -X POST localhost:4123/api/sessions/quote -H 'content-type: application/json' -d '{"consoleId":<unit 25rb/h>,"durationMinutes":60,"extraMinutes":20}'` | `overtimeAmount: 0`, `total: 37500` (FE-004) |
| U8 | Race respons basi | `/transaksi` → ketik cepat di "Cari" (debounce 300 ms) | Kadang tampil data filter lama setelah filter baru (FE-005) |
| U9 | Rincian item | `/transaksi` → klik transaksi | Kolom "Item" kosong, "Qty" = **undefined**, "Jumlah" = **Rp 0** (FE-006) |
| U10 | Laporan Pembayaran | `/laporan` → tab "Pembayaran" | 2 kartu **Rp 0**; kolom Waktu/Metode kosong (FE-007) |
| U11 | Paginasi Transaksi | `/transaksi` dengan rentang 7 hari berisi >20 transaksi | **Tidak ada** paginasi; hanya 20 baris pertama (FE-008) |
| U12 | Ekspor CSV | `/laporan` → tab "Mingguan" → "Ekspor CSV" | File berisi **transaksi**, bukan rekap mingguan (FE-009) |
| U13 | Ubah tarif saat sesi jalan | `/unit` → naikkan tarif unit yang sedang disewa → `/sesi` → "Selesaikan" | Preview memakai tarif baru, tagihan memakai tarif lama (FE-010) |
| U14 | Booking > 50 | Seeding >50 booking pada 1 tanggal → `/booking` | Hanya 50 baris, "Total N" salah (FE-011) |
| U15 | Durasi sesi hidup | `/sesi` → kolom "Durasi" | "0m / 2j" untuk sesi yang masih berjalan (FE-012) |
| U16 | Nama switch | Pakai screen reader di `/unit` → "Konsol aktif" | Tombol switch tidak punya nama yang bisa dibacakan (FE-013) |
| U17 | Timeline tumpang-tindih | `/booking` (tampilan Jadwal) dengan booking cancelled pada slot yang sama | Blok menutupi blok, booking yang tertutup tidak bisa diklik (FE-018) |
| U18 | Cetak struk | `/transaksi/:id/struk` → klik "Cetak" dalam <1 detik | Halaman kosong tercetak (FE-022) |

---

## 6. Ringkasan

| Severity | Jumlah | ID |
|---|---|---|
| Blocker | 3 | FE-001, FE-002, FE-003 |
| Critical | 2 | FE-004, FE-005 |
| Major | 7 | FE-006, FE-007, FE-008, FE-009, FE-010, FE-011, FE-012 |
| Minor | 10 | FE-013 … FE-022 |
| **Total** | **22** | |

**Mismatch Frontend↔Backend:** 14 (M1–M14) + 3 jebakan kontrak (K1–K3).

**Yang sudah benar (terverifikasi, tidak perlu diubah).**
- `lib/pricing.ts:12-16` identik dengan `server/src/lib/pricing.js` untuk subtotal (sudah ada `web/scripts/check-pricing.ts`).
- `lib/format.ts` — semua uang integer rupiah, `Intl.NumberFormat('id-ID')`, tidak ada pembulatan/`parseFloat` uang; tanggal selalu `Asia/Jakarta`; `formatJakarta` aman terhadap tanggal invalid (`NaN → '—'`).
- `lib/useCountdown.ts` — tidak menyimpan counter yang didekrementasi (anti-drift), interval + listener focus/visibility di-cleanup.
- `lib/auth.tsx` — session di-refresh saat boot (`loading`挡住了 kilat konten protected), 401 → `setUser(null)` → guard `Shell` mengarahkan ke `/masuk` dengan `state.from`; `safeFrom()` menolak target lintas-origin.
- `lib/usePolling.ts`, `lib/useMediaQuery.ts` — listener di-cleanup.
- Tidak ada `dangerouslySetInnerHTML`, tidak ada `console.log`, tidak ada `setInterval` yang bocor, tidak ada hook kondisional, tidak ada `useMemo`/`useRef` di luar component.
- Klien **tidak pernah** mengirim `role` saat register, **tidak pernah** mengirim `customer_user_id`, dan tidak pernah mengirim `discount` sebagai pelanggan — batasrophes tersebut sudah dijaga di FE (meskipun tipenya masih longgar, M14).

**Test coverage yang menyembunyikan bug ini (bukan "test kurang" generik).**
- `web` **tidak punya test sama sekali** (`web/package.json` tidak punya script test) → `tsc --noEmit` hanya memeriksa tipe; `Paginated<T>` yang salah bentuknya lolos karena tipe tidak pernah diuji terhadap JSON nyata.
- Tidak ada test yang membandingkan `api.request()` dengan envelope `ARCHITECTURE.md:49` → FE-001/FE-008 lolos.
- Tidak ada test DOM yang merender `Modal` → FE-003 lolos (butuh jsdom; lingkungan ini tidak punya browser).
- `server/test/` tidak pernah memanggil `GET /reports/payments` atau `GET /transactions/:id` → FE-006/FE-007 lolos (sudah dicatat juga di audit BE).

**Catatan overlap dengan `specs/audit-be-report.md`:** BE-002/003/004/008 adalah akar sisi server dari FE-004/FE-006/FE-007/FE-009. **FE-004, FE-006, FE-007, FE-009 tetap harus diperbaiki di sisi FE** — kalau hanya server yang diubah, FE masih salah membaca field yang tidak pernah dikirim server. FE-001, FE-002, FE-003, FE-005, FE-008, FE-010 … FE-022 **tidak ada** di laporan BE (murni sisi FE).

---

## HASIL AKHIR

**Jumlah temuan: 22** (Blocker 3 · Critical 2 · Major 7 · Minor 10), plus 14 mismatch Frontend↔Backend dan 3 jebakan kontrak.

**Blocker/Critical:**
- **FE-001 (Blocker)** — `api.request()` membuang `meta` envelope, dan `Sessions.tsx:97` membacanya sebagai `list.data?.meta.total` → **TypeError; halaman Sesi (layar utama operator) crash** begitu data dimuat; paginasi Transaksi juga mati karena alasan yang sama.
- **FE-002 (Blocker)** — `Units.tsx` mengirim `isActive` saat membuat konsol, sedangkan `createSchema` server `.strict()` menolaknya → **"Tambah konsol" selalu gagal 400**; fitur add unit mati total.
- **FE-003 (Blocker)** — `Modal.tsx` memasang effect dengan dependensi `onOpenChange` (arrow inline) → effect berjalan ulang tiap keystroke dan **mencuri fokus ke tombol "Tutup"** → **setiap input di setiap modal aplikasi tidak bisa diketik lebih dari 1 karakter** (terbukti di jsdom).
- **FE-004 (Critical)** — dialog "Selesaikan & bayar" menghitung total dari `quote` yang **tidak pernah** berisi overtime → **operator melihat & menagih Rp 37.500 padahal server menagih Rp 28.000**; kembalian Rp 9.500 hilang (selisih sampai Rp 2.333 pada tarif normal, Rp 9.500 pada uji end-to-end).
- **FE-005 (Critical)** — `useAsync` memakai satu flag boolean bersama sehingga **respons lama menimpa respons baru** → setelah mengganti filter, UI menampilkan data filter lama (terbukti di jsdom).

**Tidak layak push.** Tiga Blocker membuat tiga alur inti tidak bisa dipakai (Sesi crash, Tambah konsol 400, semua modal tidak bisa diisi) dan dua Critical membuat uang yang diterima kasir ≠ yang tercatat di struk serta menampilkan respons basi. Perbaiki FE-001…FE-005 terlebih dahulu, lalu FE-006…FE-012, lalu audit ulang.
