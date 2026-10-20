// Pure geometry for the booking timeline. Kept out of the component so the
// window math is readable and runnable on its own.

export const TIMELINE_START_MINUTES = 8 * 60;
export const TIMELINE_SPAN_MINUTES = 16 * 60;

/** Minimum rendered width, in percent — ~14 min of the 16-hour track. */
export const MIN_BLOCK_PERCENT = 1.5;

export interface BlockGeometry {
  left: number;
  width: number;
  clamped: boolean;
  /** Where the booking sits relative to the visible 08:00–24:00 track. */
  edge: 'inside' | 'before' | 'after';
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Parse `HH:MM[:SS]` into minutes after midnight. */
export function timeToMinutes(startTime: string): number {
  const [h = 0, m = 0] = startTime.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Map a booking to the 08:00–24:00 track, in percent.
 * Bookings fully outside the window pin to the nearest edge with a
 * minimum-width marker so they stay visible and focusable.
 */
export function blockGeometry(startTime: string, durationMinutes: number): BlockGeometry {
  const start = timeToMinutes(startTime);
  const duration = Math.max(0, durationMinutes);
  const rawLeft = ((start - TIMELINE_START_MINUTES) / TIMELINE_SPAN_MINUTES) * 100;
  const rawRight = ((start + duration - TIMELINE_START_MINUTES) / TIMELINE_SPAN_MINUTES) * 100;

  if (rawRight <= 0) {
    return { left: 0, width: MIN_BLOCK_PERCENT, clamped: true, edge: 'before' };
  }
  if (rawLeft >= 100) {
    return {
      left: 100 - MIN_BLOCK_PERCENT,
      width: MIN_BLOCK_PERCENT,
      clamped: true,
      edge: 'after',
    };
  }

  const left = clamp(rawLeft, 0, 100);
  const right = clamp(rawRight, 0, 100);
  return {
    left,
    width: Math.max(MIN_BLOCK_PERCENT, right - left),
    clamped: rawLeft < 0 || rawRight > 100,
    edge: rawLeft < 0 ? 'before' : rawRight > 100 ? 'after' : 'inside',
  };
}
