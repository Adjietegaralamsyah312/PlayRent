# specs/sessions.md — Sesi Rental & Timer  ← the most important screen in PlayRent

**Purpose.** Start, monitor, extend, finish and get paid for a live rental session.
**Primary user.** **Kasir** (mobile-first, standing at the counter, customer waiting). Admin additionally sees the full history list and can void.
**The single most important action.** **Memulai sesi** on an available console, and then **Selesaikan & Bayar**. Everything below optimises those two verbs.

`plan.md` §G calls this "fungsi paling penting dalam PlayRent". It gets the most detail, the tightest copy, and the fewest taps.

---

## 1. Screen map

Three addressable views, all under `/sesi`:

| Route | View | User |
| --- | --- | --- |
| `/sesi` | **Live board** — consoles grid + active session list | both |
| `/sesi/baru` | **Start-session flow** (full-page on phone, modal at ≥ 768) | both |
| `/sesi/:id` | **Session detail** — timer, timeline, actions, transaction link | both |

---

## 2. Layout — mobile first, stacked regions

### `/sesi` (Live board)

Regions stacked top → bottom at **360 px**:

1. **Top bar** (56 px): `h1` "Sesi Rental" + a refresh `IconButton` (`RefreshCw`) that shows last-synced text (`caption`: "Diperbarui 20.15").
2. **Segmented filter** (`Tabs` variant `pill`, scrollable): *Semua* · *Berjalan* · *Lewat Waktu*. Counts from the loaded list (`Berjalan (3)`).
3. **Search** (`Input` size lg, `Search` prefix, `inputMode="search"`): placeholder "Cari unit atau nama pelanggan". Debounced 300 ms, matches `consoleCode` / `customerName` client-side over the loaded page, and `?q=` for the server query.
4. **Ending-soon banner** — only when `GET /api/dashboard/ending-soon` returns items. A single `--color-warning-soft` block, not a stack of cards: `BellRing` + "2 sesi segera selesai" + the earliest console code, tappable to scroll to that session. `aria-live="polite"`.
5. **Live console grid** — `ConsoleCard variant="compact"` in `repeat(auto-fit, minmax(160px, 1fr))`, 8 px gap at 360 (2 columns), 12 px gap at 768 (3–4 columns). Sorted: `overdue` first, then `in_use` (soonest `endsAt` first), then `available`, then `reserved`, then `maintenance`. **Sorting by remaining time is the whole point of this screen** — a cashier must see who runs out next without reading.
6. **Active session list** — `ConsoleCard variant="full"` for each `active`/`overdue` session, with the live `Timer`, customer name, and the two actions.
7. **Bottom action bar** (`StickyActionBar`): **"+ Mulai Sesi"** (`Button variant="primary" size="lg" fullWidth iconLeft={Plus}`).
8. **Bottom nav** (56 px) from `AppShell`.

At **768 px**: regions 5 and 6 become a 2-column split (grid of cards left, list right); header gains the *Mulai Sesi* button inline, so the sticky bar disappears.
At **1280 px**: three columns — console grid (span 2) + session list (span 1); sticky bar gone; sidebar present.

### `/sesi/baru` (Start flow)

`Modal` at ≥ 768 (`size="lg"`), **bottom sheet** at < 640 (full width, `max-height: 92dvh`, scrollable body, actions pinned). See §6 for the step sequence.

### `/sesi/:id` (Detail)

Stacked: back/title header → **timer hero** → meta definition list → price breakdown → actions → transaction link → timeline.

---

## 3. Data read + written

| Endpoint | When | Fields used |
| --- | --- | --- |
| `GET /api/consoles?status=&type=&roomType=&q=&includeInactive=false` | load + refresh | `console.id, code, consoleType, roomType, controllers, hourlyRate, status, conditionNote, isActive` |
| `GET /api/sessions?status=&consoleId=&from=&to=&q=&page=&limit=` | load + refresh | `session.id, consoleId, consoleCode, customerName, customerContact, status, startedAt, endsAt, plannedMinutes, billedMinutes, extensions, notes, rateSnapshot, createdBy, finishedAt, transactionId` |
| `GET /api/sessions/active` | **poll fallback** every 30 s while the tab is visible | same + `remainingSeconds` |
| `GET /api/dashboard/ending-soon` | every 30 s | `sessionId, consoleCode, customerName, endsAt, remainingSeconds, severity` |
| `GET /api/sessions/:id` | detail view | `{session, console, transaction?}` |
| `GET /api/settings` | once per app load (shared context) | `rules.minDurationMinutes, rules.roundingMinutes, rules.overtimeRatePerHour, rules.overtimeGraceMinutes, rules.defaultHourlyRate, rules.warnMinutes, payments.methods, business.*` |
| `GET /api/packages` | in the start flow, duration step | `id, name, durationMinutes, price, consoleType, isActive` |

| Write | Body | Effect on UI |
| --- | --- | --- |
| `POST /api/sessions/quote` | `{consoleId, durationMinutes, startedAt?, extraMinutes?}` | price preview only; **no writes** |
| `POST /api/sessions` | `{consoleId, customerName, customerContact?, durationMinutes, notes?, startedAt?}` | `201 {session}` → reload board, toast, open detail |
| `POST /api/sessions/:id/extend` | `{extraMinutes}` | `{session}` → `endsAt` moves; re-render timer from new `endsAt` |
| `POST /api/sessions/:id/finish` | `{paymentMethod, amountPaid, discount?, discountReason?, extraCharge?, notes?}` | `201 {transaction}` → console returns to `available` |
| `POST /api/sessions/:id/void` | `{reason}` (admin only) | `{session}` → `void`, console `available` |

**Field placement.** `consoleCode` is the primary identifier everywhere (never the id). `customerName` is secondary. `endsAt` drives the timer. `plannedMinutes` vs `billedMinutes` are shown as *"Paket 60 menit"* vs *"Dihitung 60 menit"* on the finish sheet so the rounding rule is visible, not a surprise. `rateSnapshot` is labelled *"Tarif saat sesi dimulai"* on the finish sheet and in detail — later settings changes must visibly not apply (`ARCHITECTURE.md` rule).

---

## 4. States

| State | Rendering |
| --- | --- |
| **Default** | Grid + list as §2. |
| **Loading** | `Skeleton variant="card"` × 4 in the grid + 2 skeleton rows in the list. Never a centred spinner. Board header still visible. |
| **Empty** (no consoles at all) | `EmptyState icon={Gamepad2}` — title *"Belum ada unit PS"* — description *"Tambahkan unit PS4 atau PS5 terlebih dahulu agar bisa memulai sesi rental."* — action **"Tambah Unit"** → `/unit` (admin) / no action for cashier, with `caption` *"Hubungi admin untuk menambahkan unit."* |
| **Empty** (no active sessions, units exist) | `EmptyState icon={Timer}` — title *"Tidak ada sesi berjalan"* — description *"Pilih unit berstatus Tersedia lalu tekan Mulai Sesi untuk memulai rental."* — action **"Mulai Sesi"**. |
| **Empty** (filter matches nothing) | *"Tidak ada sesi dengan filter ini"* + **"Hapus filter"** secondary action. |
| **Error** (list fetch failed) | Inline error block at the top of the list region: `TriangleAlert` + *"Gagal memuat daftar sesi."* + `caption` with the server message + **"Coba Lagi"** button. Grid keeps whatever it already had. |
| **Error** (409 `UNIT_OCCUPIED` on start) | See §8 — dedicated, plain-Indonesian treatment. |
| **Success** (start) | Toast success *"Sesi dimulai — PS-01, 60 menit."* Board reloads, the new session's card gets a one-shot `--color-cyan` ring for ~1 s so the eye can find it. |
| **Success** (extend) | Toast success *"Waktu ditambah 30 menit — PS-01 selesai 21.15."* |
| **Success** (finish) | Toast success *"Pembayaran berhasil — TRX-20261019-0007."* with action **"Lihat Struk"**. |
| **Disabled** | While an action is in flight, its button is `loading` and any other action for the same session is `disabled`. A console card whose status is `maintenance` has **Mulai Sesi** disabled with title *"Unit sedang dalam perawatan."* A console with an active session cannot show Mulai Sesi at all. |
| **Permission denied** | Cashier never sees **Batalkan Sesi** (admin-only, `S8`). If a cashier hits `POST /api/sessions/:id/void` (stale tab), the server `403` surfaces as error toast *"Anda tidak memiliki izin untuk membatalkan sesi."* — the action stays hidden on reload. |

---

## 5. The live timer (exact behaviour)

**Derivation, never decrement** (`ARCHITECTURE.md` rule 3): `remainingMs = Date.parse(session.endsAt) - Date.now()` recomputed on every tick. The component never holds a counter, so a reload, a route change, or a backgrounded tab cannot drift it.

**Format.** `HH:MM:SS`, zero-padded, `--font-mono`, `.tnum`, size `--text-num-lg` (28 px) on cards and 36 px in the detail hero. **`HH` is not capped at two digits** — a 12-hour package renders `12:00:00`, a 120-hour one `120:00:00`; the layout reserves width with `min-width: 6ch` and does not truncate.

**Source of truth per screen:**
- Card / list: `session.endsAt` from `GET /api/sessions`.
- Fallback poller: `GET /api/sessions/active` returns a server-computed `remainingSeconds`. If the client clock differs from the server's by more than 60 s (detected by comparing `remainingSeconds` against the locally derived value on the first poll), the UI switches to displaying a *server-derived* offset for that session and shows `caption` *"Waktu mengikuti server"*. This is the documented cashier-device-clock-drift guard.

**Visual escalation** (thresholds from `GET /api/settings` `rules.warnMinutes`, default `[10, 5, 1]`):

| Remaining | Tone | Treatment | Icon | Label shown |
| --- | --- | --- | --- | --- |
| `> 10:00` | `--color-cyan` | normal | `Timer` | sisa waktu only |
| `≤ 10:00` | `--color-warning` | number turns amber; card border → `--color-warning`; `caption` milestone text appears | `BellRing` | **"Segera Selesai"** |
| `≤ 5:00` | `--color-warning` | amber held; the card's row background becomes `--color-warning-soft` | `BellRing` | **"Hampir Habis"** |
| `≤ 1:00` | `--color-danger` | number turns red; a **900 ms** opacity pulse (1.0 → 0.72 → 1.0, `--ease-standard`) — opacity only, so no layout thrash; suppressed under `prefers-reduced-motion` | `TriangleAlert` | **"Hampir Habis"** |
| `< 0` (**overdue**) | `--color-danger` | count-up with a leading `+` (`+00:04:12`) in `--color-danger-text`; card fill `--color-danger-soft`; border `--color-danger` | `TriangleAlert` | **"Lewat Waktu"** + `caption` *"Biaya overtime berlaku"* |

**Announcement.** An `aria-live="polite"` span announces **once per threshold crossing** — *"PS-01, sisa waktu 5 menit."* / *"PS-01 telah melewati waktu."* It never updates per second (that would flood a screen reader). Implemented by remembering the lowest crossed `warnMinutes` value in a per-session ref, exactly as `Timer` specifies in `specs/components.md`.

**Overdue persistence.** `session.status` becomes `overdue` server-side on read (`api-contract.md` S2 note). The UI treats `overdue` and a negative derived remainder as the same state and shows the same treatment, so a stale status field cannot hide a late session.

---

## 6. Start-session flow (numbered, with live price preview)

Presented as a `Stepper` at ≥ 768 and as a single scrolling form with **sticky step headers** on phone (a real sequence, so numbering is earned here).

**Step 1 — Pilih unit** (required)
- Source: the console the cashier tapped; if opened from the bottom bar, a `Select size="lg"` "Pilih unit" populated with **only** `status === 'available'` consoles, each option labelled `PS-01 · PS5 · VIP · Rp 25.000/jam`, sorted by code.
- A unit that is not `available` is not selectable; if the user somehow reaches the flow with one, the field is `disabled` with help *"Unit ini sedang tidak tersedia."*

**Step 2 — Data pelanggan**
- `Input label="Nama pelanggan"` — required. `placeholder="Contoh: Budi"`. Validation: min 2 characters → *"Nama pelanggan minimal 2 karakter."* Max 60 → *"Nama pelanggan maksimal 60 karakter."*
- `Input label="Kontak (opsional)"` — not required, `inputMode="tel"`, hint *"Nomor HP atau keterangan singkat, opsional."* Max 40.
- `Textarea label="Catatan (opsional)" rows={2}` — hint *"Misalnya: bawa 2 controller tambahan."*

**Step 3 — Durasi**
- **Paket chips** from `GET /api/packages` filtered to `isActive` and (`consoleType === null || consoleType === selected.consoleType`), rendering `name` + `Rp 25.000` (`.tnum`). Selecting a chip sets `durationMinutes` from the package.
- **Atau durasi khusus**: `Input label="Durasi (menit)" inputMode="numeric" size="lg"` with suffix `menit`. Hint shows the rules: *"Minimal 30 menit · dibulatkan ke atas per 15 menit"* (values from `rules.minDurationMinutes` / `rules.roundingMinutes`). Quick-add buttons `+15 +30 +60` for a cashier with a queue.
- Validation: `< rules.minDurationMinutes` → *"Durasi minimal 30 menit."* (the `400 DURATION_BELOW_MINIMUM` message from the server is authoritative and identical). Non-numeric or empty → *"Isi durasi dalam menit."* Max 1440 → *"Durasi maksimal 1440 menit."*
- `startedAt` defaults to now (Jakarta). Not user-editable from this flow — a backdated start is an admin operation, not a counter one. (Documented limitation.)

**Price preview (live).** Every change to `consoleId` or `durationMinutes` (debounced 300 ms) calls `POST /api/sessions/quote` with `{consoleId, durationMinutes}`. The panel shows:

```
Tarif unit              Rp 25.000 / jam
Durasi dihitung         60 menit
Subtotal                Rp 25.000
────────────────────────────────────
Perkiraan total         Rp 25.000
```
Fields come straight from the response: `hourlyRate`, `billableMinutes`, `subtotal`, `(overtimeAmount)`, `(discount)`, `total`, `currency`. `overtimeMinutes`/`overtimeAmount`/`discount` are hidden at 0.

- While the quote is in flight: the total area shows a `Skeleton variant="text"` — **never a stale number**, never a 0 that later jumps.
- If the quote fails: total area shows `--color-text-muted` *"Perkiraan harga belum tersedia"* + `caption` with the error, and the **Konfirmasi** button stays enabled (the server computes the authoritative amount anyway per `ARCHITECTURE.md` rule 1). `caption` under the total, always: *"Jumlah akhir dihitung server saat sesi selesai."*
- If the preview and the finish total ever differ, the finish sheet shows the server value and a `caption` *"Total akhir dari server."* — the preview is explicitly a preview.

**Step 4 — Konfirmasi**
- Summary block: unit, pelanggan, durasi, mulai, perkiraan selesai (`startedAt + durationMinutes`, formatted `19 Okt 2026, 20.15`), perkiraan total.
- Button: **"Mulai Sesi"** (`variant="primary" size="lg" fullWidth`).

---

## 7. Extend flow and Finish/pay flow

### 7.1 Tambah Waktu (extend)

Trigger: **"Tambah Waktu"** on the session card / detail.
- `Modal size="sm"`: title *"Tambah waktu — PS-01"*, current timer, current `endsAt` *"Selesai 20.15"*.
- Choices: chips `+15 +30 +60 menit` and `Input label="Tambahan (menit)" inputMode="numeric"` (mutually exclusive; chip fills the input).
- Live preview via `POST /api/sessions/quote` with `{consoleId, durationMinutes: session.plannedMinutes, extraMinutes}` → shows `billableMinutes`, `subtotal`, and the new projected `endsAt`.
- Validation: `extraMinutes >= 1` → else *"Tambahan waktu minimal 1 menit."* Max 1440.
- Confirm **"Tambah Waktu"** → `POST /api/sessions/:id/extend {extraMinutes}`.
  - Button enters `loading` with label **"Memproses…"** and is disabled (double-submit guard, §9).
  - Success toast: *"Waktu ditambah 30 menit — selesai 21.15."*
  - `409 SESSION_NOT_ACTIVE` → error toast *"Sesi ini sudah tidak berjalan. Muat ulang halaman."* + the dialog closes and the board refetches.
- `endsAt` in state is replaced by the response's value; the timer recomputes from it immediately.

### 7.2 Selesaikan & Bayar (finish)

`Modal size="md"` at ≥ 768, bottom sheet at 360. Regions:
1. Title *"Selesaikan Sesi — PS-01"* + customer name.
2. **Breakdown** (values from the server at finish time; shown as read-only rows):
   `Durasi paket 60 menit` · `Waktu berjalan 1j 12m` · `Dihitung 75 menit` · `Tarif Rp 25.000/jam` (`rateSnapshot`, labelled *"Tarif saat sesi dimulai"*) · `Subtotal Rp 31.250` · `Overtime 12 menit Rp 5.000` (shown only when > 0) · `Biaya tambahan Rp 0` · `Diskon Rp 0` · **`Total Tagihan Rp 31.250`** in `--text-num-xl` `.tnum`.
   - Until the user confirms, the amounts are the **client's last quote + derived overtime**, clearly marked with `caption` *"Perkiraan. Jumlah akhir dihitung server."*; on submit, the response's `transaction.total` is what is rendered, replacing the estimate.
3. **Biaya tambahan** — `Input label="Biaya tambahan" prefix="Rp" inputMode="numeric"` + `Input label="Keterangan biaya"` (required if the charge > 0 → *"Isi keterangan biaya tambahan."*). Admin/authorised only; hidden for cashier (documented: server also rejects it from cashier).
4. **Diskon** — `Input label="Diskon" prefix="Rp" inputMode="numeric"` + `Input label="Alasan diskon"` (required if > 0 → *"Isi alasan diskon."*). Admin/authorised only; hidden for cashier.
5. **PaymentMethodPicker** — required, labels Tunai / Transfer Bank / QRIS, only methods present in `settings.payments.methods`. Validation: none chosen → *"Pilih metode pembayaran."*
6. **Jumlah dibayar** — `Input label="Uang diterima" prefix="Rp" inputMode="numeric" size="lg"`. Only rendered for **Tunai** (for `transfer`/`qris` it is set to `total` automatically and the row shows *"Dibayar sesuai total"*).
   - **Change-due display**: as soon as the entered amount ≥ total, a prominent row appears, `--color-success-soft` fill, `--color-success` text: **"Kembalian Rp 18.750"** (`.tnum`, `--text-num-lg`). Below total, a `--color-danger` line *"Uang diterima kurang Rp 5.000"* and the confirm button is disabled.
   - Quick-amount chips: `Uang Pas` · `50rb` · `100rb` (rounds up to the next sensible note) — reduces typing at the counter.
   - Validation: `< total` → *"Uang diterima kurang dari total tagihan."* (`400 INSUFFICIENT_PAYMENT` from the server says the same).
7. **Catatan** — `Textarea label="Catatan (opsional)" rows={2}`.
8. Footer: `Button variant="primary" size="lg" fullWidth` **"Selesaikan & Bayar"** + `Button variant="ghost"` **"Batal"**.

On confirm → `POST /api/sessions/:id/finish`. On `201 {transaction}`:
- Dialog closes; **Post-pay success panel** (not a toast alone — the cashier must print/see the receipt): a `Modal size="sm"` showing *"Pembayaran berhasil"*, `transaction.number`, `total`, `paymentMethod`, `changeDue` in large `.tnum`, and two buttons: **"Cetak Struk"** (opens `GET /api/transactions/:id/receipt?format=html` in a new tab; the receipt auto-prints only with `?print=1`) and **"Selesai"**.
- Errors: `409 SESSION_ALREADY_FINISHED` → *"Sesi ini sudah dibayar sebelumnya. Membuka transaksi…"* + navigate to the existing `transactionId`. `400 INSUFFICIENT_PAYMENT` → inline error on the amount field. `500` → dialog stays open, error banner, entered values preserved (never lose a cashier's typed amount).

---

## 8. Conflict surface — `409 UNIT_OCCUPIED`

The race is real (two cashiers, one unit). Server-side, the DB index rejects the second `INSERT` (`ARCHITECTURE.md` rule 5). The UI must make that plain, not scary:

- The start modal stays **open** (the typed customer name and duration are preserved — never discard work).
- Field-level, at the top of step 1: `--color-warning-soft` block, `TriangleAlert`, text:
  **"Unit PS-01 baru saja dipakai kasir lain."**
  second line: *"Pilih unit lain yang berstatus Tersedia, atau muat ulang daftar unit."*
- The unit `Select` is reset to empty and its `available` list refetched (`GET /api/consoles?status=available`); the conflicting unit is removed from the options and marked `disabled` with the label suffix *"(sedang dipakai)"* until the refetch confirms it.
- Also a toast, `tone="warning"`: *"Unit PS-01 sudah dipakai. Pilih unit lain."*
- No stack trace, no `code` shown to the user — the raw `error.code` is kept in a `data-` attribute for support, not rendered.

---

## 9. Double-submit guard (mandatory)

1. Every mutating button goes `loading` (spinner + label **"Memproses…"**) and `disabled` for the whole request lifetime; `aria-busy="true"`.
2. A `ref` (not state) latches the in-flight call so a second synchronous click in the same tick cannot fire a duplicate request before React re-renders.
3. All other mutating actions for the same session are disabled while one is in flight.
4. The dialog is `dismissible={false}` during a payment submit — `Esc` and the overlay do not close a half-finished payment.
5. On `409 SESSION_ALREADY_FINISHED` or `UNIT_OCCUPIED`, the latch is **released** (these are legitimate, recoverable conflicts, not transient failures).
6. The server is still the real guard (DB index + transaction, `ARCHITECTURE.md` rules 4–5); this is UX, not safety.

---

## 10. Sound notification

- A `Switch` **"Suara peringatan"** in the session screen header menu and in `Pengaturan` (admin; persisted to `localStorage` under `playrent.prefs.sound` — a UI preference, explicitly allowed by `plan.md` §B).
- Default **off**. Rationale: a shop with several counters would otherwise erupt in beeps.
- **Autoplay is blocked by browsers.** The first user gesture the app ever sees (`pointerdown` on any element, once per session) is used to create/resume a single shared `AudioContext`. The switch therefore:
  - unlocks audio on first toggle-on (`ctx.resume()` inside the click handler),
  - and the global gesture listener keeps it unlocked for a cashier who never toggles it but relies on the shop default.
  - If `ctx.state !== 'running'` after `resume()`, the switch shows `caption` *"Browser memblokir suara. Ketuk layar sekali lalu coba lagi."* — honest, no silent failure.
- Sound fires **only on threshold crossing** (10 / 5 / 1 min) and on **overdue**, once each per session — same trigger as the `aria-live` announcement.
- Tone spec: 660 Hz sine, 120 ms, gain 0.12, then a second 880 Hz / 140 ms burst for the overdue event. Two short beeps, not an alarm loop.
- The switch is `role="switch"` + `aria-checked`, and its `description` reads *"Bunyi saat waktu sesi hampir habis."*

---

## 11. Interactions (complete list)

| Element | Action | Confirmation | Toast on success | On failure |
| --- | --- | --- | --- | --- |
| Console card (`available`) | tap card → detail; tap **Mulai Sesi** → `/sesi/baru` | none | — | — |
| Console card (`in_use`) | tap → detail | none | — | — |
| **Mulai Sesi** (bottom bar) | opens start flow | — | — | — |
| **Mulai Sesi** (step 4) | `POST /sessions` | none (single deliberate tap) | *"Sesi dimulai — PS-01, 60 menit."* | `409`→§8 · `400`→inline · `500`→error banner |
| **Tambah Waktu** | opens extend dialog | — | — | — |
| **Tambah Waktu** (confirm) | `POST /:id/extend` | none | *"Waktu ditambah 30 menit — selesai 21.15."* | `409 SESSION_NOT_ACTIVE`→error toast |
| **Selesaikan & Bayar** | opens pay sheet | — | — | — |
| **Selesaikan & Bayar** (confirm) | `POST /:id/finish` | the sheet *is* the confirmation | *"Pembayaran berhasil — TRX-…"* + post-pay panel | §7.2 errors |
| **Cetak Struk** | open receipt tab | — | — | new-tab failure → toast *"Struk gagal dibuka. Blokir pop-up?"* |
| **Batalkan Sesi** (admin) | `POST /:id/void` | `ConfirmDialog` destructive + **required reason** (`requireText` field "Alasan pembatalan") | *"Sesi dibatalkan."* | `403`→*"Anda tidak memiliki izin…"* |
| Search / filter | local + refetch | — | — | inline error block |
| Refresh icon | refetch | — | — | inline error |
| Sound switch | toggles pref | — | *"Suara peringatan aktif."* / *"Suara peringatan nonaktif."* | §10 block message |

---

## 12. Responsive behaviour

| Element | 360 px | 768 px | 1280 px |
| --- | --- | --- | --- |
| Console grid | 2 columns, `minmax(160px,1fr)`, 8 px gap | 3–4 columns, 12 px gap | grid span 2 of 3 + sidebar |
| Session list | full-width cards | right column | right column |
| Primary action | `StickyActionBar` bottom | inline page-header button | inline page-header button |
| Timer on card | `--text-num-lg` 28 px, `min-width: 6ch` | same | same |
| Detail hero timer | 36 px, centred, own row | 36 px left-aligned with meta beside it | same as 768 |
| Start flow | single form, sticky step headers, bottom sheet | `Modal lg` | `Modal lg` |
| Breakdown table | two-row label/value pairs | label…value with dot leader | same |
| `HH:MM:SS` | never wraps, never truncates | same | same |

---

## 13. Keyboard shortcuts (only where a cashier genuinely benefits)

| Key | Action | Scope |
| --- | --- | --- |
| `/` | focus search | `/sesi` — only when focus is not already in a field |
| `N` | open **Mulai Sesi** | `/sesi` |
| `F2` | open **Mulai Sesi** | global, when logged in and no dialog is open (plan §G's ask) |
| `Esc` | close the topmost dialog/sheet | global |
| `Enter` | submit the active dialog's primary action | inside a dialog |
| `↑ ↓` | move radio/segmented selection | `RadioGroup`, `Tabs`, `PaymentMethodPicker` |
| `Ctrl/⌘ + P` | print receipt | post-pay panel and transaction detail |

A `caption` hint above the grid on ≥ 1024 only: *"Tekan F2 untuk memulai sesi baru."* On phones, no keyboard hints are shown at all.

---

## 14. Accessibility notes (screen-specific)

1. **Timer announcements** — `aria-live="polite"`, one announcement per threshold crossing (§5). Never `assertive`; a running timer is not an emergency.
2. **Overdue must not rely on red** — the `TriangleAlert` icon and the literal text **"Lewat Waktu"** are always present alongside the colour.
3. **The whole `ConsoleCard` is a button** only when it has exactly one action (`onOpenDetail`); when it has per-card action buttons, the card is *not* a button — it is a `<li>` containing a heading, a status badge and real `<button>`s. Nesting interactive elements is a defect.
4. **Status badge** carries icon + Indonesian label + colour — `aria-label` is not needed because the text is present.
5. **Numbers** are `.tnum` so alignment does not change on tick; screen readers read the digits, so the visible text is the announcement text (`00:05:00` reads as digits — the `aria-live` milestone text carries the meaning).
6. **Focus management** — opening the start/pay sheet moves focus to the first field; closing returns focus to the button that opened it. In the pay sheet the first focus target is the payment method, not the disabled total.
7. **Contrast** — every pair used here is from `DESIGN.md` §3 (amber on `--color-surface`: 11.5:1 family; danger on `--color-surface`: 6.39:1; cyan: 9.78:1). The dormant `+00:04:12` count-up uses `--color-danger-text` `#FCA5A5` → 9.31:1.
8. **Reduced motion** — the 1-minute pulse becomes a static colour change; all sheet transitions become instant.
9. **Errors tied to fields** — `aria-describedby` includes the error id; `aria-invalid="true"`; the error node is `role="alert"` so it is announced when it appears after submit.
10. **The pay sheet's change-due is not `aria-live="assertive"`** — it is a polite region that updates as the cashier types; the button's disabled state plus the visible red shortfall line is the primary signal.
