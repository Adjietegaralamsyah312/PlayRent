# specs/reports.md — Laporan & Riwayat

**Purpose.** Answer the owner's four questions from real transaction data: how much came in, from which units, through which payment methods, and what never got paid.
**Primary user.** **Admin/pemilik** — this is the one screen where the cashier has no job. Cashier access is not removed (every `R*` endpoint is 👤), but the sidebar entry is admin-only by convention so the counter stays uncluttered.
**Single most important action.** **Pilih rentang tanggal** — every number on the page is meaningless until the range is right.

`plan.md` §K is unambiguous: **recorded revenue and unpaid/estimated revenue are never merged.** That rule drives the whole layout: the two figures are separate labelled cells, separate table columns, and separate chart series.

---

## 1. Layout (mobile first, stacked regions)

1. **Page header** — `h1` *"Laporan"*; right side (≥ 768) **"Ekspor CSV"** (`Download`) with a format `Select`.
2. **Range bar** — `DateRangePicker` with presets (Hari Ini · Kemarin · 7 Hari Terakhir · Bulan Ini · Bulan Lalu) plus `from`/`to`. Selected range echoed in `body-sm`: *"19 Okt 2026 – 19 Okt 2026"*. Changing the range refetches every panel; the URL carries `?from&to` so the owner can bookmark or send a link.
3. **Ringkasan keuangan** — from `R1`. Two rows, deliberately not one blended total:
   - **Pendapatan tercatat** — `revenueRecorded`, `--text-num-xl`, `--color-success` accent word, `.tnum`. `caption`: *"Transaksi berstatus Lunas."*
   - **Belum dibayar** — `revenueOutstanding`, `--text-num-xl`, `--color-warning`. `caption`: *"Tagihan berstatus Belum Bayar. Tidak dihitung sebagai pendapatan."*
   - A second dense strip below: `Transaksi {transactionCount}` · `Sesi {sessionsCount}` · `Total Durasi {totalMinutes} menit` (rendered as `48j 30m`) · `Rata-rata/Transaksi Rp {avgPerTransaction}` · `Dibatalkan {voidedCount}` (tone `danger`, links to `/transaksi?status=void`).
4. **Bucket tabs + chart** — `Tabs` **Harian · Mingguan · Bulanan** driving `R2`/`R3`/`R4`; `Chart type="bar"` of `revenue` per bucket. Bucket labels come from the server: `2026-10` (monthly), `2026-W42` (weekly), `2026-10-19` (daily, displayed `19 Okt`). Bars render the **recorded** revenue; the tooltip additionally shows `transactions` and `sessions`.
5. **Performa unit** — from `R5`. `DataTable` columns: **Unit** (`code`, `primary`) · **Jenis** (`consoleType`) · **Ruangan** (`roomType`) · **Sesi** (`numeric`) · **Durasi** (`numeric`, `1j 30m`) · **Pendapatan** (`numeric`, `Rp 320.000`) · **Utilisasi** (`numeric`, `utilizationPct` → a `Chart type="bar"`-style inline meter: a 1 px `--color-border` track with a `--color-cyan` fill and the `%` as text). Sorted by `revenue` descending. A `caption` explains the metric: *"Utilisasi = total durasi sewa dibagi jam operasional 08.00–24.00 pada rentang ini."*
6. **Metode & status pembayaran** — from `R6`. A small breakdown table: method, count, total, and a status sub-total for `paid` / `unpaid` / `void`. Same dense treatment; `.tnum` on every figure.
7. **Riwayat pembayaran** — from `R6` `items`. `DataTable`: **Waktu** · **No. Transaksi** (`primary`) · **Pelanggan** · **Metode** · **Total** (`numeric`) · **Status** (`StatusBadge`).
8. **Detail sesi rental** — from `R7`-equivalent data already loaded (`sessions` type export) or the sessions list filtered to the range: a link out to `/sesi?from=&to=`. The full session detail lives on the sessions screen; duplicating it here would be a worse version of a screen that already exists.
9. **Bottom action bar** (< 640) — **"Ekspor CSV"** `size="lg" fullWidth` (opens a bottom sheet to pick the type).

## 2. Data

| Endpoint | Fields |
| --- | --- |
| `GET /api/reports/summary?from&to` | `{revenueRecorded, revenueOutstanding, transactionCount, sessionsCount, totalMinutes, avgPerTransaction, voidedCount}` |
| `GET /api/reports/daily?from&to` | `items[].{date, revenue, transactions, sessions, minutes}` |
| `GET /api/reports/weekly?from&to` | same shape, `date` = `2026-W42` |
| `GET /api/reports/monthly?from&to` | same shape, `date` = `2026-10` |
| `GET /api/reports/units?from&to` | `items[].{consoleId, code, consoleType, roomType, sessions, minutes, revenue, utilizationPct}` |
| `GET /api/reports/payments?from&to&method&status` | `{items, totals}` |
| `GET /api/reports/export.csv?type=sessions\|transactions\|units\|daily&from&to` | `text/csv; charset=utf-8`, BOM-prefixed, filename `playrent-{type}-{from}-{to}.csv` |

`from`/`to` are **inclusive Jakarta-local dates** (`YYYY-MM-DD`). If omitted the server defaults to first-of-month → today; the UI mirrors that default visibly in the range bar so the number on screen is never unexplained.

**Export** is a **navigated download**, not a fetch-and-blob: `window.location.assign('/api/reports/export.csv?...')`. The cookie travels with the navigation, the browser handles the filename from `Content-Disposition`, and the BOM already makes Excel read UTF-8 — re-implementing that in the client would be strictly worse. The button shows `loading` for 800 ms (there is no reliable completion event for a navigated download) and then a toast confirms the attempt.

## 3. States

| State | Rendering |
| --- | --- |
| **Default** | current month-to-date |
| **Loading** | skeletons per panel: summary = 2 large blocks + a 5-cell strip; chart = axis box + shimmer bars; tables = 5 skeleton rows each. Panels resolve independently |
| **Empty (no transactions in range)** | `EmptyState icon={BarChart3}` — *"Belum ada transaksi pada rentang ini"* — *"Coba pilih rentang tanggal lain, atau pastikan sesi rental sudah diselesaikan dan dibayar."* — **"Ubah rentang"**. All panels show this same state, not five different zeros |
| **Empty (units panel, no units)** | `caption` *"Belum ada unit PS yang tercatat."* |
| **Empty (payments panel)** | `caption` *"Belum ada pembayaran pada rentang ini."* |
| **Error (per panel)** | inline: `TriangleAlert` + *"Gagal memuat {nama panel}."* + **"Coba Lagi"**; other panels keep their data |
| **Error (range invalid)** | field-level on the picker: *"Tanggal mulai tidak boleh melewati tanggal akhir."*; the previous range's data stays on screen rather than blanking |
| **Error (export)** | toast error *"Ekspor gagal. Coba lagi atau persempit rentang tanggal."* |
| **Success (export)** | toast info *"Mengunduh playrent-transactions-2026-10-01-2026-10-19.csv."* — names the file so the owner can find it in Downloads |
| **Disabled** | **Ekspor CSV** disabled with `title` *"Pilih rentang tanggal terlebih dahulu."* when the range is invalid; bucket tabs disabled while a bucket fetch is in flight |
| **Permission denied** | for a cashier the page renders read-only with the same numbers (no `R*` endpoint is admin-only). No destructive control exists here, so there is nothing to hide but the sidebar entry |
| **Large range warning** | when the range exceeds 366 days, an inline `--color-warning-soft` note appears above the chart: *"Rentang lebih dari satu tahun. Gunakan tampilan Bulanan agar grafik tetap terbaca."* and the bucket tabs default to **Bulanan** |

## 4. Field-level specs

| Field | Type | Label | Req | Rules + Indonesian messages |
| --- | --- | --- | --- | --- |
| `from` | date | **Dari tanggal** | yes | empty → *"Pilih tanggal mulai."*; future → *"Tanggal tidak boleh melewati hari ini."* |
| `to` | date | **Sampai tanggal** | yes | empty → *"Pilih tanggal akhir."*; `from > to` → *"Tanggal mulai tidak boleh melewati tanggal akhir."* |
| `type` (export) | Select | **Jenis data** | yes | Sesi Rental (`sessions`) · Transaksi (`transactions`) · Performa Unit (`units`) · Rekap Harian (`daily`); no default — the user must choose, because guessing would export the wrong file |

Presets fill both fields. `maxDate` = today (Jakarta). The range is pushed to the URL on change (replaceState) so a reload keeps context.

## 5. Interactions

| Element | Action | Confirmation | Toast |
| --- | --- | --- | --- |
| Range preset / date input | refetch all panels, update URL | — | — |
| Bucket tab Harian/Mingguan/Bulanan | refetch the chart only | — | — |
| Chart bar | hover → tooltip (label, `revenue`, `transactions`, `sessions`) | — | — |
| Chart bar click | drill to `/laporan?from=<bucket start>&to=<bucket end>` with the bucket's own range | — | — |
| Unit row | `/unit?q=<code>` | — | — |
| `Dibatalkan` cell | navigate to `/transaksi?status=void&from&to` | — | — |
| **Ekspor CSV** | bottom sheet to pick `type`, then navigate-download | sheet is the confirmation | export toast |
| `Ctrl/⌘ + P` | print the report | — | — |

## 6. Print

`plan.md` §K requires a clean print view. Rules:
- A `@media print` stylesheet (from `DESIGN.md` §2) forces the light surface: white background, near-black text, borders in a mid grey. The dark theme is a screen affordance, not a printing one — printing it would waste a cartridge and be illegible.
- Printed output: the range in the header, the two revenue figures, the summary strip, the per-unit table, and the payment breakdown. **Charts are omitted** (bars of a dark theme on paper are noise) and replaced by a printed bucket table. Explicit, not accidental.
- The sidebar, bottom nav, filter bar and all buttons are `display: none` in print.
- `@page { size: A4; margin: 12mm }` for the report (the receipt's 80 mm rule is scoped to the receipt document only).

## 7. Responsive

| | 360 px | 768 px | 1280 px |
| --- | --- | --- | --- |
| Range bar | preset chips scroll + `from`/`to` stacked | preset chips + both dates inline | + a `Minggu/Month/YTD` shortcut row |
| Revenue figures | stacked, full width, 32 px | side by side, 36 px | side by side, 36 px |
| Summary strip | 2×3 grid | single row of 6 | single row of 6 |
| Chart | 180 px tall | 240 px | 280 px, span 8 with the units table beside it (span 4) |
| Tables | cards with a `dl` | table | table + more rows |
| Export | sticky bottom bar → sheet | header button + `type` select | header button + `type` select |
| Month labels | `Okt`, 2-char months to keep 7 ticks readable | full `Okt 2026` | full |

## 8. Keyboard

| Key | Action |
| --- | --- |
| `D` | focus *Dari tanggal* |
| `E` | trigger *Ekspor CSV* (opens the sheet; the download itself needs one more confirm — deliberate) |
| `1 / 2 / 3` | switch Harian / Mingguan / Bulanan (only while the bucket tablist has focus) |
| `← / →` | move between chart bars when the chart has focus; `Enter` drills in |
| `Ctrl/⌘ + P` | print the report |

`E` never downloads immediately: a browser download is hard to undo in the wrong format, and the sheet costs one keystroke.

## 9. Accessibility

1. **Both revenue figures carry a text label and a different caption** — the recorded/unpaid distinction is never carried by colour alone (`DESIGN.md` §7 / `plan.md` §K). If a sighted-only distinction were used, a colour-blind owner would overstate income.
2. **Charts need `ariaSummary`** — each chart receives a real sentence, e.g. *"Pendapatan tercatat 19 Okt 2026 sampai 19 Okt 2026, total Rp 1.240.000, tertinggi 19 Okt sebesar Rp 320.000."* The SVG is `role="img"` with `aria-label`; the bars are individually focusable only when they drill in, and then each has an `aria-label` naming its bucket and value.
3. **The inline utilisation meter** is not a colour-only bar: it renders the numeric `utilizationPct` as text next to the track, and the track's `role="img"` has `aria-label` *"Utilisasi 62 persen"*.
4. **`totalMinutes`** is rendered human-readably (`48j 30m`) with the exact integer available to assistive tech via `title` — a raw `2910` in a table is unusable.
5. **Bucket tab panels** use `role="tabpanel"` + `aria-labelledby`; switching announces the new panel via `role="status"`.
6. **Print view is real text**, not a screenshot of the screen; the printed report is therefore accessible to a screen reader in a PDF too.
7. **`avgPerTransaction`** is labelled with its unit (*"Rata-rata per Transaksi"*), so a bare `Rp 137.777` is never ambiguous.
8. **Contrast** — recorded revenue uses `--color-success` `#34D399` on `--color-surface` (9.19:1); outstanding uses `--color-warning` `#FBBF24` on `--color-surface` (10.59:1); the voided count uses `--color-danger-text` `#FCA5A5` (9.31:1); muted captions 5.51:1. All from `DESIGN.md` §3.
9. **Reduced motion** — the chart's bar entrance animation is disabled; the final state is rendered directly.
10. **`<html lang="id">`**, and exported CSVs carry a UTF-8 BOM so Indonesian text survives a round-trip through Excel — the accessibility benefit is a bonus of correctness.
