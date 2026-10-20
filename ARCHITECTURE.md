# PlayRent — Architecture Contract

> Frozen contract. Every subagent MUST read this before working. Do not renegotiate.

## Runtime reality (verified on this device)

| Item | Value |
| --- | --- |
| Node | v26.4.0 (no build step needed for backend) |
| SQLite | `node:sqlite` built-in — **stable, no `--experimental-*` flag needed** |
| SQLite version | 3.53.4 (bundled) |
| Test runner | `node:test` built-in (no jest/vitest for backend) |
| HTTP client for integration tests | global `fetch` (built-in) |
| TZ data | tz 2026a, ICU 78 — `Intl.DateTimeFormat` with `timeZone: 'Asia/Jakarta'` works |
| Platform | Android aarch64 / Termux |
| Cores / RAM | 8 / 7.6 GB |
| Python | 3.14 available (not required) |

## Stack decisions (and why the alternatives were rejected)

| Layer | Chosen | Rejected alternative & reason |
| --- | --- | --- |
| DB driver | `node:sqlite` (built-in) | `better-sqlite3` → needs node-gyp + Android NDK; `sqlite3` → same. Native compile on Termux is the #1 failure mode. |
| Password hashing | `node:crypto` `scrypt` (built-in) | `bcrypt`/`argon2` → native compile. |
| Sessions | Opaque random token (32 bytes) in `sessions` table + `httpOnly` `SameSite=Lax` cookie | `express-session` + memory store (leaks on restart, extra dep); JWT (can't revoke). |
| Backend language | **Plain JS (ESM)**, not TS | No compile step, no `tsx`/`ts-node` dep, faster iteration. Types documented via JSDoc + this contract. |
| Frontend | React 19 + TypeScript + Vite | Required by plan. |
| Styling | Tailwind CSS v4 via `@tailwindcss/vite` | Plan allows; v4 plugin avoids PostCSS config files. |
| Icons | `lucide-react` | Plan requires a maintained icon lib. |
| Charts | Hand-rolled SVG chart component | `recharts` is ~500 kB for 2 chart types. Only add a chart lib if the custom one measurably falls short. |
| Validation | `zod` on **both** server and client | Plan requires schema validation. Shared schemas live in each package (no monorepo build). |
| Frontend unit tests | none by default | Backend integration tests cover business logic; frontend is covered by `tsc` + build. Add Vitest only if a real frontend logic module appears. |

## Architectural rules (non-negotiable)

1. **All money and duration math happens on the server.** `POST /api/quote` exists so the UI can preview price, but the transaction amount is always recomputed server-side at `finish`/`pay` time. Never trust a client-sent total.
2. **All timestamps stored as ISO-8601 UTC strings** (`new Date().toISOString()`). Never store local time. Display via `formatJakarta()` which uses `Intl.DateTimeFormat('id-ID', {timeZone:'Asia/Jakarta'})`.
3. **Timers are derived, never decremented.** A rental session stores `started_at` and `ends_at`. The UI computes `remaining = ends_at - Date.now()` on every tick. A page reload therefore cannot drift the timer.
4. **Atomic business operations use SQLite transactions.** Start session, finish+pay, check-in, void — all wrapped in `BEGIN IMMEDIATE … COMMIT` (see `db.js` `withTx`).
5. **Race safety on unit occupancy is enforced by the DB, not by a JS check.** `rental_sessions` carries a partial unique index guaranteeing at most one `active`/`overdue` session per console. A double-click therefore fails on the INSERT, not silently duplicates.
6. **Authorization is enforced server-side on every route** via `requireAuth` + `requireRole('admin')`. The frontend hides UI, it does not enforce.
7. **Soft delete only** for `consoles`, `games`, `users`, `transactions` (`is_active` / `status` columns). Operational history is never hard-deleted.
8. **Errors never leak stack traces.** Central error handler maps `AppError` → envelope; unknown errors → generic 500 + `console.error` server-side only.

## Response envelope (every endpoint, no exceptions)

Success:
```json
{ "success": true, "data": { }, "meta": { "total": 0, "page": 1, "limit": 20 } }
```
Failure:
```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "Durasi minimal 30 menit", "details": [] } }
```

HTTP codes: `200` ok, `201` created, `400` validation, `401` unauthenticated, `403` forbidden, `404` not found, `409` conflict (double booking / unit occupied), `429` rate-limited, `500` internal.

## Folder layout

```
PlayRent/
├── plan.md
├── ARCHITECTURE.md          ← this file (frozen)
├── api-contract.md          ← endpoint contract (frozen)
├── DESIGN.md                ← design tokens (owned by @designer)
├── specs/                   ← per-screen specs (owned by @designer) + implementation-summary.md
├── server/
│   ├── package.json         ← ESM, deps: express, cors, cookie-parser, zod
│   ├── .env.example
│   ├── src/
│   │   ├── index.js         ← boots http server
│   │   ├── app.js           ← createApp() → express app (testable, no listen)
│   │   ├── config.js        ← env parsing + defaults
│   │   ├── db.js            ← DatabaseSync open, migrate(), withTx()
│   │   ├── schema.sql       ← canonical schema + indexes
│   │   ├── seed.js          ← idempotent demo data
│   │   ├── lib/
│   │   │   ├── auth.js      ← hashPassword/verifyPassword, session create/read/revoke, middleware
│   │   │   ├── errors.js    ← AppError, codes, asyncHandler, errorHandler
│   │   │   ├── time.js      ← nowIso(), formatJakarta(), addMinutes(), dayRange()
│   │   │   ├── pricing.js   ← quote(), overtime(), rounding()  ← SINGLE SOURCE OF TRUTH
│   │   │   ├── validate.js  ← zod helper: parse(schema, req) → throws AppError
│   │   │   └── csv.js       ← toCsv(rows, columns)
│   │   └── routes/
│   │       ├── index.js     ← mounts all routers under /api
│   │       ├── auth.js  users.js  consoles.js  sessions.js
│   │       ├── bookings.js  transactions.js  games.js
│   │       └── reports.js  settings.js  dashboard.js
│   └── test/
│       ├── helpers.js       ← startTestServer(), login(), api()
│       └── *.test.js        ← node:test files (see plan section O)
└── web/
    ├── package.json         ← React 19, Vite, TS, Tailwind v4, lucide-react, zod, react-router
    ├── vite.config.ts       ← server.proxy /api → http://127.0.0.1:4000
    ├── tsconfig.json
    ├── index.html
    └── src/
        ├── main.tsx  App.tsx  index.css
        ├── lib/      api.ts, format.ts, useCountdown.ts, auth.tsx
        ├── components/  Layout, Sidebar, TopBar, DataTable, Modal, StatusBadge,
        │                ConsoleCard, EmptyState, Spinner, ConfirmDialog, Chart, ...
        └── pages/    Login, Dashboard, Consoles, RentalSessions, Bookings,
                      Transactions, Games, Reports, Settings, Users
```

## Ports

- Backend API: `PORT=4000` (`server/.env`)
- Frontend dev: `5173`, Vite proxies `/api` → `127.0.0.1:4000`
- Production: `server` serves `web/dist` statically as fallback (single-process deploy)

## Definition of done for any delegated task

1. Files written to the paths above (exact names).
2. Minimum verification run and its **raw output** reported: backend → `npm test`, `node --check`; frontend → `npx tsc --noEmit`, `npm run build`.
3. Report format: files touched, commands run, `verified` / `partially_verified` / `not_verified`.
4. No `console.log` left in `src/` (except the boot banner in `index.js` and `console.error` in the error handler).
