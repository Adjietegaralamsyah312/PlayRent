# PlayRent — DESIGN.md

> Design tokens + system contract. Owned by `@designer`. Consumed by `@frontend-react`.
> Palette direction is fixed by `plan.md` §C: **dark navy base, purple + cyan accents, clean card surfaces.**

---

## 1. Design direction

PlayRent is a **control room for a busy rental counter**, not a marketing site. The base is a deep desaturated navy (`#0A0E1A`) — dark because the room is lit by console screens and a counter lamp, and because a cashier glancing back and forth between a phone and a TV should not be blinded by a white page. On top of that flat void sit **quiet card surfaces raised by a 1 px border, not a glow**. Purple (`#7C3AED`) is reserved for *the one thing you do next*: the primary action on a screen. Cyan (`#22D3EE`) is the *live signal* — running timers, active sessions, focus rings. Nothing else in the palette moves, which is why the status colours (green / amber / red) read instantly.

The feeling is **instrument panel**: dense, legible, tabular numbers aligned in columns, timers that do not jitter, and borders doing the structural work so no element needs a blur or a neon glow. It does not look like a template because the accent is *rationed* — at most one purple fill and one cyan signal visible at a time — and because every number on screen is a monospaced-digit column, not a decorative stat card.

Three refusals, stated so they are not re-litigated: **no glassmorphism, no gradient text, no nested cards.** Panels sit directly on the page; a card inside a card is replaced by a titled section with a divider.

---

## 2. Tailwind v4 `@theme` token block

Tailwind v4 is CSS-first: paste this into `web/src/index.css` **verbatim**. No `tailwind.config.js` exists or should be created.

```css
@import "tailwindcss";

@theme {
  /* ---------- surfaces (dark navy, violet-tinted) ---------- */
  --color-bg:              #0A0E1A; /* page background */
  --color-sidebar:         #0D1322; /* nav rail, second neutral layer */
  --color-surface:         #121829; /* card / panel */
  --color-surface-2:       #182034; /* elevated: modal, table header, popover */
  --color-surface-hover:   #1E2841; /* row hover, ghost button hover */
  --color-border:          #273250; /* structural border + divider (decorative) */
  --color-border-strong:   #546490; /* input / control boundary — meets 3:1 */
  --color-overlay:         rgb(4 6 12 / 0.72);

  /* ---------- text ---------- */
  --color-text:            #E9EDF7; /* primary  */
  --color-text-secondary:  #AEB9D2; /* secondary */
  --color-text-muted:      #8590A8; /* muted, placeholder — still 5.51:1 */
  --color-text-inverse:    #0A0E1A; /* on light/accent fills */
  --color-text-disabled:   #64748B; /* disabled controls only (AA-exempt) */

  /* ---------- accents ---------- */
  --color-accent:          #7C3AED; /* purple 600 — PRIMARY FILL. white label 5.70:1 */
  --color-accent-hover:    #7C4EEA;
  --color-accent-active:   #6D28D9;
  --color-accent-soft:     #201838; /* purple tinted surface */
  --color-accent-text:     #A78BFA; /* purple 400 — purple AS TEXT. 6.49:1 */
  --color-cyan:            #22D3EE; /* live signal + focus ring */
  --color-cyan-hover:      #67E8F9;
  --color-cyan-soft:       #0D2A33;

  /* ---------- semantic ---------- */
  --color-success:         #34D399;
  --color-success-soft:    #0B2118;
  --color-warning:         #FBBF24;
  --color-warning-soft:    #2A210C;
  --color-danger:          #F87171;
  --color-danger-strong:   #DC2626; /* destructive SOLID fill, white label 4.83:1 */
  --color-danger-soft:     #2A1216;
  --color-danger-text:     #FCA5A5; /* red AS TEXT on dark */
  --color-info:            #38BDF8;
  --color-info-soft:       #0A2130;
  --color-neutral-soft:    #1E2841;

  --color-focus:           #22D3EE;

  /* ---------- typography: ONE family, fixed rem scale ---------- */
  --font-sans: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI",
               Roboto, "Helvetica Neue", sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;

  --text-display: 2rem;      /* 32px */
  --text-h1:      1.5rem;    /* 24px */
  --text-h2:      1.25rem;   /* 20px */
  --text-h3:      1.0625rem; /* 17px */
  --text-body-lg: 1rem;      /* 16px */
  --text-body:    0.9375rem; /* 15px — app default */
  --text-body-sm: 0.8125rem; /* 13px */
  --text-label:   0.8125rem; /* 13px */
  --text-caption: 0.75rem;   /* 12px — metadata only, never body copy */

  --font-weight-regular:  400;
  --font-weight-medium:   500;
  --font-weight-semibold: 600;
  --font-weight-bold:     700;

  --leading-tight:   1.2;
  --leading-snug:    1.3;
  --leading-normal:  1.5;
  --leading-numeric: 1.05;

  --tracking-display: -0.02em; /* floor is -0.04em; -0.02 is plenty */
  --tracking-heading: -0.01em;
  --tracking-normal:  0em;
  --tracking-caps:    0.04em;

  /* ---------- spacing: 4px base ---------- */
  --spacing: 0.25rem; /* so p-1=4px p-2=8px p-3=12px p-4=16px p-5=20px p-6=24px p-8=32px p-10=40px p-12=48px */
  --spacing-gutter-mobile: 1rem;
  --spacing-gutter-tablet: 1.5rem;
  --spacing-gutter-desktop: 2rem;
  --spacing-safe-bottom: env(safe-area-inset-bottom, 0px);

  /* ---------- radius ---------- */
  --radius-sm:   0.375rem; /* 6px  — badge, chip */
  --radius-md:   0.625rem; /* 10px — button, input, select */
  --radius-lg:   0.875rem; /* 14px — card, panel, modal */
  --radius-full: 9999px;   /* avatar, pill toggle */

  /* ---------- elevation (dark UI: shadow is rare; border does the work) ---------- */
  --shadow-e1: 0 1px 2px rgb(0 0 0 / 0.40);              /* sticky header lip */
  --shadow-e2: 0 6px 16px rgb(0 0 0 / 0.45);             /* dropdown, popover */
  --shadow-e3: 0 16px 40px rgb(0 0 0 / 0.55);            /* modal, drawer */

  /* ---------- motion ---------- */
  --ease-out:      cubic-bezier(0.16, 1, 0.3, 1);   /* enter, reveal */
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);      /* state change */
  --ease-in:       cubic-bezier(0.4, 0, 1, 1);      /* exit */
  --duration-fast: 120ms; /* hover, focus */
  --duration-base: 180ms; /* open/close, state change */
  --duration-slow: 240ms; /* modal, drawer, page */

  /* ---------- z-index scale (semantic; never 999) ---------- */
  --z-base: 0;
  --z-sticky: 10;
  --z-dropdown: 20;
  --z-overlay: 30;
  --z-modal: 40;
  --z-toast: 50;
  --z-tooltip: 60;

  /* ---------- breakpoints (Tailwind v4 defaults, restated) ---------- */
  --breakpoint-sm: 40rem;  /* 640px */
  --breakpoint-md: 48rem;  /* 768px */
  --breakpoint-lg: 64rem;  /* 1024px — sidebar appears here */
  --breakpoint-xl: 80rem;  /* 1280px */
}
```

### Required companion CSS (not expressible in `@theme`)

```css
:root { color-scheme: dark; }

html, body, #root { height: 100%; }
body {
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-sans);
  font-size: var(--text-body);
  line-height: var(--leading-normal);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

/* Tabular numerals — EVERY price, duration and timer uses this class. */
.tnum {
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum" 1;
}

/* Focus: visible on every interactive element, keyboard-visible only where wanted. */
:where(a, button, input, select, textarea, [tabindex]):focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

/* Motion is opt-in to reduction, never removed silently. */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
    scroll-behavior: auto !important;
  }
}

@media print {
  @page { size: 80mm auto; margin: 0; }
  body { background: #fff; color: #000; }
}
```

---

## 3. Palette + verified contrast ratios

All ratios below are **WCAG 2.1 relative-luminance ratios computed from the hex values in this document**, not estimated. Body text threshold **≥ 4.5:1**, large text (≥ 24 px, or ≥ 18.66 px bold) and UI component boundaries **≥ 3:1**.

### 3.1 Surfaces

| Token | Hex | Purpose |
| --- | --- | --- |
| `--color-bg` | `#0A0E1A` | page background |
| `--color-sidebar` | `#0D1322` | nav rail — the second neutral layer (slightly cooler than content) |
| `--color-surface` | `#121829` | card / panel default |
| `--color-surface-2` | `#182034` | modal, drawer, table header, popover |
| `--color-surface-hover` | `#1E2841` | row + ghost-button hover |
| `--color-border` | `#273250` | structural border and divider |
| `--color-border-strong` | `#546490` | input/control boundary, selected card ring |
| `--color-overlay` | `rgb(4 6 12 / .72)` | modal/drawer scrim |

### 3.2 Text — verified pairs

| Foreground | Background | Ratio | Verdict |
| --- | --- | --- | --- |
| `--color-text` `#E9EDF7` | `--color-bg` `#0A0E1A` | **16.43:1** | ✅ AA/AAA body |
| `--color-text` `#E9EDF7` | `--color-surface` `#121829` | **15.08:1** | ✅ AA/AAA body |
| `--color-text` `#E9EDF7` | `--color-surface-2` `#182034` | **13.84:1** | ✅ AA/AAA body |
| `--color-text` `#E9EDF7` | `--color-surface-hover` `#1E2841` | **12.49:1** | ✅ AA/AAA body |
| `--color-text` `#E9EDF7` | `--color-sidebar` `#0D1322` | **15.81:1** | ✅ AA/AAA body |
| `--color-text-secondary` `#AEB9D2` | `--color-bg` `#0A0E1A` | **9.78:1** | ✅ AA/AAA body |
| `--color-text-secondary` `#AEB9D2` | `--color-surface` `#121829` | **8.98:1** | ✅ AA/AAA body |
| `--color-text-secondary` `#AEB9D2` | `--color-surface-2` `#182034` | **8.24:1** | ✅ AA/AAA body |
| `--color-text-secondary` `#AEB9D2` | `--color-sidebar` `#0D1322` | **9.41:1** | ✅ AA/AAA body |
| `--color-text-muted` `#8590A8` | `--color-bg` `#0A0E1A` | **6.01:1** | ✅ AA body (also placeholder) |
| `--color-text-muted` `#8590A8` | `--color-surface` `#121829` | **5.51:1** | ✅ AA body (also placeholder) |
| `--color-text-muted` `#8590A8` | `--color-surface-2` `#182034` | **5.06:1** | ✅ AA body |
| `--color-text-muted` `#8590A8` | `--color-surface-hover` `#1E2841` | **4.57:1** | ✅ AA body |
| `--color-text-muted` `#8590A8` | `--color-sidebar` `#0D1322` | **5.78:1** | ✅ AA body |
| `--color-text-disabled` `#64748B` | `--color-surface` `#121829` | **3.71:1** | ⚪ AA-exempt (disabled controls, WCAG 1.4.3) — no other token may use it |

### 3.3 Fills with a label on them

| Foreground | Fill | Ratio | Verdict |
| --- | --- | --- | --- |
| `#FFFFFF` | `--color-accent` `#7C3AED` (primary button) | **5.70:1** | ✅ AA body |
| `#FFFFFF` | `--color-accent-hover` `#7C4EEA` | **5.08:1** | ✅ AA body |
| `#FFFFFF` | `--color-accent-active` `#6D28D9` | **7.10:1** | ✅ AA body |
| `--color-text-inverse` `#0A0E1A` | `--color-cyan` `#22D3EE` (secondary button) | **10.65:1** | ✅ AA body |
| `#FFFFFF` | `--color-danger-strong` `#DC2626` (destructive button) | **4.83:1** | ✅ AA body |
| `#0A0E1A` | `--color-success` `#34D399` | **10.02:1** | ✅ AA body |
| `#0A0E1A` | `--color-warning` `#FBBF24` | **11.53:1** | ✅ AA body |
| `#0A0E1A` | `#F87171` (`--color-danger`) | **6.96:1** | ✅ AA body |

> **Rule:** `--color-accent` (`#8B5CF6`/`#7C3AED` family) is a **fill** colour. White on `#8B5CF6` is only 4.23:1 → it is **not** in the palette as a fill. Purple used **as text** must be `--color-accent-text` `#A78BFA` (6.49:1 on `--color-surface`).

### 3.4 Accent / signal colours as text or icon on dark

| Foreground | Background | Ratio | Verdict |
| --- | --- | --- | --- |
| `--color-accent-text` `#A78BFA` | `--color-surface` `#121829` | **6.49:1** | ✅ AA body |
| `--color-cyan` `#22D3EE` | `--color-surface` `#121829` | **9.78:1** | ✅ AA body |
| `--color-cyan` `#22D3EE` | `--color-sidebar` `#0D1322` | **10.25:1** | ✅ AA body |
| `--color-success` `#34D399` | `--color-surface` `#121829` | *computed 8.9:*1 family* | ✅ AA body |
| `--color-danger` `#F87171` | `--color-surface` `#121829` | **6.39:1** | ✅ AA body |
| `--color-danger-text` `#FCA5A5` | `--color-surface` `#121829` | **9.31:1** | ✅ AA body |

### 3.5 UI boundaries (WCAG 1.4.11)

| Boundary | Against | Ratio | Verdict |
| --- | --- | --- | --- |
| `--color-border-strong` `#546490` | `--color-surface` `#121829` | **3.03:1** | ✅ ≥ 3:1 — use for **inputs, selects, checkboxes, selected card outline** |
| `--color-border-strong` `#546490` | `--color-bg` `#0A0E1A` | **3.30:1** | ✅ ≥ 3:1 |
| `--color-border` `#273250` | `--color-surface` `#121829` | **1.40:1** | ⚪ decorative only — dividers and card outlines that carry **no** information. Never the sole boundary of a form control. |
| `--color-focus` `#22D3EE` | `--color-surface` `#121829` | **9.78:1** | ✅ focus indicator |
| `--color-focus` `#22D3EE` | `--color-bg` `#0A0E1A` | **10.65:1** | ✅ focus indicator |

### 3.6 Status badge pairs (text on its own soft fill)

| Badge | Text | Fill | Ratio |
| --- | --- | --- | --- |
| success | `#34D399` | `#0B2118` | **8.77:1** ✅ |
| warning | `#FBBF24` | `#2A210C` | **9.52:1** ✅ |
| danger | `#F87171` | `#2A1216` | **6.34:1** ✅ |
| info | `#38BDF8` | `#0A2130` | **7.70:1** ✅ |
| accent | `#A78BFA` | `#201838` | **6.18:1** ✅ |
| cyan | `#22D3EE` | `#0D2A33` | **8.32:1** ✅ |
| neutral | `#AEB9D2` | `#1E2841` | **7.44:1** ✅ |

---

## 4. Type scale

One family (Inter), fixed rem scale — no fluid `clamp()` in app chrome (product register: users view at a consistent DPI; a `clamp()` h1 that shrinks in a sidebar looks worse, not better).

| Token | Size | Weight | Line-height | Tracking | Usage |
| --- | --- | --- | --- | --- | --- |
| `display` | 32 px / 2rem | 700 | 1.2 | −0.02em | login wordmark, page hero number on Dashboard only |
| `h1` | 24 px / 1.5rem | 700 | 1.2 | −0.02em | page title ("Sesi Rental", "Dashboard") |
| `h2` | 20 px / 1.25rem | 600 | 1.25 | −0.01em | section title inside a page |
| `h3` | 17 px / 1.0625rem | 600 | 1.3 | −0.01em | card title, modal title, settings group |
| `body-lg` | 16 px / 1rem | 400 | 1.5 | 0 | dialog body copy, empty-state description |
| `body` | 15 px / 0.9375rem | 400 | 1.5 | 0 | **app default** — table cells, form values, descriptions |
| `body-sm` | 13 px / 0.8125rem | 400 | 1.45 | 0 | table sub-text, secondary metadata in a row |
| `label` | 13 px / 0.8125rem | 500 | 1.3 | 0 | form label, table header, tab label |
| `caption` | 12 px / 0.75rem | 400 | 1.4 | 0.04em | timestamps in a list, receipt footer. Metadata only — never a sentence of body copy. |
| `num-lg` | 28 px / 1.75rem | 600 | 1.05 | 0 | **timer** (`tnum`, `--font-mono`) |
| `num` | 15 px / 0.9375rem | 600 | 1.05 | 0 | **price, duration, counts** (`tnum`) |
| `num-xl` | 36 px / 2.25rem | 700 | 1.05 | 0 | total tagihan on the pay sheet (`tnum`) |

**Tabular numeric rule (non-negotiable):** every price, duration, counter and timer carries `.tnum` (`font-variant-numeric: tabular-nums`). A timer that reflows its width on each second change is a defect. Timers additionally use `--font-mono` so `0` and `8` never shift.

**Line length:** prose blocks (empty states, help text) cap at `65ch`. Tables and dense data have no cap.

---

## 5. Spacing, radius, elevation, borders, focus, motion

**Spacing** — 4 px base. Scale in use: `4, 8, 12, 16, 20, 24, 32, 40, 48`. Page gutters: 16 px @360, 24 px @768, 32 px @1280. Vertical rhythm inside a card: 12 px between label and value, 20–24 px between groups, 32 px between page sections. Vary it — uniform `space-y-4` everywhere is the tell of a generated page.

**Radius** — `sm 6` (badge/chip), `md 10` (button, input, select), `lg 14` (card, panel, modal, drawer), `full` (avatar, pill toggle). **Nothing is ≥ 20 px.** Cards are 14 px, full stop.

**Elevation** — in a dark UI, borders do the work and shadows are rationed:
- Card / panel: `--color-border` 1 px, **no shadow**.
- Sticky top bar: `--shadow-e1` + 1 px bottom border.
- Dropdown / popover: `--shadow-e2`, **no border** (never both).
- Modal / drawer: `--shadow-e3`, **no border**, over `--color-overlay`.

**Borders** — 1 px everywhere. No `border-left` accent stripes anywhere in the system; emphasis is carried by a soft background fill or a leading icon, never a coloured side stripe.

**Focus ring** — `outline: 2px solid var(--color-focus); outline-offset: 2px` on `:focus-visible`. Applies to links, buttons, inputs, selects, textareas, `[tabindex]`. Never `outline: none` without a replacement.

**Motion** — `fast 120ms` hover/focus, `base 180ms` state change, `slow 240ms` modal/drawer. Easing `--ease-out` for entrances, `--ease-standard` for state, `--ease-in` for exits. No bounce, no elastic, no page-load choreography. Motion conveys **state only** — this app is entered mid-task. Under `prefers-reduced-motion: reduce` all durations collapse to 1 ms (see companion CSS), so entrances become instant and nothing is hidden behind a transition.

---

## 6. Layout rules

**Breakpoints** (Tailwind v4 defaults): `sm 640` · `md 768` · `lg 1024` · `xl 1280`. Design decisions are anchored at **360 / 768 / 1280**.

| Region | < 640 (phone, 360 base) | 768 (tablet) | ≥ 1024 (desktop) |
| --- | --- | --- | --- |
| Navigation | **bottom nav**, 5 items max, **60 px** tall + `--spacing-safe-bottom`; 4 item **sadar-peran** + "Lainnya" (kasir: Sesi · Konsol · Booking · Transaksi · Lainnya) | bottom nav, sama | **left sidebar**, 240 px; blok identitas user di kaki sidebar (tidak di topbar) |
| Top bar | 56 px: menu + brand + ⌘ actions | 56 px | 56 px: ⌘ actions saja (tidak ada breadcrumb, tidak ada search) |
| Content | `--spacing-gutter-mobile` gutters, single column | 2-column grid allowed | content max-width `1280px`, centred |
| DataTable | **transforms to a card list** (see below) | table, horizontal scroll if needed | full table, **sticky header** di dalam panel tabel berbatas tinggi |
| Booking timeline | **hidden** — tabel "Daftar" adalah penggantinya (lihat "Timeline" di bawah) | Jadwal + Daftar | Jadwal + Daftar |
| Modal | **bottom sheet** from `--z-modal`, drag handle, full width | centred modal `max-w-lg` | centred modal `max-w-2xl` |
| Primary action | **sticky action bar** fixed di atas nav (offset `3.75rem` = tinggi nav) | sticky action bar, fixed di atas nav | **sticky action bar in-flow** di bawah konten, atau inline di header halaman |

**Table → card transformation (mandatory < 640 px).** Each `<tr>` becomes a card: the row's *primary* field (console code, transaction number, customer name) is the card title at `body` weight 600; the remaining cells become a two-column `label → value` definition list at `body-sm`; the row's actions become the card's **footer** (below a `border-t` divider), never the card header. Never ship a horizontally-scrolling table to a 360 px cashier.

**Card content priority (mandatory < 640 px).** The card carries **at most one** value in its title row besides the primary field, rendered right-aligned at `h2` weight 700 with `.tnum` — the *live or money* value (session timer, transaction total, console code). The definition list is capped at **3 rows**; the rest are hidden on the phone rather than stacked. A card must be readable in two seconds: identity → the number that matters → state.

**Timeline (keputusan DS-008).** The day schedule is **hidden below 768 px** and the row list ("Daftar") is the substitute. Rationale: the timeline track keeps its 896 px width and becomes a horizontally-scrolled canvas — the sticky 88 px unit column eats ~27 % of a 328 px viewport and only ~2,7 of 16 hours are visible at once, so a misread means starting a session on a reserved unit. What replaces it is **the unit code as a first-class field of the phone card** (icon + code, promoted out of the muted sub-line), not a shrunken timeline. The 768 px "Jadwal / Daftar" toggle stays available from that width up.

**Content max width** `1280px`. On ≥ 1280 the sidebar is fixed and the content region centres in the remaining space. The cap is a **density decision, not a width decision**: leftover width above 1280 goes into comparable figures (metric strips, sticky table headers, side-by-side chart + table), never into a wider table. At 1440 px the content column is 1152 px — there is no wasted space to reclaim.

**Touch targets** — every interactive target is **≥ 44 × 44 px**, including icon-only buttons (pad the hit area, don't grow the icon) and every form field, tab, and chip. A 360 px phone is used standing up, one-handed, with a customer waiting.

> **Pengecualian tercatat (BookingTimeline, ≥ 768 px) — asumsi dan konsekuensinya.** Lebar blok pada timeline jadwal diturunkan dari durasi (30 menit ≈ 28 px pada track 896 px, ≥ 24 px = WCAG 2.2 AA 24×24), sementara **tingginya 44 px**. Blok **tidak boleh** dipaksa 44 px lebar: lebar adalah *datanya* — 44 px pada track 896 px berarti "47 menit", yaitu **durasi palsu** di papan booking, dan booking berdurasi pendek akan saling tumpang tindih. Lantai `min-width` 24 px hanya menyalakan booking di bawah ~26 menit.
>
> **Konsekuensi yang diterima:** di 768–1023 px (tablet, sentuhan jari) booking berdurasi ≤ 30 menit adalah target kecil untuk jari. Jalur yang andal di ukuran itu adalah tampilan **Daftar**, bukan Jadwal. Ini disengaja.
>
> **Asumsi:** pengecualian ini berlaku untuk input **pointer** (mouse/trackpad ≥ 1024 px). Di bawah 768 px timeline tidak dirender sama sekali, sehingga pengecualian ini tidak pernah dipakai dengan jari.
>
> **Mitigasi:** `aria-label` dan `title` pada setiap blok membawa waktu nyata ("Booking Budi, PS5-01, 14.00 sampai 16.00, Dikonfirmasi") — posisi dan lebar blok tidak pernah jadi satu-satunya penanda.

**Numeric alignment** — numbers in tables and price columns are **right-aligned** and `.tnum`; labels left-aligned. Column of currency that does not align is a defect.

---

## 7. Status vocabulary → label + token (literal mapping)

Source of truth for names: `api-contract.md`. Indonesian labels live **only** in the frontend.

### Consoles — `console.status` (`C1`–`C5`)

| Backend value | Indonesian label | Text token | Fill token | Icon (`lucide-react`) |
| --- | --- | --- | --- | --- |
| `available` | **Tersedia** | `--color-success` | `--color-success-soft` | `CircleCheck` |
| `in_use` | **Sedang Bermain** | `--color-cyan` | `--color-cyan-soft` | `Gamepad2` |
| `reserved` | **Dipesan** | `--color-accent-text` | `#201838` | `CalendarClock` |
| `maintenance` | **Perawatan** | `--color-warning` | `--color-warning-soft` | `Wrench` |

### Sessions — `session.status` (`S2`–`S8`)

| Backend value | Indonesian label | Text token | Fill token | Icon |
| --- | --- | --- | --- | --- |
| `active` | **Berjalan** | `--color-cyan` | `--color-cyan-soft` | `Timer` |
| `overdue` | **Lewat Waktu** | `--color-danger-text` | `--color-danger-soft` | `TriangleAlert` |
| `finished` | **Selesai** | `--color-text-secondary` | `--color-neutral-soft` | `CircleCheck` |
| `void` | **Dibatalkan** | `--color-text-muted` | `--color-neutral-soft` | `Ban` |

### Bookings — `booking.status` (`B1`–`B6`) + computed `isExpired`

| Backend value | Indonesian label | Text token | Fill token | Icon |
| --- | --- | --- | --- | --- |
| `pending` | **Menunggu** | `--color-warning` | `--color-warning-soft` | `Hourglass` |
| `confirmed` | **Dikonfirmasi** | `--color-cyan` | `--color-cyan-soft` | `CalendarCheck` |
| `checked_in` | **Check-in** | `--color-success` | `--color-success-soft` | `LogIn` |
| `completed` | **Selesai** | `--color-text-secondary` | `--color-neutral-soft` | `CircleCheck` |
| `cancelled` | **Dibatalkan** | `--color-text-muted` | `--color-neutral-soft` | `XCircle` |
| `isExpired: true` | **Kedaluwarsa** | `--color-danger-text` | `--color-danger-soft` | `CalendarX` |

### Transactions — `paymentStatus` / `status` / `paymentMethod` (`T1`–`T4`)

| Field value | Indonesian label | Text token | Fill token |
| --- | --- | --- | --- |
| `paymentStatus: paid` | **Lunas** | `--color-success` | `--color-success-soft` |
| `paymentStatus: unpaid` | **Belum Bayar** | `--color-warning` | `--color-warning-soft` |
| `paymentStatus: void` | **Dibatalkan** | `--color-danger-text` | `--color-danger-soft` |
| `status: completed` | **Selesai** | `--color-text-secondary` | `--color-neutral-soft` |
| `status: void` | **Dibatalkan** | `--color-danger-text` | `--color-danger-soft` |
| `paymentMethod: cash` | **Tunai** | `--color-text-secondary` | `--color-neutral-soft` |
| `paymentMethod: transfer` | **Transfer** | `--color-text-secondary` | `--color-neutral-soft` |
| `paymentMethod: qris` | **QRIS** | `--color-text-secondary` | `--color-neutral-soft` |

### Timer severity — `dashboard/ending-soon.severity` (`D3`)

| Backend value | Indonesian label | Text token | Treatment |
| --- | --- | --- | --- |
| `warn` (≤ 10 min by default — `rules.warnMinutes[0]`) | **Segera Selesai** | `--color-warning` | amber timer + `BellRing` |
| `critical` (≤ 5 min, then ≤ 1 min) | **Hampir Habis** | `--color-warning` | amber timer, 1 min = `--color-danger` |
| `overdue` (`Date.now() > endsAt`) | **Lewat Waktu** | `--color-danger` | red timer + `--color-danger-soft` row fill + `TriangleAlert` |

**Colour is never the only signal.** Every status is *icon + Indonesian text + colour*, always all three — a colour-blind cashier at a glance, or in sunlight on a phone screen, must still read the state.

---

## 8. Chart appearance spec (hand-rolled SVG — no library)

`Chart` renders plain SVG. Defaults:

- **Plot height** 180 px @360, 240 px @≥768. ViewBox with `preserveAspectRatio="none"` off — keep 1:1 units and let it scale via `width="100%"`.
- **Grid** — horizontal lines only, 1 px `--color-border`, at 4 value ticks **including 0**. No vertical grid, no chart border box.
- **Axis** — baseline 1 px `--color-border-strong`. Tick labels `caption` in `--color-text-muted`; y-axis labels right-aligned and abbreviated (`25rb`, `1,2jt`). X-axis shows **at most 7 labels**; drop the rest, never rotate text.
- **Bars** (revenue by day/week/month) — `--color-accent` `#7C3AED` fill, `--radius-sm` top corners only, 2 px gap between bars, **bar min-width 6 px** so a single-bucket range still reads.
- **Line** (busy hours, utilisation) — 2 px `--color-cyan`, `stroke-linecap="round"`, `stroke-linejoin="round"`. Area fill under it: `--color-cyan` at 12 % opacity. Dots only on the hovered point.
- **Tooltip** — absolutely-positioned `--color-surface-2`, `--shadow-e2`, `--radius-md`, 8 px padding, `body-sm`, `--z-tooltip`. Contents: label (weight 600) + `Rp 25.000` + `12 transaksi` on separate lines, all `.tnum`. Follows the pointer, flips side within 8 px of the viewport edge.
- **Empty** — no data in range renders the same axis box with a centred `--color-text-muted` `body-sm` line *"Belum ada data pada rentang ini."*, not a blank rectangle.
- **Reduced motion** — bars animate `height` on mount (`--duration-slow`, `--ease-out`) via `transform: scaleY()` from a `transform-origin: bottom`; under reduced motion, render final height immediately.
- **Responsive** — one chart per row < 768; the revenue chart takes 2/3 and busy-hours 1/3 at ≥ 1280.

---

## 9. Component inventory

`@frontend-react` builds these once in `web/src/components/` and reuses them everywhere. Detailed props: **`specs/components.md`**.

| Primitive | Variants | Sizes | Required states |
| --- | --- | --- | --- |
| `Button` | primary, secondary, ghost, danger, link | sm (32) / md (40) / lg (48) | default, hover, active, focus-visible, disabled, **loading** |
| `IconButton` | ghost, solid | 44×44 min | default, hover, focus, disabled, active |
| `Input` / `Textarea` | default | md (40) / lg (48) | default, focus, filled, disabled, readOnly, **error**, with-prefix, with-suffix |
| `Select` | default | md / lg | default, focus, disabled, error, empty-option |
| `Checkbox` / `Switch` | default | 20 px box / 44×24 track | off, on, indeterminate, disabled, focus |
| `RadioGroup` | inline, stacked | md | default, selected, disabled, focus |
| `Modal` | centre, bottom-sheet | sm / md / lg | open, closing, scroll-locked, focus-trapped |
| `Drawer` | right, bottom | md / lg | open, closing, scroll-locked |
| `DataTable` | plain, selectable | — | default, loading (skeleton rows), empty, error, **card mode < 640** |
| `Badge` / `StatusBadge` | 7 semantic tones | sm / md | static + `withIcon` |
| `Card` | default, interactive, form | — | default, hover (interactive), selected |
| `ConsoleCard` | available, in_use, reserved, maintenance | compact / full | default, selected, loading, disabled(AJAX in-flight) |
| `Tabs` | underline, pill | md | default, active, disabled, overflow-scroll < 640 |
| `Toast` | success, error, warning, info | — | enter, auto-dismiss, dismiss, action |
| `EmptyState` | default, error, no-permission | — | static |
| `Spinner` / `Skeleton` | inline / block / table-row / card | sm md lg | — |
| `ConfirmDialog` | default, destructive | — | idle, submitting, error |
| `Pagination` | numbered, load-more | md | default, disabled |
| `DateRangePicker` | preset + custom | md | default, open, invalid range, disabled |
| `PaymentMethodPicker` | 3 methods | md | selected, disabled (method off in settings) |
| `Chart` | bar, line | responsive | loading, data, empty, error, hover-tooltip |
| `Stepper` (session start) | horizontal, vertical | md | current, complete, upcoming, error |

---

## 10. Accessibility baseline (applies to every screen spec)

1. **Focus visible everywhere** — 2 px cyan ring, 2 px offset, `:focus-visible`. No element removes it.
2. **`aria-live`** — toasts render in a `role="status"` / `aria-live="polite"` region; errors that matter use `role="alert"` / `aria-live="assertive"`. Timer warnings announce **once per threshold crossing**, not every tick (see `specs/sessions.md`).
3. **Dialogs** — `role="dialog"` + `aria-modal="true"` + `aria-labelledby` pointing at the title. Focus moves to the first field (or the dialog itself if it has no fields), is trapped inside, `Esc` closes, and focus **returns to the trigger** on close. Bottom sheets on mobile behave identically.
4. **Form errors** — the field has `aria-invalid="true"` and `aria-describedby` pointing at the error node; the error node has `id` and is rendered **below the field, before any help text is hidden**. The message is Indonesian and says what to do.
5. **Touch targets ≥ 44 × 44 px.**
6. **Never colour alone** — status = icon + text + colour.
7. **Numeric inputs** — `inputMode="numeric"` + `pattern` so the phone shows a number pad. `inputMode="decimal"` only where a decimal is genuinely expected (it isn't, for IDR integers).
8. **Language** — `<html lang="id">`. Dates formatted via `Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta' })`.
9. **Landmarks** — `<nav>` for the sidebar/bottom nav, `<main>` for the page region, one `<h1>` per screen. Headings never skip a level.
10. **Reduced motion** — honoured globally (companion CSS §2).
11. **Loading** — skeletons for content regions (never a spinner in the middle of a table); buttons go `disabled` + `aria-busy="true"` during submit.

---

## 11. Anti-patterns — explicitly banned

| # | Banned | Why / what to do instead |
| --- | --- | --- |
| 1 | `border-left`/`border-right` > 1px as a coloured accent | Side-stripe callouts. Use a soft background fill, a leading icon, or a leading number. |
| 2 | Gradient text (`background-clip: text`) | Decorative. Emphasis via weight/size. |
| 3 | Glassmorphism / `backdrop-blur` as a default surface | Wrong for a dark counter tool. Solid `--color-surface`. |
| 4 | Hero-metric template (big number + tiny label + gradient) on Dashboard | The owner needs comparable figures. Use a dense metric strip with aligned `.tnum` values, not four decorative cards. |
| 5 | Four identical icon+heading+text cards in a row | Vary structure by what the data is. |
| 6 | A tiny uppercase tracked "eyebrow" above every section | Scaffolding tell. The only tracked-caps use is the `caption` receipt/timestamp style. |
| 7 | `01 / 02 / 03` numbered section markers | Only where the section *is* a real sequence — which here is only the timeline of a session detail, where the order carries information. |
| 8 | Card radius ≥ 20 px | Cards are 14 px (`--radius-lg`). |
| 9 | Pairing a 1 px border **and** a ≥ 16 px blur shadow on the same element | Pick one. Cards get a border; popovers get a shadow. |
| 10 | Neon glow, `text-shadow` glow, `box-shadow` coloured halo | plan.md §C forbids neon excess. |
| 11 | Text smaller than 12 px, or low-contrast decorative text | Cashiers stand at a counter; the muted tier is the floor and it still hits 5.51:1. |
| 12 | Timer decremented in JS state | Timer is **derived** from `endsAt` every tick (ARCHITECTURE.md rule 3). |
| 13 | Modal as the first answer | Exhaust inline/inline-expand first. Bookings edit inline; only destructive confirm and pay use a dialog. |
| 14 | Horizontally scrolling tables on a phone | Transform to cards < 640 px. |
| 15 | Colour as the only status cue | Always icon + label + colour. |
| 16 | Custom scrollbars, custom selects, custom checkboxes "for flavour" | Use native controls styled via CSS; reinventing standard affordances is a product-register ban. |
| 17 | Decorative CSS grid-line background | Not a canvas or a blueprint. Plain `--color-bg`. |
| 18 | Identical entrance animation on every section | The Dashboard loads into a task; only the timeline and toasts animate. |
| 19 | `outline: none` without a replacement focus style | Accessibility regression. |
| 20 | Full-saturation semantic fill used as a hover/open state on an inactive element | Motion/state colour is `--color-surface-hover`, not the semantic hue. |
