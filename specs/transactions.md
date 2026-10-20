# specs/transactions.md — Transaksi, Detail & Struk

**Purpose.** Find a past payment, read its detail, print a receipt, and — for an admin, with a reason — void it without ever deleting history.
**Primary user.** **Kasir** for lookup and reprint at the counter; **admin** additionally for void. Every `T*` endpoint is 👤 except `T3` (🔑).
**Single most important action.** **Cetak Struk** (reprint) — the reason anyone opens this screen after the fact.

---

## 1. Layout (mobile first, stacked regions)

The module is three destinations:

| Route | View |
| --- | --- |
| `/transaksi` | list + filters + totals |
| `/transaksi/:id` | detail |
| `/transaksi/:id/struk` | full-page receipt preview (or a new tab from detail) |

### 1.1 `/transaksi` (list)

1. **Page header** — `h1` *"Transaksi"*; right side (≥ 768): `DateRangePicker` (presets, default *Hari Ini*), method `Select`, status `Select`.
2. **Filter bar** — at 360: a `Tabs pill` scroller (`Semua · Lunas · Belum Bayar · Dibatalkan`) + filter `IconButton` opening a bottom `Drawer` holding `DateRangePicker`, **Metode** (Semua · Tunai · Transfer · QRIS) and search `Input` (placeholder *"Cari nomor transaksi atau nama pelanggan"*). At ≥ 768 all controls inline.
3. **Totals summary** — from `T1`'s `totals:{count,gross,paid,outstanding}`. One dense strip (same pattern as the Dashboard metric strip): `Transaksi 9` · `Bruto Rp 1.240.000` · `Dibayar Rp 1.200.000` · `Belum Dibayar Rp 40.000`. Each `.tnum`. **"Belum Dibayar" is a separate, labelled cell** from "Dibayar" — `plan.md` §K's recorded-vs-outstanding distinction, never merged into one number.
4. **Table / card list** — `DataTable` columns: **No. Transaksi** (`primary`, format `TRX-20261019-0007`) · **Waktu** (`19 Okt 2026, 20.15`) · **Pelanggan** (`customerName`) · **Unit** (`consoleCode`) · **Total** (`numeric`, `Rp 31.250`) · **Metode** (`StatusBadge`: Tunai/Transfer/QRIS) · **Status** (`paymentStatus`: Lunas/Belum Bayar/Dibatalkan) · **Kasir** (`cashierName`, `body-sm`) · **Aksi** (`IconButton`s: `ReceiptText` *"Cetak Struk"*, `Eye` *"Detail"`, `Ban` *"Batalkan"` admin-only).
5. **Pagination** — `load-more` at 360, numbered at ≥ 768.
6. **Bottom action bar** — none (this is a read screen; adding a CTA here would be decoration).

### 1.2 `/transaksi/:id` (detail)

Stacked regions:
1. **Header** — `h1` = `number` (mono-ish, `.tnum`); `StatusBadge` for `status` and `paymentStatus`; right side **"Cetak Struk"** (`ReceiptText`) and, admin-only, **"Batalkan Transaksi"** (`Ban`, danger ghost).
2. **Meta definition list** — `Waktu 19 Okt 2026, 20.15` · `Pelanggan` · `Unit PS-01` · `Kasir {cashierName}` · `Metode` · `Status Pembayaran`.
3. **Rincian biaya** — rows: `Subtotal Rp 31.250` · `Biaya tambahan Rp 0` · `Diskon −Rp 0` (+ `caption` `discountReason` when present) · **`Total Rp 31.250`** (`--text-num-xl`) · `Dibayar Rp 50.000` · **`Kembalian Rp 18.750`** (`--color-success`, only when `paymentMethod === 'cash'` and `changeDue > 0`). All `.tnum`, right-aligned, label left.
4. **Sesi terkait** — a link card to `/sesi/{sessionId}`: console code, `startedAt`–`finishedAt`, `plannedMinutes` vs `billedMinutes`, `rateSnapshot` labelled *"Tarif saat sesi dimulai"*. Uses `session` from `T2`.
5. **Void block** — visible only when `status === 'void'`: `--color-danger-soft`, `Ban`, *"Dibatalkan oleh {voidBy} pada {voidedAt}"* + `voidReason`. Struck-through total? **No** — the total is kept readable and a `caption` line states *"Transaksi ini dibatalkan dan tidak dihitung sebagai pendapatan."* Striking out the number makes it unreadable to the person who needs to quote it.
6. **Item list** (`items` from `T2`) — only rendered when non-empty: description, qty, unit price, line total.

### 1.3 `/transaksi/:id/struk` (receipt)

**Rendered from the server**, not the client: `GET /api/transactions/:id/receipt?format=html` returns a self-contained HTML document with inline CSS and `@page { size: 80mm auto }`. The client opens it — it does **not** rebuild the receipt.

- **From the list row action / detail button:** `window.open('/api/transactions/:id/receipt?format=html', '_blank')`. If the pop-up is blocked (`window.open` returns `null`): toast error *"Struk gagal dibuka. Izinkan pop-up untuk situs ini lalu coba lagi."*
- **Post-pay panel (sessions.md §7.2):** same URL with `&print=1`, which is what makes the document auto-trigger `window.print()`. Plain list/detail opens never auto-print. This is the explicit distinction documented in `api-contract.md` T4.
- **On-screen preview** (`/transaksi/:id/struk` route, for a phone with no printer): the same HTML in a full-page `<iframe title="Struk transaksi TRX-20261019-0007">` + a sticky **"Cetak"** `Button` calling `iframe.contentWindow.print()`. The iframe has a fixed `max-width: 80mm` white panel with a `--color-border` outline so the 80 mm paper width is honest, not stretched to the phone.
- **Print fidelity requirements** the frontend must not fight: the server document is the source of truth for typography, spacing and `business_settings`. The client must not inject its own stylesheet into the iframe; `DESIGN.md`'s print rule (`@page { size: 80mm auto }`, white background, black text) mirrors the server's so a browser print of the app shell matches the receipt.

## 2. Data

| Endpoint | Fields |
| --- | --- |
| `GET /api/transactions?from&to&method&status&q&page&limit` | `items[].{id,number,sessionId,consoleCode,customerName,cashierName,createdAt,subtotal,extraCharge,discount,discountReason,total,paymentMethod,paymentStatus,amountPaid,changeDue,status,voidReason,voidBy,voidedAt}` + `meta:{total,page,limit}` + `totals:{count,gross,paid,outstanding}` |
| `GET /api/transactions/:id` | `{transaction, items, session, cashier, console}` |
| `POST /api/transactions/:id/void` | `{reason}` → `{transaction}` status `void` |
| `GET /api/transactions/:id/receipt?format=html[&print=1]` | **HTML document**, not the JSON envelope |
| `GET /api/settings` | `business.{name,address,phone,receiptFooter,taxNote}` — shown on the on-screen receipt fallback only; the server document already embeds them |

Money is INTEGER rupiah end-to-end (`api-contract.md` T-note). `changeDue` is `0` for non-cash — the change-due row is therefore **hidden**, not rendered as `Rp 0`, for transfer/QRIS.

## 3. States

| State | Rendering |
| --- | --- |
| **Default** | list for today, newest first |
| **Loading** | 5 skeleton rows (table) / 4 skeleton cards (phone) + a skeleton totals strip |
| **Empty (none in range)** | `EmptyState icon={Receipt}` — *"Belum ada transaksi pada rentang ini"* — *"Transaksi akan tercatat setelah kasir menyelesaikan sesi rental."* — **"Ubah rentang"** |
| **Empty (filtered)** | *"Tidak ada transaksi dengan filter ini"* + **"Hapus filter"** |
| **Error (list)** | inline: `TriangleAlert` + *"Gagal memuat daftar transaksi."* + **"Coba Lagi"** |
| **Error (detail)** | page-level `EmptyState variant="error"` — *"Transaksi tidak ditemukan."* — *"Data mungkin sudah dipindahkan atau nomor tidak valid."* — **"Kembali ke daftar"**. `404` is a normal, expected outcome for a mistyped URL |
| **Error (receipt)** | toast error *"Struk gagal dibuka. Izinkan pop-up untuk situs ini lalu coba lagi."* (pop-up blocked) or *"Struk tidak dapat dimuat."* (non-200 on the receipt endpoint) |
| **Success (void)** | toast *"Transaksi TRX-20261019-0007 dibatalkan."* + the row's badge flips to **Dibatalkan** in place, no page jump |
| **Disabled** | **Batalkan Transaksi** is disabled with `title` *"Transaksi ini sudah dibatalkan."* when `status === 'void'`; the whole action is absent for a cashier |
| **Permission denied** | cashier sees no void action. A stale tab that POSTs `T3` gets `403` → toast *"Anda tidak memiliki izin untuk membatalkan transaksi."* |
| **Outstanding** | `paymentStatus: 'unpaid'` renders the amber **Belum Bayar** badge and is counted in `totals.outstanding`; the detail shows a `caption` *"Tagihan belum dibayar. Jumlah ini belum dihitung sebagai pendapatan tercatat."* |

## 4. Form — Batalkan Transaksi (admin)

`ConfirmDialog tone="destructive"` + `requireText`. Fields:

| Field | Type | Label | Req | Rules + Indonesian messages |
| --- | --- | --- | --- | --- |
| `reason` | Textarea rows=3 | **Alasan pembatalan** | yes | hint *"Alasan dicatat pada riwayat audit."*; empty → *"Isi alasan pembatalan."*; min 5 chars → *"Alasan minimal 5 karakter."*; max 200 → *"Alasan maksimal 200 karakter."* |
| — | Input | **Ketik nomor transaksi untuk konfirmasi** | yes | must equal `transaction.number` exactly → *"Nomor transaksi tidak cocok."*; confirm button stays disabled until it matches |

Title: *"Batalkan transaksi TRX-20261019-0007?"*
Description: *"Transaksi tidak dihapus. Statusnya berubah menjadi Dibatalkan dan otomatis dikecualikan dari perhitungan pendapatan. Tindakan ini dicatat pada riwayat audit."*
Confirm label: **"Batalkan Transaksi"**; `loading` → *"Memproses…"*; cancel **"Kembali"**.

## 5. Interactions

| Element | Action | Confirmation | Toast |
| --- | --- | --- | --- |
| Row **Cetak Struk** / detail **Cetak Struk** | open `receipt?format=html` in a new tab | — | error toast only on block/failure |
| Post-pay **Cetak Struk** | `receipt?format=html&print=1` | — | as above |
| Row **Detail** / row tap | `/transaksi/:id` | — | — |
| Detail **Sesi terkait** | `/sesi/:id` | — | — |
| **Batalkan Transaksi** | `POST /:id/void` | `ConfirmDialog` + required reason + typed number | *"Transaksi TRX-… dibatalkan."* |
| Filter / search | refetch (300 ms debounce on search) | — | — |
| Totals strip cell | applies the corresponding filter (Dibayar → `status=paid`, etc.) | — | — |

`Ctrl/⌘ + P` on the detail screen opens the receipt and prints it, rather than printing the app shell — the shell has nothing worth printing.

## 6. Responsive

| | 360 px | 768 px | 1280 px |
| --- | --- | --- | --- |
| List | **cards**: title = `number`, `dl` of Waktu/Pelanggan/Unit/Total/Metode/Status, footer = Cetak + Detail | table, 9 columns, `stickyHeader` | table + `DateRangePicker` inline + 8 more rows visible |
| Totals strip | 2×2 grid of cells, 8 px gap | single row of 4 | single row of 4 |
| Detail cost rows | label above value, right-aligned value | label…value with dot leader | same, `max-w-2xl` |
| Receipt preview | iframe scaled to fit width, paper panel 80 mm outlined | centred 80 mm panel | centred 80 mm panel |
| Filters | pill tabs + drawer | inline row | inline row |

## 7. Keyboard

| Key | Action |
| --- | --- |
| `/` | focus search |
| `Enter` on a focused row | open detail |
| `Ctrl/⌘ + P` | receipt preview + print |
| `Esc` | close drawer/dialog |
| `Tab` | list → totals cells → rows → row actions, in visual order |

## 8. Accessibility

1. **Receipt iframe** has a `title` that includes the transaction number — an untitled iframe is invisible to assistive tech.
2. **The receipt is served as real HTML** with real text, so it is readable by a screen reader and by a text-based print-to-PDF. It is not a canvas and not an image.
3. **Voided state** is icon (`Ban`) + text (**Dibatalkan**) + colour, plus the plain-language sentence about revenue exclusion. The total is not struck through.
4. **"Belum Dibayar" vs "Dibayar"** are separate labelled cells with different numbers — never the same figure in a different colour.
5. **Number formatting** is `Rp 25.000` everywhere via a single `formatIDR` helper; `.tnum` on every amount so columns align for someone scanning for an amount.
6. **Destructive dialog** traps focus, `Esc` cancels, `aria-describedby` links the description, and the typed-number confirmation is announced as a required field.
7. **Contrast** — `--color-success` `#34D399` on `--color-surface` (9.19:1) for Kembalian, `--color-danger-text` `#FCA5A5` (9.31:1) for the void block, all tokens from `DESIGN.md` §3.
8. **Loading a receipt is announced** — while the new tab/iframe resolves, the trigger button shows `loading` so the user is not left wondering whether the tap registered.
9. **`lang="id"`** on the receipt document too, so a screen reader reads `Rp` and Indonesian dates correctly.
