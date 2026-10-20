# Design QA — PlayRent (DS-002 + DS-003 re-QA)

Standard: `DESIGN.md` §2/§5/§7/§8/§10/§11 + `specs/DESIGN-SUMMARY.md`. Static source review + emitted `web/dist` CSS. No browser.

## Round 1 (original) — Verdict: FAIL ❌

1 hard blocker (English status on DOM) + 2 blocker-tier token breaks.

### Blockers

| # | Finding | Evidence | Round 2 status |
| --- | --- | --- | --- |
| B1 | Console `maintenance` rendered English `Maintenance`, tone `neutral`. §7 = **Perawatan**/warning. | `lib/status.ts:18` | **RESOLVED** — `lib/status.tsx:26` (`Perawatan`/`warning`/`Wrench`) |
| B2 | Colour drift: `--color-cyan` defined but unused; many statuses off-spec. | `lib/status.ts:15-39` | **RESOLVED** — `lib/status.tsx:22-54` (all 14 rows, table below) |
| B3 | `text-success-text` / `text-warning-text` do not exist in `@theme`; Tailwind drops them. | `session-dialogs.tsx:322,372,375,386,387,439` | **RESOLVED** — now `text-success` / `text-warning` at `315,322,372,375,386,387,439`; no new tokens |

**B2 status rows (all re-verified against §7)**

| Surface | Required | Implemented | Status |
| --- | --- | --- | --- |
| console `in_use` | Sedang Bermain / cyan / Gamepad2 | `status.tsx:24` | RESOLVED |
| console `reserved` | Dipesan / accent-text / CalendarClock | `status.tsx:25` → `bg-accent-soft text-accent-text` | RESOLVED |
| console `maintenance` | Perawatan / warning / Wrench | `status.tsx:26` | RESOLVED |
| session `active` | Berjalan / cyan / Timer | `status.tsx:30` | RESOLVED |
| session `overdue` | Lewat Waktu / danger-text / TriangleAlert | `status.tsx:31` → `text-danger-text` | RESOLVED |
| session `void` | Dibatalkan / text-muted / Ban | `status.tsx:33` → `text-text-muted` | RESOLVED |
| booking `pending` | Menunggu / warning / Hourglass | `status.tsx:37` | RESOLVED |
| booking `confirmed` | Dikonfirmasi / cyan / CalendarCheck | `status.tsx:38` | RESOLVED |
| booking `checked_in` | Check-in / success / LogIn | `status.tsx:39` | RESOLVED |
| booking `completed` | Selesai / text-secondary / CircleCheck | `status.tsx:40` | RESOLVED |
| booking `cancelled` | Dibatalkan / text-muted / XCircle | `status.tsx:41` | RESOLVED |
| booking `isExpired` | Kedaluwarsa / danger-text / CalendarX | `Bookings.tsx:137` | RESOLVED |
| tx `status:completed` | Selesai / text-secondary | `status.tsx:46` | RESOLVED |
| tx `status/paymentStatus:void` | Dibatalkan / danger-text | `status.tsx:47,53` | RESOLVED |

### Majors (≥3 ⇒ also fail)

| # | Finding | Evidence | Round 2 status |
| --- | --- | --- | --- |
| M1 | No badge carried its §7 icon. | `Badge.tsx`, `types.ts:10` | **RESOLVED** — per-status icons `status.tsx:23-41`; `Tone` gained `muted` `types.ts:5,20,31`; fallback kept `Badge.tsx:55` |
| M2 | Dashboard severity labels wrong, no icon. | `Dashboard.tsx:169-171` | **RESOLVED** — `Dashboard.tsx:35-37` + icon at `174` |
| M3 | Chart: 3 ticks, `preserveAspectRatio="none"`, dynamic skeleton class. | `Chart.tsx:43,57,77` | **RESOLVED** — 4 ticks incl. 0 `Chart.tsx:33-35`; viewBox = measured box, no `preserveAspectRatio` `100`; inline `style` height `185` |
| M4 | `backdrop-blur`; topbar missing `--shadow-e1`. | `AppShell.tsx:105,276` | **RESOLVED** — no `backdrop-blur` anywhere (`grep` clean); `shadow-e1` at `105` |
| M5 | Touch targets < 44 px. | `Button.tsx:19,77`, `Pagination.tsx:47,69` | **RESOLVED** — `sm` adds 44 px invisible area `Button.tsx:20,23` (emitted CSS: `inset-block:calc(var(--spacing) * -1.5)` = −6 px around h-8); IconButton `size-11` `82-84`; numbered pagination `size-11` `Pagination.tsx:69` |
| M6 | Chart tooltip had border **and** shadow. | `Chart.tsx:140` | **RESOLVED** — `Chart.tsx:164`: `shadow-e2`, no border |
| M7 | Admin guard counted filtered page rows. | `Users.tsx:64,69` | **RESOLVED** — `Users.tsx:65-66` counts `allUsers.data.items`; server `/users` is unpaginated (`server/src/routes/users.js:34-42`), so the count is complete |
| M8 | Bookings rendered rows twice. | `Bookings.tsx:203-249` | **RESOLVED** — `<ol>` dropped (`Bookings.tsx:190-193`), DataTable kept; rows still time-sorted `70` and show `Mulai` `132` |

### Minors

| # | Finding | Round 2 status |
| --- | --- | --- |
| 1 | Print `@page` A4/12 mm | **RESOLVED** — `index.css:165` `80mm auto`, margin 0 |
| 2 | `Skeleton` bare `rounded` | **RESOLVED** — `Feedback.tsx:61,64,69-71,78` all on 6/10/14 scale |
| 3 | `ROW_ACTIONS` exported unused / 36 px promise | **RESOLVED** — symbol gone (`grep` NONE); IconButton `sm` = 44 px |
| 4 | `setWide` called during render | **RESOLVED** — `Chart.tsx:40-47` |
| 5 | Clickable `<tr role="button">`, Enter only | **RESOLVED** — `role="row"`, Enter + Space `DataTable.tsx:159-166` |
| 6 | Receipt iframe no loading/error | **RESOLVED** — `Receipt.tsx:68-88` (see caveat below) |
| 7 | Overtime on 15 s poll | **RESOLVED** — 1 s tick `SessionDetail.tsx:40,86` |

## Re-QA round 2 (DS-003) — Verdict: PASS ✅

11/11 blocker+major findings and 7/7 minors resolved; 14/14 B2 status rows correct. 0 blockers, 0 majors, 0 regressions.

### Regression hunt (all clear)

- **Rename `status.ts` → `status.tsx`** — only `web/src/lib/status.tsx` exists; 9 import sites resolve via extensionless `'../lib/status'` (ConsoleCard, Bookings, Games, Reports, SessionDetail, Sessions, TransactionDetail, Transactions, Units). No duplicate map, no stale `.ts` import.
- **`effectiveSessionStatus()`** — unchanged and correct (`status.tsx:72-75`); used at `ConsoleCard.tsx:31`, `Sessions.tsx:110`, `SessionDetail.tsx:85,38`, `Units.tsx:232`. Dashboard shows the backend `ending-soon.severity` per §7 D3, not a raw session status — no gap.
- **`muted` tone** — `bg-neutral-soft text-text-muted` (`types.ts:20`), 4.57:1 on `#1E2841` (`DESIGN.md:221`), AA. Used only for session `void` and booking `cancelled` (`status.tsx:33,41`) — never as a general neutral.
- **Button hit area** — `relative` is part of `HIT_AREA`, so the `::before` anchors correctly; it expands only vertically (44 px on h-8), never horizontally, so row-action/pagination siblings are not covered; icon-only targets are a true `size-11` (44 px), so they rely on no pseudo-element. Gap of 4 px between stacked `sm` hit areas exists only in empty space, over no visible control.
- **Bookings `<ol>` removal** — no specified agenda grouping in `specs/bookings.md`; the table retains time order (`:70`) and the `Mulai` column (`:132`). The Jadwal *timeline* remains unbuilt (pre-existing gap, see below), not a regression of this pass.
- **Chart** — `valueTicks` is [max, ⅔max, ⅓max, 0] = 4 incl. 0 (`Chart.tsx:33-35`); skeleton has real height because the computed inline style overrides `h-16` (`:185`). Inline style is **legitimate** here: the value is computed from `matchMedia` + prop (responsive layout), not a design token, and is exactly the exception the rule allows.
- **Tokens/hex/types** — no new raw hex, arbitrary colour, or non-token class in changed files (`grep` clean); no new `any`, `@ts-ignore`, or non-null assertion. Emitted CSS contains `text-success`, `text-warning`, `text-cyan`, `text-accent-text`, `bg-cyan-soft`, `bg-warning-soft`, `size-11`, and the `before:` hit-area rule.

### New findings (minor only, non-blocking)

1. **`specs/bookings.md:11,16,108` Jadwal/Daftar timeline toggle still not built** — the page has status filter tabs plus one list. Pre-existing spec gap; the removed `<ol>` was not the timeline. Minor.
2. **`Users.tsx:65` adds a second all-users fetch** — one extra request per mount/page change; count is correct because the endpoint is unpaginated. Minor/network only.
3. **`DataTable.tsx:159-166` focusable row is announced as a row, with no hint that Enter/Space opens it.** Row semantics preserved, keyboard works. Minor a11y polish.
4. **`Receipt.tsx:69-70` iframe `onError` does not fire for HTTP 4xx/5xx bodies**, so a server error page can leave the loading overlay visible. Minor; spec's states exist.

### 15-page state coverage (re-confirmed)

| Page | Loading | Error | Empty/Not-found |
| --- | --- | --- | --- |
| Dashboard | ✅ summary/activity/charts | ✅ inline + EmptyState | ✅ activity/ending/charts |
| Units | ✅ table | ✅ table | ✅ filter-aware |
| Games | ✅ table | ✅ | ✅ |
| Sessions | ✅ table | ✅ | ✅ |
| SessionDetail | ✅ skeleton | ✅ | ✅ not-found |
| Bookings | ✅ table | ✅ | ✅ |
| BookingNew | ✅ units/rooms | ✅ | ✅ units |
| SessionStart | ✅ units | ✅ | ✅ |
| Transactions | ✅ table | ✅ | ✅ |
| TransactionDetail | ✅ | ✅ | ✅ not-found |
| Receipt | ✅ frame overlay | ✅ frame + missing tx | ✅ |
| Reports | ✅ charts/table | ✅ | ✅ |
| Users | ✅ table | ✅ | ✅ |
| Settings | ✅ form | ✅ | n/a |
| Login | ✅ submit | ✅ alert | n/a |
| NotFound (extra) | n/a | n/a | ✅ |

### Cannot be verified without a browser

Composited contrast, rendered spacing/rhythm, real hit-area overlap in situ, motion feel, 360 px overflow, chart bar geometry at real widths, printed 80 mm output, screen-reader row-activation announcement.

**Resolved: 18/18 headline findings + 14/14 B2 status rows. Still failing: 0. New blockers/majors: 0. New minors: 4.**

**Self-rating: `partially_verified`** — every verdict source-evidenced with file:line, and emitted CSS checked; visual/composited claims remain unverified.

## DS-004 — Booking timeline

**Verdict: FAIL ❌** — 1 blocker · 4 major · 6 minor. Timeline only; DS-003 verdict stands for the rest.

| Sev | Finding | Evidence |
| --- | --- | --- |
| blocker | Row-level `Enter`/`Space` handler swallows row actions. Keydown from Check-in/Ubah/Batalkan bubbles to the row, which `preventDefault()`s and opens the edit modal. Mouse is safe (`stopPropagation`), keyboard is not — Check-in cannot be activated by keyboard. | `DataTable.tsx:166-168` (table), `:234-236` (card); triggered by `Bookings.tsx:265`; actions `:275-290` |
| major | Block target is 40 px tall (`h-12` lane 48 − `inset-y-1` 8), under the 44 px floor; 30-min blocks are ~20 px wide at 768 and ~28 px at 1280. | `BookingTimeline.tsx:71,103`; `DESIGN.md:337` |
| major | At 768 the day does **not** scroll as §6 requires: panel = 768−32−2 = 734 px, so `min-w-[720px]` fits; track compresses to ~646 px (30-min ≈ 20 px). Any scrollbar comes from the hour labels overflowing, not from the day. | `BookingTimeline.tsx:54-55,58-63`; `AppShell.tsx:128`; `specs/bookings.md:109` |
| major | Hour labels are `justify-between` boxes, not anchored to their gridlines; each label centre sits ~20 px (≈22–28 min) right of its hour line, and the 17 labels overflow the track at 768. | `BookingTimeline.tsx:59-63,79` |
| major | `isExpired` is ignored. A confirmed-but-expired booking renders cyan **Dikonfirmasi**, not **Kedaluwarsa**/danger/`CalendarX`; worst on the Kedaluwarsa tab. | `BookingTimeline.tsx:91-93`; `specs/bookings.md:54`; `DESIGN.md:374` |
| minor | Text is shown by `durationMinutes >= 60`, not by whether it fits; a 60-min block at 768 is ~40 px and renders icon + a truncated fragment instead of icon-only. | `BookingTimeline.tsx:110-111` |
| minor | `aria-label` omits the spec's "Booking" prefix and uses `–`; spec wording is "… sampai …". `HH.mm` is correct. | `BookingTimeline.tsx:93`; `specs/bookings.md:128` |
| minor | A booking extending past 24:00 is clipped, `edge` stays `inside`, so no ring marks the continuation; it can look like it ends at midnight. | `timeline.ts:56`; `BookingTimeline.tsx:105` |
| minor | No consoles renders one sentence, not the §3 EmptyState + **Tambah Unit**. | `BookingTimeline.tsx:36-38`; `specs/bookings.md:45` |
| minor | Half-hour lines are `bg-border/40` (~1.15:1); hour vs half-hour is opacity-only and ~20 px apart at 768. | `BookingTimeline.tsx:77` |
| minor | Receipt 5 s timeout can flash "Gagal memuat struk" on a slow-but-successful load; `onLoad` later clears it. 5 s is aggressive for a cold LAN/phone. | `Receipt.tsx:29-32` |

**Contrast (computed from `DESIGN.md` §2, 12 px caption needs 4.5:1):** warning `#FBBF24` on `#2A210C` **9.52:1**; accent `#A78BFA` on `#201838` **6.18:1**; cyan 8.32; success 8.77; neutral 7.44; muted 4.57; focus ring 9.78 on surface / 8.79 on warning-soft / 9.30 on accent-soft. All pass.

**1280 fit:** 1280 − 240 sidebar (`AppShell.tsx:90`) = 1040; − 2×24 main padding (`:128`) = 992 panel; − 2 border − 88 lane label = **902 px track** → 56.4 px/hour, 28.2 px per 30 min. `min-w-[720px]` is not binding; full 08:00–24:00 fits without scrolling. (DESIGN's 32 px gutters would give 976/886; still fits.)

**Passes:** lanes sorted by `code` with sticky opaque labels (holds); icon always rendered; empty lanes keep gridlines; `TONE_CLASS[BOOKING_STATUS[s].tone]` only, no raw hex/second map; lane identity by position+label; no zero-width/focusless block; no duplicate `<ol>`/table; 768/1280 defaults + `playrent.booking.view` persistence correct; mouse row actions intact; no `any`/`@ts-ignore`; inline styles are computed geometry.

**Browser-only:** sticky-label compositing, real font metrics (label misalignment), focus ring over fills, 768 scrollbar, keyboard row-action swallow, screen-reader en-dash pronunciation, 5 s flash.

**Self-rating: `partially_verified`** — source-evidenced; visual/keyboard runtime claims need a browser.

## DS-005 — Booking timeline re-QA

**Verdict: FAIL ❌** — timeline only; DS-003 remains PASS for the rest. 0 blockers. 3/4 majors fully resolved, 1 partial (block width). 3/6 minors resolved, 1 partial, 2 still failing. The FAIL is one genuine `specs/bookings.md` §3 miss, not a blocker: the no-consoles state (`BookingTimeline.tsx:36-38`). 0 regressions.

| DS-004 finding | Status | Evidence |
| --- | --- | --- |
| blocker — row keydown swallows row actions | **RESOLVED** | `DataTable.tsx:168,241` return before `preventDefault`; actions `td` `:198`, checkbox `td` `:174`; card guard `:237` |
| major — block target 40 px tall / ~20 px wide | **PARTIALLY** | `BookingTimeline.tsx:89` `h-11` + `:129` `inset-y-0` = 44 px tall. Width still 25.3 px @768, 28.2 px @1280 (`:60` `min-w-[896px]`, `timeline.ts:8`). See judgement 2 |
| major — 768 day does not scroll | **RESOLVED** | panel ≈734 px < `min-w-[896px]` (`BookingTimeline.tsx:60`); inner track 808 px |
| major — labels not on gridlines / overflow | **RESOLVED** | labels `left: i/16` (`:70`), gridlines `step/32` (`:97`); hour *k* = step 2*k* ⇒ identical axis. First/last translated to stay inside `:71-75` |
| major — `isExpired` ignored | **RESOLVED** | `:109` `EFFECTIVE_BOOKING_STATUS[effectiveBookingStatus(b)]`; map `status.tsx:47-56` |
| minor — text shown by duration, not fit | **PARTIALLY** | `:136-138` still `durationMinutes >= 60`; 60-min @768 ≈50 px ⇒ icon + truncated fragment. Compliant with §8.2 wording ("when it fits (≥ 60 min)") but visually poor |
| minor — aria-label prefix / separator | **RESOLVED** | `:111-112` emits `Booking … sampai …`; `HH.mm` via `:28`. Matches `specs/bookings.md:128` exactly |
| minor — past-24:00 block not marked | **RESOLVED** | `timeline.ts:57` `rawRight > 100 ⇒ edge:'after'`; ring `:131` |
| minor — no-consoles state not §3 EmptyState | **STILL FAILING** | `:36-38` bare `<p>Belum ada unit PS.</p>` vs `specs/bookings.md:45` (EmptyState + description + **Tambah Unit**). Early return also hides `error` (`:42`) when consoles=[] |
| minor — half-hour lines too faint | **STILL FAILING** | `:95` `bg-border/40` ≈1.1–1.2:1; hour vs half-hour is opacity-only |
| minor — Receipt 5 s premature error | **RESOLVED** | `Receipt.tsx:27-32` now 15 s with explanatory comment |

### Judgement points (spec-cited)

1. **10 lanes at 44 px** — 10×44 + 32 header + 10 borders ≈ **482 px**. The panel has no `max-h`/`overflow-y`; it grows and the **page** scrolls. `specs/bookings.md` §6 (`:108-109`) governs the horizontal axis only (1280: "08:00–24:00 fully visible"; 768: "day scrolls horizontally inside the panel"); it does **not** require all lanes in one viewport. No nested vertical scroll. Pass.
2. **`min-w-[896px]` at 768** — panel ≈734 → track 896−88 = **808 px** → 30 min = **25.3 px**, height 44 px. §6 `:109` explicitly prescribes exactly this: 768 shows 30-min gridlines with horizontal scroll; 360 hides the timeline. **Do not move the breakpoint to 1024.** 25×44 clears WCAG 2.2 AA 24×24; it is below `DESIGN.md:337`'s 44×44, but 44 px width is arithmetically impossible while §6's "1280 full day fits" leaves a 902 px track (28.2 px/30 min). Record a timeline exception in `DESIGN.md:337`; do not distort duration to satisfy it.
3. **`danger` for `expired`** — **correct and spec-literal.** `DESIGN.md:374` maps `isExpired` → `--color-danger-text`/`--color-danger-soft`/`CalendarX`; `status.tsx:49` + `TONE_CLASS.danger` (`types.ts:16`) match; §3.6 gives 6.34:1. Session `overdue` is also danger (`DESIGN.md:361`), so danger is the documented "needs action now" family. `warning` would contradict the literal map. The at-risk banner at `Bookings.tsx:243` is warning-soft, but `specs/bookings.md:14` specifies **danger-soft** — the banner is the pre-existing outlier, not evidence for warning. Keep danger.
4. **Row interaction** — table: row `onClick` `DataTable.tsx:165` opens; checkbox `td:174` and actions `td:198` stop propagation; keydown `:166-170` returns for descendants before `preventDefault`, so Check-in/Ubah/Batalkan keep Enter/Space. Card: `:235-239` ignores `button,a,input,select,textarea`; checkbox `:253` and actions `:260` stop; keydown `:240-243` target-guarded. Normal cell click opens; checkbox and row actions do not. No regression.
5. **Tokens/types** — grep across the five files: **none** of raw hex, arbitrary colour, `text-[…]`, `any`, `@ts-ignore`, `@ts-expect-error`. Inline styles are computed geometry only (label `left`/`transform`, gridline `left`, block `left`/`right`/`width`/`minWidth`). `ring-[var(--color-border-strong)]` is a token.
6. **Copy** — `:112` now reads exactly `"Booking Budi, PS-01, 20.15 sampai 21.15, Dikonfirmasi"`, matching `specs/bookings.md:128`; `HH.mm` in blocks via `blockTimeLabel` (`:26-29`). Natural Indonesian.

**New regressions:** none. Pre-existing, outside this gate: banner `warning-soft` where `specs/bookings.md:14` says `danger-soft` — note for a future Bookings pass, not a timeline regression.

**Browser-only:** real focus/activation of row actions inside a focusable `<tr>`; sticky gutter compositing during 768 horizontal scroll; focus ring over soft fills; 60-min truncation at real font metrics; screen-reader delivery of "sampai"; actual 482 px panel fit in a laptop viewport.

**Counts: 7 resolved · 2 partial · 2 still failing (1 genuine spec violation: no-consoles EmptyState). Self-rating: `partially_verified`.**

---

## DS-006 — Booking timeline close-out (leader-verified)

The `@designer` re-QA round could not be re-run: the model provider rejected the request from this network ("free models aren't available from your current IP"). Rather than leave the gate open, the three actionable DS-005 items were fixed by `@frontend-react` (FE-006) and verified by inspection here. **This is not a designer PASS** — it is a documented leader fallback, and the timeline remains unverified visually.

| DS-005 finding | Status | Evidence |
| --- | --- | --- |
| no-consoles state not §3 `EmptyState` | **RESOLVED** | `BookingTimeline.tsx:53-62` — `EmptyState` + `Gamepad2` + title "Belum ada unit PS" + description + "Tambah Unit" → `onAddUnit` (`:16`), wired at `Bookings.tsx:267` to `navigate('/unit')` |
| early return hid the error banner | **RESOLVED** | panel chrome is outside the branch: `div.panel → {error && error-row} → {isEmpty ? EmptyState : timeline}` (`:41-62`); `isEmpty = !loading && lanes.length === 0` so loading still renders skeletons |
| half-hour gridlines too faint | **RESOLVED** | `:102` `bg-border/40` → `bg-border/70`; hour lines unchanged at `bg-border` |
| banner used `warning-soft` (spec §1 #4 says `danger-soft`) | **RESOLVED** | `Bookings.tsx:243-244` → `border-danger/50 bg-danger-soft` + `text-danger-text`; the `pending` badge still legitimately uses the warning tone via `status.tsx:37` |
| block width 25–28 px vs 44 px | **ACCEPTED** | arithmetically unavoidable: a 44 px half-hour block implies a 1408 px track, which contradicts §6's "1280 full day fits". 25×44 clears WCAG 2.2 AA 24×24. Documented exception, not a defect |

**Full-suite state at close-out (independently re-run):**

| Check | Result |
| --- | --- |
| `server: npm test` | **32 / 32 pass, 0 fail** |
| `server: node tools/security-probe.mjs` | **PASS** — 0 blocker / 0 major / 0 minor (36 checks) |
| `web: tsc --noEmit` | **0 errors** |
| `web: build` | 453.57 kB JS (130.21 gzip) · 32.83 kB CSS (7.16 gzip) |
| end-to-end production smoke | health 200 · SPA root + deep link 200 · `kasir` login 200 · `GET /api/bookings?date=` returns `isExpired` · `GET /api/consoles` 200 · cookie `HttpOnly; Secure; SameSite=Lax` |

**Still open (documented, not blocking):**

1. `DESIGN.md` §10.5 — **RESOLVED**: annotation added at `DESIGN.md:337-340` explaining the timeline touch-target exception (25–28 px wide blocks at 768 px; ≥ 24 px clears WCAG 2.2 AA 24×24; 44 px width arithmetically impossible while full day fits at 1280 px).
2. At-risk banner "Tampilkan" shortcut — **RESOLVED**: `Bookings.tsx:242-256` — added `Button` "Tampilkan" that calls `setTab('expired')` + toast feedback; banner tone already `danger-soft` per spec.
3. 60-minute blocks still decide text by `durationMinutes >= 60` rather than measured fit — compliant with §8.2 wording, visually tight at 768.
4. Everything visual: focus ring over soft fills, sticky-gutter compositing during horizontal scroll, real font-metric truncation, screen-reader delivery, 482 px panel fit, printed 80 mm output.

**Status: `partially_verified`** — all automated gates green; the timeline's rendered appearance has never been seen in a browser.

---

## DS-007 — Finalisasi per plan.md (leader-executed)

Tugas 1–6 dari `plan.md` diselesaikan dan diverifikasi oleh inspeksi kode serta re-run suite otomatis. `@designer` re-QA tidak dapat dijalankan ulang (provider menolak request dari IP ini), sehingga bagian ini adalah **leader fallback**, bukan PASS desainer.

| Tugas | uraian | Status | Bukti |
|-------|--------|--------|-------|
| T1 | DESIGN.md §10.5 — anotasi pengecualian sentuh 44×44 px | ✅ Selesai | `DESIGN.md:337-340` — pengecualian timeline tercatat jujur |
| T2 | Banner at-risk booking — tombol "Tampilkan" | ✅ Selesai | `Bookings.tsx:242-256` — `setTab('expired')` + toast |
| T3 | Audit BookingTimeline.tsx + lib/timeline.ts | ✅ Selesai | 08:00–24:00, gridline 30 mnt, label jam, lebar blok, lane per unit, Kedaluwarsa, scroll, a11y tombol — semua sesuai spec |
| T4 | Tindakan booking kedaluwarsa (tidak ada Check-in) | ✅ Selesai | `isActionable` includes `'expired'`; expired → Selesaikan + Batalkan, bukan Check-in |
| T5 | Receipt + timeout iframe (loading/error/retry/cetak) | ✅ Selesai | `Receipt.tsx` — skeleton loading, error 15 s, "Buka tab baru", print() |
| T6 | Re-run test server, probe, TypeScript, build | ✅ Selesai | 32/32 test, probe 0/0/0 PASS, tsc 0 error, build sukses |

**Hasil test sebelum vs sesudah (baseline tidak berubah):**

| Check | Sebelum | Sesudah |
|-------|---------|---------|
| `server: npm test` | 32/32 pass | 32/32 pass |
| `server: security-probe.mjs` | 0/0/0 PASS | 0/0/0 PASS |
| `web: tsc --noEmit` | 0 errors | 0 errors |
| `web: build` | sukses | sukses |
| E2E | tidak tersedia (no browser) | tidak tersedia (no browser) |

**Bug yang ditemukan dan diperbaiki dalam finalisasi ini:** tidak ada bug fungsional baru. Semua skenario uji `plan.md` (1–10) telah direproduksi terhadap server langsung dan **semua PASS**. Perubahan yang dilakukan adalah penutupan temuan desain/QA (T1–T5), bukan perbaikan bug fungsional.

**Item yang belum terverifikasi (perlu browser manusia):**
- Komposisi warna & kontras terkomposit
- Ukuran sentuh fisik pada layar 360 px
- Layout 360 px & overflow horizontal
- Cetak struk 80 mm (printer HP nyata / preview cetak browser)
- Gerakan timer & feel interaksi
- Pengumuman layar pembaca (screen reader)
- Layout saat layar diputar (landscape/portrait)

**Catatan:** DS-006 (designer re-QA timeline) belum pernah lulus karena provider tidak tersedia dari jaringan ini. Status timeline tetap `belum terverifikasi secara visual` sampai gate desainer dijalankan berhasil.

**File yang diubah dalam finalisasi ini:**
- `DESIGN.md` — anotasi pengecualian sentuh 44×44 px (§10.5)
- `web/src/pages/Bookings.tsx` — tombol "Tampilkan" pada banner at-risk
- `specs/design-qa-report.md` — bagian DS-007 + update item masih terbuka
- `README.md` — checklist pengujian manual HP (item 7 disempurnakan, item 12–17 ditambahkan)

**File yang tidak diubah (sengaja):** `server/src/**`, `web/src/components/BookingTimeline.tsx`, `web/src/lib/timeline.ts`, `web/src/lib/status.ts` — sudah diverifikasi, tidak ada perlukan perubahan.

---

## DS-008 — Audit UX HP & laptop (Phase 1 DESIGN, @designer)

> **Jenis:** audit desain + spesifikasi implementasi (**bukan** re-QA atas UI yang sudah jadi).
> **Metode:** inspeksi statis `web/src/**` (8.218 baris, 50 file) + `DESIGN.md` + `specs/*.md`. **Tidak ada browser / headless / screenshot di lingkungan ini.**
> **Tidak ada yang diklaim "sudah terlihat".** Setiap temuan bertumpu pada `file:line` + token `DESIGN.md` §2.
> **Deliverable:** `specs/ux-mobile-laptop.md` (BARU) + revisi `DESIGN.md` §6 saja.

### Permintaan yang dijawab

> *"perbaiki dan tingkatkan UI dan UX khususnya pengguna HP dan laptop"*

Dijawab sebagai **dua pengalaman terpisah**, bukan satu layout yang di-zoom: HP = kasir berdiri, satu tangan, 360 px; laptop = admin duduk, membandingkan angka, 1280–1440 px.

### Ringkasan temuan

**12 temuan teratas** (batas kontrak). **P0 = 6 · P1 = 5 · P2 = 1.**

| # | Sev | Temuan | Bukti |
| --- | --- | --- | --- |
| F01 | **P0** | `StickyActionBar` `sm:hidden` → **admin laptop tidak punya tombol Simpan** di Pengaturan; di HP bar menutupi ~36 px konten dan menindih nav bawah 4 px | `AppShell.tsx:276` · `Settings.tsx:318,323` |
| F02 | **P0** | `PageHeader` actions satu baris `shrink-0` tanpa wrap → **TransactionDetail 5 aksi ≈ 540 px meluber dari 360 px** | `AppShell.tsx:245` · `TransactionDetail.tsx:79-103` |
| F03 | **P0** | `MOBILE_PRIMARY` statis dan tidak sadar peran → **Booking (check-in) tersembunyi di sheet "Lainnya"** | `AppShell.tsx:30` |
| F04 | **P0** | `ConsoleCard` merender tombol "Mulai Sesi" tanpa `onStart` → **tombol mati di layar "Mulai sesi"** (dipakai kasir terus-menerus) | `ConsoleCard.tsx:78-82` · `SessionStart.tsx:145-153` |
| F05 | **P0** | `Pagination` numbered: baris kontrol `flex` tanpa wrap → **~448 px meluber di 360 px**; mode `load-more` ada tapi kode mati | `Pagination.tsx:21,40-84` · `Sessions.tsx:217` · `Transactions.tsx:200` |
| F06 | **P0** | Kartu HP `role="button"` memuat `<button>` asli → **axe `nested-interactive` (WCAG 4.1.2)**; nama aksesibel selalu literal **"Buka detail"** di 4 halaman | `DataTable.tsx:231-244,260-262` · `Sessions.tsx:164` · `Units.tsx:191` · `Users.tsx:169` · `Games.tsx:159` |
| F07 | **P1** | Hierarki kartu HP terbalik: unit = teks terlemah, aksi di header, nominal = baris ke-4 | `DataTable.tsx:246-275` · `Bookings.tsx:179-188` |
| F08 | **P1** | Target sentuh < 44 px: field 40 px, tab 31 px, pil tanggal 38 px (spec §10.5 mensyaratkan 44) | `Form.tsx:11` · `Tabs.tsx:55` · `DateRangePicker.tsx:75` |
| F09 | **P1** | `openReceipt` mengembalikan `{ok}` tapi **nilai balik dibuang** → "Cetak struk" gagal senyap bila popup diblokir | `Transactions.tsx:183` · `receipt.ts:10-14` |
| F10 | **P1** | Plafon konten 1280 px di §6 **tidak ada implementasinya** → tabel melar 1632 px di monitor 1920 | `AppShell.tsx:128` |
| F11 | **P1** | `stickyHeader` tidak pernah dipakai; **dan** sticky header tak akan bekerja di dalam `overflow-x-auto` | `DataTable.tsx:34,74,134` |
| F12 | **P2** | Dashboard: 5 kartu metrik bertepi (larangan §11 #4), chart 50/50 (§8 minta 2/3–1/3), blok "Segera berakhir" di urutan ke-4 di HP | `Dashboard.tsx:131-156,158-202,208` |

Temuan di luar 12 (apotek: tab aktif terpotong, stack filter Transaksi, `fullWidth` di header SessionStart, urutan tombol footer modal, blok user dobel di ≥1024, `pb-24` ganda di Settings) ada di `specs/ux-mobile-laptop.md` §10 **tanpa severity** — sengaja tidak diprioritaskan.

### Tiga keputusan

| | Keputusan | Alasan (satu kalimat) | Dampak |
| --- | --- | --- | --- |
| **(a)** | **Timeline di HP tetap disembunyikan < 768 px** | Di 360 px timeline tidak menyusut — ia tetap 896 px dan jadi kanvas yang digeser horizontal, sehingga kasir bisa salah baca unit terpesan sebagai kosong. | Aturan `specs/bookings.md` §6 **tetap berlaku**; yang diganti hanya **alasannya**, dan penggantinya adalah **kode unit jadi field utama kartu HP** (F07) + satu kalimat penjelas. `specs/bookings.md` tidak diubah. |
| **(b)** | **Pengecualian target sentuh blok timeline dipertahankan (lantai 24 px)** | Lebar blok adalah *datanya* — memaksa 44 px membuat booking 30 menit tampak seperti 47 menit, dan durasi palsu lebih berbahaya daripada target kecil. | Catatan `DESIGN.md` §6 ditulis ulang: asumsi (**pointer**, bukan jari), konsekuensi yang diterima (768–1023 px → jalur jari = tampilan Daftar), dan mitigasi (`aria-label` + `title` membawa waktu nyata). |
| **(c)** | **Plafon 1280 px dipertahankan, ruang diisi kerapatan — bukan lebar** | Di 1440 px konten terpakai sudah 1152 px, jadi tidak ada ruang terbuang; ruang kosong baru muncul di atas ±1568 px. | Plafon **diimplementasikan** (F10) + kerapatan lewat header lengket & panel tabel (F11) + strip metrik & rasio chart 2/3–1/3 (F12). |

### Yang diubah di `DESIGN.md` (hanya §6)

1. Tabel responsive §6 — baris **Navigation** (nav 56 → **60 px**, set item sadar-peran), **Top bar** (56 px di semua ukuran; koreksi klaim lama "64 px + breadcrumb + search" yang tidak ada di kode), **DataTable** (sticky header di panel berbatas tinggi), **Booking timeline** (baris baru: hidden < 768 px), **Primary action** (sticky bar in-flow di ≥1024).
2. Paragraf "Table → card transformation" — ditegaskan: aksi baris menjadi **footer** kartu, bukan header.
3. Paragraf baru "**Card content priority**" — maksimum 1 nilai menonjol di baris judul + `dl` maksimum 3 baris.
4. Paragraf baru "**Timeline (keputusan DS-008)**" — aturan + alasan + penggantinya.
5. Paragraf "Content max width" — ditegaskan sebagai **keputusan kerapatan**, bukan lebar.
6. Paragraf "Touch targets" —onnesIAN: 44 px kini mencakup field, tab, dan chip.
7. Catatan pengecualian BookingTimeline — ditulis ulang (asumsi / konsekuensi / mitigasi).

**§2, §3, §4, §5, §7, §8, §9, §10, §11 TIDAK diubah.** Token, peta status, dan kontrak API tidak disentuh.

### Item yang WAJIB diverifikasi visual di browser (tidak ada browser di lingkungan ini)

**Tidak ada satu pun yang boleh dianggap terverifikasi sampai ada mata manusia.** Daftar lengkap ada di `specs/ux-mobile-laptop.md` §9. Ringkas:

- [ ] 360 / 390 / 430 px — **nol** gulir horizontal di semua halaman (F02, F05).
- [ ] Lebar asli tombol header setelah F02 — **ukur ulang**, jangan pakai estimasi teks.
- [ ] Semua field/tab/pil benar-benar ≥ 44 px (F08) — ukur.
- [ ] `axe` `nested-interactive` = 0 di Sesi/Konsol/Pengguna/Game (F06).
- [ ] Nama aksesibel kartu = identitas, bukan "Buka detail" (F06).
- [ ] Panel tabel bergulir internal + `thead` benar-benar lengket (F11).
- [ ] Bar `StickyActionBar` tidak menindih nav; tidak ada celah 4 px (F01/F03).
- [ ] Timeline tetap tersembunyi < 768 px; di 768–1023 px blok 30 menit ≈ 28 px **terlihat dan bisa ditekan** (konsekuensi (b) yang diterima).
- [ ] Dashboard: strip 5 sel di 360 px (2 kolom) dan 1280 px (5 kolom); chart 2/3–1/3 (F12).
- [ ] Kontras badge/kartu setelah hierarki kartu berubah (F07).
- [ ] Cetak struk 80 mm setelah jalur fallback F09.
- [ ] `prefers-reduced-motion`, rotasi layar, dan safe-area di Android nyata.

### Status

| Aspek | Status |
| --- | --- |
| Jejak temuan → `file:line` | ✅ terverifikasi (inspeksi statis `web/src/**`) |
| Perhitungan lebar/tinggi | ✅ terverifikasi (dari token `DESIGN.md` §2; asumsi lebar font Inter **perlu konfirmasi visual**) |
| Keputusan (a)/(b)/(c) | ✅ tetapkan, dan (a)/(b)/(c) sudah dicerminkan di `DESIGN.md` §6 |
| Tweenan ini **bukan** PASS/FAIL atas UI yang sudah dibangun | ✅ ini Phase 1 DESIGN; `@frontend-react` mengimplementasikan, lalu `@designer` QA (Phase 3) |
| **Verifikasi visual** | ❌ **`not_verified`** — tidak ada browser/headless di lingkungan ini |

### File

| File | Aksi |
| --- | --- |
| `specs/ux-mobile-laptop.md` | **BARU** — audit per layar (HP + laptop), 12 temuan, 3 keputusan, spesifikasi implementasi per temuan, apotek, checklist verifikasi |
| `DESIGN.md` | **§6 saja** — 7 revisi terarah (lihat di atas) |
| `specs/design-qa-report.md` | **TAMBAH** bagian ini |

**File yang sengaja tidak disentuh:** `server/**`, `web/src/**`, `specs/bookings.md`, `api-contract.md`, `DESIGN.md` §2/§3/§7/§8/§10/§11.

---

## DS-009 — QA batch UX HP & laptop (Phase 3, atas FE-007 → FE-009)

**Verdict: PASS ✅** — 0 blocker · 2 major · 5 minor. 12 dari 13 item **RESOLVED**, 1 **PARTIAL** (F08, deviasi terdokumentasi).
Tidak ada browser di lingkungan ini → **butuh verifikasi visual** untuk 12 butir di `specs/ux-mobile-laptop.md` §9.

**Metode:** inspeksi statis `web/src/**` terhadap `specs/ux-mobile-laptop.md` §6 (F01–F12) + `DESIGN.md` §2/§6/§10/§11. Bukti eksekusi: `node node_modules/typescript/bin/tsc --noEmit` → **bersih**; `node web/scripts/check-table-card.ts` → **13/13 ok**; diff programatik `@theme` `index.css` vs `DESIGN.md` §2 → **IDENTIK** (tak ada token baru/berubah).

### Status per item

| Item | Status | Bukti (terverifikasi dari sumber) | Catatan |
| --- | --- | --- | --- |
| F01 | RESOLVED | `AppShell.tsx:284-297` (dua render), `Settings.tsx:318-327`, `SessionStart.tsx:260-261` | Spacer 72 px = tinggi bar 72 px (tepat). Lihat hitung ulang di bawah. |
| F02 | RESOLVED | `AppShell.tsx:243-258, 269-276`; `TransactionDetail.tsx:94-114, 188-199`; `SessionDetail.tsx:100-108, 133-142`; `Dashboard.tsx:141-173` | Klaim "48 px" hanya terpenuhi di Dashboard. |
| F03 | RESOLVED | `AppShell.tsx:33-34, 83-85`; `DESIGN.md` §6 sudah menyebut 60 px + nav sadar-peran | 5 item muat di 360 px. |
| F04 | RESOLVED | `ConsoleCard.tsx:36` (`onStart &&`), `SessionStart.tsx:145-153` | Tombol mati hilang; kartu tak bisa diketuk (lihat M1). |
| F05 | RESOLVED | `Pagination.tsx:29-52`, `lib/useMediaQuery.ts` (ekstraksi diizinkan spec) | Lebar 134 px (spec perkira 160). Lihat m3. |
| F06 | RESOLVED | `DataTable.tsx:230-268` (div biasa), `lib/table-card.ts:37-43`; `Sessions/Units/Users/Games.tsx` `text:` | Nama aksesibel persis string spec. |
| F07 | RESOLVED | `DataTable.tsx:263-285`, `lib/table-card.ts:22-30`; `Transactions/Sessions/Bookings.tsx` `prominentOnMobile` | Lihat m2 (kolom uang Reports). |
| F08 | **PARTIAL** | `Form.tsx:13-17`, `Tabs.tsx:55`, `DateRangePicker.tsx:75, 96, 108` | 44 px di <640 ✅; 40 px di 640–1023 (deviasi dari `lg:h-10`). |
| F09 | RESOLVED | `Transactions.tsx:90-98`, `TransactionDetail.tsx:47-56` | Toast + aksi "Buka struk" (satu mekanisme, pola `session-dialogs.tsx`). |
| F10 | RESOLVED | `AppShell.tsx:133-136` | 992/1152/1280 px — hitung ulang di bawah. |
| F11 | RESOLVED | `DataTable.tsx:55, 78, 139` | Kalibrasi `8rem` kurang pas di halaman yang tabelnya jauh di bawah header (m4). |
| F12 | RESOLVED | `Dashboard.tsx:118-133, 175-232, 234` | Urutan & rasio sesuai §8. |
| F13 | RESOLVED | `ConsoleCard.tsx:48-71` | Kartu **sudah** bukan `role="button"` — code jadi satu-satunya kontrol. |

### Hitung ulang angka (dari token `DESIGN.md` §2)

| # | Yang diklaim | Hitung ulang | Status |
| --- | --- | --- | --- |
| F01 | nav bawah 60 px → offset bar `3.75rem` | `py-2` 16 + ikon `size-6` 24 + `gap-0.5` 2 + label `text-caption` 12×1.5 = 18 → **60 px** | ✅ tepat |
| F01 | bar HP 72 px → spacer `h-[4.5rem]` | `py-3` 24 + `Button lg` 48 = **72 px** | ✅ tepat |
| F01 | "tidak ada isi tertutup" | cadangan bawah = `main pb-24` 96 + spacer 72 = **168 px**; kebutuhan = nav 60 + bar 72 = **132 px** → **kelonggaran 36 px** (sebelumnya −36 px tertutup) | ✅ terpenuhi |
| F01 | bar ≥1024 | `py-2.5` 20 + `Button md` 40 = **60 px**, in-flow `sticky bottom-0` → tak pernah menutupi konten | ✅ |
| F02 | aksi utama ≤ 200 px dari atas | topbar 56 + `py-5` 20 + breadcrumb 18 + `gap-3`×2 24 + h1 29 = **147 px** → baris aksi mulai ~147 px | ✅ |
| F02 | aksi utama 48 px | hanya Dashboard (`size="lg"` 48). `TransactionDetail` "Cetak struk" & `SessionDetail` "Selesaikan" = `size="md"` **40 px** | ❌ (pre-existing) |
| F02 | tak ada overflow 360 px | maks aksi mobile = 204 px (SessionDetail) vs 328 px tersedia | ✅ |
| F05 | strip pagination 160 px | IconButton 44 + gap 8 + "2 / 5" ~30 + gap 8 + 44 = **134 px** vs 328 | ✅ (lebih baik dari spec) |
| F08 | field 44 px | `h-11` = **44 px** (<640); `sm:h-10` = **40 px** (≥640); `lg` `h-12` = 48 | ⚠️ lihat m1 |
| F08 | tab & pil 44 px | `min-h-11` = **44 px** (tab & pil preset & input tanggal) | ✅ |
| F10 | 1280 / 1440 / 1920 | 1280 → **992 px** (tak berubah) · 1440 → **1152 px** (tak berubah) · 1920 → dipotong **1280 px**, sisa 176 px/sisi | ✅ |

### Regresi (2 major)

| # | Temuan | Dampak | Perbaikan konkret |
| --- | --- | --- | --- |
| **M1** | **Target sentuh kartu menyusut jadi ±25 px.** F06/F13 mengganti "kartu = `role=button` (tap se-kartu)" dengan "kartu = `div`, kontrol = tombol teks". Di `DataTable.tsx:249-257` tombol primary (`text-body` 15 px, `p-0`) ≈ 25 px tinggi; di `ConsoleCard.tsx:60-67` tombol kode konsol juga ±25 px. Di "Mulai sesi" (`SessionStart.tsx:151`) kode konsol jadi **satu-satunya** cara memilih unit (spec F04 poin 3 menulis "kartu tetap `role=button`" — tidak dijalankan). Melawan `DESIGN.md` §6 "setiap target interaktif ≥ 44×44". | 1 sentuhan meleset di layar kasir utama. | `DataTable.tsx:254` → `min-h-11 w-full self-stretch items-center` (atau `py-2 -my-2`); `ConsoleCard.tsx:64` → `inline-flex min-h-11 items-center -my-2`. 1 baris masing-masing. |
| **M2** | **Kolom uang hilang di HP pada 2 tab Laporan.** Batas 3 baris `dl` (F07 poin 3) memotong kolom ke-4+: `Reports.tsx:82` `total` (pembayaran) dan `Reports.tsx:74` `revenue` (per unit) — kartu HP tidak menampilkan nominal sama sekali. `Settings.tsx:165` `active` (status paket) juga terpotong. | Data tidak tampil di 360 px (tersedia di laptop & ekspor CSV). | Tandai `prominentOnMobile: true` pada `Reports.tsx:82` (`total`) dan `Reports.tsx:74` (`revenue`) — nominal pindah ke slot kanan-atas, tidak terpotong. |

> M1/M2 adalah konsekuensi dari desain F06/F07 saya sendiri (bukan penyimpangan frontend) — dicatat supaya ditutup di batch berikutnya, bukan untuk menghukum implementasi.

### Temuan minor (tidak memblokir)

| # | Temuan | Perbaikan |
| --- | --- | --- |
| m1 | **F08 PARTIAL:** `Form.tsx:15` memakai `sm:h-10` (40 px) — deviasi terdokumentasi dari kode spec (`lg:h-10`) tetapi mengikuti prosa spec. Konflik dengan `DESIGN.md` §6/§10.5, yang hanya mengecualikan ≥1024 px (lihat catatan BookingTimeline). | `sm:h-10` → `lg:h-10` (1 karakter) bila 640–1023 px harus dihitung sentuh. |
| m2 | `Pagination.tsx:40` — `aria-label` pada `<span>` tanpa role (role=generic) **diabaikan** pembaca layar & akan kena aturan axe `aria-prohibited-attr`; "dari 5" hilang. | `<span className="sr-only">Halaman {page} dari {pageCount}</span><span aria-hidden="true">{page} / {pageCount}</span>`. |
| m3 | `Settings.tsx:320` — pesan bar HP (214 px) membungkus 3 baris di 360 px → bar jadi ±83 px, melewati spacer 72 px → ±10 px tertutup. | `hidden sm:block` pada `<p>` itu (atau `truncate`). |
| m4 | `DataTable.tsx:139` — `lg:max-h-[calc(100dvh-8rem)]` mengasumsikan tabel ~128 px dari atas; di Transaksi/Laporan tabel 600–1000 px di bawah → panel bisa lebih tinggi dari ruang yang tersisa. Tabel pendek **tidak** meregang (`max-h` tidak menambah tinggi) ✅. | `lg:max-h-[70dvh]` — fraksi viewport, selalu lebih pendek dari layar. |
| m5 | `Login.tsx:94` — tombol mata absolut `top-[30px]` tidak lagi.center di field sandi 44 px (bergeser 4,5 px, meluber 4,5 px; sebelumnya meluber 8,5 px). | Pakai prop `suffix` milik `Input`, atau `top-[26px]`. |

### Yang dicek dan **tidak** bermasalah (aman)

- **F11 tidak merusak tabel pendek** — `max-h` tidak meregang; panel 5 baris identik seperti sebelumnya. `stickyHeader` default `true` tidak merusak halaman mana pun (tak ada halaman yang perlu `false`, sesuai spec). `main` **tidak** punya `overflow` → tak ada dua scroll container; yang ada adalah scroll halaman + scroll panel (memang disengaja).
- **F12 tidak membalik prioritas persona** — "Segera berakhir" memang blok urgency; untuk owner itu risiko pendapatan, untuk kasir yang sampai di Dashboard juga sesi yang mau berakhir. Kasir tidak pernah mendarat di Dashboard (`Login.tsx:13-15` → `/sesi`), jadi urutannya tidak merugikan siapa pun. Yang berubah hanya jarak ke strip metrik di HP.
- **F06/F07 tidak merusak desktop** — kolom desktop utuh; `role="row"` dihapus dengan benar (`<tr>` sudah row); baris desktop tetap `tabIndex={0}` + guard `e.target !== e.currentTarget` (`DataTable.tsx:170-174`); `rowLabel` di `Bookings.tsx:288` & `Transactions.tsx:182` tetap menang atas `primaryCol.text` (`lib/table-card.ts:42`). Semua render primary berupa phrasing content (tidak ada `<div>` di dalam `<button>`) ✅.
- **F03 muat di 360 px** — 5 item × 72 px; label terpanjang "Transaksi" ≈ 56 px < 72 px, tanpa `truncate` → tidak terpotong. "Lainnya" kasir = Dashboard + Game (2 item), admin = 5 item.
- **Konsistensi token** — nol hex/warna arbitrer baru di `web/src/**`; semua nilai baru (`max-w-[1280px]`, `3.75rem`, `4.5rem`, `100dvh-8rem`, `min-h-11`) berasal dari `DESIGN.md` §6 / skala spacing; `shadow-e1` & `--z-sticky` ada; `@theme` `index.css` identik dengan `DESIGN.md` §2.

### Wajib verifikasi visual (tidak ada browser di lingkungan ini)

1. 360/390/430 px — **tidak ada** gulir horizontal di halaman mana pun.
2. 360 px — kartu DataTable & kartu konsol "Mulai sesi": apakah judulnya terasa seperti tombol? (M1)
3. 360 px — kartu Transaksi dengan nominal besar (≥ Rp 1.250.000): nomor 18 char mono ≈162 px + nominal ≈132 px = 306 px > 296 px isi kartu → nomor expected membungkus 2 baris.
4. 360 px — "Laporan → Pembayaran" & "Per Unit": konfirmasi nominal tidak tampil (M2).
5. 360 px — bar "Ada perubahan yang belum disimpan.": tinggi bar vs spacer 72 px (m3).
6. ≥1024 — "Simpan perubahan" tetap terlihat sambil menggulir dan tidak menutupi field terakhir (F01).
7. ≥1024 — panel tabel: scroll internal + `thead` benar-benar lengket; panel tidak melewati bawah viewport (m4).
8. 640–1023 px — judul "Transaksi TRX-…" terpotong ~50 px oleh 5 aksi header (pre-existing, m-level).
9. 1280/1920 — konten terpusat 1280 px, sisa 176 px tiap sisi.
10. 360 px — nav bawah 5 item, label utuh; Dashboard urut "Segera berakhir → strip unit → Hari ini"; chart 2/3–1/3 di 1280.
11. `axe` — `nested-interactive` = 0 di Sesi/Konsol/Pengguna/Game/Booking/Transaksi/Unit; `aria-prohibited-attr` = 0 di Pagination (m2).
12. Android nyata — safe-area, `dvh`, `prefers-reduced-motion`.

### Status verifikasi

| Aspek | Status |
| --- | --- |
| Implementasi vs spec F01–F13 | `verified` (inspeksi statis `web/src/**` + `tsc --noEmit` bersih + `check-table-card.ts` 13/13) |
| Hitung ulang angka | `verified` (dari token `DESIGN.md` §2; asumsi lebar glyph Inter/JetBrains Mono **perlu konfirmasi visual**) |
| Konsistensi token | `verified` (diff `@theme` identik; nol warna arbitrer) |
| Penampilan nyata / regresi visual | **`not_verified`** — tidak ada browser/headless di lingkungan ini |
| **Verdict** | **PASS ✅** dengan 2 major yang harus ditutup di batch berikutnya (1 baris CSS masing-masing) |

---

## DS-010 — Design QA: registrasi publik + area pelanggan (Phase 3, atas FE-010 → FE-012)

**Verdict: FAIL ❌** — **1 blocker · 6 major · 14 minor.**

Metode: inspeksi statis `web/src/**` + `server/src/**` terhadap `DESIGN.md` §2/§3/§5/§6/§7/§10 dan `api-contract.md`. Bukti eksekusi: `node node_modules/typescript/bin/tsc --noEmit` → **bersih (exit 0)**; `node scripts/check-table-card.ts` → **all checks passed** (hanya mencakup tabel admin — tabel pelanggan baru **tidak** ikut di-cover, dan di situlah M3 muncul); nol hex arbitrer di luar `index.css`; nol token mati (`text-success-text` tidak ada; `text-success` = `--color-success` ✓).
Tidak ada browser di lingkungan ini → **13 butir wajib verifikasi visual** (daftar di bawah). Tidak ada klaim "sudah terlihat benar".

### BLOCKER

| # | Temuan | Dampak | Perbaikan konkret |
| --- | --- | --- | --- |
| **B1** | **`AppShell.tsx:88-91,167-174,189-191` — tombol "Lainnya" di nav bawah selalu dirender.** Untuk role `user`, `MOBILE_PRIMARY_USER` (`AppShell.tsx:40`) memuat **keempat** rute pelanggan, jadi `overflow = []` (`:91`). Sheet "Menu lainnya" (`:189-191`) dirender dengan `<NavList items={[]} />` → **sheet kosong**. | Di <1024 px, setiap halaman pelanggan menampilkan satu target navigasi yang terlihat interaktif tapi mati (menuka sheet kosong). | Render hanya bila ada isi: bungkus blok `Lainnya` (`AppShell.tsx:167-174`) dengan `{overflow.length > 0 && ( … )}`. Bonus: nav pelanggan jadi **4 item × 90 px** di 360 px (label "Booking Saya" ±68 px) — jauh lebih lapang daripada 5 × 72 px yang pas-pasan. |

### MAJOR (≥3 ⇒ FAIL)

| # | Temuan | Dampak | Perbaikan konkret |
| --- | --- | --- | --- |
| **M1** | **`Beranda.tsx:30-32` — "Booking berikutnya" membandingkan tanggal, bukan waktu.** Filter `UPCOMING.includes(b.status) && b.bookingDate >= today`; booking hari ini yang jamnya sudah lewat tetap terpilih. Booking `confirmed` yang sudah lewat → `effectiveBookingStatus` = `expired` → badge **"Kedaluwarsa"**, tetapi tetap dipromosikan sebagai "berikutnya" (dan menahan kartu kosong "Belum ada booking"). | Status/wNext booking ditampilkan salah pada kartu utama area pelanggan. | `Beranda.tsx:30-32`: bandingkan `${b.bookingDate} ${b.startTime}` dengan waktu Jakarta sekarang (`YYYY-MM-DD HH:MM`) **dan** buang `effectiveBookingStatus(b) === 'expired'`. |
| **M2** | **`Button.tsx:29` — label fill primary di bawah 4,5:1.** `bg-accent` #7C3AED + `text-text-inverse` #0A0E1A = **3,40:1**, sedangkan `DESIGN.md` §3.3 mendokumentasikan **#FFFFFF** di atas accent = **5,70:1** (dan `index.css:22` sendiri menulis "white label 5.70:1"). Affected: "Daftar" (CTA utama `/daftar`), "Buat booking", "Simpan", "Kirim booking", `Tabs.tsx:62`, `Pagination.tsx:88`. | Label CTA utama tidak AA. | `Button.tsx:29` → `primary: 'bg-accent text-white hover:bg-accent-hover active:bg-accent-active'`; samakan `Tabs.tsx:62` & `Pagination.tsx:88`. `text-white` sudah dipakai varian danger → **tanpa hex/token baru**; `DESIGN.md` §2 tidak disentuh. |
| **M3** | **`InfoRental.tsx:32-50` — status unit hilang di HP.** `selectCardColumns` (`lib/table-card.ts:22-29`) memotong `dl` kartu menjadi 3 baris; urutan kolom unit = code·tipe·ruangan·controller·rate·status → yang tersisip 3 = tipe, ruangan, controller, **status jatuh**. | Pelanggan di 360 px **tidak melihat ketersediaan unit sama sekali** (Tersedia / Sedang Bermain / Dipesan / Perawatan) — padahal itu field paling menentukan untuk memilih unit. | `InfoRental.tsx:47` → `{ key: 'controllers', header: 'Controller', numeric: true, hideOnMobile: true, … }` supaya status naik ke kartu; atau pindahkan `status` sebelum `controllers`. Tambah `InfoRental` ke `web/scripts/check-table-card.ts` supaya regresi ini tertangkap. |
| **M4** | **`InfoRental.tsx:101` + `Tabs.tsx:50,83-88` — `aria-controls` menunjuk elemen yang tidak ada.** `Tabs` menulis `aria-controls={`${baseId}-panel-${item.value}`}`, tapi `TabPanel` **tidak pernah dipakai di seluruh repo** dan `baseId` privat → tidak bisa disambung. | Pembaca layar announce tab yang mengendalikan "nothing"; axe `aria-valid-attr-value`. | `Tabs.tsx:12` tambah prop `idPrefix?: string` (default `useId()`); `InfoRental.tsx:104-159` bungkus tiap isi tab dengan `<TabPanel id={`info-rental-panel-${tab}`} value={tab}>`. (Halaman lama: 6 halaman ikut kena — 1 perbaikan komponen menutup semuanya.) |
| **M5** | **`AppShell.tsx:128-132` — toggle "Matikan/Nyalakan suara peringatan" untuk semua peran.** `chime()` hanya terjangkau dari `Timer` (`components/Timer.tsx`), yang dipakai di Dashboard/Sesi/SessionDetail/ConsoleCard — **area Super Admin**. | Di area pelanggan kontrol ini tidak pernah berbunyi: label membingungkan ("peringatan apa?") dan tidak ada efek. | Render hanya bila `user?.role === 'superadmin'` (sama untuk blok `UserBlock` di `AppShell.tsx:107`). |
| **M6** | **`BookingSaya.tsx:167-207` — aksi utama tidak persisten di HP.** "Buat booking" hanya inline di header; `DESIGN.md` §6 mewajibkan **sticky action bar** fixed di atas nav untuk <1024 px. | Di HP dengan tabel panjang, tombol utama keluar layar — pelanggan harus menggulir ke atas. | Pakai `StickyActionBar` (`AppShell.tsx:288-303`) + **spacer 72 px** seperti `Settings.tsx:318-327`; tanpa spacer baris terakhir tertutup nav (regresi F01). |

### MINOR (tidak memblokir)

| # | Temuan | Perbaikan |
| --- | --- | --- |
| m1 | `Register.tsx:95-106` — layar sukses menampilkan tombol "Masuk sekarang" **dan** link "Sudah punya akun? Masuk" (kontradiktori tepat setelah membuat akun). | Hapus link di layar sukses (sisakan tombol). |
| m2 | `Register.tsx:160` — `error={errors.phone}` mati: `validate()` (`:29-41`) tak pernah mengisi error phone. | Hapus prop, atau tambahkan aturan phone. |
| m3 | `Form.tsx:24` + `Register.tsx:128` — bintang wajib tanpa legenda. | `<p className="text-caption text-text-muted">* wajib diisi</p>` di bawah judul form. |
| m4 | `Register.tsx:62-66` — validasi gagal → fokus tetap di tombol kirim; tak ada fokus ke field pertama yang invalid. | Pindahkan fokus ke input pertama yang invalid (ref map). |
| m5 | `Register.tsx:144-161` — cermin aturan server kurang lengkap: `fullName` maks 80 & `phone` maks 40 (`server/src/routes/auth.js:46-50`) belum jadi `maxLength`. | `maxLength={80}` / `maxLength={40}`; hari ini nama 100 karakter gagal dari server dan muncul sebagai pesan **di atas form**, bukan di field. |
| m6 | `Register.tsx:47-56` — selama `useAuth().loading` form berkedip untuk pengguna yang sudah masuk. | Render spinner selama `loading`. |
| m7 | `Beranda.tsx:115-141` — "Tarif dasar" (= `defaultHourlyRate`) dibaca sebagai harga yang akan dibayar; yang dipakai adalah tarif **per unit** (Info Rental "Tarif/jam" + estimasi Booking Saya). | Label "Tarif dasar" → "Tarif dasar" + "mulai dari", atau tampilkan tarif unit. |
| m8 | `Beranda.tsx:38-57` — kondisi error tidak memasukkan `units.error`; gagal memuat unit → kode unit diam-diam "—". | Sertakan `units.error` atau beri label "Unit tidak tersedia". |
| m9 | `BookingSaya.tsx:56-67` — durasi diisi `minMinutes` (30) sebelum settings termuat; setelah nilai sebenarnya (mis. 60) masuk, draft **tidak pernah dikoreksi** → field tampil "30" dengan pesan "Minimal 60 menit.". | Koreksi draft saat `cfg` resolve, atau nonaktifkan submit sampai `cfg` siap. |
| m10 | `BookingSaya.tsx:280-286` — "Nama pelanggan" bisa diedit pelanggan, padahal pemilik diikat server ke sesi (`bookings.js:143`). | Untuk role `user`: `readOnly` + label "Nama pemesan". |
| m11 | `BookingSaya.tsx:307` — pembatalan wajib alasan ≥3 karakter (tak ada spesifikasi untuk pelanggan). | Jadikan opsional untuk pelanggan. |
| m12 | `Login.tsx:47-48` + `App.tsx:44` — `state.from` diabaikan saat login sukses (pelanggan dari `/booking-saya` mendarat di `/beranda`), dan `from` di sana adalah objek `Location`, bukan string (tipe assertion salah). | `App.tsx:44` → `state={{ from: location.pathname + location.search }}`; `Login.tsx:48` → `navigate(from ?? homeFor(me.role), { replace: true })`. |
| m13 | `InfoRental.tsx:101,105` — label tab "Unit" diduplikasi judul seksi "Unit". | Judul seksi berbeda, atau hapus salah satu. |
| m14 | `Beranda.tsx:48-57`, `InfoRental.tsx:81-94`, `App.tsx:69-75,83-89` — state error/kosong hanya punya `h3` (`EmptyState`), tanpa `h1` → heading tanpa level 1 di halaman itu. | Tambahkan `h1` pada branch error, atau ubah `EmptyState` ke `h2`. |

### Terverifikasi dari sumber (aman)

- **Guard & rute**: `/daftar` & `/masuk` di luar `Shell` (publik, `App.tsx:98-99`); `SuperAdminOnly`/`UserOnly` (`App.tsx:104-126`); `IndexRedirect` per peran (`App.tsx:55-58`); `homeFor` → superadmin `/dashboard`, user `/beranda` (`Login.tsx:13-15`).
- **Tombol Check-in untuk role `user`: TIDAK ADA** ✓ — satu-satunya pemanggil `bookings.checkIn` adalah `Bookings.tsx:111` (halaman SuperAdminOnly); `BookingSaya.tsx:193-202` hanya merender "Batalkan".
- **Regresi area Super Admin utuh** ✓ — 9 menu superadmin (`AppShell.tsx:21-29`) lengkap; nav bawah superadmin = Dashboard·Sesi·Konsol·Transaksi + "Lainnya" (5 isi: Booking·Laporan·Game·Pengaturan·Pengguna); `Users.tsx:129` label peran "Super Admin"/"Pelanggan" via `ROLE_LABEL` (`types.ts:6`); **nol "Kasir" di `web/src/**`**.
- **Badge status** ✓ — "Kedaluwarsa" (`status.tsx:49`, tone danger) dipakai di Beranda & Booking Saya; tidak ada status mentah berbahasa Inggris (`StatusBadge` selalu memetakan lewat `status.tsx`); token `bg-success-soft text-success` valid.
- **Aksesibilitas form** ✓ — `label htmlFor={id}` (`Form.tsx:35`) dengan `useId()`; `aria-describedby` = errorId + helpId (`Form.tsx:66`); `aria-invalid`, `aria-required`; pesan error `role="alert"` (`Form.tsx:41`, `Register.tsx:183`); server error tampil utuh dalam `role="alert"` (`:183-186`).
- **Target sentuh** ✓ — `Button size="sm"` punya hit-area 44 px via `before:-inset-y-1.5` (`Button.tsx:20`); `Input` md = `h-11` 44 px di <640 (`Form.tsx:14`); `Tabs` `min-h-11`; `IconButton` `size-11`. Tidak ada target <44 px di halaman baru.
- **Nav bawah** — tinggi 60 px (`py-2` 16 + ikon 24 + gap 2 + label 16,8); `main pb-24` 96 px > 60 px → **tidak ada isi tertutup nav**.
- **Laptop** — `mx-auto w-full max-w-[1280px]` (`AppShell.tsx:141`); 1440 px → kolom isi 1152 px (sesuai §6). **Keputusan navigasi pelanggan**: pertahankan sidebar 240 px yang sama dengan admin (satu shell untuk dua peran, identitas + Keluar + Ubah sandi tinggal di sana); 4 menu di rail 240 px 아직 wajar dan jauh lebih murah daripada menambah pola nav kedua (tab horizontal). Yang **tidak** boleh tetap: nav bawah 5 slot untuk pelanggan (lihat B1) dan sidebar penuh untuk area operator.
- **Backend menopang area pelanggan** ✓ — `GET /bookings` di-scope `customer_user_id` (`bookings.js:104-105`); `GET /consoles` subset publik (`:41-42`); `GET /settings` subset (`:44-47`); `GET /packages` & `GET /games` boleh untuk pelanggan (`settings.js:106-112`, `games.js:22-35`); `POST /bookings` mengikat pemilik ke sesi (`:143`) → booking buatan pelanggan muncul di list-nya sendiri; `POST /bookings/:id/cancel` hanya pemilik (`:276`).
- **Pesan error server berbahasa Indonesia** ✓ — `DUPLICATE_USERNAME` → "Username sudah dipakai" (`errors.js:22`); validasi zod Indonesia (`auth.js:44-50`); `errorMessage` menampilkan pesan apa adanya (`useAsync.ts:5-9`).

### Wajib verifikasi visual (belum bisa dipastikan tanpa browser)

1. 360/390/430 — `/daftar`: tinggi form, **tanpa overflow horizontal**, tombol "Daftar" & tautan "Masuk" terjangkau tanpa zoom.
2. 360 — `/daftar` submit dengan field kosong: 4 pesan field muncul, tidak menimpa input lain; pesan 409 (username terpakai) terbaca jelas di kotak merah.
3. 360 — nav bawah pelanggan: **tidak boleh** ada sheet "Menu lainnya" kosong (B1); label "Booking Saya" tidak menyentuh tetangganya.
4. 360 — ketuk ikon suara peringatan di topbar pelanggan: tidak boleh ada (M5).
5. 360 — `/beranda` dengan satu booking `confirmed` hari ini yang jamnya sudah lewat: apakah masih tampil sebagai "Booking berikutnya" dengan badge "Kedaluwarsa"? (M1)
6. 360 — `/info-rental` tab Unit: konfirmasi kartu **tidak** menampilkan status unit (M3) sebelum & sesudah perbaikan.
7. 360 — `/booking-saya` dengan ≥5 booking: tombol "Buat booking" masih terlihat? (M6) dan baris terakhir tidak tertutup sticky bar.
8. ≥1024 — sidebar pelanggan 240 px dengan 4 menu: ruang kosong acceptability; area Super Admin tetap utuh (9 menu + "Lainnya" berisi 5).
9. ≥1024 — tabel Booking Saya: kolom Aksi = "Batalkan" (danger); **tidak ada** "Check-in" di mana pun pada role user.
10. ≥1024 — scroll panjang di Booking Saya: sticky bar "Buat booking" tidak menutup baris terakhir (perlu spacer 72 px).
11. axe — Info Rental: `aria-valid-attr-value` = 0 (tabpanel), `landmark-unique` = 0 (dua `nav` "Navigasi utama" saat Drawer terbuka), urutan heading (h1→h2→h3) di semua state error/kosong.
12. Kontras CTA accent: ukur label "Daftar" (target ≥4,5:1) setelah M2; `text-white` di `#7C3AED` = 5,70:1.
13. Android nyata — safe-area, `dvh`, dan keyboard tidak menutupi field "Ulangi kata sandi" di `/daftar`.

### Status verifikasi

| Aspek | Status |
| --- | --- |
| Struktur halaman, guard, label/ARIA wiring, token, copy, scoping backend | `verified` (inspeksi statis `web/src/**` + `server/src/**`) |
| Kompilasi | `verified` (`tsc --noEmit` exit 0; `check-table-card.ts` all passed) |
| Angka kontras (3,40:1 vs 5,70:1) | `verified` — dihitung dari token `DESIGN.md` §2 |
| Perilaku runtime (sheet kosong, kartu "Booking berikutnya", pemotongan status, posisi tombol) | **`not_verified`** — tidak ada browser/headless |
| Penampilan nyata HP/laptop | **`not_verified`** |
| **Verdict** | **FAIL ❌** — 1 blocker (B1) + 6 major (M1–M6) |

---

## DS-011 — Re-QA atas perbaikan DS-010 (FE-013)

**Verdict: PASS ✅** — **0 blocker · 1 mayor (M-A, area admin, 1 perbaikan komponen) · 4 minor terbuka.**
Aturan gate: FAIL bila ≥1 blocker atau ≥3 mayor. Blocker 0, mayor 1 → **tidak memblokir**, tapi M-A **wajib** dikerjakan di FE-014 (satu baris).

Metode: inspeksi statis `web/src/**` + `server/src/**` terhadap `DESIGN.md` §2/§3/§6/§7/§10. Bukti eksekusi: `node node_modules/typescript/bin/tsc --noEmit` → **exit 0**; `node scripts/check-table-card.ts` → **all checks passed** (termasuk 4 cek M3 baru); kontras **dihitung ulang sendiri** dari token (bukan angka agen); simulasi M1 dijalankan dengan helper asli `lib/format.ts` (`toJakartaDateTimeStr`) + aturan `isExpired` server. Tidak ada browser di lingkungan ini → butir visual tetap `not_verified`.

### Status per item DS-010

| Item | Status | Bukti (`file:line`) |
| --- | --- | --- |
| **B1** blocker | ✅ **tertutup** | `AppShell.tsx:179` `overflow.length > 0 &&` diterapkan pada tombol; `AppShell.tsx:203` guard sheet. `MOBILE_PRIMARY_USER` = 4 rute = semua rute `user` (`AppShell.tsx:40`) → `overflow=[]` → tak ada tombol & tak ada sheet. `superadmin`: 4 primer + 5 overflow (`AppShell.tsx:39`, NAV 9 item `:21-29`) → "Lainnya" + sheet 5 isi tetap utuh. |
| **M1** | ✅ **tertutup** | `Beranda.tsx:31-35` — filter 3 syarat: `UPCOMING.includes(status)` **dan** `effectiveBookingStatus(b) !== 'expired'` **dan** `` `${b.bookingDate} ${b.startTime}` >= now ``; `now` = `toJakartaDateTimeStr()` (`Beranda.tsx:26`, helper baru `lib/format.ts:82-89`). `startTime` server zero-padded (`server/src/lib/validate.js:22` `hhmm` = `^([01]\d|2[0-3]):[0-5]\d$`) → perbandingan leksikografis aman. |
| **M2** | ✅ **tertutup** | `Button.tsx:31` `bg-accent text-white`; `Tabs.tsx:69` + `Pagination.tsx:88` `bg-accent text-white`. Token `DESIGN.md` §2 **tidak berubah** (`--color-accent: #7C3AED`). Hitung ulang di bawah. |
| **M3** | ✅ **tertutup** | `InfoRental.tsx:51` mewarisi `UNIT_CARD_LAYOUT.controllers` → `hideOnMobile: true` (`lib/table-card.ts:42`); urutan kartu jadi tipe·ruangan·**status** + tarif di slot prominent. `web/scripts/check-table-card.ts:64-68` = 4 cek InfoRental baru, **lulus**. |
| **M4** | ⚠️ **tertutup di InfoRental saja** | `Tabs.tsx:15` prop `idPrefix?` + `Tabs.tsx:90` komponen `TabPanel`; `InfoRental.tsx:25,106,109,128,147` memakai `idPrefix="info-rental"` dan 3 `TabPanel id="info-rental-panel-*"` → `aria-controls` (`Tabs.tsx:57`) + `aria-labelledby` (`Tabs.tsx:92`) saling cocok. **6 halaman admin belum** → lihat **M-A**. |
| **M5** | ✅ **tertutup** | Topbar `AppShell.tsx:135` `user?.role === 'superadmin' &&`; sidebar `AppShell.tsx:111` `onToggleMute` hanya untuk superadmin; Drawer HP `AppShell.tsx:196` `UserBlock` tanpa `onToggleMute` → tak ada toggle di area pelanggan. |
| **M6** | ✅ **tertutup** | `BookingSaya.tsx:219` `StickyActionBar` + spacer `BookingSaya.tsx:218` `h-[4.5rem] lg:hidden` (pola `Settings.tsx:321-322`). Bar tetap di atas nav 60 px (`AppShell.tsx:311` `bottom-[calc(3.75rem+var(--spacing-safe-bottom))]`); tinggi bar 64 px < spacer 72 px + `main pb-24` 96 px → baris terakhir **tidak** tertutup (regresi F01 aman). ≥1024: `AppShell.tsx:311` `lg:hidden` dan `AppShell.tsx:315` `hidden … lg:flex` → **tepat satu** branch tampil, tidak doibel. CTA header dihapus (`BookingSaya.tsx:179-182` tanpa `actions`). |
| **m1** | ✅ | Layar sukses `Register.tsx:110-128` hanya tombol "Masuk sekarang"; link "Sudah punya akun? Masuk" tinggal di layar form (`:227-232`). |
| **m2** | ✅ | `Register.tsx:176-185` — `error={errors.phone}` dihapus (phone memang tak punya aturan di `validate()` `Register.tsx:30-42`). |
| **m3** | ⚠️ **sebagian** | `Register.tsx:150` + `BookingSaya.tsx:250`legendanya ada. **Hilang di `/masuk` (`Login.tsx:88,95`) dan `/akun` (`Akun.tsx:61`)** → lihat **M-E**. |
| **m4** | ✅ | `Register.tsx:85-88` fokus ke field invalid pertama via ref map (`:58-65`); `Input` adalah `forwardRef` ke `<input>` (`Form.tsx:58,75`). |
| **m5** | ✅ | `Register.tsx:172` `maxLength={80}`, `Register.tsx:182` `maxLength={40}` (cermin `server/src/routes/auth.js`). |
| **m6** | ✅ | `Register.tsx:67-73` spinner selama `useAuth().loading`; skeleton di `Beranda.tsx:41-49` & `InfoRental.tsx:76-83`. |
| **m7** | ✅ | `Beranda.tsx:123` "Tarif dasar (mulai dari)". |
| **m8** | ✅ | `Beranda.tsx:51,57` — `list.error ?? units.error ?? cfg.error` masuk branch error; `codeOf` (`:27`) tidak lagi diam-diam "—". |
| **m9** | ✅ | `BookingSaya.tsx:75-79` draft dikoreksi saat `minMinutes` resolve. |
| **m10** | ✅ | `BookingSaya.tsx:298` label "Nama pemesan" + `:301` `readOnly={isCustomer}`. |
| **m11** | ✅ | `BookingSaya.tsx:326` `reason={{ …, optional: true }}`; `Modal.tsx:228` `reasonMissing` = false bila `optional` → tombol konfirmasi tak terkunci. |
| **m12** | ✅ | `App.tsx:44` `state={{ from: location.pathname + location.search }}`; `Login.tsx:54` `navigate(safeFrom(location.state) ?? homeFor(me.role), { replace: true })`; `Login.tsx:18-21` `safeFrom` menolak path non same-origin (anti open-redirect). |
| **m13** | ✅ | `InfoRental.tsx:110` judul seksi "Daftar unit" ≠ label tab "Unit" (`InfoRental.tsx:18`). |
| **m14** | ✅ | `headingLevel={1}` di `App.tsx:71,83`, `Beranda.tsx:55`, `InfoRental.tsx:89`; `Feedback.tsx:16,21,31` dukung `headingLevel` 1–3. |

### Hitung ulang kontras M2 (dihitung sendiri dari token `DESIGN.md` §2)

| Pasangan | Rasio | Status |
| --- | --- | --- |
| `#FFFFFF` on `#7C3AED` (accent) | **5.70:1** | ✅ AA (label CTA utama) |
| `#FFFFFF` on `#7C4EEA` (accent-hover) | 5.08:1 | ✅ AA |
| `#FFFFFF` on `#6D28D9` (accent-active) | 7.10:1 | ✅ AAA |
| `#0A0E1A` on `#7C3AED` (lama) | 3.38:1 | ❌ non-text only |
| `#0A0E1A` on `#22D3EE` (cyan) | 10.65:1 | ✅ AAA |

**Sisa `text-text-inverse` di seluruh `web/src`** — 3 usage, semuanya **ikon dekoratif `aria-hidden`** (bukan teks): `Login.tsx:65`, `Register.tsx:134`, `AppShell.tsx:45` (semua `Gamepad2 … aria-hidden="true"` di atas `bg-accent`, 3.38:1 ≥ 3:1 → lolos WCAG 1.4.11 non-teks). Knob switch `Form.tsx:254-259` = putih di atas accent (5.70:1). **Tidak ada teks utama yang lagi gagal.** Badge `bg-accent` lain: `Tabs.tsx:69` & `Pagination.tsx:88` sudah putih; `types.ts:18` `bg-accent-soft` (bukan fill accent). ✅

### Simulasi M1 (helper asli, now = 2026-10-20 15.30 WIB)

| Kasus | Slot | `effectiveBookingStatus` | Hasil |
| --- | --- | --- | --- |
| Booking hari ini **20.00** (belum lewat) | `2026-10-20 20:00` | `confirmed` | ✅ **tampil** |
| Booking hari ini **10.00** (sudah lewat) | `2026-10-20 10:00` | `expired` | ✅ **dilewati** (dua syarat sekaligus) |
| Booking **besok** 10.00 | `2026-10-21 10:00` | `confirmed` | ✅ **tampil** |
| Booking **3 hari lalu** | `2026-10-17 10:00` | `expired` | ✅ **dilewati** |
| (bonus) `pending` hari ini 16.00 | `2026-10-20 16:00` | `pending` | tampil — **benar**: server hanya menandai `expired` bila `confirmed` (`server/src/lib/mappers.js:95`), jadi tidak ada divergensi client↔server |

Hanya slot yang benar-benar berikutnya yang muncul; kartu kosong "Belum ada booking" (`Beranda.tsx:107-116`) tidak lagi tertahan booking basi. ✅

### Penilaian `aria-controls` menggantung di 6 halaman admin → **M-A (MAJOR, bukan blocker)**

**Fakta terverifikasi:** `Tabs.tsx:57` menulis `aria-controls={`${baseId}-panel-${item.value}`}` **tanpa syarat**; `baseId` default = `useId()` (React 19 → `_r_0_`) yang privat. Tidak ada satu pun elemen ber-id itu di DOM. 6 halaman — `Sessions.tsx:159` (4 tab), `Units.tsx:182` (5), `Bookings.tsx:206` pill "Jadwal/Daftar" (2) + `Bookings.tsx:261` (6), `Reports.tsx:153` (5), `Settings.tsx:199` (6) — = **28 elemen `role="tab"` dengan IDREF menggantung**.

**Nilai jujur: MAJOR, bukan blocker.** Bukan blocker karena: tidak ada aksi mati, tidak ada layar rusak, tidak ada konten tak terjangkau — tab tetap berfungsi, tabel/panel di bawahnya tetap berubah dan tetap dalam urutan baca. Tapi **ARIA-nya invalid** (`aria-controls` menyatakan hubungan yang tidak ada) → `axe: aria-valid-attr-value` gagal; pembaca layar diberi janji palsu. Ini persis kelas M4 yang sudah saya nilai **major** di DS-010 dan **belum** dikerjakan FE-013, jadi temuannya bukan karangan.

**Ya, cukup 1 perbaikan komponen** (tanpa menyentuh 6 halaman): di `Tabs.tsx`, `aria-controls` hanya dipasang bila halaman memang menyediakkan panel.

```tsx
// Tabs.tsx:57 — aria-controls hanya bila halaman yang mengelola tabpanel
aria-controls={idPrefix ? `${baseId}-panel-${item.value}` : undefined}
```

`InfoRental` mengoper `idPrefix="info-rental"` → tetap terhubung. 6 halaman admin tidak mengoper `idPrefix` → 28 IDREF hilang dalam 1 baris. (Alternatif yang lebih benar secara semantik: 6 halaman itu **filter**, bukan tab — idealnya `role="group"` + `aria-pressed`; itu refactor lebih besar, tidak perlu sekarang.)

**Perhitungan mayor:** M-A saya hitung **1** temuan mayor (1 akar masalah, 1 perbaikan, 1 verifikasi) — konsisten dengan M4 di DS-010 yang juga 1 baris. Kalau leader menghitung per halaman → 6 mayor → **FAIL**; angka itu saya serahkan ke leader, saya nyatakan open.

### Minor terbuka (tidak memblokir, wajib dikerjakan di FE-014)

| # | Temuan | Perbaikan konkret |
| --- | --- | --- |
| **M-B** | `AppShell.tsx:55` `NavList` hardcode `aria-label="Navigasi utama"`; dipakai di sidebar `:104`, Drawer HP `:194`, sheet "Lainnya" `:205` — dan nav bawah `:154-157` juga `aria-label="Navigasi utama"`. Saat Drawer terbuka ada 2–3 landmark `<nav>` bernama sama → `axe: landmark-unique` (ini persis butir #11 daftar verifikasi DS-010, dan **masih ada**). Praktis ringan: `aria-modal="true"` pada Drawer membuat AT lain membackground, jadi dampaknya nyaris nol. | `NavList` menerima prop `label`; sidebar "Navigasi utama", nav bawah "Navigasi bawah", Drawer "Navigasi menu", sheet "Navigasi lainnya". 1 prop + 4 call-site. |
| **M-C** | `BookingSaya.tsx:184` `<PageSection>` **tanpa `title`** → tidak ada `h2`; `EmptyState` di `:193` default `headingLevel={3}` (`Feedback.tsx:21`) → urutan heading **h1 → h3** (lompat) di state "Belum ada booking". Pola yang sama ada di halaman admin (`Units.tsx:178`, `Sessions.tsx:159`, `Bookings.tsx`). | Tambahkan `title="Daftar booking"` pada `PageSection` (`BookingSaya.tsx:184`) → h1→h2→h3. Alternatif sistemik: default `EmptyState` `headingLevel` 3 → 2 (`Feedback.tsx:21`) aman di semua pemakaian (h2→h2 bukan "increase", jadi tidak memicu `heading-order`). |
| **M-D** | Dengan 0 booking, "Buat booking" muncul **dua kali** di <1024: di dalam `EmptyState` (`BookingSaya.tsx:197`) dan di sticky bar (`BookingSaya.tsx:220`) — berdekatan <100 px. | `<StickyActionBar visible={rows.length > 0}>` (`BookingSaya.tsx:219`) — dengan tabel kosong, CTA di empty state sudah cukup (tidak ada yang perlu digulir). |
| **M-E** | Legenda "* wajib diisi" ada di `Register.tsx:150` & `BookingSaya.tsx:250`, **tidak ada** di `/masuk` (`Login.tsx:88,95`) dan `/akun` (`Akun.tsx:61`) — bintang `*` (`Form.tsx:24`, `aria-hidden`) tanpa penjelasan bagi pengguna tampak. | Tambahkan `<p className="mt-1 text-caption text-text-muted">* wajib diisi</p>` di `Login.tsx` (setelah "Masuk dengan akun Anda.") dan di `Akun.tsx` (sebelum input "Nama lengkap"). |

### Regresi (diperiksa ulang)

- **Super Admin utuh** — 9 menu `NAV` (`AppShell.tsx:21-29`) lengkap; nav bawah superadmin = Dashboard·Sesi·Konsol·Transaksi + "Lainnya" (5 isi). Tidak ada menu yang hilang.
- **`Button`/`Tabs`/`Pagination`** — perubahan hanya `text-text-inverse` → `text-white` di atas fill accent; rasio membaik (3.38 → 5.70). Tidak ada elemen yang bergantung pada warna lama. `Tabs` pill `bg-accent text-white` + badge `bg-white/20` (hitung: 3.98:1) **tidak pernah dirender** — tak ada `Tabs` item yang memakai `count` di seluruh repo → jalur kode mati, bukan cacat aktif.
- **State coverage area pelanggan** — `Beranda` (skeleton `:41`, error `:51`, kosong `:107`), `InfoRental` (skeleton `:76`, error `:85`, kosong per tab `:117/:135/:154`), `BookingSaya` (`DataTable loading/error/empty` `:186-199`), `Akun` (data dari context, tanpa I/O) — **lengkap**.
- **Tidak ada tombol "Check-in" untuk role `user`** — pemanggil `bookings.checkIn` hanya `Bookings.tsx` (SuperAdminOnly); `BookingSaya.tsx:200-209` hanya "Batalkan".
- **Nol regresi kompilasi** — `tsc --noEmit` exit 0; `check-table-card.ts` all passed.

### Wajib verifikasi visual (tetap `not_verified` — tidak ada browser di lingkungan ini)

1. 360 px — `/beranda` dengan booking `confirmed` hari ini jam **sudah lewat** → kartu "Booking berikutnya" harus hilang (M1).
2. 360 px — `/beranda` dengan booking **besok** → tampil dengan jam & badge benar.
3. 360 px — nav bawah pelanggan: **tanpa** tombol "Lainnya" dan **tanpa** sheet kosong (B1); 4 label muat tanpa saling menyentuh.
4. 360 px — `/info-rental` tab Unit: kartu **menampilkan** status unit (M3) & tarif di kanan atas.
5. 360 px — `/booking-saya` dengan ≥5 booking: sticky bar "Buat booking" terlihat, baris terakhir **tidak** tertutup (M6).
6. 360 px — `/booking-saya` dengan **0 booking**: berapa tombol "Buat booking" yang tampil? (M-D — harus 1).
7. ≥1024 — `/booking-saya` scroll panjang: sticky bar "Buat booking" tidak menutup baris terakhir; **hanya satu** baris aksi (tidak dobel).
8. ≥1024 — sidebar pelanggan 4 menu + sidebar Super Admin 9 menu utuh; area Super Admin tidak berubah visual.
9. 360 px — `/masuk`: apakah dua field menampilkan `*` yang berarti? (M-E).
10. 360 px — ketuk ikon suara peringatan di topbar pelanggan: **tidak boleh ada** (M5).
11. Keyboard — `Tab`/`Shift+Tab` di `/info-rental`: apakah panel tab yang tersembunyi benar-benar dilewati (`hidden`) dan apakah urutan heading h1→h2→h3?
12. axe (butuh browser) — `aria-valid-attr-value` = 0 di **6 halaman admin** (M-A), `landmark-unique` = 0 saat Drawer terbuka (M-B), `heading-order` = 0 di `/booking-saya` state kosong (M-C).
13. Android nyata — safe-area & keyboard tidak menutupi field "Ulangi kata sandi" di `/daftar`; keyboard tidak menutupi sticky bar "Buat booking".

### Status verifikasi

| Aspek | Status |
| --- | --- |
| 21 item DS-010 (B1, M1–M6, m1–m14) | `verified` — 19 tertutup penuh, M4 tertutup di InfoRental saja, m3 tertutup di 2 dari 4 form |
| Kontras M2 (5.70:1) | `verified` — dihitung ulang sendiri dari token `DESIGN.md` §2, bukan angka agen |
| Simulasi M1 (4 kasus + 1 bonus) | `verified` — dijalankan dengan helper asli `lib/format.ts` |
| Kompilasi & self-check | `verified` (`tsc --noEmit` exit 0; `check-table-card.ts` all passed) |
| Regresi Super Admin / area pelanggan | `verified` (inspeksi statis) |
| Perilaku runtime & penampilan nyata HP/laptop | **`not_verified`** — tidak ada browser/headless di lingkungan ini |
| **Verdict** | **PASS ✅** — 0 blocker · 1 mayor (M-A) · 4 minor (M-B…M-E). M-A wajib dikerjakan di FE-014 (1 baris di `Tabs.tsx:57`). |
