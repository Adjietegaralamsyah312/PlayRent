# specs/dashboard.md — Dashboard Operasional

**Purpose.** At a glance: what is running, what is about to run out, how today is going, and what just happened. Also the admin's entry point to revenue.
**Primary user.** **Kasir** for the top half (units + ending-soon); **admin** for the revenue and activity half. Both land here from the sidebar; cashier's default route is `/sesi` (`login.md` §2) but the Dashboard is always reachable.
**Single most important action.** **Tambah Waktu** on an ending-soon session — the dashboard exists to catch a customer before they run out of time.

---

## 1. Layout (mobile first, stacked regions)

`plan.md` §E lists exactly what must be here; nothing decorative is added to that list.

1. **Page header** — `h1` *"Dashboard"*; `caption` *"19 Okt 2026, 20.15 · Selamat malam"* (Jakarta date + a time-of-day greeting derived from the hour: *Selamat pagi/siang/sore/malam*). Right side (≥ 768): `DateRangePicker` scoping only the two charts, presets defaulting to *7 Hari Terakhir*.
2. **Unit metric strip** — one dense horizontal strip, **not** four decorative cards (`DESIGN.md` §11 #4). A single `Card padding="sm"` containing five cells separated by 1 px `--color-divider`:
   `Total 12` · `Tersedia 5` · `Sedang Bermain 4` · `Dipesan 2` · `Perawatan 1`.
   Each cell = `caption` label above a `num` value (`.tnum`), with a 8 px status dot in the cell's status colour. Values from `summary.units.{total,available,inUse,reserved,maintenance}`. Tapping a cell navigates to `/unit?status=<value>`. Horizontal scroll at 360 with the last cell half-visible as the affordance.
3. **Hari Ini row** — three values from `summary.today`: `Sesi 14` · `Transaksi 9` · `Pendapatan Rp 1.240.000`. Same dense treatment, one row, `.tnum`. **The revenue figure is labelled "Pendapatan tercatat"** — `plan.md` §K demands recorded revenue be distinguishable from estimates, and this label is the first place that distinction appears.
4. **Sesi segera selesai** — from `GET /api/dashboard/ending-soon`. Cards (up to 5), each: console code (`h3`) + customer name (`body-sm`) + live `Timer` + **"Tambah Waktu"** button + **"Detail"** link. Sorted overdue → critical → warn, then by `remainingSeconds` ascending. `aria-live="polite"` region so a newly-ending session is announced.
5. **Grafik pendapatan** — `Chart type="bar"` from `GET /api/dashboard/revenue-chart?groupBy=day|week|month` (`buckets[].label, revenue, transactions`). Grouping follows the selected range: ≤ 31 days → `day`, ≤ 180 days → `week`, else `month`. Chart appearance per `DESIGN.md` §8.
6. **Jam ramai** — `Chart type="line"` from `GET /api/dashboard/busy-hours` (`hours[].hour, sessions, revenue`). X axis labels `00`…`23` (at most 7 shown, every 4th hour). Value shown is `sessions` by default with a `Tabs` toggle `Sesi | Pendapatan` in the section header.
7. **Aktivitas terbaru** — from `GET /api/dashboard/activity`, last 20 `{type, at, description, actor, refId}`. A vertical list, **not** cards: a 2 px `--color-border` timeline rule with an icon node per row (`PlayCircle` session_started · `CircleCheck` session_finished · `CalendarPlus` booking_created · `Ban` transaction_voided), `description` in `body`, `actor` + Jakarta time in `caption`. A `voided` row uses `--color-danger-text` and is visible to admin only.
8. **Quick actions** (`StickyActionBar`, < 640) — **"Mulai Sesi"** (primary) + **"Booking Baru"** (secondary). At ≥ 768 these move into the page header.

Desktop (≥ 1280): 12-column grid — metric strip full width; ending-soon (span 4) / revenue chart (span 8); busy-hours (span 8) / activity (span 4).

## 2. Data

| Endpoint | Fields used |
| --- | --- |
| `GET /api/dashboard/summary` | `units.{total,available,inUse,reserved,maintenance}`, `today.{sessions,revenue,transactions}`, `range.{revenueToday,revenueWeek,revenueMonth}` |
| `GET /api/dashboard/activity` | `items[].{type,at,description,actor,refId}` |
| `GET /api/dashboard/ending-soon` | `items[].{sessionId,consoleCode,customerName,endsAt,remainingSeconds,severity}` |
| `GET /api/dashboard/revenue-chart` | `?from&to&groupBy=day\|week\|month` → `buckets[].{label,revenue,transactions}` |
| `GET /api/dashboard/busy-hours` | `?from&to` → `hours[].{hour,sessions,revenue}` |
| `GET /api/settings` | `business.name` (greeting/header), `rules.warnMinutes` (timer escalation) |

`range.revenueToday/revenueWeek/revenueMonth` are rendered as a `caption` line under the *Hari Ini* row: *"Minggu ini Rp 7.850.000 · Bulan ini Rp 28.400.000"* — `.tnum`, `--color-text-secondary`. **Zero hardcoded figures** (`api-contract.md` D-note); if a fetch fails the number region shows `—`, never `0`.

## 3. States

| State | Rendering |
| --- | --- |
| **Default** | all regions populated |
| **Loading** | per-region skeletons: metric strip = 5 shimmer blocks 96×40; ending-soon = 2 skeleton cards; charts = axis box + shimmer bars; activity = 5 skeleton rows. Regions resolve independently — a slow chart must not blank the units. |
| **Empty — ending-soon** | a single inline line, not an empty card: `CircleCheck` + *"Tidak ada sesi yang segera selesai."* in `--color-text-muted` `body-sm`. |
| **Empty — activity** | *"Belum ada aktivitas hari ini."* + `caption` *"Aktivitas akan muncul setelah kasir memulai sesi atau membuat booking."* |
| **Empty — charts** | axis box retained, centred `body-sm` *"Belum ada data pada rentang ini."* + **"Ubah rentang"** action opening the `DateRangePicker`. |
| **Empty — no consoles at all** | if `units.total === 0`, replace regions 2–7 with one `EmptyState`: *"Belum ada unit PS"* / *"Tambahkan unit PS4 atau PS5 untuk mulai mencatat rental."* / **"Tambah Unit"** (admin) or `caption` *"Hubungi admin untuk menambahkan unit."* (cashier). |
| **Error (per region)** | inline block inside that region: `TriangleAlert` + *"Gagal memuat {nama bagian}."* + **"Coba Lagi"**. Other regions keep their data. |
| **Error (total failure)** | if all three of `summary`/`ending-soon`/`activity` fail, one page-level `EmptyState variant="error"`: *"Tidak dapat memuat dashboard."* / *"Periksa koneksi ke server lalu coba lagi."* / **"Coba Lagi"** |
| **Success** | after **Tambah Waktu** → toast *"Waktu ditambah 30 menit — PS-01 selesai 21.15."*; the row's timer immediately re-renders from the new `endsAt` |
| **Disabled** | a metric cell for a status with 0 units stays interactive (navigates to an empty filtered list) — a disabled cell hides a legitimate destination |
| **Permission denied** | revenue regions (`Hari Ini` revenue, both charts, `range.*`) and the `voided` activity rows are **admin-only**; a cashier sees the operational half and a `caption` *"Ringkasan pendapatan hanya untuk admin."* in place of the charts. Server enforces this independently (`ARCHITECTURE.md` rule 6). |

## 4. Field-level form specs

Only one input surface: the **DateRangePicker** in the header.

| Field | Label | Required | Validation |
| --- | --- | --- | --- |
| from | **Dari tanggal** | yes | empty → *"Pilih tanggal mulai."*; future → *"Tanggal tidak boleh melewati hari ini."* |
| to | **Sampai tanggal** | yes | empty → *"Pilih tanggal akhir."*; `from > to` → *"Tanggal mulai tidak boleh melewati tanggal akhir."* |

Presets: Hari Ini · Kemarin · 7 Hari Terakhir · Bulan Ini · Bulan Lalu. Selecting a preset fills both fields and refetches only the two charts. Navigator clamped with `maxDate = today (Jakarta)`.

## 5. Interactions

| Element | Action | Confirmation | Toast |
| --- | --- | --- | --- |
| Metric cell | navigate to `/unit?status=…` | none | — |
| Ending-soon **Tambah Waktu** | open the extend dialog from `specs/sessions.md` §7.1 | none | extend success toast |
| Ending-soon card | tap → `/sesi/:id` | none | — |
| Activity row | tap → the referenced entity (`refId` → session/booking/transaction detail) | none | — |
| Chart bar/line point | hover/focus → tooltip | none | — |
| Chart point click | navigate to `/laporan?from=…&to=…&focus=<bucket>` | none | — |
| Busy-hours toggle | switch series | none | — |
| Quick action **Mulai Sesi** | `/sesi/baru` | — | — |
| Quick action **Booking Baru** | `/booking/baru` | — | — |

## 6. Responsive

| | 360 px | 768 px | 1280 px |
| --- | --- | --- | --- |
| Unit strip | horizontal scroll, 5 cells, 8 px gap | all 5 visible inline | all 5 visible inline |
| Charts | one per row, 180 px tall | one per row, 240 px | revenue span 8 / busy span 4 |
| Ending-soon | full-width cards, 1 per row | 2 per row | vertical list, span 4 |
| Activity | below charts | below charts | side column, span 4 |
| Quick actions | `StickyActionBar` | page header buttons | page header buttons |
| Greeting/date | `caption` under title | inline right of title | inline right of title |

## 7. Keyboard

| Key | Action |
| --- | --- |
| `/` | focus the header search (present ≥ 768 only) |
| `N` | *Mulai Sesi* |
| `R` | refresh all dashboard regions (manual refresh — the page does not auto-poll except ending-soon) |
| `Tab` | order: header actions → metric cells → ending-soon actions → charts → activity rows. Chart SVG is focusable only when `onPointClick` is set, and then each point is a `tabindex=0` element with `aria-label` = point label + formatted value. |

## 8. Accessibility

1. **Metric strip is a definition list** (`<dl>`), not a row of divs — label/value pairs are read in order.
2. **Charts** are `role="img"` with `aria-label={ariaLabel}` **and** the caller supplies `ariaSummary` (e.g. *"Pendapatan 7 hari terakhir, total Rp 1.250.000, tertinggi 19 Okt Rp 320.000."*). A chart with no text alternative is not shipped.
3. **Ending-soon** region is `aria-live="polite"`; additions from polling are announced as *"Sesi PS-03 sisa 4 menit."* — but the region uses `aria-live="polite"` with `aria-atomic="false"` so only the new node is read, not the whole list.
4. **Timer tone** never carries meaning alone — each ending-soon card always shows the *"Segera Selesai"* / *"Hampir Habis"* / *"Lewat Waktu"* text label next to the number (`DESIGN.md` §7).
5. **Recorded vs outstanding revenue** is a text label, not a colour — the same figure in two tones would be a colour-only distinction.
6. **Contrast** — every value on `--color-surface` uses a token verified in `DESIGN.md` §3 (muted caption 5.51:1, secondary 8.98:1, primary 15.08:1).
7. **Reduced motion** — bar entrance animation and the chart-line draw are disabled; values render at final state.
8. **Polling does not steal focus** and does not reorder content the user is reading: ending-soon order updates, but if focus is inside that region the list is not re-sorted until focus leaves.
9. **Heading order** — one `<h1>` ("Dashboard"), each region an `<h2>`, each ending-soon card an `<h3>`. No skips.
