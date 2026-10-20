import { useState } from 'react';
import { toJakartaDateStr, shiftDate } from '../lib/format';

export interface DateRange { from: string; to: string }

export interface DateRangePickerProps {
  value: DateRange;
  onChange: (r: DateRange) => void;
  presets?: ('today' | 'yesterday' | 'last7' | 'thisMonth' | 'lastMonth')[];
  maxDate?: string;
  error?: string;
}

const PRESET_LABELS: Record<string, string> = {
  today: 'Hari Ini',
  yesterday: 'Kemarin',
  last7: '7 Hari Terakhir',
  thisMonth: 'Bulan Ini',
  lastMonth: 'Bulan Lalu',
};

function resolvePreset(key: string): DateRange {
  const today = toJakartaDateStr();
  switch (key) {
    case 'yesterday': {
      const y = shiftDate(today, -1);
      return { from: y, to: y };
    }
    case 'last7':
      return { from: shiftDate(today, -6), to: today };
    case 'thisMonth':
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case 'lastMonth': {
      const [y, m] = today.split('-').map(Number);
      const prevEnd = shiftDate(`${today.slice(0, 7)}-01`, -1);
      const prevStart = `${prevEnd.slice(0, 7)}-01`;
      void y; void m;
      return { from: prevStart, to: prevEnd };
    }
    default:
      return { from: today, to: today };
  }
}

export function DateRangePicker({ value, onChange, presets = ['today', 'yesterday', 'last7', 'thisMonth', 'lastMonth'], maxDate, error }: DateRangePickerProps) {
  const today = maxDate ?? toJakartaDateStr();
  const [touched, setTouched] = useState(false);
  const invalid = Boolean(value.from && value.to && value.from > value.to);
  const shownError = error ?? (touched && invalid ? 'Tanggal mulai tidak boleh melewati tanggal akhir.' : undefined);

  function setFrom(from: string) {
    setTouched(true);
    if (value.to && from > value.to) return; // don't emit an invalid range
    onChange({ ...value, from });
  }
  function setTo(to: string) {
    setTouched(true);
    if (value.from && to < value.from) return;
    onChange({ ...value, to });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => {
          const r = resolvePreset(p);
          const active = r.from === value.from && r.to === value.to;
          return (
            <button
              key={p}
              type="button"
              aria-pressed={active}
              onClick={() => { setTouched(false); onChange(r); }}
              className={[
                'min-h-11 rounded-[var(--radius-full)] border px-3.5 text-body-sm transition-colors duration-fast',
                active
                  ? 'border-accent bg-accent-soft text-accent-text'
                  : 'border-border-strong text-text-secondary hover:bg-surface-hover hover:text-text',
              ].join(' ')}
            >
              {PRESET_LABELS[p]}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-label font-medium text-text-secondary">Dari</span>
          <input
            type="date"
            value={value.from}
            max={value.to || today}
            onChange={(e) => setFrom(e.target.value)}
            aria-invalid={shownError ? true : undefined}
            className="h-11 rounded-md border border-border-strong bg-surface-2 px-3 text-body text-text [color-scheme:dark] lg:h-10"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-label font-medium text-text-secondary">Sampai</span>
          <input
            type="date"
            value={value.to}
            min={value.from}
            max={today}
            onChange={(e) => setTo(e.target.value)}
            aria-invalid={shownError ? true : undefined}
            className="h-11 rounded-md border border-border-strong bg-surface-2 px-3 text-body text-text [color-scheme:dark] lg:h-10"
          />
        </label>
      </div>

      {shownError && <p role="alert" className="text-caption text-danger">{shownError}</p>}
    </div>
  );
}
