# Kontrak Perbaikan — PlayRent (KANO)

**Status:** FROZEN — 20 Okt 2026 · **Pemilik:** IT Leader
**Dasar:** `specs/audit-be-report.md` (18 temuan) + `specs/audit-fe-report.md` (22 temuan)
**Implementasi:** `server/` oleh @node-developer · `web/` oleh @frontend-react (paralel, file terpisah)

Aturan emas: **server menghitung, client menampilkan.** Tidak ada angka uang atau status yang
dihitung ulang di clientexcept preview yang memanggil `/sessions/quote`.

---

## 0. Envelope & paginasi — TIDAK ada perubahan server

Server tetap: `{ success, data, meta }` dengan `meta` di level envelope (lihat `ARCHITECTURE.md`
§"Response envelope" dan `server/src/lib/errors.js:56`).

**Perubahan hanya di client** (`web/src/lib/api.ts` → `request()`): envelope `meta` digabung ke
payload yang dikembalikan, sehingga satu objek selalu punya bentuk `{...data, meta}`.

```ts
// request<T>() — setelah json di-parse
if (json.meta !== undefined && json.data && typeof json.data === 'object' && !Array.isArray(json.data)) {
  return { ...json.data, meta: json.meta } as T;
}
return json.data;
```

Konsekuensi (wajib berlaku di semua halaman):
- `list.data?.meta.total` → jumlah total (Sessions, Transactions, Bookings).
- `list.data?.meta.page` / `.limit` → untuk `<Pagination>`.
- `list.data?.items` → baris data.
- `list.data?.totals` → agregat (Transactions, Reports).

Tipe `Paginated<T> extends List<T> { meta: Meta }` tetap dipakai apa adanya. **Jangan** mengubah
`server/src/lib/errors.js` atau bentuk envelope server.

---

## 1. Bentuk Transaction & TransactionItem — KANO (perubahan SERVER)

`mapTransaction` (`server/src/lib/mappers.js`) adalah bentuk kanonik — **jangan diubah**.
`api-contract.md` §T1 sudah memuatnya.

### 1.1 `GET /reports/payments` (BE-003)
Harus mengembalikan:

```jsonc
{
  "items": [ /* Transaction[] — objek transaksi UTUH, sama seperti GET /transactions */ ],
  "totals": {
    "count": 3,          // jumlah baris (termasuk void)
    "gross": 24000,      // Σ total, status != 'void'
    "paid": 24000,       // Σ total, status != 'void' AND payment_status = 'paid'
    "outstanding": 0,    // Σ total, status != 'void' AND payment_status = 'unpaid'
    "voided": 1          // JUMLAH transaksi void (count, bukan rupiah)
  }
}
```

- `items[]` = `rows.map(mapTransaction)` — WAJIB objek penuh (`createdAt`, `paymentMethod`,
  `paymentStatus`, `number`, `customerName`, `consoleCode`, `total`, …), bukan bentuk ringkas
  `{at, method, status}`.
- Field `byMethod` boleh dipertahankan sebagai tambahan, tapi client **tidak** boleh bergantung
  padanya. `subtotal` dihapus (duplikat `gross`).
- Filter `method` & `status` tetap bekerja (`cash|transfer|qris`, `paid|unpaid|void`).

### 1.2 `GET /transactions/:id` → `items[]` (BE-004)

```jsonc
"items": [
  { "id": 1, "kind": "rental", "description": "Sewa PS-01 60 menit", "qty": 1, "unitPrice": 8000, "lineTotal": 8000 }
]
```

- `description` ← `label`, `qty` ← `quantity`, `lineTotal` ← `amount`. Field `kind` tetap ada.
- **Penting:** renderer struk HTML (`server/src/routes/transactions.js` → `renderReceiptHtml`)
  memakai `it.label` / `it.quantity` / `it.amount` — **sesuaikan** ke nama baru atau jangan
  ubah `itemsFor()` dan buat objek dua nama. Pilih satu: buat `itemsFor()` mengembalikan objek
  kanonik `{id, kind, description, qty, unitPrice, lineTotal}` lalu perbarui pemakai struk.

---

## 2. Semantik `POST /sessions/quote` — KANO (perubahan SERVER + CLIENT)

**Body:**

```jsonc
{
  "sessionId": 12,        // opsional — pratinjau SESI YANG SEDANG BERJALAN
  "consoleId": 1,         // wajib bila sessionId tidak ada
  "durationMinutes": 60,  // wajib bila sessionId tidak ada
  "startedAt": "2026-10-20T10:00:00Z", // opsional (hanya jalur plan)
  "extraMinutes": 30      // opsional — menit tambahan pada durasi rencana
}
```

**Perhitungan server (WAJIB persis):**

| | jalur `sessionId` (sesi hidup) | jalur plan (tanpa `sessionId`) |
|---|---|---|
| `planned` | `session.planned_minutes + (extraMinutes ?? 0)` | `durationMinutes + (extraMinutes ?? 0)` |
| `hourlyRate` | **`session.rate_snapshot`** | `console.hourly_rate` |
| `actual` | `minutesBetween(session.started_at, now)` | `startedAt ? max(0, minutesBetween(startedAt, now)) : planned` |
| sumber overtime | **waktu nyata yang sudah berjalan** | hanya bila `startedAt` diberikan |

Aturan tambahan:
- `sessionId` ada → sesi harus ada (404 `SESSION_NOT_FOUND`) dan berstatus `active`/`overdue`
  (409 `SESSION_NOT_ACTIVE`).
- `extraMinutes` **selalu** menambah durasi rencana (bukan menit overtime). Minute overtime
  hanya muncul dari `actual > planned`.
- Response TETAP: `{durationMinutes, billableMinutes, hourlyRate, subtotal, overtimeMinutes,
  overtimeAmount, discount, total, currency:'IDR'}` — hasil `quote()` di
  `server/src/lib/pricing.js`. Bentuknya tidak berubah.
- `discount` dan `extraCharge` **tidak** boleh berparameter di quote (ditagih di `finish`).

**Uji kesetaraan (WAJIB ada, ini inti BE-002):** untuk sesi yang sudah melewati `ends_at`,
`POST /sessions/quote {sessionId}` harus mengembalikan `total` yang **sama** dengan
`total` dari `POST /sessions/:id/finish` (untuk diskon=0, extraCharge=0, metode cash,
`amountPaid` = total). Selisih harus 0 rupiah.

---

## 3. Migrasi `business_settings` (BE-001) — WAJIB

- Tambah migrasi baru di `server/src/db.js` (append di akhir array `MIGRATIONS`; **jangan edit**
  langkah v1/v2/v3 yang sudah rilis): `v4_businessSettings` → `INSERT OR IGNORE INTO
  business_settings (id, business_name, …, updated_at) VALUES (1, 'PlayRent', …, now)` dengan
  default **identik** dengan `server/src/seed.js` (`insertSettings`).
- Naikkan versi skema di `server/src/lib/db-backup.js` (`CURRENT_SCHEMA_VERSION`) 3 → 4, dan
  sesuaikan `REQUIRED_TABLES`/pemeriksaan kolom bila perlu.
- `server/src/lib/settings.js`:
  - `getSettingsRow(db)` **tidak boleh** melempar `TypeError` bila baris hilang → kembalikan baris
    default (nilai `DEFAULT_RULES` dari `lib/pricing.js` + `business_name: 'PlayRent'`).
  - fungsi **update** settings harus UPSERT (`INSERT ... ON CONFLICT(id) DO UPDATE`), supaya
    admin tidak diam-diam gagal menyimpan pengaturan.
- `package.json` server: tambah script `seed:schema` (hanya baris `business_settings` + katalog
  minimum, **tanpa** 44 hari transaksi fiktif dan **tanpa** sesi demo aktif). Script `seed`
  yang ada tetap = seeder demo.
- `README.md`: perbarui bagian instalasi agar jalur produksi tidak pernah menyuntikkan data demo
  (lihat `README.md` bagian seed/admin:bootstrap).

## 4. Aturan lain yang wajib diperbaiki (SERVER)

| ID | Perbaikan | File |
|---|---|---|
| BE-005 | `GET /sessions` harus memanggil `markOverdue(db)` seperti `GET /sessions/:id` → `?status=overdue` tidak boleh selalu `[]` | `routes/sessions.js` |
| BE-006 | `POST /bookings/:id/cancel` → tolak 409 bila booking sudah check-in (ada sesi / status `checked_in`) | `routes/bookings.js` |
| BE-007 | `GET /reports/daily|weekly|monthly` harus **mengisi hari/periode kosong** dengan 0 dalam rentang from..to; `GET /dashboard/revenue-chart` mengisi bucket kosong per hari (dan per minggu/bulan sesuai `groupBy`) | `routes/reports.js`, `routes/dashboard.js` |
| BE-008 | `GET /reports/export.csv?type=` mendukung `sessions\|transactions\|units\|daily\|weekly\|monthly\|payments`; `type` tak dikenal → **400 VALIDATION_ERROR**, bukan fallback diam-diam ke `transactions` | `routes/reports.js` |
| BE-010 | `POST /sessions` body `startedAt`: tolak 400 bila > 24 jam di masa lalu atau > 5 menit di masa depan (mencegah overtime digelembungkan) | `routes/sessions.js` |
| BE-011 | `GET /dashboard/summary` → `revenueWeek` harus mencakup 7 hari terakhir **utuh**, termasuk saatrentang melewati batas tahun | `routes/dashboard.js` |
| BE-012 | `server/src/schema.sql` = snapshot v1 → **jangan diedit**; tambahkan komentar "snapshot v1 — jangan diedit, perubahan lewat migrasi". Pastikan hasil migrasi akhir cocok `api-contract.md` (role `superadmin`/`user`) | `schema.sql` |
| BE-013 | Cegah *formula injection* CSV: nilai string yang diawali `= + - @` atau diawali tab/CR → prefix `'` | `lib/csv.js` (`toCsv`) |
| BE-014 | Pembayaran non-tunai: `amountPaid` = nominal yang benar-benar diterima (`body.amountPaid` bila > 0, else `total`), `changeDue` tetap 0 | `routes/sessions.js` (finish) |
| BE-015 | `POST /users` username ganda → 409 `DUPLICATE_USERNAME` (tangkap UNIQUE violation, jangan 500) | `routes/users.js` |
| BE-016 | Query dashboard dibatasi (rentang tanggal / LIMIT) — tidak boleh scan tanpa batas | `routes/dashboard.js` |
| BE-018a | Escape `% _ \` pada parameter pencarian LIKE + `ESCAPE '\'` | `routes/*.js` yang memakai LIKE |
| BE-018b | `id` non-numerik → 400 `VALIDATION_ERROR` (bukan 500) | `lib/validate.js` |

Tambahan (dari laporan, tidak ber-ID): `GET /transactions` `totals` yang sudah ada **tetap**
`{count, gross, paid, outstanding}` — jangan diubah.

---

## 5. Aturan client (WEB)

| ID | Perbaikan | File |
|---|---|---|
| FE-001 / FE-008 | `request()` gabungkan envelope `meta` ke payload (lihat §0) → `list.data.meta.total` bekerja & paginasi hidup | `lib/api.ts` |
| FE-002 | `POST /consoles` **tidak boleh** mengirim `isActive` (schema server `.strict()` → 400). `isActive` hanya untuk PATCH. Periksa form create lain (games/paket **boleh** `isActive` sesuai kontrak §G2/§P4) | `pages/Units.tsx` |
| FE-003 | `Modal.tsx`: efek fokus jangan bergantung pada `onOpenChange` (arrow inline) → fokus dicuri tiap ketikan. Simpan callback di `ref` atau pisahkan efek "fokus saat open" dari efek "keydown handler" | `components/Modal.tsx` |
| FE-004 / FE-010 | `FinishDialog` panggil `sessions.quote({ sessionId })` — **hapus** estimasi overtime client-side dan pemanggilan `extraMinutes` untuk overtime. `ExtendDialog` panggil `sessions.quote({ sessionId, extraMinutes })` vs `sessions.quote({ sessionId })` → selisih = biaya perpanjangan | `components/session-dialogs.tsx` |
| FE-004b | Total di dialog = `estimate.subtotal + estimate.overtimeAmount + extraCharge - min(discount, subtotal+overtime+extraCharge)` — cap yang sama dengan server | `components/session-dialogs.tsx` |
| FE-005 | `useAsync`: guard *stale response* — pakai nomor urut permintaan; abaikan respons yang bukan yang terbaru. Reset `alive` per-request, bukan flag global | `lib/useAsync.ts` |
| FE-006 / FE-007 | Sesuai §1: `TransactionItem` = `{id, kind, description, qty, unitPrice, lineTotal}`; `reports.payments` = `Transaction[]` + totals baru. Update `lib/types.ts` + `lib/api.ts` + `pages/TransactionDetail.tsx` + `pages/Reports.tsx` | `lib/types.ts`, `lib/api.ts`, `pages/*` |
| FE-009 | `Reports.tsx` kirim `type` CSV yang benar per tab: `daily`/`weekly`/`monthly`/`units`/`payments` | `pages/Reports.tsx` |
| FE-011 | `pages/Bookings.tsx` memakai paginasi server (`page`/`limit` + `meta`) lewat komponen `<Pagination>` — jangan potong diam-diam di 50 | `pages/Bookings.tsx` |
| FE-012 | Durasi sesi hidup (`billedMinutes` null) → tampilkan menit **berjalan** (sekarang - startedAt), bukan "0m" | `pages/Sessions.tsx` |
| FE-013 | `Switch` (role="switch") butuh accessible name: `aria-labelledby` ke `<span id>` (bukan `<label for>`) | `components/Form.tsx` |
| FE-014 | `aria-describedby` hanya menunjuk id yang benar-benar dirender (satu dari error/help, sesuai yang tampil) | `components/Form.tsx` |
| FE-015 | `aria-sort` pindah ke `<th>`, bukan `<button>` di dalamnya | `components/DataTable.tsx` |
| FE-016 | Sumbu-x chart line & tooltip memakai pemetaan yang sama (pusat sel) | `components/Chart.tsx` |
| FE-017 | Ambang "kritis" timer = ambang terkecil yang dikonfigurasi (`warn[warn.length-1] ?? warn[0] ?? 5`), bukan fallback tetap 5 | `lib/useCountdown.ts` |
| FE-018 | Booking timeline: booking `cancelled`/`completed`/`checked_in` yang tumpang tindih tidak boleh menutupi blok aktif (sub-lane atau z-index + opasitas) | `components/BookingTimeline.tsx` |
| FE-019 | `SettingsProvider` untuk pelanggan memakai bentuk publik; tipe `Settings`/`CustomerSettings` dibedakan truthfully (`rules.overtimeRatePerHour`, `rules.overtimeGraceMinutes`, `payments` opsional untuk publik) | `lib/settings-context.tsx`, `lib/types.ts` |
| FE-020 | `toast.tsx` bersihkan timer saat dismiss/unmount; `usePolling` skip tick bila request sebelumnya masih berjalan | `lib/toast.tsx`, `lib/usePolling.ts` |
| FE-021 | `maxLength` "Catatan ketersediaan" = 60 (sama dengan server) + `helpText` menyebut batasnya | `pages/Games.tsx` |
| FE-022 | Tombol "Cetak" struk nonaktif sampai iframe selesai memuat (`frameState === 'loaded'`) | `pages/Receipt.tsx` |

Detail per temuan (file:line, bukti, dampak) ada di `specs/audit-fe-report.md` dan
`specs/audit-be-report.md` — **bacalah**, jangan hanya ringkasan di atas.

---

## 6. Aturan yang TIDAK diubah (dengan sengaja)

| Item | Alasan |
|---|---|
| Bentuk envelope server `{success, data, meta}` | `ARCHITECTURE.md` + `lib/errors.js` adalah acuan; masalahnya di client |
| `mapTransaction` (bentuk Transaction) | Sudah cocok `api-contract.md` §T1 |
| `server/src/lib/pricing.js` — rumus & pembulatan | Source of truth uang; **hanya** dipanggil, tidak diubah (kecuali `quote()` dipanggil dengan argumen yang benar per §2) |
| Diskon di-cap `subtotal + overtimeAmount + extraCharge` | Kode lebih aman dari "capped at subtotal" di kontrak; **dokumentasikan** di `api-contract.md` §Pricing (kontrak yang diselaraskan, bukan kode yang diubah) |
| `server/src/schema.sql` | Snapshot v1 yang sudah rilis — perubahan lewat migrasi |
| Tidak menambah dependency baru (`package.json` server/web) | `npm ci` di CI harus tetap jalan; tidak ada paket baru |
| Nama file/folder/ekspor yang tidak berkaitan | Cakupan dibatasi pada temuan audit |

---

## 7. Verifikasi wajib (WAJIB dijalankan sebelum lapor)

**Server** (`cd server`):
- `npm test` → semua hijau (72 tes existing **harus tetap lulus**, update test yang mengasumsikan
  bentuk lama, jangan hapus test).
- Tambah **tes regresi** minimal untuk: migrasi v4 (DB kosong → `business_settings` ada),
  quote(sesi overtime) == finish(sesi overtime), `?status=overdue` tidak kosong, `items[]` nama
  baru, `reports/payments` totals baru, cancel booking yang sudah check-in → 409.

**Web** (`cd web`):
- `npm run typecheck` → 0 error.
- `npm run build` → sukses (CI GitHub Pages menjalankan ini).

**Integrasi (Leader, setelah kedua tim selesai):**
- Server hidup + login admin → cek `/api/settings`, `/api/sessions?status=overdue`,
  `/api/reports/payments`, `/api/transactions/1` → bentuk JSON sesuai §1.
- Quote vs finish → selisih 0.
