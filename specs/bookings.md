# specs/bookings.md — Booking / Reservasi

**Purpose.** Reserve a console for a future date and time, see the day's schedule without collisions, and check a customer in so the reservation becomes a live rental session — without ever creating a double rental.
**Primary user.** **Kasir** (taking a phone booking or a walk-in reservation). Admin uses the same screen. Both 👤 on every endpoint (`B1`–`B6`).
**Single most important action.** **Check-in** — turn a reservation into a running session.

---

## 1. Layout (mobile first, stacked regions)

1. **Page header** — `h1` *"Booking"*; right side (≥ 768) **"Booking Baru"** primary + a view toggle **Jadwal / Daftar** (persisted).
2. **Date strip** — 7 day chips centred on the selected date (yesterday → +5 days), each showing day abbreviation + date number + a `caption` count of bookings that day. Selected chip = `--color-accent` fill, white label. Left/right `IconButton`s (`ChevronLeft`/`ChevronRight`) step a day; horizontal scroll at 360. Default = today (Jakarta). Feeds `?date=YYYY-MM-DD`.
3. **Filter row** — status `Select` (Semua · Menunggu · Dikonfirmasi · Check-in · Selesai · Dibatalkan · **Kedaluwarsa**), console `Select`, search `Input` (`nama pelanggan`). At 360 the status filter collapses into a single `Tabs pill` scroller: *Semua · Menunggu · Dikonfirmasi · Kedaluwarsa*, with the rest folded behind the filter drawer. **Kedaluwarsa must be reachable at 360** — it is the list the cashier has to act on (see §3).
4. **At-risk banner** — when any `confirmed` booking in view has `isExpired: true`, a `--color-danger-soft` block: `CalendarX` + *"1 booking kedaluwarsa"* + *"Tandai selesai atau batalkan agar jadwal unit tidak terkunci."* + an inline **"Tampilkan"** action that sets the status filter to Kedaluwarsa.
5. **Content — two views:**
   - **Jadwal (timeline, default ≥ 768):** one row per console (from `GET /api/consoles`), a horizontal time axis 08:00 → 24:00 in 30-minute gridlines. Each booking is a block positioned by `startTime` + `durationMinutes`, coloured by status tone (soft fill + text colour from `DESIGN.md` §7), showing `customerName` + `HH:mm–HH:mm`. Overlapping-free is guaranteed by the server, so blocks never overlap on one row. `aria-label` per block.
   - **Daftar (list, default 360):** `DataTable` → cards. Card: title = `customerName` (`primary`); `dl` of **Unit** `consoleId`→console code, **Tanggal** `19 Okt 2026`, **Waktu** `20.15 – 21.15`, **Durasi** `60 menit`, **Estimasi Biaya** `Rp 25.000` (`.tnum`), **Status** `StatusBadge`; footer actions per §5.
6. **Bottom action bar** (< 640) — **"Booking Baru"** `size="lg" fullWidth`.

Layout note: `booking.discount` from `B3` is accepted by the API but the field is only rendered for admin (see §4 #8); the estimate shown to a cashier is computed from the console's `hourlyRate` and `durationMinutes`.

## 2. Data

| Endpoint | Fields |
| --- | --- |
| `GET /api/bookings?date=YYYY-MM-DD&from&to&status&consoleId&q` | `items[].{id,consoleId,customerName,customerContact,bookingDate,startTime,durationMinutes,status,notes,discount,isExpired}` + `meta` |
| `GET /api/bookings/:id` | `{booking}` |
| `GET /api/consoles` | `id, code, consoleType, roomType, hourlyRate, status` — for the timeline rows, the console select, and the estimate |
| `POST /api/bookings` | `{consoleId,customerName,customerContact?,bookingDate,startTime,durationMinutes,notes?,discount?}` → `201 {booking}` |
| `PATCH /api/bookings/:id` | partial `{customerName?,contact?,bookingDate?,startTime?,durationMinutes?,status?,notes?,consoleId?}` → `{booking}` (any schedule change re-runs the conflict check) |
| `POST /api/bookings/:id/check-in` | `{durationMinutes?}` → `201 {session}`, booking becomes `checked_in` |
| `POST /api/bookings/:id/cancel` | `{reason?}` → `{booking}` status `cancelled`, slot released immediately. **409 `BOOKING_ALREADY_CHECKED_IN`** when the booking is already checked in (`status = 'checked_in'` or `session_id` is set) — neither the booking nor its session is touched |
| `GET /api/sessions/active` | to grey out consoles that are currently busy and to decide whether check-in is possible |

**Conflict details** arrive on `409 BOOKING_CONFLICT` as `error.details: [{conflictingBookingId, startTime, endTime}]` — used verbatim in the inline warning (§4).

**Cancelling a booking that is already checked in is refused.** After check-in the slot is occupied by a running session; cancelling the booking would free the schedule while the session is still running. The server answers **409 `BOOKING_ALREADY_CHECKED_IN`** and changes nothing — the operator has to finish (or void) the session first.

## 3. States

| State | Rendering |
| --- | --- |
| **Default** | day strip + list/timeline for the selected date |
| **Loading** | 3 skeleton cards (or timeline rows = a grey axis with shimmer blocks) |
| **Empty (no bookings that day)** | `EmptyState icon={CalendarPlus}` — *"Belum ada booking pada 19 Okt 2026"* — *"Buat booking baru agar jadwal unit tidak bentrok dengan pelanggan lain."* — **"Booking Baru"** |
| **Empty (filtered)** | *"Tidak ada booking dengan filter ini"* + **"Hapus filter"** |
| **Empty (no consoles)** | `EmptyState` — *"Belum ada unit PS"* — *"Tambah unit terlebih dahulu sebelum membuat booking."* — **"Tambah Unit"** |
| **Error (list)** | inline: `TriangleAlert` + *"Gagal memuat daftar booking."* + **"Coba Lagi"** |
| **Error (save)** | inside the form; conflict gets the dedicated treatment in §4 |
| **Error (cancel)** | `409 BOOKING_ALREADY_CHECKED_IN` → the `ConfirmDialog` closes and an error toast reads *"Booking ini sudah check-in, jadi tidak bisa dibatalkan. Selesaikan sesinya dulu."* Neither the booking nor its session changes. |
| **Success (create)** | toast *"Booking Budi pada PS-01, 19 Okt 2026 20.15 berhasil dibuat."* |
| **Success (edit)** | toast *"Booking atas nama Budi diperbarui."* |
| **Success (check-in)** | toast *"Check-in berhasil — sesi PS-01 dimulai."* + navigate to `/sesi/:id` |
| **Success (cancel)** | toast *"Booking atas nama Budi dibatalkan. Jadwal unit kembali tersedia."* |
| **Disabled** | **Check-in** only enabled when `status === 'confirmed'`; for `pending` it is `disabled` with `title` *"Konfirmasi booking terlebih dahulu."*; when the console is occupied it is `disabled` with *"Unit sedang dipakai."* (server also returns `409 BOOKING_NOT_CONFIRMED` / `409 UNIT_OCCUPIED`) |
| **Permission denied** | none by design — every `B*` endpoint is 👤. The screen states this with no admin-only controls. |
| **Expired** | a `confirmed` booking with `isExpired: true` renders the `CalendarX` badge **Kedaluwarsa**, moves to the top of the list, and offers exactly two actions: **Tandai Selesai** (`PATCH status:'completed'`) and **Batalkan** (`B6`). It is never auto-deleted or auto-completed (`api-contract.md` auto-complete rule). |

## 4. Form — Booking Baru / Ubah Booking

`Modal size="md"` (bottom sheet at 360). Title *"Booking Baru"* / *"Ubah Booking"*.

| # | Field | Type | Label | Req | Rules + Indonesian messages |
| --- | --- | --- | --- | --- | --- |
| 1 | `customerName` | Input | **Nama pelanggan** | yes | placeholder `Contoh: Budi`; empty → *"Isi nama pelanggan."*; min 2 → *"Nama pelanggan minimal 2 karakter."*; max 60 → *"Nama pelanggan maksimal 60 karakter."* |
| 2 | `customerContact` | Input `inputMode="tel"` | **Kontak (opsional)** | no | hint *"Nomor HP, opsional. Dipakai untuk menghubungi pelanggan."*; max 40; non-digit-heavy input → *"Kontak hanya boleh angka, spasi, dan tanda + atau -."* |
| 3 | `consoleId` | Select size="lg" | **Unit** | yes | options `PS-01 · PS5 · VIP · Rp 25.000/jam`; consoles currently `in_use` render `disabled` with suffix *"(sedang dipakai)"*; empty → *"Pilih unit."* |
| 4 | `bookingDate` | Input `type="date"` | **Tanggal** | yes | `min` = today (Jakarta); past → *"Tanggal booking tidak boleh di masa lalu."*; empty → *"Pilih tanggal booking."* |
| 5 | `startTime` | Input `type="time"` | **Waktu mulai** | yes | step 300 (5 min); empty → *"Pilih waktu mulai."*; outside 08:00–23:59 → *"Waktu mulai di luar jam operasional (08.00–24.00)."*; combined with #4 must be ≥ now → *"Waktu mulai tidak boleh di masa lalu."* |
| 6 | `durationMinutes` | Input numeric size="lg" | **Durasi (menit)** | yes | suffix *"menit"*; quick chips `+30 +60 +120`; empty → *"Isi durasi dalam menit."*; `< 30` → *"Durasi minimal 30 menit."*; `> 480` → *"Durasi maksimal 480 menit."* |
| 7 | `notes` | Textarea rows=2 | **Catatan (opsional)** | no | maxLength 200 + counter |
| 8 | `discount` | Input prefix="Rp" | **Diskon (opsional)** | no | **admin only**; hint *"Kosongkan jika tanpa diskon."*; not a non-negative integer → *"Diskon harus berupa angka."*; `> subtotal` → server caps at subtotal; client shows `caption` *"Diskon dibatasi maksimal sebesar subtotal."* |
| 9 | `status` | Select | **Status** | yes | edit mode only; Menunggu · Dikonfirmasi · Check-in · Selesai · Dibatalkan. Choosing **Check-in** here is refused with *"Gunakan tombol Check-in agar sesi rental dibuat."* — status is set via the action, never by hand, so a session can never be skipped into existence. |

**Estimate block** (read-only, below duration): `Tarif Rp 25.000/jam` · `Durasi 60 menit` · **`Estimasi biaya Rp 25.000`** (`.tnum`) · `caption` *"Estimasi. Tagihan akhir dihitung saat sesi selesai."*

**Endpoint `startTime`, end time and conflict.** The end time is derived and shown: *"20.15 – 21.15"*. If the server returns `409 BOOKING_CONFLICT`, the dialog **stays open** and an inline warning appears directly under the `startTime` field:

> `--color-warning-soft` block, `CalendarX`:
> **"Jadwal PS-01 sudah terisi."**
> *"Bentrok dengan 20.00–21.00. Pilih waktu lain atau unit lain."*
> (the `startTime`/`endTime` come from `error.details[0]`; if `details` is empty the second line reads *"Pilih waktu lain atau unit lain."*)

The `startTime` field is highlighted with `--color-warning` and focus moves to it. Changing `startTime`, `durationMinutes`, `bookingDate` or `consoleId` clears the warning until the next submit.

Footer: **"Simpan Booking"** (`primary`, `loading` → *"Menyimpan…"*) + **"Batal"** (`ghost`).

**Cancel** flow: `ConfirmDialog` — title *"Batalkan booking?"*, description *"Jadwal unit 20.15–21.15 akan langsung tersedia untuk pelanggan lain."*, an optional reason `Input` **Alasan (opsional)**, confirm label **"Batalkan Booking"**, cancel **"Kembali"**. Not `tone="destructive"` — cancelling releases a slot, it does not destroy history.

## 5. Interactions

| Element | Action | Confirmation | Toast |
| --- | --- | --- | --- |
| **Booking Baru** | open form | — | create toast |
| Card/timeline block tap | open detail drawer (`Drawer right`/`bottom`) | — | — |
| **Konfirmasi** (pending) | `PATCH {status:'confirmed'}` | none | *"Booking atas nama Budi dikonfirmasi."* |
| **Ubah** | open form (edit) | — | update toast |
| **Check-in** | `POST /:id/check-in` with optional `durationMinutes` override | `Modal size="sm"` summary: unit, pelanggan, durasi (editable, defaulting to `durationMinutes`), *"Sesi akan dimulai sekarang dan dihitung dari waktu sekarang."* | check-in toast + route to `/sesi/:id` |
| **Batalkan** | `POST /:id/cancel` | `ConfirmDialog` + optional reason | cancel toast |
| **Tandai Selesai** (expired/confirmed) | `PATCH {status:'completed'}` | none | *"Booking ditandai selesai."* |
| Day chip | change `?date=` | — | — |
| View toggle | Jadwal ↔ Daftar | — | — |

Double-submit guard applies to **Check-in** exactly as in `specs/sessions.md` §9: `loading` + **"Memproses…"** + disabled, plus a ref latch. A double check-in would be the single worst defect this screen could ship.

## 6. Responsive

| | 360 px | 768 px | 1280 px |
| --- | --- | --- | --- |
| Date strip | 7 chips, horizontal scroll, 44 px tall | all 7 visible, 1 week | all 7 + a `DateRangePicker` for jumping |
| Default view | **Daftar** (cards) | **Jadwal** (timeline) | Jadwal, taller rows, 08:00–24:00 fully visible |
| Timeline | hidden (not shrunk — a 30-min block is unreadable at 360) | 30-min gridlines, day scrolls horizontally inside the panel | full day fits |
| Form | bottom sheet, `92dvh`, scrollable | `Modal md` | `Modal md` |
| Actions | card footer, 2 primary + overflow menu | inline row buttons | inline row buttons |
| New booking | sticky bottom bar | page-header button | page-header button |

## 7. Keyboard

| Key | Action |
| --- | --- |
| `/` | focus search |
| `N` | open *Booking Baru* |
| `← / →` | previous/next day (only when focus is inside the date strip) |
| `Esc` | close the topmost dialog/drawer |
| `Enter` | submit the open form |

No `F`-key shortcuts: a cashier already has `F2` for a live session, and overloading function keys costs more than it saves.

## 8. Accessibility

1. **Timeline blocks** are `<button>`s (or `<a>`s) with `aria-label` *"Booking Budi, PS-01, 20.15 sampai 21.15, Dikonfirmasi"* — a coloured block is meaningless without a name.
2. **Status is icon + label + colour** at every size; on the timeline block the label is inside the block when it fits (≥ 60 min) and in the tooltip/detail otherwise, with the icon always present.
3. **Expired bookings** announce on load in a `role="status"` region: *"1 booking kedaluwarsa pada 19 Okt 2026."*
4. **Conflict warning** is `role="alert"` and is wired to the `startTime` field via `aria-describedby`, so a screen reader hears the clashing times.
5. **Check-in dialog** traps focus; the duration override is the first field; `Esc` cancels; focus returns to the Check-in button.
6. **Date inputs** are native `<input type="date">` / `type="time"` — correct mobile pickers, correct locale handling, no custom calendar widget (product ban on reinvented form controls).
7. **Colour independence** — the timeline conveys lane (which console) by row position and label, not only by colour; the same booking appears in the Daftar view for anyone who cannot use the graphic.
8. **Contrast** — every status tone used on a soft fill is verified in `DESIGN.md` §3.6 (lowest 6.18:1); the day chip's white-on-`--color-accent` is 5.70:1.
9. **Natural reading order** in the card view: title (who) → unit → when → duration → estimate → status → actions.
