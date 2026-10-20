# DESIGN-SUMMARY

Dark operational UI for a PS rental counter. **Product register** — clarity and speed over self-expression. Bahasa Indonesia, IDR, Asia/Jakarta.

**Tokens** (Tailwind v4 `@theme`, full block in `DESIGN.md` §2)
`bg #0A0E1A` · `sidebar #0D1322` · `surface #121829` · `surface-2 #182034` · `hover #1E2841` · `border #273250` (decorative) · `border-strong #546490` (3.03:1) · `text #E9EDF7` (15.08:1) · `text-secondary #AEB9D2` (8.98:1) · `text-muted #8590A8` (5.51:1) · `accent #7C3AED` (white 5.70:1) · `accent-hover #7C4EEA` · `accent-text #A78BFA` (6.49:1) · `cyan #22D3EE` (ink 10.65:1) · `focus #22D3EE` · `success #34D399` · `warning #FBBF24` · `danger #F87171` · `danger-strong #DC2626` · `danger-text #FCA5A5` · `info #38BDF8`

**Type** Inter only. body 15px · label 13px · caption 12px · `num-lg` 28px (timer) · `num-xl` 36px (total). `.tnum` on every number. Radius 6/10/14/full. Motion 120/180/240 ms, `prefers-reduced-motion` respected.

**Status → colour** (labels only in the UI; English values stay in the API)

| Domain | Value | Label | Token |
| --- | --- | --- | --- |
| console | `available` | Tersedia | success |
| console | `in_use` | Sedang Bermain | cyan |
| console | `reserved` | Dipesan | accent-text |
| console | `maintenance` | Perawatan | warning |
| session | `active` | Berjalan | cyan |
| session | `overdue` | Lewat Waktu | danger-text |
| session | `finished` | Selesai | text-secondary |
| session | `void` | Dibatalkan | text-muted |
| booking | `pending` | Menunggu | warning |
| booking | `confirmed` | Dikonfirmasi | cyan |
| booking | `checked_in` | Check-in | success |
| booking | `completed` | Selesai | text-secondary |
| booking | `cancelled` | Dibatalkan | text-muted |
| payment | `paid` / `unpaid` / `void` | Lunas / Belum Bayar / Dibatalkan | success / warning / danger-text |

Accent purple is for **actions**, cyan for **live/in-progress**. Every badge is icon + label + text token on its own `-soft` fill; full table with ratios in `DESIGN.md` §3.6.

**Breakpoints** 360 (actions) · 640 (table→cards) · 768 (two-col, targets) · 1024 (sidebar) · 1280 (max).

**Five rules**
1. Server computes money and duration; the client renders `endsAt` and never decrements a timer. Status is never recomputed client-side.
2. Recorded revenue and unpaid revenue are **separate labelled cells** — never blended, never colour-only.
3. Every number is `.tnum` + Indonesian formatting; every label/error is Bahasa Indonesia, including for English API values and error codes.
4. Status = icon + text + colour; every screen defines empty, error, loading, disabled and permission-denied.
5. Mutations are guarded (double-submit), reversible actions are not styled as destructive, and destructive ones need `<ConfirmDialog>` + a typed reason/number.

Per-screen specs: `sessions.md` · `login.md` · `dashboard.md` · `consoles.md` · `bookings.md` · `transactions.md` · `games.md` · `reports.md` · `settings.md` · `users.md`; primitives: `components.md`.
