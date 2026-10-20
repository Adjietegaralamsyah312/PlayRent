# specs/games.md — Katalog Game

**Purpose.** Keep the shop's game list — what is available on which platform, and where the physical disc/case lives — so a cashier can answer *"ada FIFA?"* in three seconds.
**Primary user.** **Kasir** reads it (that is the whole point: answering a customer at the counter). **Admin** manages it (`G2`–`G4` are 🔑; `G1` is 👤).
**Single most important action.** **Cari game** — the search box is the product here. Everything else is admin housekeeping.

`plan.md` §J is explicit: this catalogue manages **operational data only**. Nothing on this screen implies control of, or communication with, a PlayStation console. No "eject disc", no "launch game", no sync indicator. The screen copy and icons must not suggest it either.

---

## 1. Layout (mobile first, stacked regions)

1. **Page header** — `h1` *"Katalog Game"*; `caption` count *"48 game · 41 aktif"* (`.tnum`); right side (≥ 768) **"Tambah Game"** primary.
2. **Search + filters** — search `Input size="lg"` with `Search` prefix, placeholder *"Cari judul game"*, autofocused on ≥ 768. At 360: two `Select`s below the search — **Platform** (Semua · PS4 · PS5 · Keduanya) and **Genre** (Semua + the genres present in the loaded data). At ≥ 768 these sit inline. A `Switch` **"Tampilkan game nonaktif"** (`includeInactive`) lives behind the filter drawer at 360 and inline at ≥ 768.
3. **Content** — **Daftar** only; a grid of game cards is the *identical-card-grid* anti-pattern (`DESIGN.md` §11 #5) and this data is a lookup table, not a showcase. `DataTable` columns:
   **Judul** (`primary`, weight 600) · **Platform** (`Badge tone="neutral"`: `PS4` / `PS5` / `PS4 & PS5`) · **Genre** (`Badge tone="neutral"`) · **Controller Disarankan** (`numeric`, `1–4`) · **Lokasi** (`availabilityNote`, `body-sm`, e.g. *"Rak A-2"*) · **Status** (`StatusBadge`: **Aktif** tone `success` / **Nonaktif** tone `neutral`) · **Aksi** (admin: `Pencil` *"Ubah"*, `PowerOff` *"Nonaktifkan"*; cashier: none).
4. **No pagination** — `G1` has no `page`/`limit` and returns the catalogue; the table caps at a comfortable height and scrolls. A shop's game list is tens of rows, not thousands.
5. **Bottom action bar** (< 640, admin) — **"Tambah Game"**.

## 2. Data

| Endpoint | Fields |
| --- | --- |
| `GET /api/games?platform&genre&q&includeInactive` | `items[].{id,title,platform,genre,recommendedControllers,availabilityNote,isActive}` |
| `POST /api/games` | `{title,platform:'PS4'\|'PS5'\|'both',genre,recommendedControllers,availabilityNote,isActive}` → `201` |
| `PATCH /api/games/:id` | partial |
| `DELETE /api/games/:id` | soft deactivate (`isActive=false`) — never a hard delete |

**`platform` display mapping** (the API's `both` has no Indonesian word that reads well in a table cell):

| API value | Label |
| --- | --- |
| `PS4` | **PS4** |
| `PS5` | **PS5** |
| `both` | **PS4 & PS5** |

`recommendedControllers` is a *recommendation* the cashier quotes to a customer (*"ini bisa 4 orang"*), never a validation the app enforces.

## 3. States

| State | Rendering |
| --- | --- |
| **Default** | all active games, sorted `title` A→Z (locale-aware `id` collation, so *"The Last of Us"* files under T and numbers sort naturally) |
| **Loading** | 6 × `Skeleton variant="table-row"` (or cards at 360) |
| **Empty (catalogue empty)** | `EmptyState icon={Library}` — *"Belum ada game di katalog"* — *"Tambahkan game yang tersedia di rental agar kasir mudah menjawab pertanyaan pelanggan."* — **"Tambah Game"** (admin) / `caption` *"Hubungi admin untuk menambahkan game."* (cashier) |
| **Empty (search, no match)** | `EmptyState icon={SearchX}` — *"Game \"fifa 2027\" tidak ditemukan"* — *"Periksa ejaan judul, atau ubah filter platform."* — **"Hapus filter"**. Echoing the query back is the difference between a dead end and an answer |
| **Empty (filtered)** | *"Tidak ada game dengan filter ini"* + **"Hapus filter"** |
| **Empty (includeInactive on, all inactive)** | `caption` line under the header: *"Semua game pada katalog sedang nonaktif."* |
| **Error (list)** | inline: `TriangleAlert` + *"Gagal memuat katalog game."* + **"Coba Lagi"** |
| **Error (save)** | inside the form: banner with the server `error.message`, dialog stays open, values preserved |
| **Success (create)** | toast *"Game \"EA Sports FC 26\" berhasil ditambahkan."* |
| **Success (update)** | toast *"Perubahan pada \"EA Sports FC 26\" tersimpan."* |
| **Success (deactivate)** | toast *"\"EA Sports FC 26\" dinonaktifkan."* + the row shows **Nonaktif** in place (it stays visible until refetch) |
| **Disabled** | while a row action is in flight, that row's actions are `disabled`; nothing else on the screen is blocked |
| **Permission denied** | cashier has no *Tambah/Ubah/Nonaktifkan* controls; a deep-linked mutation returns `403` → toast *"Anda tidak memiliki izin untuk mengubah katalog game."* |

Re-activation is just an edit with the **Status** switch turned on — no separate "activate" action, because the form already has the field.

## 4. Form — Tambah / Ubah Game

`Modal size="md"` (bottom sheet at 360). Title *"Tambah Game"* / *"Ubah Game — EA Sports FC 26"*.

| # | Field | Type | Label | Req | Rules + Indonesian messages |
| --- | --- | --- | --- | --- | --- |
| 1 | `title` | Input size="lg" | **Judul game** | yes | placeholder `Contoh: EA Sports FC 26`; min 2 → *"Judul game minimal 2 karakter."*; max 120 → *"Judul game maksimal 120 karakter."* |
| 2 | `platform` | Select size="lg" | **Platform** | yes | PS4 · PS5 · **PS4 & PS5**; empty → *"Pilih platform."* |
| 3 | `genre` | Input + suggestion chips | **Genre** | yes | free text with chips for the genres already in the catalogue (`Sport`, `Action`, `Racing`, `Fighting`, `Family`, `Adventure`); empty → *"Isi genre game."*; max 40 → *"Genre maksimal 40 karakter."* |
| 4 | `recommendedControllers` | Input numeric | **Controller disarankan** | no | suffix *"buah"*; hint *"Opsional. Berapa pemain nyaman memainkan game ini."*; non-integer or outside 1–4 → *"Controller disarankan harus 1 sampai 4."*; empty is allowed (stored as null, rendered as `—`) |
| 5 | `availabilityNote` | Input | **Lokasi / catatan ketersediaan** | no | placeholder `Contoh: Rak A-2`; hint *"Di mana game ini disimpan, agar kasir cepat menemukannya."*; max 60 → *"Catatan maksimal 60 karakter."* |
| 6 | `isActive` | Switch | **Game aktif** | — | description *"Game nonaktif tidak muncul saat kasir mencari katalog."* Default **on** for a new game |

Footer: **"Simpan"** (`primary`, `loading` → *"Menyimpan…"*) + **"Batal"** (`ghost`).

**Nonaktifkan** flow: `ConfirmDialog`, title *"Nonaktifkan \"EA Sports FC 26\"?"*, description *"Game tidak muncul lagi pada pencarian kasir. Data tetap tersimpan dan bisa diaktifkan kembali."*, confirm label **"Nonaktifkan"**, cancel **"Kembali"**. Not `tone="destructive"` — it is reversible and destroys nothing.

## 5. Interactions

| Element | Action | Confirmation | Toast |
| --- | --- | --- | --- |
| Search input | refetch with `?q=` (300 ms debounce); keeps the current scroll position on the results | — | — |
| Genre chip | set the genre filter | — | — |
| Row **Ubah** | open form (edit) | — | update toast |
| Row **Nonaktifkan** | `DELETE /games/:id` | `ConfirmDialog` | deactivate toast |
| **Tambah Game** | open form (create) | — | create toast |
| Sortable header (Judul, Platform) | sort | — | — |
| `Esc` | close the open dialog/drawer | — | — |

Search behaviour that matters: matching is **case-insensitive substring on `title`**, so *"last of us"* finds *"The Last of Us Part II"* — anything narrower makes the cashier retype in front of a waiting customer. The client lowercases the input before sending `?q=`; it does not filter the returned list locally, so there is never a "results on this page only" surprise.

## 6. Responsive

| | 360 px | 768 px | 1280 px |
| --- | --- | --- | --- |
| Content | **cards**: title = `Judul`, `dl` of Platform/Genre/Controller/Lokasi/Status, actions in the card footer | table, 7 columns | table, 7 columns, `stickyHeader`, 6 more rows visible |
| Search | full width, `size="lg"` | inline, `max-w-sm`, autofocused | inline, `max-w-sm`, autofocused |
| Filters | two `Select`s stacked + drawer for the switch | inline row | inline row |
| Add game | sticky bottom bar | page-header button | page-header button |
| Count caption | under the title | inline right of the title | inline right of the title |

## 7. Keyboard

| Key | Action |
| --- | --- |
| `/` | focus search (the same key as every other list screen) |
| `N` | open *Tambah Game* (admin) |
| `↓ / ↑` | move through the result rows while the search is focused (keeps the cashier's hands off the mouse) |
| `Enter` on a focused row | open the edit form (admin) — for a cashier the row is not interactive, so `Enter` does nothing rather than opening something they cannot use |
| `Esc` | clear the search when it is focused and has a value; otherwise close the topmost dialog |

## 8. Accessibility

1. **Search is a `<search>` landmark** with an `<label>` *"Cari game"* — not a bare input with a placeholder.
2. **Result count is announced** in a `role="status"` region after each debounced search: *"12 game ditemukan."* / *"Tidak ada game yang cocok."*
3. **Platform badge** text carries the meaning (`PS4 & PS5`); the badge colour is neutral for every platform, so nothing depends on colour.
4. **Active/Nonaktif** is icon (`CircleCheck` / `Ban`) + text + colour, per `DESIGN.md` §7.
5. **`—` for a missing `recommendedControllers`** is rendered with an `sr-only` *"tidak ditentukan"* so a screen reader does not read a dash.
6. **Table** has a `<caption class="sr-only">` *"Katalog game"* and `scope="col"` headers.
7. **Sorting** exposes `aria-sort="ascending|descending"` on the active header.
8. **Contrast** — text is `--color-text` on `--color-surface` (15.08:1); neutral badges are `#AEB9D2` on `#1E2841` (7.44:1); muted location notes are `#8590A8` on `#121829` (5.51:1).
9. **No console-control affordances** — no icon, label or tooltip suggests the app talks to a PlayStation, which is both a product rule (§J) and an accessibility one (a button that lies about its effect is worse than no button).
10. **Touch targets** ≥ 44 px for the card-footer actions at 360.
