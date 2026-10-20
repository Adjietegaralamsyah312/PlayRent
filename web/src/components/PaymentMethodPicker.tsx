import { Banknote, Landmark, QrCode } from 'lucide-react';
import type { PaymentMethod } from '../lib/types';

export interface PaymentMethodPickerProps {
  value: PaymentMethod | null;
  onChange: (m: PaymentMethod) => void;
  available?: PaymentMethod[];
  error?: string;
}

const METHODS: { value: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { value: 'cash', label: 'Tunai', icon: Banknote },
  { value: 'transfer', label: 'Transfer Bank', icon: Landmark },
  { value: 'qris', label: 'QRIS', icon: QrCode },
];

export function PaymentMethodPicker({ value, onChange, available = ['cash', 'transfer', 'qris'], error }: PaymentMethodPickerProps) {
  const shown = METHODS.filter((m) => available.includes(m.value) || m.value === value);

  function onKeyDown(e: React.KeyboardEvent, current: number) {
    const enabled = shown.filter((m) => available.includes(m.value));
    if (enabled.length === 0) return;
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const idx = enabled.findIndex((m) => m.value === shown[current].value);
    const next = e.key === 'ArrowRight' ? enabled[(idx + 1) % enabled.length] : enabled[(idx - 1 + enabled.length) % enabled.length];
    onChange(next.value);
  }

  return (
    <div role="group" aria-label="Metode pembayaran" className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {shown.map((m, i) => {
          const enabled = available.includes(m.value);
          const active = value === m.value;
          const Icon = m.icon;
          return (
            <button
              key={m.value}
              type="button"
              aria-pressed={active}
              disabled={!enabled}
              onClick={() => enabled && onChange(m.value)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={[
                'flex min-h-[64px] items-center gap-3 rounded-[var(--radius-lg)] border px-4 py-3 text-left transition-colors duration-fast',
                'disabled:cursor-not-allowed disabled:opacity-50',
                active
                  ? 'border-accent bg-accent-soft text-text ring-1 ring-[var(--color-accent)]'
                  : 'border-border-strong bg-surface-2 text-text-secondary hover:bg-surface-hover',
              ].join(' ')}
            >
              <Icon className={`size-6 shrink-0 ${active ? 'text-accent-text' : 'text-text-muted'}`} aria-hidden="true" />
              <span className="flex flex-col">
                <span className="text-body font-medium text-text">{m.label}</span>
                {!enabled && <span className="text-caption text-text-muted">Tidak aktif</span>}
              </span>
            </button>
          );
        })}
      </div>
      {error && <p role="alert" className="text-caption text-danger">{error}</p>}
    </div>
  );
}
