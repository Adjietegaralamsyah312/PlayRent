# Laporan Perbaikan FE — Batch 1 (inti: blokir & uang)

**Agen:** @frontend-react · **Task:** FE-FIX-1 · **Tanggal:** 20 Okt 2026
**Ruang lingkup:** hanya `web/src/**` (tidak ada `server/`, `api-contract.md`, `specs/fix-contract.md`;
`web/package.json` tidak berubah — nol dependency baru).
**Status verifikasi:** `verified`

---

## 1. Ringkasan

| ID | Severity | File diubah | Yang berubah | Cara verifikasi |
|---|---|---|---|---|
| FE-001 + FE-008 | Blocker + Major | `web/src/lib/api.ts` | `request()` menggabungkan `meta` envelope ke payload: `data` objek → `{...data, meta}`. `list.data?.meta.total` kini bekerja → halaman Sesi tidak crash, `<Pagination>` Transaksi/Booking hidup. Kode persis sesuai `specs/fix-contract.md` §0. | E2E ke server nyata + jsdom (`list.data.meta.total = 47`); Lihat §3.1 |
| FE-002 | Blocker | `web/src/pages/Units.tsx` | Payload create dipisah dari payload update. `POST /consoles` **tidak** mengirim `isActive` lagi; `isActive` tetap ikut pada `PATCH`. Tipe payload create = `Omit<Partial<ConsoleUnit>, 'isActive'>` → regresi ketahuan compiler (tsc error kalau `isActive` ditambahkan lagi). | E2E ke server nyata: tanpa `isActive` → **201 Created**; dengan `isActive` → **400 "Unrecognized key(s) in object: 'isActive'"**. jsdom: body POST vs PATCH tertangkap. Lihat §3.2 |
| FE-003 | Blocker | `web/src/components/Modal.tsx` | Efek fokus tidak lagi bergantung pada identitas `onOpenChange` (arrow inline). Callback + `initialFocusRef` disimpan di `ref`; efek "fokus saat open" (deps `[open]`) dipisah dari efek "keydown/Escape/Tab" (deps `[open, dismissible]`). Fokus tetap dikembalikan saat ditutup; Escape/Tab tetap jalan. | jsdom before/after (§3.3) — fokus TIDAK lagi dicuri tiap ketikan |
| FE-004 + FE-010 | Critical + Major | `web/src/components/session-dialogs.tsx`, `web/src/lib/api.ts` | `FinishDialog`: estimasi overtime client-side **dihapus**; panggil `sessions.quote({ sessionId: session.id })` → pratinjau = tagihan server (tarif `rateSnapshot` + jam nyata). `ExtendDialog`: `quote({sessionId})` vs `quote({sessionId, extraMinutes})` → selisih = biaya perpanjangan. Total dialog = `subtotal + overtimeAmount + extraCharge − min(discount, gross)` (cap sama dengan server). Tipe body `QuoteRequest` (tambah `sessionId?`) di `api.ts`. | jsdom: body quote = `{"sessionId":"42"}` (tanpa `extraMinutes`), total = `Rp 28.000` dari quote server, diskon dicap. E2E: `quote(sessionId).total == finish(sessionId).total` → selisih **0 rupiah**. Lihat §3.4 |
| FE-005 | Critical | `web/src/lib/useAsync.ts` | Flag global `alive` diganti **nomor urut permintaan** (`seq`): hanya respons terakhir yang boleh menulis state. `alive` tidak lagi di-reset per reload. `reload()` manual tetap bekerja; `setData` tetap ekspos. | jsdom before/after (§3.5) — respons lama tidak lagi menimpa respons baru |
| FE-012 | Major | `web/src/pages/Sessions.tsx`, `web/src/pages/SessionDetail.tsx`, `web/src/lib/types.ts`, `web/src/lib/format.ts` | Sesi hidup (`billedMinutes = null`) menampilkan **menit berjalan** (`now − startedAt`, dibulatkan ke bawah), bukan "0m". Sesi selesai/void tetap `billedMinutes`. Tipe `billedMinutes` jadi `number | null` (benar). Helper baru `elapsedMinutes()` di `lib/format.ts`; halaman Sesi punya tick 30 detik supaya angka tidak basi. | jsdom: sel "Durasi" = `45m / 1j`, bukan `0m / 1j` (§3.6) |

### File di luar daftar awal (deviasi sadar, semua tetap FE-012)

| File | Alasan |
|---|---|
| `web/src/lib/types.ts` | `billedMinutes: number` → `number \| null`. Wajib untuk FE-012 (kontrak §5 FE-012 + audit FE-012: "lib/types.ts: billedMinutes: number | null"). Tipe `TransactionItem` / `reports.payments` **tidak** disentuh (itu Batch 2). |
| `web/src/lib/format.ts` | Helper `elapsedMinutes()` — dipakai bersama oleh `Sessions.tsx` + `SessionDetail.tsx` (audit: "dan wherever else `billedMinutes` dirender"). |
| `web/src/pages/SessionDetail.tsx` | 1 baris: defect FE-012 yang sama ("rencana / tercatat" → "0m") di halaman detail. Halaman ini sudah re-render tiap detik (`useCountdown`), jadi angkanya langsung hidup. |

### Tambahan kecil di `session-dialogs.tsx` (kualitas, bukan fitur)

`FinishDialog` kini punya state `quoteError`: kalau quote gagal, dialog menampilkan
"Gagal menghitung tagihan: …" dan tombol bayar **nonaktif** — sebelumnya quote yang gagal
ditelan diam-diam dan layar menampilkan "Rp 0" (jalur uang).

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
dist/index.html                   0.89 kB │ gzip:   0.47 kB
dist/assets/index-D5erqjGm.css   33.59 kB │ gzip:   7.28 kB
dist/assets/index-ClGlBrE0.js   483.80 kB │ gzip: 137.10 kB
✓ built in 13.24s
```

- Tidak ada `console.log` di file yang diubah (`grep` → 0 hasil).
- `web/package.json` tidak berubah → tidak ada dependency baru, `npm ci` di CI tetap jalan.
- File uji **tidak** ditaruh di repo; semua skrip ad-hoc ada di
  `/data/data/com.termux/files/usr/tmp/opencode/fe-batch1/`
  (`checks.tsx`, `checks-units.tsx`, `checks-session.tsx`, `e2e.ts` + runner jsdom).
  Skrip membandingkan kode **lama (git HEAD)** vs **kode baru** pada modul yang sama.

---

## 3. Bukti

### 3.1 FE-001 / FE-008 — envelope `meta` (jsdom, mock fetch)

```
paginated: data.meta.total=46 data.items=1 | plain: data={"user":{"id":"1"}}
PASS  meta is merged into the payload (list.data.meta.total works)  total=46
PASS  rows are still there  items=1
PASS  a payload without meta is returned untouched  plain={"user":{"id":"1"}}
```

E2E ke server nyata (server di `localhost:4188`, DB temporer):

```
GET /sessions → data.meta={"page":1,"limit":2,"total":47,"totalPages":24} items=2
PASS  list.data.meta.total is available (page does not crash)  total=47
```

**Bonus (bug lama, kode lama):** board Sesi dengan api-layer lama **crash**:
`CRASH while rendering the board: Cannot read properties of undefined (reading 'total')`
— persis temuan FE-001. Dengan kode baru: board render normal.

### 3.2 FE-002 — "Tambah konsol" (jsdom, halaman `Units` asli)

```
=== OLD (git HEAD) ===
POST /consoles body: {"code":"PS5-99",...,"conditionNote":null,"isActive":true}
FAIL  create does NOT send isActive  keys=code,...,conditionNote,isActive

=== NEW (fixed) ===
POST /consoles body: {"code":"PS5-99","consoleType":"PS4","roomType":"Reguler","controllers":2,
                       "hourlyRate":25000,"status":"available","conditionNote":null}
PASS  create does NOT send isActive
PATCH /consoles body: {..., "isActive":false}
PASS  update still sends isActive
```

E2E ke server nyata:

```
PASS  POST /consoles without isActive succeeds  id=11
PASS  POST /consoles WITH isActive is rejected by the server
      400 VALIDATION_ERROR: Unrecognized key(s) in object: 'isActive'
```

### 3.3 FE-003 — fokus modal (jsdom, `Modal.tsx` asli, `onOpenChange` inline)

```
OLD (git HEAD): typed="B" | activeElement after 1 keystroke = Tutup
PASS  OLD reproduces the bug (focus stolen)  typed="B" activeElement=Tutup
NEW (fixed):    typed="B" | activeElement after 1 keystroke = INPUT
PASS  NEW keeps the caret in the field  typed="B" activeElement=INPUT

focus on open=Tutup | escape close calls=1 | focus returned to trigger=true
PASS  Escape still closes the modal  closed=1
PASS  focus returns to the trigger on close  restored=true
```

=> fokus tidak lagi dicuri tiap ketikan; modal tetap tertutup dengan Escape dan fokus
kembali ke elemen pemicu. (Fokus awal saat modal dibuka tetap elemen focusable pertama —
perilaku lama tidak diubah; Trap Tab dipindah verbatim ke efek sendiri.)

### 3.4 FE-004 / FE-010 — pratinjau = tagihan server (jsdom + server nyata)

```
quote request body: {"sessionId":"42"}
PASS  the quote asks the server about the running session (sessionId only)
PASS  the preview shows the server total (rent + overtime)  hasTotal=true hasOvertimeRow=true
PASS  the discount is capped at the gross amount  expected total Rp 0
```

Kode lama (git HEAD) mengirim body's client-side:
`{"consoleId":"7","durationMinutes":60,"extraMinutes":0}` → FAIL.

E2E ke server nyata (jalur `sessionId` sudah ada di server, BE-002):

```
POST /sessions/quote {sessionId:46} → {"durationMinutes":120,"billableMinutes":120,
  "hourlyRate":10000,"subtotal":20000,"overtimeMinutes":0,"overtimeAmount":0,"total":20000}
PASS  the quote uses the session rate snapshot  rate=10000 snapshot=10000
POST /sessions/quote {sessionId:46, extraMinutes:30} → total=25000
PASS  extending 30 minutes is priced by the server  durationMinutes=150

# sesi lewat waktu (startedAt 40 menit lalu, rencana 30 menit)
overdue quote: {"durationMinutes":30,"billableMinutes":30,"hourlyRate":25000,
  "subtotal":12500,"overtimeMinutes":5,"overtimeAmount":1000,"discount":0,"total":13500}
overdue session → quote.total=13500 finish.total=13500 changeDue=0
PASS  quote(sessionId) == finish(sessionId) (0 rupiah apart)  quote=13500 finish=13500
```

**Uji ekuivalensi kontrak §2 terpenuhi: selisih 0 rupiah** (dulu pratinjau ≠ tagihan,
selisih terbukti sampai Rp 9.500 per audit).

### 3.5 FE-005 — respons basi (jsdom, `useAsync.ts` asli)

```
OLD (git HEAD): after NEW=NEW(filter=2) | after LATE OLD=OLD(filter=1) | after manual reload=RELOADED
PASS  OLD reproduces the bug (stale response wins)  afterOld=OLD(filter=1)
NEW (fixed):    after NEW=NEW(filter=2) | after LATE OLD=NEW(filter=2) | after manual reload=RELOADED
PASS  NEW keeps the fresh response  afterOld=NEW(filter=2)
PASS  NEW manual reload still works  afterReload=RELOADED
```

### 3.6 FE-012 — menit berjalan (jsdom, board `Sessions` asli)

```
board contains "45m / 1j": true | contains "0m / 1j": false
PASS  a running session shows the minutes that have run  expected "45m / 1j"
PASS  a running session does NOT show "0m"  no "0m / 1j"

=== OLD (git HEAD) ===
board contains "45m / 1j": false | contains "0m / 1j": true
FAIL  a running session shows the minutes that have run
```

---

## 4. Catatan integrasi (untuk Leader)

1. **FE-004/FE-010 bergantung pada BE-002** (server menerima `sessionId` di
   `POST /sessions/quote`). Kodenya **sudah ada** di `server/src/routes/sessions.js`
   (diverifikasi E2E di atas) → FE dan BE sekarang konsisten.
2. **FE-001 memengaruhi halaman lain**: setiap endpoint berpaginasi kini mengembalikan
   `{...data, meta}`. Tipe `Paginated<T> extends List<T> { meta: Meta }` tidak berubah.
   Halaman yang membaca `.meta` tanpa `?.` (mis. `Sessions.tsx:97` `list.data?.meta.total`)
   aman karena `list.data` non-null berarti `meta` juga ada.
3. **FE-002** — `POST /consoles` sekarang valid (400 "Unrecognized key(s) … 'isActive'")
   sudah hilang. Perilaku create game/paket **tidak** disentuh (they boleh `isActive`,
   kontrak §G2/§P4).
4. **FE-012** — `billedMinutes` bertipe `number | null`; kalau ada pemanggil lain di
   Batch 2 yang memaksa `number`, cast/guard perlu di sana.

## 5. Status verifikasi

**`verified`** — typecheck 0 error, build sukses, 18 pemeriksaan otomatis lulus
(jsdom before/after untuk FE-001/002/003/004/005/012 + E2E ke server nyata untuk
FE-001/002/004/010), tanpa dependency baru dan tanpa `console.log`.
