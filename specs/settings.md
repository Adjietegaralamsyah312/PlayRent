# specs/settings.md — Pengaturan Usaha

**Purpose.** The admin's control panel: shop identity for the receipt, the pricing rules the server actually enforces, the timer warning thresholds, and the duration packages the cashier picks from.
**Primary user.** **Admin only** for writes (`P2`, `P4`–`P6` are 🔑). `P1` (read) and `P3` (packages list) are 👤, because the cashier's start-session flow needs `rules` and `packages` to render.
**Single most important action.** **Simpan Peraturan** — specifically the pricing rules, because `pricing.js` on the server is the single source of truth (`ARCHITECTURE.md`, `api-contract.md`) and a mismatch between what the admin thinks is configured and what the server charges is the worst possible state for this screen.

**The one sentence the screen must say out loud:** settings changes affect **future** transactions only. Active sessions keep their `rateSnapshot` (`api-contract.md` P2 note). This is rendered as a persistent `--color-info-soft` note at the top of the Pricing section, not a footer afterthought — an admin raising the hourly rate mid-shift must understand why the running session did not re-price.

---

## 1. Layout (mobile first, stacked regions)

A `Tabs` set, not a long scroll — each tab is a separate save scope with its own dirty/save state, so a half-edited tab never blocks another.

Tabs: **Usaha · Tarif & Aturan · Paket Durasi · Timer & Notifikasi · Pembayaran · Struk**

Common shell for each tab:
1. `PageHeader` — `h1` *"Pengaturan"*; `caption` *"Perubahan berlaku untuk transaksi berikutnya."*
2. Tab strip (`Tabs variant="underline"`, scrollable at 360).
3. The tab's `PageSection`s, each a `Card padding="lg"`.
4. **Sticky save bar** at the bottom of the viewport (all breakpoints — this screen has no primary action elsewhere): a `--color-surface-2` bar with `--shadow-e1`, showing the dirty state — *"3 perubahan belum disimpan"* (`body-sm`, `--color-warning`) — plus **"Simpan"** (`primary`, `loading` → *"Menyimpan…"*) and **"Kembalikan"** (`ghost`). The bar is hidden when nothing is dirty. This is the *visibility of system status* rule from `plan.md` §C made literal: the admin can always see whether their edits are saved.

### Tab 1 — Usaha (`business`)

`Card` with a 1-column form (2 columns ≥ 768):

| Field | Label | Req | Notes |
| --- | --- | --- | --- |
| `business.name` | **Nama rental** | yes | placeholder `Contoh: PlayRent Gaming Lounge`; shown on the receipt header |
| `business.address` | **Alamat** | yes | `Textarea rows=3`; multi-line on the receipt |
| `business.phone` | **Nomor telepon** | no | `inputMode="tel"` |
| `business.taxNote` | **Catatan pajak** | no | e.g. *"Harga sudah termasuk pajak."*; printed below the total when set |
| `business.receiptFooter` | **Catatan kaki struk** | no | `Textarea rows=2`; e.g. *"Terima kasih, selamat bermain kembali."* |

### Tab 2 — Tarif & Aturan (`rules`)

A 2-column grid of numeric fields (1 column at 360). Every field shows its effect in a live `.tnum` example next to it, because these numbers are only meaningful by example.

| Field | Label | Req | Live example rendered beside it |
| --- | --- | --- | --- |
| `rules.defaultHourlyRate` | **Tarif default per jam** | yes | `Rp 20.000 / jam` — used when a new console is created with no explicit rate |
| `rules.minDurationMinutes` | **Durasi minimum** | yes | *"Sesi 20 menit akan ditolak. Minimal 30 menit."* |
| `rules.roundingMinutes` | **Pembulatan tagihan** | yes | *"45 menit dihitung menjadi 45 menit."* (assumes 15) — hint: the server always rounds **up** |
| `rules.overtimeRatePerHour` | **Tarif overtime per jam** | yes | `Rp 30.000 / jam` — applied only after the grace period |
| `rules.overtimeGraceMinutes` | **Toleransi overtime** | yes | *"Terlambat 10 menit tidak dikenakan biaya."* |

Plus the persistent info note:
> `--color-info-soft`, `Info` icon — **"Perubahan aturan hanya berlaku untuk sesi baru."**
> *"Sesi yang sedang berjalan tetap memakai tarif yang berlaku saat sesi dimulai. Total transaksi selalu dihitung ulang oleh server."*

Validation (all fields, Indonesian):
- non-integer → *"Isi dengan angka bulat."*
- `defaultHourlyRate < 1000` → *"Tarif minimal Rp 1.000."*
- `minDurationMinutes < 15` → *"Durasi minimum minimal 15 menit."*; `> 480` → *"Durasi minimum maksimal 480 menit."*
- `roundingMinutes` not in `5 | 10 | 15 | 30 | 60` → *"Pembulatan harus 5, 10, 15, 30, atau 60 menit."*
- `overtimeRatePerHour < 1000` → *"Tarif overtime minimal Rp 1.000."*
- `overtimeGraceMinutes > 60` → *"Toleransi overtime maksimal 60 menit."*

### Tab 3 — Paket Durasi (`P3`–`P6`)

`DataTable`: **Nama** (`primary`) · **Durasi** (`numeric`, `60 menit`) · **Harga** (`numeric`, `Rp 25.000`) · **Platform** (Semua / PS4 / PS5) · **Status** (Aktif/Nonaktif) · **Aksi** (`Pencil`, `PowerOff`). **"Tambah Paket"** button in the section header.

Form (`Modal size="sm"`, bottom sheet at 360):

| Field | Label | Req | Rules |
| --- | --- | --- | --- |
| `name` | **Nama paket** | yes | placeholder `Contoh: Paket 1 Jam`; empty → *"Isi nama paket."*; max 40 → *"Nama paket maksimal 40 karakter."* |
| `durationMinutes` | **Durasi (menit)** | yes | suffix *"menit"*; chips `30/60/120/180`; empty → *"Isi durasi paket."*; `< rules.minDurationMinutes` → *"Durasi paket minimal sama dengan durasi minimum usaha."* |
| `price` | **Harga** | yes | `prefix="Rp"`; empty → *"Isi harga paket."*; `< 1000` → *"Harga minimal Rp 1.000."* |
| `consoleType` | Select | **Berlaku untuk** | ▼ Semua unit · PS4 · PS5 |
| `isActive` | Switch | **Paket aktif** | description *"Paket nonaktif tidak muncul saat kasir memulai sesi."* |

### Tab 4 — Timer & Notifikasi (`rules.warnMinutes`)

- **Ambang peringatan** — a chip editor over `warnMinutes`. Default `[10, 5, 1]`. Chips show `10 menit ×`, `5 menit ×`, `1 menit ×` with an **"+ Tambah ambang"** button adding an `Input` (integer minutes). Rules:
  - values must be integers `1–120` → *"Ambang peringatan harus 1 sampai 120 menit."*
  - duplicates rejected → *"Ambang 5 menit sudah ada."*
  - must not be empty → *"Sediakan minimal satu ambang peringatan."*
  - Editing the list shows a `caption` preview: *"Kasir diperingatkan saat sisa waktu 10, 5, dan 1 menit."*
- **Suara peringatan** — a `Switch` mirroring the per-device preference from `specs/sessions.md` §10. The tab states plainly: *"Preferensi suara disimpan di perangkat masing-masing kasir. Browser memblokir suara otomatis sampai pengguna menyentuh layar sekali."* The admin's toggle here is the shop default written to `localStorage`; it cannot force sound on a cashier's device, and the copy says so rather than pretending otherwise.
- A **"Uji suara"** `Button` (ghost) that plays the two-beep tone after user gesture — the only honest way to verify a browser will actually play it.

### Tab 5 — Pembayaran (`payments.methods`)

A `Checkbox` group over `['cash','transfer','qris']`, each with an Indonesian label (Tunai · Transfer Bank · QRIS) and a `description`:
- Tunai — *"Pembayaran di tempat. Kembalian dihitung otomatis."*
- Transfer Bank — *"Dikonfirmasi manual oleh kasir. Tidak terhubung ke bank."*
- QRIS — *"Dikonfirmasi manual oleh kasir. Tidak terhubung ke gateway."*

The two non-cash descriptions are the honest disclosure `plan.md` §I demands: **no payment is verified automatically**, and the label must not imply otherwise. Validation: unchecking every method → *"Pilih minimal satu metode pembayaran."*

### Tab 6 — Struk (`business.receiptFooter`, `taxNote`, `name`, `address`, `phone`)

- A live **receipt preview**: an 80 mm white panel rendering exactly the fields from this tab plus a sample `TRX-20261019-0007` line and a `Rp 25.000` total, styled to match the server receipt. Label: `caption` *"Pratinjau struk (80 mm)."*
- **"Cetak Uji"** `Button` opening `GET /api/transactions/:id/receipt?format=html` for the most recent transaction with `&print=1`; if there is no transaction yet, the button is `disabled` with `title` *"Belum ada transaksi untuk dicetak."* — a print test needs real data.
- A `caption` note: *"Struk dicetak 80 mm. Pastikan lebar kertas sesuai pada printer."*

## 2. Data

| Endpoint | Body / fields |
| --- | --- |
| `GET /api/settings` | `{business:{name,address,phone,receiptFooter,taxNote}, rules:{minDurationMinutes,roundingMinutes,overtimeRatePerHour,overtimeGraceMinutes,defaultHourlyRate,warnMinutes}, payments:{methods}}` |
| `PUT /api/settings` | merges the same shape; writes `audit_logs` with a before/after diff |
| `GET /api/packages` | `items[].{id,name,durationMinutes,price,consoleType,isActive}` |
| `POST /api/packages` | `{name,durationMinutes,price,consoleType:null\|'PS4'\|'PS5',isActive}` |
| `PATCH /api/packages/:id` | partial |
| `DELETE /api/packages/:id` | soft deactivate |
| `GET /api/health` | `version` for the footer |

`PUT` sends the **whole settings object**, not a patch — a partial merge would make "Kembalikan" ambiguous. The client keeps a pristine copy from the last successful `GET` for dirty-diffing and revert.

## 3. States

| State | Rendering |
| --- | --- |
| **Default** | current settings loaded, save bar hidden |
| **Loading** | form skeletons (fields render as disabled skeleton blocks); tab strip still interactive |
| **Empty (no packages)** | `EmptyState icon={PackagePlus}` — *"Belum ada paket durasi"* — *"Tambahkan paket seperti \"Paket 1 Jam\" agar kasir bisa memilih durasi dengan cepat."* — **"Tambah Paket"**. Packages are optional; the start flow still accepts a custom duration |
| **Error (load)** | page-level `EmptyState variant="error"` — *"Gagal memuat pengaturan."* — *"Periksa koneksi ke server lalu coba lagi."* — **"Coba Lagi"**. No form is rendered, because editing a guess of the server's values is worse than not editing |
| **Error (save)** | inside the sticky save bar: `TriangleAlert` + server `error.message` in `--color-danger`; the bar stays dirty and the entered values are preserved |
| **Error (field)** | inline under the field, `role="alert"` |
| **Success (save)** | toast *"Pengaturan tersimpan. Berlaku untuk transaksi berikutnya."* + the save bar hides + the pristine copy is refreshed (so dirty-diffing starts clean) |
| **Success (package)** | toast *"Paket \"Paket 2 Jam\" ditambahkan."* / *"Paket \"Paket 2 Jam\" dinonaktifkan."* |
| **Rejected by server** | if the server rejects a `warnMinutes` or rate value that passed the client, the field-level message from `error.message` is shown verbatim and the field keeps focus — the server is authoritative and the client does not override it |
| **Disabled** | **Simpan** disabled while nothing is dirty and while a save is in flight; **Kembalikan** disabled when clean; the whole tab is read-only (`disabled` fields, no save bar) for a cashier who somehow reaches the route |
| **Permission denied** | cashier: the route renders **read-only** with a `--color-info-soft` banner *"Anda hanya dapat melihat pengaturan. Hubungi admin untuk mengubahnya."* and no save bar; a forced `PUT` returns `403` → toast *"Anda tidak memiliki izin untuk mengubah pengaturan."* |
| **Unsaved-changes guard** | switching tabs with a dirty form shows a `ConfirmDialog` — *"Perubahan belum disimpan"* / *"Perubahan pada tab ini akan hilang."* / **"Buang Perubahan"** + **"Kembali"**; navigating away uses the same dialog via a router blocker |

## 4. Interactions

| Element | Action | Confirmation | Toast |
| --- | --- | --- | --- |
| Any field edit | sets dirty on that tab | — | — |
| **Simpan** | `PUT /api/settings` (or the package call) | none — the button is explicit | save toast |
| **Kembalikan** | revert to pristine | `ConfirmDialog` if > 3 fields changed, silent otherwise | *"Perubahan dikembalikan."* |
| Tab switch (dirty) | guard dialog | yes | — |
| **+ Tambah ambang** | add a chip | — | — |
| Chip `×` | remove a threshold | — | — |
| **Uji suara** | play the tone | — | *"Suara diuji. Jika tidak terdengar, ketuk layar sekali lalu coba lagi."* |
| **Tambah/Ubah Paket** | package form | — | package toasts |
| **Nonaktifkan Paket** | `DELETE /packages/:id` | `ConfirmDialog` (non-destructive tone) | deactivate toast |
| **Cetak Uji** | open the latest receipt with `&print=1` | — | error toast only on failure |

## 5. Responsive

| | 360 px | 768 px | 1280 px |
| --- | --- | --- | --- |
| Tabs | horizontal scroller with edge fade | all 6 tabs visible | all 6 visible |
| Two-column grids | 1 column | 2 columns | 2 columns, form `max-w-3xl` |
| Package table | **cards** | table | table |
| Save bar | full width, sticky, above the bottom nav | full width, sticky | `max-w-3xl` aligned with the form, sticky |
| Receipt preview | 80 mm panel scaled to fit, horizontal scroll if needed | centred 80 mm | centred 80 mm |

## 6. Keyboard

| Key | Action |
| --- | --- |
| `Ctrl/⌘ + S` | Save (guarded against the browser's Save Page — `preventDefault`) |
| `Esc` | revert focus to the save bar (does not discard); a second `Esc` opens the discard dialog |
| `Tab` / `Shift+Tab` | field order = visual order, top to bottom |
| `+` / `-` on the threshold editor | add/remove a threshold chip while it has focus |

## 7. Accessibility

1. **The save bar is a `role="status"` region** announcing *"3 perubahan belum disimpan"* — a screen-reader user must know their edits are pending just as a sighted user does.
2. **Every numeric field shows its unit in the label or a suffix**, never in the placeholder alone: *"Durasi minimum (menit)"*, `prefix="Rp"`. A bare number is ambiguous to everyone, and unusable to a screen reader.
3. **Live examples** (`"Sesi 20 menit akan ditolak. Minimal 30 menit."`) are wired via `aria-describedby`, so the consequence of a value is announced with the field.
4. **The threshold chip editor is a real list** — `<ul>` with each chip a `<li>` containing a labelled remove `IconButton` (`aria-label="Hapus ambang 5 menit"`). Not a row of unlabelled `×` glyphs.
5. **The receipt preview** is marked `aria-hidden="true"` (it is a visual preview duplicating the form's own values) while the **"Cetak Uji"** button carries the accessible path to the real document.
6. **The info note about `rateSnapshot`** is not a tooltip or an asterisk — it is a visible, plain-language block, because the consequence (a running session not re-pricing) is exactly the kind of thing users discover by surprise otherwise.
7. **Unsaved-changes dialog** traps focus, `Esc` cancels, and the destructive choice is the second button, not the default.
8. **Contrast** — the save bar's dirty warning is `--color-warning` `#FBBF24` on `--color-surface-2` (9.71:1); the info note is `--color-info` `#38BDF8` on `--color-info-soft` (7.70:1); field errors use `--color-danger` on `--color-surface` (6.39:1); muted hints 5.51:1. Verified in `DESIGN.md` §3.
9. **Reduced motion** — the save bar's slide-in becomes instant.
10. **`<html lang="id">`**; the money fields use `inputMode="numeric"` with no decimals, matching the server's INTEGER-rupiah model, so there is no ambiguity to mis-read.
