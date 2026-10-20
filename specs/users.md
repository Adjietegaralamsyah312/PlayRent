# specs/users.md — Pengguna

**Purpose.** Let the owner add a cashier account, correct a name, change a role, reset a forgotten password, and turn off an account that has left — without ever blinding the shop to its own history.
**Primary user.** **Admin only.** Every `U*` endpoint is 🔑. A cashier never sees this route.
**Single most important action.** **Tambah Pengguna** — a new cashier account is the reason the screen is opened. Everything else is maintenance.

**Two rules the screen enforces visibly**, both from `api-contract.md` U4:
- You cannot deactivate **yourself** (`409 CANNOT_DELETE_SELF`) — you would lock yourself out mid-shift.
- You cannot deactivate the **last active admin** (`409 LAST_ADMIN`) — the shop would be unable to configure anything.
These are shown as a *pre-emptive* disabled state with a `title` and helper text, not as an error after the tap. A user who taps a button that the app knew would fail has been failed by the app.

Accounts are **soft-deactivated, never deleted** (`isActive = false`). The screen says so, because an owner looking for a *Delete* button needs to know why there isn't one.

---

## 1. Layout (mobile first, stacked regions)

1. **Page header** — `h1` *"Pengguna"*; `caption` *"3 pengguna · 2 aktif"* (`.tnum`); right side (≥ 768) **"Tambah Pengguna"** primary.
2. **Filter bar** — search `Input` placeholder *"Cari nama atau username"* (`?q`); role `Select` (**Semua · Admin · Kasir**); a `Switch` **"Tampilkan nonaktif"** (`isActive`). At 360 the two selects live in a filter `Drawer`.
3. **Content** — `DataTable`. **No card grid**: this is a short lookup list, and a grid of avatars would be the identical-card-grid anti-pattern (`DESIGN.md` §11 #5). Columns:
   **Nama** (`primary`, `fullName`, with the `users` avatar initial circle) · **Username** (`body-sm`, `--color-text-secondary`, prefixed `@`) · **Peran** (`StatusBadge`: **Admin** tone `accent` / **Kasir** tone `neutral`) · **Status** (`StatusBadge`: **Aktif** tone `success` / **Nonaktif** tone `neutral`) · **Dibuat** (`body-sm`, `createdAt` → `12 Sep 2026`) · **Aksi** (`KeyRound` *"Ubah Sandi"*, `Pencil` *"Ubah"`, `PowerOff` *"Nonaktifkan"`).
4. **Pagination** — not rendered. `U1` returns `{items}` with no `meta` (`api-contract.md`), and `plan.md` §L budgets a handful of accounts, not hundreds; the table caps at a comfortable height and scrolls. If the account list ever grows past a screen, that is a product change to raise with the backend, not something this screen can paginate on its own.
5. **Bottom action bar** (< 640) — **"Tambah Pengguna"** `fullWidth size="lg"`.

## 2. Data

| Endpoint | Body / Query | Returns |
| --- | --- | --- |
| `GET /api/users?q&role&isActive` | — | `{items}` |
| `POST /api/users` | `{username, fullName, password, role}` | `201 {user}` |
| `PATCH /api/users/:id` | partial `{fullName?, role?, isActive?, password?}` | `{user}` |
| `DELETE /api/users/:id` | — | soft deactivate. `409 CANNOT_DELETE_SELF` / `409 LAST_ADMIN` |
| `GET /api/auth/me` | — | `{user}` — the current admin's own `id`, used for the self-guard |
| `POST /api/auth/change-password` | `{currentPassword, newPassword}` | `{ok:true}`, revokes all other sessions of that user |

`user` = `{id, username, fullName, role: 'admin'|'cashier', isActive, createdAt}`. **Never** `password_hash` (`api-contract.md`), and the UI never asks for or displays one.

**Role display mapping** (the API's English values have no place in an Indonesian UI):

| API value | Label | Badge tone |
| --- | --- | --- |
| `admin` | **Admin** | `accent` |
| `cashier` | **Kasir** | `neutral` |

`username` is shown with an `@` prefix and is **immutable after creation** — `U3`'s body has no `username` field, and the create form says so on the field itself: *"Username tidak dapat diubah setelah dibuat."* Letting an admin type one, save, and discover it silently ignored would be a lie in the UI.

## 3. States

| State | Rendering |
| --- | --- |
| **Default** | all users, active first, then `fullName` A→Z (locale `id`) |
| **Loading** | 4 × `Skeleton variant="table-row"` (cards at 360) |
| **Empty (no users beyond self)** | should be impossible — the current admin is always a row — so this empty state is defensive only: `EmptyState icon={Users}` — *"Tidak ada pengguna yang cocok"* + **"Hapus filter"** |
| **Empty (search, no match)** | `EmptyState icon={SearchX}` — *"Pengguna \"budi\" tidak ditemukan"* — *"Periksa ejaan nama atau username."* — **"Hapus filter"** (query echoed back) |
| **Error (list)** | inline: `TriangleAlert` + *"Gagal memuat daftar pengguna."* + **"Coba Lagi"** |
| **Error (save)** | inside the form: banner with the server `error.message` shown verbatim; the modal stays open with values preserved |
| **Error (username duplicate)** | `U2` has no dedicated error code in `api-contract.md`; if the server rejects it, the returned message is shown verbatim under the `username` field. The client does **not** invent an Indonesian string for a server answer it has not been given — guessing wrong is worse than quoting the server |
| **Error (deactivate self)** | `409 CANNOT_DELETE_SELF` → the action was already disabled; if forced, toast *"Anda tidak dapat menonaktifkan akun sendiri."* |
| **Error (deactivate last admin)** | `409 LAST_ADMIN` → the action was already disabled; if forced, toast *"Tidak dapat menonaktifkan admin terakhir. Tambahkan admin lain terlebih dahulu."* |
| **Success (create)** | toast *"Pengguna \"Budi Santoso\" ditambahkan."* — the username is deliberately **not** echoed, so a password-adjacent value is not left on screen |
| **Success (update)** | toast *"Perubahan pada \"Budi Santoso\" tersimpan."* |
| **Success (deactivate)** | toast *"Akun \"Budi Santoso\" dinonaktifkan."* + the row flips to **Nonaktif** in place |
| **Success (password reset)** | toast *"Sandi \"Budi Santoso\" berhasil diubah."* + the info line *"Semua sesi lain pengguna tersebut telah diakhiri."* |
| **Success (own password)** | toast *"Sandi Anda berhasil diubah."* |
| **Disabled** | **Nonaktifkan** disabled with `title` *"Anda tidak dapat menonaktifkan akun sendiri."* on the current admin's own row (`user.id === /auth/me.id`); disabled with `title` *"Tidak dapat menonaktifkan admin terakhir."* when the row is the only active admin. The reason is also rendered as visible `caption` helper text in the row's action area, not tooltip-only — a tooltip is invisible on a touch device |
| **Permission denied** | the route is admin-only; a cashier deep-linking it gets a `403`-driven page-level `EmptyState variant="error"` — *"Anda tidak memiliki akses ke halaman ini."* — **"Kembali ke Dashboard"** |
| **Re-activated** | an inactive row shows **"Aktifkan"** in place of *Nonaktifkan* (a `PATCH isActive:true`, no dialog — it is reversible and harmless) |

## 4. Forms

### 4.1 Tambah Pengguna

`Modal size="sm"` (bottom sheet at 360). Title *"Tambah Pengguna"*.

| # | Field | Type | Label | Req | Rules + Indonesian messages |
| --- | --- | --- | --- | --- | --- |
| 1 | `fullName` | Input size="lg" | **Nama lengkap** | yes | placeholder `Contoh: Budi Santoso`; empty → *"Isi nama lengkap."*; min 2 → *"Nama minimal 2 karakter."*; max 80 → *"Nama maksimal 80 karakter."* |
| 2 | `username` | Input | **Username** | yes | prefix `@`, `autoCapitalize="none"`; hint *"Username tidak dapat diubah setelah dibuat."*; empty → *"Isi username."*; `/^[a-z0-9._]{3,32}$/` → *"Username hanya boleh huruf kecil, angka, titik, dan garis bawah, 3–32 karakter."* |
| 3 | `password` | Input type="password" + reveal | **Kata sandi** | yes | empty → *"Isi kata sandi."*; min 8 → *"Kata sandi minimal 8 karakter."*; a strength meter (`Lemah / Sedang / Kuat`) that **never blocks** submission beyond the length rule — a shop counter account is not a bank login, and a strength gate that rejects a usable password pushes staff toward writing it on a sticky note |
| 4 | `role` | RadioGroup | **Peran** | yes | **Kasir** — *"Melayani sesi rental dan pembayaran."* (default) · **Admin** — *"Akses penuh, termasuk pengaturan dan laporan."*; empty → *"Pilih peran."* |

Footer: **"Simpan"** (`loading` → *"Menyimpan…"*) + **"Batal"**. Default role is **Kasir** — the overwhelmingly common case, and the safer default.

### 4.2 Ubah Pengguna

Same modal. `username` renders as a **read-only** `Input` with a `caption` *"Username tidak dapat diubah."*; `password` is **absent** from this form entirely — resetting a password is its own action (§4.4) so an admin editing a display name cannot accidentally overwrite a password.
Fields: `fullName`, `role` (switch to **Kasir** shows, before saving, a `--color-warning-soft` note: *"Pengguna ini akan kehilangan akses ke pengaturan dan laporan."*), `isActive` `Switch`.

### 4.3 Nonaktifkan Pengguna

`ConfirmDialog`, **not** `tone="destructive"` — nothing is destroyed.
Title *"Nonaktifkan \"Budi Santoso\"?"*
Description *"Akun tidak dapat masuk lagi, tetapi seluruh riwayat transaksi dan sesi yang ia catat tetap tersimpan."*
Confirm **"Nonaktifkan"** · cancel **"Kembali"**.
If it is the admin's own row or the last active admin, the confirm button is `disabled` with the matching `title`, and the dialog body explains the rule inline.

### 4.4 Ubah Sandi (per user)

`Modal size="xs"`. Title *"Ubah Sandi — Budi Santoso"*.

| Field | Label | Req | Rules |
| --- | --- | --- | --- |
| `newPassword` | **Kata sandi baru** | yes | min 8 → *"Kata sandi minimal 8 karakter."*; hint *"Semua sesi lain pengguna ini akan diakhiri setelah sandi diubah."* |
| `confirmPassword` | **Ulangi kata sandi baru** | yes | must match → *"Kata sandi tidak sama."* |

The admin is **not** asked for the other user's current password (they do not have it — that is why they are here). The `currentPassword` field of `A4` is for **self**-change only. The dialog's description states the consequence plainly: *"Semua sesi lain pengguna ini akan diakhiri setelah sandi diubah."*

### 4.5 Ubah Sandi Saya (own account, `A4`)

Reached from the user menu in `AppShell` (header avatar → **"Ubah Sandi"**), not from this screen's table.

| Field | Label | Req | Rules |
| --- | --- | --- | --- |
| `currentPassword` | **Kata sandi saat ini** | yes | empty → *"Isi kata sandi saat ini."*; wrong → *"Kata sandi saat ini salah."* (from the server's `error.message`) |
| `newPassword` | **Kata sandi baru** | yes | min 8 → *"Kata sandi minimal 8 karakter."*; same as current → *"Kata sandi baru harus berbeda dari kata sandi saat ini."* |
| `confirmPassword` | **Ulangi kata sandi baru** | yes | must match → *"Kata sandi tidak sama."* |

Title *"Ubah Sandi"*; description *"Setelah sandi diubah, semua sesi lain Anda akan diakhiri. Sesi di perangkat ini tetap aktif."* — the accurate statement for `A4`, which revokes the *other* sessions.

## 5. Interactions

| Element | Action | Confirmation | Toast |
| --- | --- | --- | --- |
| Search | refetch `?q=` (300 ms debounce) | — | — |
| Role / includeInactive filter | refetch | — | — |
| **Tambah Pengguna** | open form (create) | — | create toast |
| Row **Ubah** | open form (edit) | — | update toast |
| Row role → Kasir | warning note in-form | save | — |
| Row **Ubah Sandi** | reset modal | — | reset toast + session-revoked note |
| Row **Nonaktifkan** | `DELETE /users/:id` | `ConfirmDialog` | deactivate toast |
| Row **Aktifkan** | `PATCH isActive:true` | none — reversible | *"Akun \"Budi Santoso\" diaktifkan kembali."* |
| Own avatar → **Ubah Sandi** | own-password modal | — | own toast |
| Own avatar → **Keluar** | `POST /auth/logout` → `/masuk` | — | — |
| `Esc` | close the topmost modal/sheet | — | — |

Row actions are compact at ≥ 768; at 360 they collapse into a single `MoreVertical` (`EllipsisVertical`) `IconButton` opening a bottom sheet with the same three actions — three 44 px buttons in a card footer do not fit, and shrinking them below 44 px would be the wrong trade.

## 6. Responsive

| | 360 px | 768 px | 1280 px |
| --- | --- | --- | --- |
| Content | **cards**: avatar + `Nama`, `@username`, Peran/Status badges, `Dibuat`, `…` actions button | table, 6 columns, actions inline | table, 6 columns, `stickyHeader`; the *Akses* helper text for disabled rows wraps to two lines |
| Search / filters | full width + drawer | inline row | inline row |
| Forms | bottom sheet, `size="lg"` controls, labels above | centred modal | centred modal |
| Add user | sticky bottom bar | header button | header button |
| Table subtitle | — | `caption` under the header | filter results count inline right |

## 7. Keyboard

| Key | Action |
| --- | --- |
| `/` | focus search |
| `N` | open *Tambah Pengguna* |
| `↓ / ↑` | move through rows while search is focused |
| `Enter` on a focused row | open *Ubah* |
| `Esc` | close the topmost modal/sheet; `Esc` on a focused card cancels the `…` sheet |

## 8. Accessibility

1. **The self-guard and last-admin guard are visible text**, not `title`-only: a `caption` under the row's action area reads *"Anda tidak dapat menonaktifkan akun sendiri."* / *"Admin terakhir tidak dapat dinonaktifkan."* Tooltips do not exist for touch or keyboard users who never hover.
2. **Destructive-vs-reversible wording is honest**: *Nonaktifkan* is not styled as destructive and the dialog states the data is kept and the action can be undone. Over-styling a reversible action as destructive trains users to ignore red.
3. **Role is never colour-only** — each is a text badge (`Admin` / `Kasir`) and the role also appears as a filter value. The `accent` tone on **Admin** is a scanning aid, not the meaning.
4. **Password fields** have a reveal toggle with `aria-label` *"Tampilkan kata sandi"* / *"Sembunyikan kata sandi"`, `autocomplete="new-password"`, and never a `value` echoed into a toast or console. No password is ever rendered in a `title`, an error, or the table.
5. **The strength meter** is `role="status"` announcing *"Kekuatan kata sandi: sedang"*, and its bar is not the only signal (the words are).
6. **Table** has `<caption class="sr-only">` *"Daftar pengguna"*, `scope="col"` headers, and the avatar circle is `aria-hidden` (the name beside it is the label).
7. **Focus management**: the create/edit modal traps focus, focus returns to the trigger on close, and after a save the changed row's action button regains focus rather than the page top.
8. **Contrast** — `--color-text` on `--color-surface` (15.08:1) for names; `--color-text-secondary` `#AEB9D2` (8.98:1) for usernames and dates; `Admin` badge `accent` text `#A78BFA` on `--color-accent-soft` `#201838` (6.18:1); `Aktif` badge `#34D399`-family on `#0B2118` (8.77:1); the role-downgrade warning `#FBBF24` on `--color-warning-soft` `#2A210C` (9.52:1). All from `DESIGN.md` §3.
9. **Reduced motion** — modal and row-flip transitions become instant.
10. **`<html lang="id">`**; the whole screen is Indonesian, including the badge labels derived from English API values (`admin` → *Admin*, `cashier` → *Kasir*).
