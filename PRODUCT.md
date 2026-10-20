# PlayRent — Product Context

Register: **product** (design serves the task, not the brand).

## What it is
PlayRent is an operational web app for Indonesian PS4/PS5 rental shops (*rental PlayStation*). It manages consoles, live rental sessions with countdown timers, bookings, payments, receipts, reports, and business settings.

## Who uses it
- **Kasir (cashier)** — at the counter, standing, **on a phone**, with a customer waiting in front of them. Speed of the start-session → finish → pay loop is the whole product. Primary device constraint: **360 px**.
- **Admin / pemilik (owner)** — on a laptop/desktop, reviewing revenue, managing consoles, users, games, and settings.

## Language & locale
- UI language: **Bahasa Indonesia** (cashiers are not English speakers; no English labels anywhere).
- Currency: **IDR**, formatted `Rp 25.000` (dot thousands separator, no decimals, no `,00`).
- Date/time: **Asia/Jakarta**, displayed `19 Okt 2026, 20.15` (24-hour, dot separator, abbreviated Indonesian month).
- Timers: `HH:MM:SS`, derived from a stored `endsAt`, never decremented.

## The one job that matters
Get a customer onto a console, and get them paid, without the cashier thinking. Every other screen supports that or the owner's oversight of it.

## What it must never feel like
Not a generic dark analytics dashboard. Not a gaming-café neon poster. A **quiet, fast, high-contrast rental counter tool** that happens to look like it belongs to a gaming lounge.

## Constraints from ARCHITECTURE.md
React 19 + TS + Vite + Tailwind v4 + `lucide-react`. Charts are hand-rolled SVG (no chart library). All money/duration math is server-side; the UI previews via `POST /api/sessions/quote`.
