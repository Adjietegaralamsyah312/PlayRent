# specs/components.md — shared primitive API

> Props below are the contract. `@frontend-react` implements these in `web/src/components/`.
> All tokens (`--color-*`, `--radius-*`, …) come from `DESIGN.md` §2.
> Every component: forward `ref`, spread `...rest` onto the root element, and accept `className` merged last.

Shared types in `web/src/components/types.ts`:

```ts
export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'cyan';
export type Size = 'sm' | 'md' | 'lg';
export type StatusTone = Tone; // alias kept for readability in specs
export interface Option<T extends string = string> { value: T; label: string; disabled?: boolean }
export interface ApiError { code: string; message: string; details?: unknown[] }
```

---

## Button

```ts
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'link'; // default 'primary'
  size?: Size;                       // sm=32px, md=40px, lg=48px (h). default 'md'
  loading?: boolean;                 // renders spinner, sets disabled + aria-busy
  loadingText?: string;              // shown while loading, e.g. "Memproses…"
  iconLeft?: React.ReactNode;        // <Gamepad2 size={18} aria-hidden />
  iconRight?: React.ReactNode;
  fullWidth?: boolean;               // true in bottom action bars
  type?: 'button' | 'submit';        // default 'button'
}
```
- `loading` **implies** `disabled`; never rely on the caller to set both.
- `variant='danger'` uses `--color-danger-strong` fill + white label; `ghost` uses `--color-surface-hover` on hover.
- `link` variant: `--color-accent-text`, underline on hover, min 44px hit area via padding.
- Keyboard: native. `Space`/`Enter` activate. Focus ring from global rule.

---

## IconButton

```ts
export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;               // lucide icon; own size, e.g. size={18}
  label: string;                       // REQUIRED → aria-label + sr-only text
  variant?: 'ghost' | 'solid';         // default 'ghost'
  size?: Size;                          // hit area is min 44×44 regardless
  loading?: boolean;
  tone?: Tone;                          // ghost hover tint, default 'neutral'
}
```
- `label` is required by the type — an icon-only button without an accessible name must not compile.

---

## Input

```ts
export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string;                       // visible Indonesian label; also <label for>
  size?: Size;                         // md=40px, lg=48px
  helpText?: string;                   // hint below field, id-ed for aria-describedby
  error?: string;                      // Indonesian message; sets aria-invalid + role=alert
  prefix?: React.ReactNode;            // e.g. "Rp" or a lucide icon
  suffix?: React.ReactNode;            // e.g. unit "menit"
  requiredMark?: boolean;              // shows a superscript dot, sets aria-required
}
```
- Renders: `<label>` → field → `helpText` → `error`.
- `aria-describedby` concatenates the help and error ids present.
- When `error` is set: border becomes `--color-danger`, and the error node is `role="alert"`.
- Placeholder is allowed but **never the only label** — placeholder colour is `--color-text-muted` (5.51:1).

## Textarea

```ts
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string; rows?: number; maxLength?: number;   // show `n/maxLength` counter when maxLength set
  helpText?: string; error?: string; requiredMark?: boolean;
}
```

## Select

```ts
export interface SelectProps<T extends string = string> extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label: string; options: Option<T>[]; size?: Size;
  placeholder?: string;                // rendered as disabled empty value, e.g. "Pilih unit"
  helpText?: string; error?: string; requiredMark?: boolean;
}
```
- Native `<select>` styled — not a custom listbox (product ban: no reinvented form controls).
- `size='lg'` is used for the two most error-prone cashier choices: console and duration.

## Checkbox

```ts
export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label: string; description?: string; size?: 'sm' | 'md'; // 20px / 24px box
}
```

## Switch

```ts
export interface SwitchProps {
  checked: boolean; onCheckedChange: (v: boolean) => void;
  label: string; description?: string; disabled?: boolean; id?: string;
}
```
- 44×24 track, 20 px knob, `role="switch"` + `aria-checked`. Used for: notification sound, unit `isActive`, game `isActive`.

## RadioGroup

```ts
export interface RadioGroupProps<T extends string = string> {
  name: string; value: T | null; onChange: (v: T) => void;
  options: Option<T>[]; legend: string;          // <fieldset><legend> — required
  orientation?: 'inline' | 'stacked'; disabled?: boolean; error?: string;
}
```
- Uses roving `tabindex` + arrow keys (native radio semantics).

---

## Modal

```ts
export interface ModalProps {
  open: boolean; onOpenChange: (open: boolean) => void;
  title: string;                       // becomes the dialog's aria-labelledby
  description?: string;                // aria-describedby when short
  size?: 'sm' | 'md' | 'lg';           // sm=max-w-sm, md=max-w-lg, lg=max-w-2xl
  children: React.ReactNode; footer?: React.ReactNode;
  dismissible?: boolean;               // default true; false while a payment is submitting
  initialFocusRef?: React.RefObject<HTMLElement>;
}
```
Behaviour (all mandatory):
- `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, focus trapped, `Esc` closes when `dismissible`, focus restored to trigger on close.
- Body scroll locked while open; `--shadow-e3`; **no border**; overlay `--color-overlay`.
- Rendered via portal at `--z-modal`.
- **< 640 px it is a bottom sheet**: slides from the bottom, `--radius-lg` on top corners only, drag handle, full width, `max-height: 92dvh`, content scrolls.

## Drawer

```ts
export interface DrawerProps {
  open: boolean; onOpenChange: (v: boolean) => void;
  side?: 'right' | 'bottom';           // default 'right'
  title: string; children: React.ReactNode; footer?: React.ReactNode;
  width?: string;                      // default 'min(480px, 100vw)'
}
```
- Same a11y contract as `Modal`. Used for: mobile filter panel, activity feed, session detail peek.

---

## DataTable

```ts
export interface Column<T> {
  key: string;
  header: string;                      // Indonesian
  render: (row: T) => React.ReactNode;
  align?: 'left' | 'right' | 'center'; // numeric columns: 'right'
  numeric?: boolean;                   // adds .tnum + right align
  hideOnMobile?: boolean;              // omitted from the card view's <dl>
  primary?: boolean;                   // this column becomes the card title < 640px
  width?: string;
  sortable?: boolean;
}
export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;                   // renders `skeletonRows` skeleton rows
  skeletonRows?: number;               // default 5
  empty?: React.ReactNode;             // <EmptyState/>; required
  error?: string | null;               // renders inline error block, keeps header
  onRowClick?: (row: T) => void;       // row becomes button-like: role/tabindex/Enter
  rowActions?: (row: T) => React.ReactNode;
  selectable?: boolean;                // renders a leading checkbox column
  selectedIds?: string[]; onSelectedIdsChange?: (ids: string[]) => void;
  stickyHeader?: boolean;              // ≥ 768 only
}
```
- `< 640 px`: renders **cards** — `primary` column as title (`body`, weight 600), remaining visible columns as a `<dl>` of `label → value` at `body-sm`, `rowActions` in the card footer. No horizontal scroll, ever.
- Loading = skeleton rows, never a centred spinner.
- `error` keeps the header so the user still knows what failed to load.

---

## Badge / StatusBadge

```ts
export interface BadgeProps {
  tone?: Tone; children: React.ReactNode;
  size?: 'sm' | 'md'; withIcon?: React.ReactNode; variant?: 'soft' | 'outline';
}
export interface StatusBadgeProps<T extends string> {
  value: T;
  map: Record<T, { label: string; tone: Tone; icon: React.ReactNode }>;
  size?: 'sm' | 'md';
}
```
- Soft fill = the `*-soft` token from `DESIGN.md` §7; text = the matching semantic colour; `--radius-sm`; `label` at `--text-label` weight 500.
- `StatusBadge` always renders **icon + label + colour** — the map guarantees the icon, so a screen cannot accidentally ship colour-only. An unmapped value renders as `warning` tone with the raw value as the label AND logs nothing (silent fallback is intentional: an unknown status from the API must be visible, not crash the table).

---

## Card

```ts
export interface CardProps {
  children: React.ReactNode;
  title?: string; description?: string;
  actions?: React.ReactNode;           // top-right action cluster
  interactive?: boolean;               // adds hover/selected affordances
  selected?: boolean;                  // ring via --color-border-strong
  padding?: 'none' | 'sm' | 'md' | 'lg';
  as?: keyof React.JSX.IntrinsicElements; // 'section' | 'article' | 'li'
}
```
- `--color-surface`, 1 px `--color-border`, `--radius-lg` (14px), **no shadow**.
- A `Card` inside a `Card` is a review failure — use a titled section with a divider instead.

## ConsoleCard

```ts
export interface ConsoleCardProps {
  console: { id: string; code: string; consoleType: 'PS4' | 'PS5'; roomType: 'Reguler' | 'VIP';
             controllers: number; hourlyRate: number; status: 'available' | 'in_use' | 'reserved' | 'maintenance';
             conditionNote?: string | null };
  session?: { id: string; customerName: string; endsAt: string; status: 'active' | 'overdue' } | null;
  selected?: boolean;
  busy?: boolean;                      // an AJAX action is in flight → disable actions
  onStart?: (consoleId: string) => void;
  onExtend?: (sessionId: string) => void;
  onFinish?: (sessionId: string) => void;
  onOpenDetail?: (consoleId: string) => void;
  variant?: 'compact' | 'full';
}
```
- Layout: header = `code` (`h3`) + `StatusBadge`; body = `PS5 · VIP · 2 controller`; footer = `Rp 25.000/jam` (`.tnum`) and, when `in_use`/`reserved`, a live `Timer` + `customerName`.
- Primary action is context-driven: `available` → "Mulai Sesi", `in_use` → "Tambah Waktu" + "Selesaikan", `maintenance` → disabled with "Perawatan".
- Tap target: whole card is the click target for detail; actions are ≥ 44 px.
- `busy` shows the action button in `loading` state — this is the double-submit guard.

## Tabs

```ts
export interface TabItem { value: string; label: string; count?: number; disabled?: boolean }
export interface TabsProps { items: TabItem[]; value: string; onChange: (v: string) => void; variant?: 'underline' | 'pill'; }
```
- `role="tablist"`, arrow-key navigation, `aria-selected`, `aria-controls` to the panel id.
- `< 640 px` the tablist scrolls horizontally with edge fade — it is the one place horizontal scroll is allowed (it is a control, not data).

## Toast

```ts
export interface ToastOptions {
  title: string;                       // Indonesian, short
  description?: string;                // optional second line
  tone?: 'success' | 'error' | 'warning' | 'info'; // default 'info'
  duration?: number;                   // ms; default 4000, errors 8000, 0 = manual dismiss
  action?: { label: string; onClick: () => void };
}
export interface ToastProps extends ToastOptions { id: string; onDismiss: (id: string) => void }
export function useToast(): { toast: (o: ToastOptions) => string; dismiss: (id: string) => void }
```
- Container `<ol role="status" aria-live="polite">` at `--z-toast`; **errors use `role="alert"`**.
- Position: bottom-centre on phone (above the nav + sticky bar), top-right ≥ 768. Max 3 visible; queue the rest.
- Enter: translate-y 8 px + fade over `--duration-base` `--ease-out`; exit fade `--duration-fast`. Reduced motion → fade only.

## EmptyState

```ts
export interface EmptyStateProps {
  icon?: React.ReactNode;              // lucide, size 32, --color-text-muted
  title: string;                       // Indonesian, states the situation
  description?: string;                // Indonesian, states what to do next
  primaryAction?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  variant?: 'default' | 'error' | 'no-permission';
}
```
- `error` variant: `--color-danger` icon + a "Coba Lagi" action is expected from the caller.

## Spinner / Skeleton

```ts
export interface SpinnerProps { size?: Size; label?: string } // label → sr-only; default "Memuat…"
export interface SkeletonProps { variant?: 'text' | 'block' | 'table-row' | 'card'; lines?: number; className?: string }
```
- `prefers-reduced-motion` → `Skeleton` uses a static `--color-surface-hover` block, no shimmer.

## ConfirmDialog

```ts
export interface ConfirmDialogProps {
  open: boolean; onOpenChange: (v: boolean) => void;
  title: string; description?: string;
  confirmLabel: string;                // verb, Indonesian: "Batalkan Transaksi", never "OK"
  cancelLabel?: string;                // default "Batal"
  tone?: 'default' | 'destructive';
  onConfirm: () => void | Promise<void>;
  submitting?: boolean;                // shows "Memproses…", disables both buttons
  error?: string | null;               // shown inside the dialog, keeps it open
  requireText?: string;                // when set, confirm disabled until input matches exactly
}
```
- Built on `Modal` size `sm`. Destructive tone = `Button variant="danger"`.
- `requireText` is used where a reason is mandatory (void session / void transaction): the dialog contains a required reason field, not just a typed confirmation.

## Pagination

```ts
export interface PaginationProps {
  page: number; limit: number; total: number;
  onPageChange: (p: number) => void;
  onLimitChange?: (l: number) => void;
  mode?: 'numbered' | 'load-more';     // calls should use 'load-more' on phone
}
```
- Shows `Menampilkan 1–20 dari 143` in `body-sm` `--color-text-muted`; numbers are `.tnum`.
- `< 640 px` renders `load-more` with a `Button` and keeps the shown count.

## DateRangePicker

```ts
export interface DateRange { from: string; to: string } // 'YYYY-MM-DD' Jakarta-local, inclusive
export interface DateRangePickerProps {
  value: DateRange; onChange: (r: DateRange) => void;
  presets?: ('today' | 'yesterday' | 'last7' | 'thisMonth' | 'lastMonth')[]; // default all
  maxDate?: string;                    // default today-Jakarta (no future dates in reports)
  error?: string;
}
```
- Preset chips + two native `<input type="date">` (native picker over a custom calendar — mobile-friendly, correct on edge cases).
- Invalid (`from > to`) shows *"Tanggal mulai tidak boleh melewati tanggal akhir."* and does not call `onChange`.
- Preset labels: Hari Ini · Kemarin · 7 Hari Terakhir · Bulan Ini · Bulan Lalu.

## PaymentMethodPicker

```ts
export interface PaymentMethodPickerProps {
  value: 'cash' | 'transfer' | 'qris' | null;
  onChange: (m: 'cash' | 'transfer' | 'qris') => void;
  available?: ('cash' | 'transfer' | 'qris')[]; // from GET /api/settings payments.methods; default all
  error?: string;
}
```
- Renders enabled methods as large selectable cards (label + icon), disabled ones hidden if absent from `available` and shown-with-`Tidak aktif` if explicitly wanted.
- Labels: Tunai (`Banknote`) · Transfer Bank (`Landmark`) · QRIS (`QrCode`).
- `aria-pressed` on each card; arrow keys move selection.

## Chart

```ts
export interface ChartPoint { label: string; value: number; secondary?: number }
export interface ChartProps {
  type: 'bar' | 'line';
  data: ChartPoint[];                  // value = revenue (IDR integer) or sessions count
  valueKind: 'currency' | 'count' | 'minutes'; // decides tooltip + axis formatting
  height?: number;                     // default 180 (mobile) / 240 (≥768) handled internally
  loading?: boolean; error?: string | null;
  emptyLabel?: string;                 // default "Belum ada data pada rentang ini."
  ariaLabel: string;                   // REQUIRED — describes the chart for screen readers
  ariaSummary?: string;                // REQUIRED text alternative: "Pendapatan 7 hari terakhir, total Rp 1.250.000"
  onPointClick?: (index: number) => void;
}
```
- Appearance is fixed by `DESIGN.md` §8. `ariaSummary` carries the data as a sentence so the chart is not an image-only hole; the SVG itself is `role="img"` with `aria-label={ariaLabel}`.
- `valueKind='currency'` formats `Rp 25.000` with `.tnum`; axis ticks abbreviate (`25rb`, `1,2jt`).

## Layout primitives

```ts
export interface AppShellProps { children: React.ReactNode }        // sidebar + topbar + bottomnav + main
export interface PageHeaderProps {
  title: string;                      // <h1>
  subtitle?: string;
  breadcrumb?: { label: string; href?: string }[];
  actions?: React.ReactNode;
  backTo?: string;                    // renders a back IconButton on phone
}
export interface PageSectionProps { title?: string; description?: string; actions?: React.ReactNode; children: React.ReactNode }
export interface StickyActionBarProps { children: React.ReactNode; visible?: boolean } // fixed bottom < 640, above nav
export interface TimerProps {
  endsAt: string;                     // ISO-8601 UTC
  warnMinutes?: number[];             // from GET /api/settings rules.warnMinutes, default [10,5,1]
  size?: 'sm' | 'md' | 'lg';          // md = 28px
  onThresholdCross?: (m: number) => void; // fired once per crossed threshold
  announce?: boolean;                 // default true → aria-live polite, announced once per threshold
}
```

`Timer` behaviour (used by Dashboard, Sessions, ConsoleCard):

1. On mount and every 1 s, compute `remainingMs = Date.parse(endsAt) - Date.now()`. **Never store a decremented counter.**
2. Render `HH:MM:SS` with `String.padStart`; when ≥ 1 h, `HH` grows past 2 digits (`120:00:00` is legal and must not be truncated).
3. Compute the crossed threshold from `warnMinutes` sorted descending; the **smallest** crossed value wins. Tone: `>warnMinutes[0]` → `--color-cyan`; `≤ 10` → `--color-warning`; `≤ 5` → `--color-warning`; `≤ 1` → `--color-danger`; `< 0` → `--color-danger` + label **"Lewat Waktu"** and `+HH:MM:SS` prefixed with `+`.
4. `onThresholdCross(minutes)` fires **once** when the value first becomes ≤ that threshold (module-level `Set` of fired thresholds per session id — a reload re-arms it; acceptable, and documented).
5. `announce` puts the milestone text in an `aria-live="polite"` span that changes only on threshold crossing — never per second.
6. Interval is paused when `document.hidden` and recomputed immediately on `visibilitychange` — the *value* is always correct because it is derived.
