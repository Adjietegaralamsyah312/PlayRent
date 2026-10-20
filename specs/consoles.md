# specs/consoles.md — Manajemen Unit PS

**Purpose.** Create, edit, filter and deactivate PS4/PS5 units; see at a glance which unit is in use, reserved, or in maintenance.
**Primary user.** **Admin** (full CRUD). **Kasir** reads this screen to pick a free unit — read-only for them: the *Tambah Unit* / *Ubah* / *Nonaktifkan* controls are hidden and the server returns `403` for `C3`–`C5` regardless (`ARCHITECTURE.md` rule 6).
**Single most important action.** **Tambah Unit** (admin) / **Mulai Sesi** from a card (cashier).

---

## 1. Layout (mobile first, stacked regions)

1. **Page header** — `h1` *"Unit PS"*; `caption` count *"12 unit · 5 tersedia"` (`.tnum`, computed from the loaded list); right side (≥ 768) **"Tambah Unit"** primary button + a `LayoutGrid`/`Rows3` view toggle (grid ↔ table, persisted in `localStorage` as a UI preference).
2. **Filter bar** — at 360 a single row: filter `IconButton` (`SlidersHorizontal`, opens a `Drawer side="bottom"`) + search `Input size="lg"` with `Search` prefix, placeholder *"Cari kode unit"*. The drawer holds `Select` for **Status** (Semua · Tersedia · Sedang Bermain · Dipesan · Perawatan), **Jenis** (Semua · PS4 · PS5), **Ruangan** (Semua · Reguler · VIP), and a `Switch` **"Tampilkan unit nonaktif"** (`includeInactive`). At ≥ 768 the same controls render inline as a filter row. Active filters show as removable `Badge`s with an `X`; a **"Hapus filter"** text button appears when any is set.
3. **Content** — two modes:
   - **Grid (default at 360):** `ConsoleCard variant="full"` in `repeat(auto-fit, minmax(160px, 1fr))`, 8 px gap.
   - **Table (default ≥ 768, toggleable):** `DataTable` with columns: **Kode** (`primary`, mono-ish, weight 600) · **Jenis** (PS4/PS5 `Badge` tone `neutral`) · **Ruangan** (Reguler/VIP `Badge` tone `neutral`) · **Controller** (`numeric`, e.g. `2`) · **Tarif/Jam** (`numeric`, `Rp 25.000`) · **Status** (`StatusBadge` from the `DESIGN.md` §7 map) · **Kondisi** (`body-sm`, `conditionNote` truncated to 40 chars with `title`) · **Aksi** (`IconButton`s: `Pencil` *"Ubah"*, `PowerOff` *"Nonaktifkan"*; admin only).
4. **Pagination** — `mode="load-more"` at 360, `numbered` at ≥ 768 (`Menampilkan 1–20 dari 24`).
5. **Bottom action bar** (< 640, admin) — **"Tambah Unit"** `size="lg" fullWidth`.

## 2. Data

| Endpoint | Fields |
| --- | --- |
| `GET /api/consoles?status=&type=&roomType=&q=&includeInactive=` | `items[].{id,code,consoleType,roomType,controllers,hourlyRate,status,conditionNote,isActive,createdAt}` |
| `GET /api/consoles/:id` | `{console, currentSession}` — `currentSession` powers the in-use card's customer name and timer |
| `POST /api/consoles` | `{code,consoleType,roomType,controllers,hourlyRate,status,conditionNote}` → `201 {console}` |
| `PATCH /api/consoles/:id` | partial → `{console}` |
| `DELETE /api/consoles/:id` | soft deactivate → `409 UNIT_OCCUPIED` if an active session exists |

The card's *in use* variant reads `currentSession.{customerName,endsAt,status}`. Only `GET /api/consoles/:id` returns `currentSession`, so the grid list view renders `currentSession` from the parallel `GET /api/sessions?status=active` result, keyed by `consoleId` — documented, because `C1` does not include it.

## 3. States

| State | Rendering |
| --- | --- |
| **Default** | grid or table populated, sorted by `code` ascending (natural sort: `PS-2` before `PS-10`) |
| **Loading** | 4 × `Skeleton variant="card"` (grid) or 5 × `Skeleton variant="table-row"` (table) |
| **Empty (no units at all)** | `EmptyState icon={Gamepad2}` — *"Belum ada unit PS"* — *"Tambahkan unit PS4 atau PS5 beserta tarif sewanya untuk mulai mencatat rental."* — **"Tambah Unit"** (admin) / `caption` *"Hubungi admin untuk menambahkan unit."* (cashier) |
| **Empty (filtered)** | *"Tidak ada unit dengan filter ini"* — *"Coba ubah atau hapus filter yang aktif."* — **"Hapus filter"** |
| **Error (list)** | inline block: `TriangleAlert` + *"Gagal memuat daftar unit."* + server message in `caption` + **"Coba Lagi"** |
| **Error (save/update)** | inside the form dialog, a banner with the server `error.message`; the dialog stays open with values preserved |
| **Success (create)** | toast success *"Unit PS-07 berhasil ditambahkan."* (uses the returned `code`); dialog closes; the new row/card is inserted and flashes a `--color-cyan` ring once |
| **Success (update)** | toast success *"Perubahan pada PS-07 tersimpan."* |
| **Success (deactivate)** | toast success *"Unit PS-07 dinonaktifkan."* + a `Badge tone="neutral"` **"Nonaktif"** appears on the row (the row stays visible until the next refetch, so the admin sees what just happened) |
| **Disabled** | while a card action is in flight, all actions on that card are `disabled`; **Nonaktifkan** is disabled with `title` *"Unit sedang dipakai. Selesaikan sesi terlebih dahulu."* when `status === 'in_use'` |
| **Permission denied** | cashier: no *Tambah/Ubah/Nonaktifkan* controls at all; deep-linking to a mutation returns a toast error *"Anda tidak memiliki izin untuk mengubah unit."* (`403`) |

## 4. Form — Tambah / Ubah Unit

`Modal size="md"` (bottom sheet at 360). Title *"Tambah Unit"* / *"Ubah Unit — PS-07"*. Fields in this order:

| # | Field | Type | Label | Req | Rules + Indonesian messages |
| --- | --- | --- | --- | --- | --- |
| 1 | `code` | Input | **Kode unit** | yes | placeholder `contoh: PS-07`; `autoCapitalize="characters"`; hint *"Harus unik, misalnya PS-01."*; empty → *"Isi kode unit."*; pattern `^[A-Za-z0-9-]{2,12}$` → *"Kode unit hanya boleh huruf, angka, dan tanda hubung (2–12 karakter)."*; `409 DUPLICATE_CODE` → *"Kode unit PS-07 sudah dipakai."* |
| 2 | `consoleType` | Select size="lg" | **Jenis konsol** | yes | PS4 · PS5; empty → *"Pilih jenis konsol."* |
| 3 | `roomType` | Select size="lg" | **Ruangan** | yes | Reguler · VIP; empty → *"Pilih jenis ruangan."* |
| 4 | `controllers` | Input numeric | **Jumlah controller** | yes | suffix *"buah"*; empty → *"Isi jumlah controller."*; must be integer 1–8 → *"Jumlah controller harus 1 sampai 8."* |
| 5 | `hourlyRate` | Input prefix="Rp" | **Tarif per jam** | yes | `inputMode="numeric"`; hint *"Tanpa titik atau koma."*; empty → *"Isi tarif per jam."*; not a positive integer → *"Tarif harus berupa angka lebih dari 0."*; `< 1000` → *"Tarif minimal Rp 1.000."*; input displays a live `.tnum` echo *"Rp 25.000"* under the field |
| 6 | `status` | Select | **Status** | yes | Tersedia · Sedang Bermain · Dipesan · Perawatan. **"Tersedia" is unavailable while an active session exists** — the option renders `disabled` with suffix *"(unit sedang dipakai)"*; forcing it returns `409 UNIT_OCCUPIED` → *"Unit ini sedang dipakai. Selesaikan sesi terlebih dahulu sebelum menandainya Tersedia."* |
| 7 | `conditionNote` | Textarea rows=3 | **Catatan kondisi** | no | maxLength 300 + counter; hint *"Misalnya: stik kiri agak longgar."* |
| 8 | `isActive` | Switch | **Unit aktif** | — | Edit mode only. Description *"Unit nonaktif tidak muncul di pilihan sesi baru."* |

Footer: **"Simpan"** (`primary`, `loading` → *"Menyimpan…"*) + **"Batal"** (`ghost`). `code` is editable in edit mode but the server still enforces uniqueness; changing a code never rewrites historical sessions (they store `consoleCode` snapshots in the transaction record).

**Deactivate** flow: `ConfirmDialog tone="destructive"`, title *"Nonaktifkan PS-07?"*, description *"Unit tidak akan muncul saat memulai sesi baru. Riwayat sesi dan transaksi tetap tersimpan."*, confirm label **"Nonaktifkan"**. No `requireText` (recoverable by re-activating). `409 UNIT_OCCUPIED` → error inside the dialog: *"Unit ini sedang dipakai. Selesaikan sesi terlebih dahulu."*

## 5. Interactions

| Element | Action | Confirmation | Toast |
| --- | --- | --- | --- |
| **Tambah Unit** | open form (create mode) | — | *"Unit PS-07 berhasil ditambahkan."* |
| Row/card **Ubah** | open form (edit mode) | — | *"Perubahan pada PS-07 tersimpan."* |
| Row/card **Nonaktifkan** | delete | `ConfirmDialog` destructive | *"Unit PS-07 dinonaktifkan."* |
| Card **Mulai Sesi** (`available`) | `/sesi/baru` pre-filled with this unit | — | session start toast |
| Card **Tambah Waktu** (`in_use`) | extend dialog | — | extend toast |
| Card body (cashier, `available`) | `/sesi/baru` | — | — |
| Card body (any, other statuses) | `/sesi/:id` or the unit's current session detail | — | — |
| Status `Badge` in filter | toggle status filter | — | — |
| View toggle | grid ↔ table | — | — |

## 6. Responsive

| | 360 px | 768 px | 1280 px |
| --- | --- | --- | --- |
| Content | grid of 160 px cards, 2 columns | **table** with all columns | table, `stickyHeader`, 4 extra visible rows |
| Filters | 1 row: icon drawer + search | inline filter row | inline filter row + view toggle |
| Form | bottom sheet, full width, `92dvh` | centred `Modal md` | centred `Modal md` |
| Row actions | card footer, 44 px targets | icon buttons at the row end | icon buttons + `title` tooltips |
| Add unit | sticky bottom bar | page-header button | page-header button |

## 7. Keyboard

| Key | Action |
| --- | --- |
| `/` | focus search |
| `N` | open *Tambah Unit* (admin) |
| `Esc` | close form/drawer |
| `Tab` | within the table, skip the actions cell until the row is focused; actions are reachable in order |

## 8. Accessibility

1. **Form labels** are real `<label>` elements tied by `id`; hints and errors wired with `aria-describedby`.
2. **Status is icon + label + colour** — the `StatusBadge` map guarantees it (`DESIGN.md` §7). "Sedang Bermain" is never only a colour.
3. **Destructive confirm** traps focus, `Esc` cancels (no `requireText` here — deactivation is reversible), and focus returns to the `PowerOff` button.
4. **The filter drawer** is a labelled `dialog` with `aria-modal="true"`; the trigger button reports `aria-expanded`.
5. **Currency inputs** use `inputMode="numeric"`; the live `Rp` echo is `aria-live="polite"` but only announces after a 600 ms pause so it does not read every keystroke.
6. **Table** uses `<caption class="sr-only">` *"Daftar unit PlayStation"*, `<th scope="col">`, and `aria-sort` on sortable headers.
7. **Natural-sort codes** so a screen reader does not read PS-10 between PS-1 and PS-2.
8. **Contrast** — status badge pairs verified in `DESIGN.md` §3.6 (lowest is accent 6.18:1).
9. **Touch targets** ≥ 44 px for the row action icons on the phone card footer.
