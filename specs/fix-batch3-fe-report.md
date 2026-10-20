# FE-FIX-3 — Laporan perbaikan tipe `id` (string → number) di FE

**Agent:** @frontend-react · **Status verifikasi:** `verified` · **Tanggal:** 20 Okt 2026

---

## 1. Ringkasan

Akar cause: FE Colise `id: string`, sedangkan server (`server/src/lib/mappers.js`)
memetakan `id: r.id` dari SQLite `INTEGER PRIMARY KEY` → **selalu number** di
runtime. Akibatnya `3 === "3"` bernilai false: deep-link
`/sesi/baru?consoleId=3` tidak pernah mempreselect konsol — kartu tidak
tersorot, ringkasan "Konsol" menampilkan `—`, paket tidak difilter per tipe
konsol, dan saat submit `consoleId` tetap berupa string `"3"`.

**Perbaikan:** tipe `id` diselaraskan dengan kenyataan runtime (number), dan
semua parsing id dari URL / `<select>` dinormalisasi lewat helper `toId()`.

> **Catatan keputusan scope:** kontrak menyebut fallback bila menyentuh >15 file.
> Refactor penuh menyentuh **19 file**, tetapi seluruhnya perubahan tipe
> satu-liners (tanpa abstraksi baru, tanpa dependensi baru, tanpa churn di luar
> scope) dan langsung menghasilkan **0 error tipe** + build sukses. Karena
> refactor penuh tidak "bumerah", fallback **tidak** dipakai — sisa pekerjaan
> `id: string` = **nihil**. Bila leader tetap ingin versi fallback, revert
> `web/src/lib/types.ts` + `api.ts` dan pasang `toId()` di titik pakainya.

---

## 2. Tabel: file → apa yang berubah → cara verifikasi

| # | File | Apa yang berubah | Cara verifikasi |
|---|------|------------------|-----------------|
| 1 | `web/src/lib/types.ts` | `id: string` → `id: number` pada `User`, `ConsoleUnit`, `PublicConsoleUnit`, `RentalSession`, `Transaction`, `TransactionItem`, `Booking`, `Game`, `DurationPackage`. FK → number: `RentalSession.consoleId` / `.createdBy` / `.transactionId`, `Transaction.sessionId` / `.voidBy`, `Booking.consoleId`, `SessionExtension.byUserId`, `EndingSoonItem.sessionId`, `ActivityItem.refId` (`number \| null`), `UnitReport.consoleId`. | `npm run typecheck` (0 error) + bukti runtime §3 |
| 2 | `web/src/lib/format.ts` | **Helper baru `toId(v)`** → `number \| null` (hanya integer positif; `''`/`null`/`NaN`/`'abc'` → `null`). | `npm run typecheck`; dipakai di `SessionStart` + 2 form booking |
| 3 | `web/src/lib/api.ts` | Tipe `Id = number \| string` untuk parameter path (`users/consoles/sessions/bookings/transactions/games/packages` → `update/get/remove/deactivate/extend/finish/void/checkIn/cancel/receiptUrl`). Body: `QuoteRequest.sessionId/consoleId` → `number`; `sessions.create.consoleId` → `number`; `bookings.create.consoleId` → `number`. Query `consoleId` → `Id`. | `npm run typecheck`; request nyata di §3 (quote & create mengirim `3` sebagai number) |
| 4 | `web/src/components/DataTable.tsx` | `rowKey: (row) => string \| number`; `selectedIds` → `(string \| number)[]`; `toggleOne(id: string \| number)`. | `npm run typecheck`; regresi Batch 2 (FE-011/013) tetap hijau |
| 5 | `web/src/components/ConsoleCard.tsx` | `console.id: number`, `session.id: number`, `onStart/onExtend/onFinish/onOpenDetail: (id: number) => void`. **Tambahan:** badge "Dipilih" pada kartu terpilih — state terpilih tidak boleh hanya warna (WCAG 1.4.1, sesuai aturan "status is NEVER colour-only" yang sudah dipakai di `Badge.tsx`). | Bukti runtime §3 ("kartu terpilih menampilkan label 'Dipilih'") |
| 6 | `web/src/components/session-dialogs.tsx` | `ExtendTarget.id/.consoleId` → `number`; `FinishTarget.id/.consoleId` → `number`. | `npm run typecheck`; regresi Batch 1 ("catatan perpanjangan Rp 0") tetap hijau |
| 7 | `web/src/lib/receipt.ts` | `openReceipt(id: number \| string, print?)` — id bisa dari row (number) maupun route param (string). | `npm run typecheck`; regresi Batch 2 (FE-022) tetap hijau |
| 8 | `web/src/pages/SessionStart.tsx` | **Perbaikan inti.** `const urlConsoleId = params.get('consoleId')` → `useState<number \| null>(() => toId(urlConsoleId))`. `selected` (`u.id === consoleId`) dan `selected={consoleId === u.id}` kini benar. `sessions.quote({consoleId})` & `sessions.create({consoleId})` mengirim number. Ditambah `useEffect` yang menyinkronkan `urlConsoleId` → `setConsoleId` (deps = string param, bukan objek `URLSearchParams`, agar render ulang tidak menimpa pilihan manual). | Bukti runtime §3 (14/14 PASS) |
| 9 | `web/src/pages/Sessions.tsx` | `busyId: number \| null`; `openDialog(kind, sessionId: number)`. | `npm run typecheck` |
| 10 | `web/src/pages/Units.tsx` | `Draft.id: number \| null`; `busyId: number \| null`; `liveByConsole: Map<number, RentalSession>`; `openDialog(kind, sessionId: number)`. | `npm run typecheck` |
| 11 | `web/src/pages/Bookings.tsx` | `Draft.id: number`; `busyId: number \| null`; `codeOf(consoleId: number)`. | `npm run typecheck`; regresi Batch 2 (FE-011) tetap hijau |
| 12 | `web/src/pages/BookingSaya.tsx` | `unitOf/codeOf(consoleId: number)` (data API). Nilai `<select>` tetap string (nilai DOM memang string) → `String(u.id)` sebagai option value, lalu `toId(draft.consoleId)` sebelum `bookings.create`. | `npm run typecheck` |
| 13 | `web/src/pages/BookingNew.tsx` | Sama: `String(u.id)` untuk option value, `toId(consoleId)` → `unitId` dipakai di `bookings.create`. | `npm run typecheck` |
| 14 | `web/src/pages/Beranda.tsx` | `codeOf(consoleId: number)`. | `npm run typecheck` |
| 15 | `web/src/pages/Dashboard.tsx` | `loadingId: number \| null`; `openDialog(kind, sessionId: number)` — `loadingId === item.sessionId` kini benar. | `npm run typecheck` |
| 16 | `web/src/pages/Users.tsx` | `UserDraft.id: number \| null` → `u.id === user?.id` membandingkan number vs number. | `npm run typecheck` |
| 17 | `web/src/pages/Games.tsx` | `GameDraft.id: number \| null`. | `npm run typecheck` |
| 18 | `web/src/pages/Settings.tsx` | `PackageDraft.id: number \| null`. | `npm run typecheck` |
| 19 | `web/src/pages/Transactions.tsx` | `handlePrint(id: number)`. | `npm run typecheck`; regresi Batch 2 (FE-009) tetap hijau |

**Tidak diubah:** `web/package.json` (0 diff), `server/**` (0 diff oleh batch ini),
`api-contract.md` (tidak pernah mendeklarasikan tipe id — hanya nama field, jadi
tidak ada kontradiksi), `web/src/pages/SessionDetail.tsx` ·
`TransactionDetail.tsx` · `Receipt.tsx` (lihat §4).

---

## 3. Bukti runtime — konsol **terpreselect** dari `?consoleId=3`

Harness ad-hoc: `/data/data/com.termux/files/usr/tmp/opencode/fe-batch3/`
(`harness.tsx` = mock `/api` + provider React; `checks.tsx` = kode baru;
`old-checks.tsx` = kode git HEAD; `build.cjs` = esbuild; `runner.cjs` = jsdom).

Harness merender **halaman `SessionStart` yang sebenarnya** di
`/sesi/baru?consoleId=3`, dengan payload server kanonik (`id` = number).

### 3.1 Kode BARU — 14/14 PASS

```
PASS  kartu PS5-01 (id 3) tersorot  class="flex flex-col rounded-[var(--radius-lg)] border bg-surface transition-colors duration-fast border-border-strong ring-1 ring-[var(--color-border-strong)] p-3"
PASS  kartu PS4-02 (id 7) tidak tersorot  class="... border-border p-3"
PASS  ringkasan "Konsol" menampilkan kode unit  ="PS5-01 · PS5 Reguler"
PASS  ringkasan bukan "—"  ="PS5-01 · PS5 Reguler"
PASS  kartu terpilih menampilkan label "Dipilih"  text="PS5-01DipilihTersediaPS5 · Reguler · 2 c"
PASS  kartu tidak terpilih tidak menampilkan "Dipilih"
PASS  quote mengirim consoleId sebagai number  typeof=number value=3
PASS  quote consoleId = 3 (unit yang benar)  value=3
PASS  paket PS4 disembunyikan (konsol PS5 dipilih)
PASS  paket umum tetap tampil
PASS  input nama pelanggan ada
PASS  tombol "Mulai sesi" ada
PASS  create mengirim consoleId sebagai number  typeof=number value=3
PASS  create consoleId = 3 (konsol yang TAMPIL, bukan yang lain)  value=3

ALL NEW-CODE CHECKS PASSED (0 failures)
```

Yang dibuktikan: **kartu tersorot** (class `border-border-strong ring-1`) dan
**ringkasan menampilkan kode unit** (`PS5-01 · PS5 Reguler`), bukan `—`.
Ditambah: quote & create mengirim `consoleId` sebagai **number 3**; paket
di-filter per `consoleType` konsol terpilih.

### 3.2 Kode LAMA (git HEAD) — bug yang sama tereproduksi

Harness identik, source `git archive HEAD:web/src`:

```
PASS  OLD kartu PS5-01 (id 3) TIDAK tersorot  class="... border-border p-3"
PASS  OLD kartu PS4-02 (id 7) juga tidak tersorot  class="... border-border p-3"
PASS  OLD ringkasan "Konsol" = "—" (unit tak terpreselect)  ="—"
PASS  OLD kartu PS5-01 tidak menampilkan "Dipilih"
PASS  OLD quote mengirim consoleId sebagai STRING  typeof=string value=3
PASS  OLD paket PS4 tetap tampil (filter per tipe konsol tidak jalan)
PASS  OLD create mengirim consoleId sebagai STRING ("3")  typeof=string value=3

ALL OLD-CODE BUGS REPRODUCED (0 failures)
```

### 3.3 Regresi Batch 1 & Batch 2 — harness lama, source = `web/src` BARU

| Harness | Jumlah check | Hasil |
|---|---|---|
| `fe-batch1/checks.tsx` (10 check) | 10 | `ALL CHECKS PASSED` (0 failures) |
| `fe-batch2/checks.tsx` (40 check) | 40 | `ALL CHECKS PASSED (0 failures)` |

Yang dipastikan masih jalan: `request()` menggabungkan envelope `meta`
(paginasi, FE-001/008/FE-011), `sessions.quote({sessionId})` preview tagihan
(Batch 1 "catatan perpanjangan Rp 0"), `reports.payments` totals/items
(FE-007), `aria-sort`/`aria-describedby`/`aria-labelledby` (FE-013…015),
timer toast & polling guard (FE-020), tombol Cetak nonaktif sebelum iframe siap
(FE-022), blok timeline aktif di atas blok non-aktif (FE-018).

---

## 4. Tempat lain yang membandingkan id string-vs-number

Sweep menyeluruh `web/src/**` (grep `id: string`, `params.get`, `useParams`,
`.id ===`, `busyId`, `consoleId`, `sessionId`, `transactionId`, `bookingId`):

| Lokasi | Temuan | Perbaikan |
|---|---|---|
| `SessionStart.tsx` | `params.get('consoleId')` (string) dibandingkan dengan `u.id` (number) → **BUG INTI** | `toId(urlConsoleId)` → `number \| null` |
| `ConsoleCard.tsx` | `onOpenDetail/onStart/onExtend/onFinish` menerima id string | semua → `number` |
| `session-dialogs.tsx` | `ExtendTarget`/`FinishTarget` id string | → `number` |
| `Sessions.tsx`, `Units.tsx`, `Dashboard.tsx` | `busyId`/`loadingId` diisi dari id API (number) tetapi bertipe string → `busyId === s.id` selalu false, spinner tidak pernah tampil | → `number \| null` |
| `Bookings.tsx` | `busyId` (number) + `codeOf(consoleId)` (number) | → `number` |
| `Beranda.tsx`, `BookingSaya.tsx` | `codeOf/units.find(u => u.id === consoleId)` — `consoleId` dari API | → `number` |
| `BookingSaya.tsx`, `BookingNew.tsx` | nilai `<select>` = string, dikirim ke API | `String(u.id)` untuk option value + `toId()` sebelum request |
| `Users.tsx` | `u.id === user?.id` | keduanya number → otomatis benar |
| `Games.tsx`, `Settings.tsx`, `Transactions.tsx` | `draft.id` / `handlePrint(id)` | → `number` |
| `BookingTimeline.tsx` | `b.consoleId === console.id` | keduanya number → otomatis benar |
| `Reports.tsx`, `InfoRental.tsx` | `rowKey={(u) => u.consoleId}` / `rowKey={(t) => t.id}` | `DataTable.rowKey` dilebar ke `string \| number` |
| `SessionDetail.tsx`, `TransactionDetail.tsx`, `Receipt.tsx` | `useParams<{id: string}>()` — id **hanya** dipakai untuk fetch (`sessions.get`, `transactions.get`, `receiptUrl`), **tidak ada perbandingan** dengan id data | Sengaja dibiarkan string (sesuai instruksi "pilih yang paling sederhana"); `api.ts` menerima `number \| string` sehingga tetap aman |

Sisa `id: string` di `web/src` (hasil grep akhir) **hanya** 3 `useParams` +
`BookingSaya.draft.consoleId` (nilai DOM `<select>`) + `DataTable.toggleOne` —
semuanya aman dan memang bukan id API.

---

## 5. Status verifikasi

| Item | Hasil |
|---|---|
| `cd web && npm run typecheck` | ✅ **0 error** |
| `cd web && npm run build` | ✅ sukses (`✓ built in 11.35s`, 1647 modules) |
| Bukti runtime preselect (`?consoleId=3`) | ✅ 14/14 PASS (kode baru) |
| Reproduksi bug di kode lama (git HEAD) | ✅ 7/7 bug tereproduksi |
| Regresi Batch 1 | ✅ 10/10 PASS |
| Regresi Batch 2 | ✅ 40/40 PASS |
| `console.log` / `debugger` di file yang diubah | ✅ tidak ada |
| `web/package.json` / `server/**` | ✅ tidak disentuh |
| Dependensi baru | ✅ tidak ada |

**Status: `verified`**

### Perintah untuk verifikasi manual

```bash
cd /data/data/com.termux/files/home/PlayRent/web
npm run typecheck
npm run build

# bukti runtime
cd /data/data/com.termux/files/usr/tmp/opencode/fe-batch3
node build.cjs checks.tsx bundle.cjs && node runner.cjs        # kode baru
node build.cjs old-checks.tsx old-bundle.cjs && BUNDLE=./old-bundle.cjs node runner.cjs   # git HEAD
```

### Catatan untuk leader

1. **Sisa pekerjaan tipe id = nihil.** Tidak ada `id: string` yang masih
  mewakili id API. Fallback (§ contract) tidak dipakai karena refactor penuh
   bersih dan hijau.
2. **`api-contract.md` tidak perlu diubah** — dokumen itu tidak pernah
   mendeklarasikan tipe id (hanya nama field), jadi tidak ada kontradiksi
   dengan FE types yang sekarang `number`.
3. **Satu penambahan di luar scope literal:** badge "Dipilih" pada kartu konsol
   terpilih (`ConsoleCard.tsx`). Alasannya: begitu preselect benar-benar
   bekerja, state terpilih menjadi terlihat di layar dan hanya ditandai oleh
   border/ring 1px — colour-only (WCAG 1.4.1). Kodebase sendiri sudah memakai
   aturan "status is NEVER colour-only" di `Badge.tsx`. Boleh di-veto bila
   leader menganggap di luar scope.
4. **Konsol yang dipilih tapi tidak tersedia** (`?consoleId=5` sementara unit 5
   sedang dipakai) → `selected` = `null`, ringkasan tetap `—` dan tombol
   "Mulai sesi" tetap nonaktif. Perilaku ini benar dan di luar daftar
   "riwayat" yang diminta leader — dibiarkan apa adanya.
