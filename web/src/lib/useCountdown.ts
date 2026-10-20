import { useEffect, useState } from 'react';

export type CountdownSeverity = 'ok' | 'warn' | 'critical' | 'overdue';

export interface Countdown {
  remainingSeconds: number;
  isOverdue: boolean;
  severity: CountdownSeverity;
}

/**
 * Derives remaining time from an ISO `endsAt` on every tick. The value is
 * NEVER stored as a decremented counter — a reload or backgrounded tab cannot
 * drift it (product rule). The interval exists only to trigger a re-render.
 */
export function useCountdown(endsAt: string | null | undefined, warnMinutes: number[] = [10, 5, 1]): Countdown {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!endsAt) return;
    const bump = () => setTick((n) => n + 1);
    const id = window.setInterval(bump, 1000);
    const onVisible = () => { if (!document.hidden) bump(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', bump);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', bump);
    };
  }, [endsAt]);

  if (!endsAt) return { remainingSeconds: 0, isOverdue: false, severity: 'ok' };

  const remainingSeconds = Math.round((Date.parse(endsAt) - Date.now()) / 1000);
  const minutes = remainingSeconds / 60;
  const warn = [...warnMinutes].sort((a, b) => b - a); // [10,5,1]
  const top = warn[0] ?? 10;
  // "Critical" is the SMALLEST configured threshold — with a single threshold
  // of 3 minutes, critical must not fall back to 5 (FE-017).
  const second = warn[warn.length - 1] ?? warn[0] ?? 5;

  let severity: CountdownSeverity = 'ok';
  if (remainingSeconds < 0) severity = 'overdue';
  else if (minutes <= second) severity = 'critical';
  else if (minutes <= top) severity = 'warn';

  return { remainingSeconds, isOverdue: remainingSeconds < 0, severity };
}
