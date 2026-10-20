// Formatting helpers. All money is INTEGER rupiah; all dates are Asia/Jakarta.
// Every number rendered from here must sit in a `.tnum` context.

const TZ = 'Asia/Jakarta';
const idr = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });

/** `Rp 25.000` — no decimals, dot thousands separator. */
export function formatIDR(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return 'Rp 0';
  return `Rp ${idr.format(Math.round(value))}`;
}

/** Bare integer with Indonesian separators: `25.000`. */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '0';
  return idr.format(value);
}

type JakartaStyle = 'short' | 'long' | 'time' | 'date';

/** `19 Okt 2026` · `19 Oktober 2026` · `20.15` · `19 Okt 2026, 20.15`. */
export function formatJakarta(iso: string | number | Date | null | undefined, style: JakartaStyle = 'short'): string {
  if (!iso) return '—';
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const opts: Intl.DateTimeFormatOptions = { timeZone: TZ };
  if (style === 'time') Object.assign(opts, { hour: '2-digit', minute: '2-digit', hour12: false });
  else if (style === 'date') Object.assign(opts, { day: '2-digit', month: 'short', year: 'numeric' });
  else if (style === 'short') Object.assign(opts, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  else Object.assign(opts, { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  return new Intl.DateTimeFormat('id-ID', opts).format(d);
}

/** `19 Okt 2026, 20.15` */
export function formatDateTime(iso: string | null | undefined): string {
  return formatJakarta(iso, 'short');
}

/** `1 jam 30 menit` · `45 menit` */
export function formatDuration(minutes: number | null | undefined): string {
  const m = Math.max(0, Math.round(minutes ?? 0));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest} menit`;
  if (rest === 0) return `${h} jam`;
  return `${h} jam ${rest} menit`;
}

/** `48j 30m` — compact, for dense strips. */
export function formatDurationShort(minutes: number | null | undefined): string {
  const m = Math.max(0, Math.round(minutes ?? 0));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest}m`;
  if (rest === 0) return `${h}j`;
  return `${h}j ${rest}m`;
}

/** `HH:MM:SS` derived from a second count. HH is NOT capped at two digits. */
export function formatTimer(seconds: number): string {
  const abs = Math.abs(Math.floor(seconds));
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** `YYYY-MM-DD` in Jakarta local time. */
export function toJakartaDateStr(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
  return parts; // en-CA yields YYYY-MM-DD
}

/**
 * `YYYY-MM-DD HH:MM` in Jakarta local time. Lexicographically comparable with
 * a booking slot (`${bookingDate} ${startTime}`), which the server always sends
 * as zero-padded `HH:mm`.
 */
export function toJakartaDateTimeStr(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

/** Shift a `YYYY-MM-DD` string by N days (Jakarta-agnostic, date-only math). */
export function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** `Rp` axis abbreviation: `25rb`, `1,2jt`. */
export function abbrevIDR(value: number): string {
  const v = Math.abs(value);
  if (v >= 1_000_000_000) return `${idr.format(value / 1_000_000_000)}M`;
  if (v >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace('.', ',')}jt`;
  if (v >= 1_000) return `${idr.format(value / 1_000)}rb`;
  return idr.format(value);
}

/** `Selamat pagi/siang/sore/malam` from the Jakarta hour. */
export function greeting(date: Date = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).format(date));
  if (hour < 11) return 'Selamat pagi';
  if (hour < 15) return 'Selamat siang';
  if (hour < 18) return 'Selamat sore';
  return 'Selamat malam';
}

/** `19 Okt 2026, 20.15 · Selamat malam` */
export function formatHeaderDate(date: Date = new Date()): string {
  return `${formatJakarta(date, 'short')} · ${greeting(date)}`;
}

/** `2026-W42` → `Minggu 42 · 2026`; `2026-10` → `Okt 2026`; `2026-10-19` → `19 Okt`. */
export function formatBucketLabel(label: string): string {
  if (/^\d{4}-W\d{1,2}$/.test(label)) {
    const [y, w] = label.split('-W');
    return `Minggu ${Number(w)} · ${y}`;
  }
  if (/^\d{4}-\d{2}$/.test(label)) {
    const [y, m] = label.split('-').map(Number);
    return new Intl.DateTimeFormat('id-ID', { month: 'short', year: 'numeric', timeZone: TZ }).format(new Date(Date.UTC(y, m - 1, 1)));
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(label)) {
    const [y, m, d] = label.split('-').map(Number);
    return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: TZ }).format(new Date(Date.UTC(y, m - 1, d)));
  }
  return label;
}

/** `2 jam yang lalu` style isn't needed; this is short relative for activity. */
export function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'baru saja';
  if (min < 60) return `${min} menit lalu`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} jam lalu`;
  return formatJakarta(iso, 'short');
}
