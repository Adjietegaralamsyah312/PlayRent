import { Check, Clock3, Gamepad2, Wrench, Play, Plus, Square } from 'lucide-react';
import { Badge, StatusBadge } from './Badge';
import { Button } from './Button';
import { Timer } from './Timer';
import { CONSOLE_STATUS, effectiveSessionStatus } from '../lib/status';
import { formatIDR } from '../lib/format';
import type { ConsoleStatus, ConsoleType, RoomType } from '../lib/types';

export interface ConsoleCardProps {
  console: {
    id: number; code: string; consoleType: ConsoleType; roomType: RoomType;
    controllers: number; hourlyRate: number; status: ConsoleStatus;
    conditionNote?: string | null;
  };
  session?: { id: number; customerName: string; endsAt: string; status: 'active' | 'overdue' } | null;
  selected?: boolean;
  busy?: boolean;
  onStart?: (consoleId: number) => void;
  onExtend?: (sessionId: number) => void;
  onFinish?: (sessionId: number) => void;
  onOpenDetail?: (consoleId: number) => void;
  variant?: 'compact' | 'full';
  warnMinutes?: number[];
}

export function ConsoleCard({
  console: unit, session, selected, busy,
  onStart, onExtend, onFinish, onOpenDetail, variant = 'full', warnMinutes,
}: ConsoleCardProps) {
  const status = unit.status;
  const live = session ? effectiveSessionStatus({ status: session.status as 'active' | 'overdue', endsAt: session.endsAt }) : null;
  // A button without a handler is a dead button — it eats the tap and does
  // nothing. So each action is built only when its handler exists: the button
  // and the function that makes it work are the same object, never two.
  const sessionId = session?.id ?? null;
  const startAction = status === 'available' && onStart ? () => onStart?.(unit.id) : null;
  const extendAction = (status === 'in_use' || status === 'reserved') && sessionId && onExtend ? () => onExtend?.(sessionId) : null;
  const finishAction = (status === 'in_use' || status === 'reserved') && sessionId && onFinish ? () => onFinish?.(sessionId) : null;
  const waitingCheckIn = status === 'reserved' && !session;
  const inMaintenance = status === 'maintenance';
  const hasActionRow = !!(startAction || extendAction || finishAction || waitingCheckIn || inMaintenance);
  // The card itself is NOT a button: it holds real <button>s, and a button-role
  // wrapper around them is the nested-interactive violation (WCAG 4.1.2). The
  // code is the only "open detail" control, and it exists only when a handler
  // exists — a button with no handler is a dead button.
  const canOpenDetail = typeof onOpenDetail === 'function';

  return (
    <div
      className={[
        'flex flex-col rounded-[var(--radius-lg)] border bg-surface transition-colors duration-fast',
        selected ? 'border-border-strong ring-1 ring-[var(--color-border-strong)]' : 'border-border',
        variant === 'compact' ? 'p-3' : 'p-4',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="flex items-center gap-2 text-h3 font-semibold text-text">
          <Gamepad2 className="size-5 text-text-muted" aria-hidden="true" />
          {canOpenDetail ? (
            <button
              type="button"
              onClick={() => onOpenDetail?.(unit.id)}
              aria-label={`Buka detail konsol ${unit.code}`}
              className="-my-2 inline-flex min-h-11 items-center rounded-sm bg-transparent p-0 font-semibold text-h3 text-text underline-offset-2 transition-colors duration-fast hover:text-accent-text hover:underline"
            >
              {unit.code}
            </button>
          ) : (
            unit.code
          )}
        </h3>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {/* The selection is never colour-only: the ring alone would not be
              legible to everyone, so the chosen unit says so (WCAG 1.4.1). */}
          {selected && (
            <Badge tone="accent" withIcon={<Check className="size-3.5" aria-hidden="true" />}>Dipilih</Badge>
          )}
          <StatusBadge value={status} map={CONSOLE_STATUS} />
        </div>
      </div>

      <p className="mt-1 text-body-sm text-text-secondary">
        {unit.consoleType} · {unit.roomType} · {unit.controllers} controller
      </p>

      {unit.conditionNote && (status === 'maintenance' || variant === 'full') && (
        <p className="mt-1.5 line-clamp-2 text-caption text-text-muted">{unit.conditionNote}</p>
      )}

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-body-sm text-text-secondary tnum">{formatIDR(unit.hourlyRate)}/jam</span>
        {(status === 'in_use' || status === 'reserved') && live && (
          <Timer endsAt={session!.endsAt} warnMinutes={warnMinutes} size="sm" announce={false} />
        )}
      </div>

      {(status === 'in_use' || status === 'reserved') && session && (
        <p className="mt-1 truncate text-body-sm text-text">
          <span className="text-text-muted">Penyewa: </span>{session.customerName}
        </p>
      )}

      {hasActionRow && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {startAction && (
            <Button size="sm" loading={busy} onClick={startAction} iconLeft={<Play className="size-4" aria-hidden="true" />}>
              Mulai Sesi
            </Button>
          )}
          {extendAction && (
            <Button size="sm" variant="secondary" loading={busy} onClick={extendAction} iconLeft={<Plus className="size-4" aria-hidden="true" />}>
              Tambah Waktu
            </Button>
          )}
          {finishAction && (
            <Button size="sm" loading={busy} onClick={finishAction} iconLeft={<Square className="size-4" aria-hidden="true" />}>
              Selesaikan
            </Button>
          )}
          {inMaintenance && (
            <Badge tone="warning" withIcon={<Wrench className="size-3.5" aria-hidden="true" />}>Perawatan</Badge>
          )}
          {waitingCheckIn && (
            <Badge tone="warning" withIcon={<Clock3 className="size-3.5" aria-hidden="true" />}>Menunggu check-in</Badge>
          )}
        </div>
      )}
    </div>
  );
}
