import { CalendarX, Gamepad2 } from 'lucide-react';
import { Button } from './Button';
import { EmptyState, Skeleton } from './Feedback';
import { EFFECTIVE_BOOKING_STATUS, effectiveBookingStatus } from '../lib/status';
import { TONE_CLASS } from './types';
import { blockGeometry, timeToMinutes } from '../lib/timeline';
import type { Booking, ConsoleUnit } from '../lib/types';

export interface BookingTimelineProps {
  consoles: ConsoleUnit[];
  bookings: Booking[];
  loading?: boolean;
  error?: string | null;
  onSelect: (booking: Booking) => void;
  onRetry?: () => void;
  onAddUnit?: () => void;
}

const HOURS = Array.from({ length: 17 }, (_, i) => 8 + i);
const GRID = Array.from({ length: 33 }, (_, i) => i);

/** `20.15` — Indonesian time separators. */
function hm(totalMinutes: number): string {
  const m = ((totalMinutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}.${String(m % 60).padStart(2, '0')}`;
}

export function blockTimeLabel(booking: Booking): string {
  const start = timeToMinutes(booking.startTime);
  return `${hm(start)}–${hm(start + booking.durationMinutes)}`;
}

export function BookingTimeline({
  consoles, bookings, loading = false, error = null, onSelect, onRetry, onAddUnit,
}: BookingTimelineProps) {
  const lanes = [...consoles].sort((a, b) => a.code.localeCompare(b.code));
  const isEmpty = !loading && lanes.length === 0;

  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
      {error && (
        <div role="alert" className="flex items-center gap-3 border-b border-border px-4 py-2.5 text-body-sm text-danger-text">
          <CalendarX className="size-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">{error}</span>
          {onRetry && (
            <button type="button" onClick={onRetry} className="text-body-sm font-medium text-accent-text hover:underline">
              Coba lagi
            </button>
          )}
        </div>
      )}

      {isEmpty ? (
        <EmptyState
          icon={<Gamepad2 className="size-8" aria-hidden="true" />}
          title="Belum ada unit PS"
          description="Tambahkan unit terlebih dahulu agar jadwal booking bisa ditampilkan."
          primaryAction={onAddUnit && <Button onClick={onAddUnit}>Tambah Unit</Button>}
        />
      ) : (
      <div
        className="overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label="Jadwal booking per unit"
      >
        <div className="min-w-[896px]">
          {/* hour header — labels sit on the same percentage axis as the gridlines */}
          <div className="flex border-b border-border bg-surface-2">
            <div className="sticky left-0 z-10 w-[88px] shrink-0 bg-surface-2" />
            <div className="relative h-8 flex-1 text-caption tnum text-text-muted">
              {HOURS.map((h, i) => (
                <span
                  key={h}
                  className="absolute top-1/2 whitespace-nowrap"
                  style={{
                    left: `${(i / (HOURS.length - 1)) * 100}%`,
                    transform: i === 0
                      ? 'translateY(-50%)'
                      : i === HOURS.length - 1
                        ? 'translate(-100%, -50%)'
                        : 'translate(-50%, -50%)',
                  }}
                >
                  {String(h).padStart(2, '0')}:00
                </span>
              ))}
            </div>
          </div>

          {lanes.map((console) => (
            <div key={console.id} className="flex border-b border-border last:border-0" aria-busy={loading}>
              <div className="sticky left-0 z-10 flex w-[88px] shrink-0 items-center border-r border-border bg-surface px-3">
                <span className="text-body-sm text-text-secondary">{console.code}</span>
              </div>
              <div className="relative h-11 flex-1">
                {GRID.map((step) => (
                  <div
                    key={step}
                    className={[
                      'pointer-events-none absolute inset-y-0 w-px',
                      step % 2 === 0 ? 'bg-border' : 'bg-border/70',
                    ].join(' ')}
                    style={{ left: `${(step / (GRID.length - 1)) * 100}%` }}
                    aria-hidden="true"
                  />
                ))}

                {loading && (
                  <Skeleton variant="block" className="absolute inset-y-0 left-0 w-1/3" />
                )}

                {!loading && bookings
                  .filter((b) => b.consoleId === console.id)
                  .map((booking) => {
                    const meta = EFFECTIVE_BOOKING_STATUS[effectiveBookingStatus(booking)];
                    const { left, width, edge } = blockGeometry(booking.startTime, booking.durationMinutes);
                    const range = blockTimeLabel(booking).replace('–', ' sampai ');
                    const label = `Booking ${booking.customerName}, ${console.code}, ${range}, ${meta.label}`;
                    // Below 24px a 30-min block is untappable; 44px would overstate its duration.
                    const atEnd = left + width >= 99.9;
                    return (
                      <button
                        key={booking.id}
                        type="button"
                        onClick={() => onSelect(booking)}
                        aria-label={label}
                        title={label}
                        style={{
                          ...(atEnd
                            ? { right: '1px', width: `calc(${width}% - 2px)` }
                            : { left: `calc(${left}% + 1px)`, width: `calc(${width}% - 2px)` }),
                          minWidth: '24px',
                        }}
                        className={[
                          'absolute inset-y-0 flex items-center gap-1 overflow-hidden rounded-[var(--radius-md)] px-1.5 text-left text-caption font-medium',
                          'transition-[filter] duration-fast hover:brightness-110',
                          edge !== 'inside' && 'ring-1 ring-inset ring-[var(--color-border-strong)]',
                          TONE_CLASS[meta.tone],
                        ].join(' ')}
                      >
                        <span className="shrink-0">{meta.icon}</span>
                        {booking.durationMinutes >= 60 && (
                          <span className="truncate tnum">{booking.customerName} · {blockTimeLabel(booking)}</span>
                        )}
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      </div>
      )}
    </div>
  );
}
