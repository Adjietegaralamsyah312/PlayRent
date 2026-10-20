import { useEffect, useRef, useState } from 'react';
import { useCountdown } from '../lib/useCountdown';
import { formatTimer } from '../lib/format';
import { chime } from '../lib/sound';

export interface TimerProps {
  endsAt: string;
  warnMinutes?: number[];
  size?: 'sm' | 'md' | 'lg';
  onThresholdCross?: (m: number) => void;
  announce?: boolean;
}

// ponytail: module-level Set — one process, one arming per endsAt. A reload
// re-arms it (documented and acceptable; the alarm is a nudge, not a ledger).
const fired = new Set<string>();

const SIZE_CLASS: Record<NonNullable<TimerProps['size']>, string> = {
  sm: 'text-body-sm',
  md: 'text-h2',
  lg: 'text-display',
};

export function Timer({ endsAt, warnMinutes = [10, 5, 1], size = 'md', onThresholdCross, announce = true }: TimerProps) {
  const { remainingSeconds, isOverdue, severity } = useCountdown(endsAt, warnMinutes);
  const [milestone, setMilestone] = useState<number | null>(null);
  const lastMilestone = useRef<number | null>(null);

  const thresholds = [...warnMinutes].sort((a, b) => a - b); // [1,5,10]
  const minutes = remainingSeconds / 60;
  const smallestCrossed = thresholds.find((t) => minutes <= t) ?? null;
  const largestCrossed = [...thresholds].reverse().find((t) => minutes <= t) ?? null;

  useEffect(() => {
    if (isOverdue) {
      const key = `${endsAt}:overdue`;
      if (!fired.has(key)) {
        fired.add(key);
        chime('overdue');
        lastMilestone.current = 0;
        setMilestone(0);
      }
      return;
    }
    if (largestCrossed === null) return;
    const key = `${endsAt}:${largestCrossed}`;
    if (fired.has(key)) return;
    fired.add(key);
    chime(largestCrossed <= 1 ? 'critical' : 'warn');
    onThresholdCross?.(largestCrossed);
    lastMilestone.current = largestCrossed;
    setMilestone(largestCrossed);
  }, [endsAt, largestCrossed, isOverdue, onThresholdCross]);

  const toneClass = isOverdue
    ? 'text-danger'
    : severity === 'critical'
      ? 'text-danger'
      : severity === 'warn'
        ? 'text-warning'
        : 'text-cyan';

  const label = isOverdue ? 'Lewat Waktu' : milestone !== null ? `Sisa ${milestone} menit` : null;

  return (
    <span className={`inline-flex flex-col ${size === 'sm' ? 'items-start' : ''}`}>
      <span className={`tnum font-semibold leading-numeric ${SIZE_CLASS[size]} ${toneClass}`} style={{ fontFamily: 'var(--font-mono)' }}>
        {isOverdue ? '+' : ''}{formatTimer(remainingSeconds)}
      </span>
      {label && (
        <span className={`text-caption font-medium ${toneClass}`}>{label}</span>
      )}
      {announce && (
        <span aria-live="polite" className="sr-only">
          {smallestCrossed !== null || isOverdue
            ? isOverdue
              ? 'Sesi sudah lewat waktu.'
              : `Sisa waktu ${smallestCrossed} menit.`
            : ''}
        </span>
      )}
    </span>
  );
}
