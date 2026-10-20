# specs/login.md — Masuk

**Purpose.** Authenticate a cashier or admin into the counter app, quickly, on a phone.
**Primary user.** Both (unauthenticated).
**Single most important action.** **Masuk** — get past this screen in under ten seconds.

---

## 1. Layout (mobile first, stacked regions)

Centred single column, no sidebar, no bottom nav (`AppShell` renders a bare shell).

1. **Brand block** — wordmark *"PlayRent"* in `display`, `--color-text`; `caption` line *"Sistem Manajemen Rental PlayStation"* in `--color-text-muted`. Above it, a `Gamepad2` glyph at 32 px in `--color-accent-text` — the only accent on the screen, paired with the primary button's purple.
2. **Form card** — `Card padding="lg"`, `max-w-sm` at 360, `max-w-md` at ≥ 768, vertically centred.
   - `Input label="Nama pengguna"` — `autoComplete="username"`, `autoCapitalize="none"`, `autoCorrect="off"`, `inputMode="text"`, `size="lg"`, `requiredMark`.
   - `Input label="Kata sandi" type="password"` with a show/hide `IconButton` (`Eye`/`EyeOff`, `aria-pressed`, label *"Tampilkan kata sandi"* / *"Sembunyikan kata sandi"*), `autoComplete="current-password"`, `size="lg"`, `requiredMark`.
   - **Global error region** — above the button, `role="alert"`, `--color-danger` text on `--color-danger-soft`, 8 px padding, `--radius-md`. Empty by default (no reserved space — it appears only when there is an error).
   - `Button type="submit" variant="primary" size="lg" fullWidth` — **"Masuk"**; `loading` → label **"Memproses…"**.
3. **Footer** — `caption` *"PlayRent v{version}"* from `GET /api/health` (optional; hidden if it fails).

At **768 px+**: the card is centred in the viewport with the brand block above it; a shallow `--color-surface` panel never appears — the card sits directly on `--color-bg`.

## 2. Data

| Endpoint | Body | Notes |
| --- | --- | --- |
| `POST /api/auth/login` | `{username, password}` | sets the `pr_session` httpOnly cookie; returns `{user}` |
| `GET /api/auth/me` | — | run on app boot to restore a session; `401 SESSION_EXPIRED` → this screen |
| `GET /api/health` | — | optional `version` |

`user = {id, username, fullName, role, isActive, createdAt}`. On success the app routes by role: **admin** → `/dashboard`; **cashier** → `/sesi` (the cashier's job is live sessions, not charts).

## 3. States

| State | Rendering |
| --- | --- |
| **Default** | empty fields, submit enabled, no error text |
| **Loading (submit)** | button `loading` + "Memproses…", both fields `disabled`, `aria-busy="true"`. Spinner is inside the button only. |
| **Loading (session restore)** | full-screen `Skeleton variant="card"` in the card position + a `caption` *"Memeriksa sesi…"* — never a flash of the login form for an already-logged-in user |
| **Empty** | n/a (the form *is* the empty state) |
| **Error — bad credentials** (`401 INVALID_CREDENTIALS`) | `role="alert"` region: **"Nama pengguna atau kata sandi salah."** Password field is cleared, username kept; focus returns to the password field |
| **Error — rate limited** (`429 RATE_LIMITED`) | `role="alert"`: **"Terlalu banyak percobaan. Coba lagi dalam 15 menit."** Submit stays disabled with a live `caption` countdown — this is the *only* place a countdown is shown, and it is driven by the client's estimate of the 15-minute window, not the server's clock |
| **Error — validation** (`400 VALIDATION_ERROR`) | field-level, from `error.message` |
| **Error — network / 500** | `role="alert"` *"Tidak dapat menghubungi server. Periksa koneksi lalu coba lagi."* + **"Coba Lagi"** |
| **Success** | no toast (a toast would fire before the destination renders and look like a glitch); the button switches to success label **"Berhasil"** for ~300 ms with a `CircleCheck` icon, then the route changes |
| **Disabled** | submit disabled while either field is empty (error prevention: don't let the user fire an empty request) |
| **Permission denied** | n/a |

## 4. Field-level specs

| Field | Label | `required` | Hint / placeholder | Validation (Indonesian) |
| --- | --- | --- | --- | --- |
| username | **Nama pengguna** | yes | placeholder `contoh: kasir1` | empty → *"Isi nama pengguna."*; < 3 chars → *"Nama pengguna minimal 3 karakter."* |
| password | **Kata sandi** | yes | none (never hint a password format on the login form) | empty → *"Isi kata sandi."*; < 8 chars → *"Kata sandi minimal 8 karakter."* |

Neither field is ever `readOnly`. Both are `disabled` only during submit. Errors clear on the next input event (`onInput`), not on blur, so the message does not linger.

## 5. Interactions

| Element | Action | Toast / feedback |
| --- | --- | --- |
| **Masuk** | `POST /api/auth/login` | on success: inline button state, then route change. Never a toast. |
| `Enter` in either field | submit | same |
| Eye toggle | show/hide password | none; `aria-pressed` flips; accessible label changes |
| Failed submit | keep username, clear password, focus password | `role="alert"` announced |

## 6. Responsive

| | 360 px | 768 px | 1280 px |
| --- | --- | --- | --- |
| Card | full width minus 16 px gutters, `--radius-lg` | `max-w-md` centred, 24 px gutters | same, `max-w-md` centred in viewport |
| Inputs | `size="lg"` (48 px) — comfortable thumb targets | `size="lg"` | `size="lg"` |
| Brand | 32 px wordmark | 32 px | 32 px |
| Vertical | card starts ~12 % from the top so the keyboard does not hide the button; body scrolls | centred | centred |

## 7. Keyboard

`Enter` submits from any field. `Tab` order: username → password → eye toggle → submit. No custom shortcuts (a login screen has no power-user path worth inventing). Focus lands on **username** on mount.

## 8. Accessibility

1. `<html lang="id">`. `<title>` = *"Masuk — PlayRent"*.
2. `autoComplete="username"` / `"current-password"` so password managers work — required for the cashier who logs in every shift.
3. Global error region uses `role="alert"` so it is announced immediately on arrival.
4. Field errors use `aria-describedby` + `aria-invalid`.
5. The eye toggle has a real accessible label that changes with state; it is never an unlabelled icon.
6. Autofocus on username, but the focus ring is only shown for keyboard interaction (`:focus-visible`).
7. Loading is announced via `aria-busy` + the button's changed text — a screen reader hears "Memproses…".
8. No CAPTCHA, no puzzle, no animated background: this screen is used one-handed, standing, 30 times a day.
