// Status → Indonesian label → Badge tone. The API only ever emits English codes;
// the UI NEVER shows them raw. Single source of truth (specs/DESIGN-SUMMARY.md).

import type { ReactNode } from 'react';
import {
  Ban, CalendarCheck, CalendarClock, CalendarX, CircleCheck, Gamepad2, Hourglass, LogIn,
  Timer, TriangleAlert, Wrench, XCircle,
} from 'lucide-react';
import type {
  Booking, BookingStatus, ConsoleStatus, GamePlatform, PaymentMethod, PaymentStatus,
  RentalSession, SessionStatus, TxStatus,
} from './types';
import type { Tone } from '../components/types';

export type { Tone } from '../components/types';

export interface StatusMeta { label: string; tone: Tone; icon?: ReactNode }

const ICON = 'size-3.5';

// DESIGN.md §7 — labels + tone + icon are a literal mapping. Never invent one.
export const CONSOLE_STATUS: Record<ConsoleStatus, StatusMeta> = {
  available: { label: 'Tersedia', tone: 'success', icon: <CircleCheck className={ICON} aria-hidden="true" /> },
  in_use: { label: 'Sedang Bermain', tone: 'cyan', icon: <Gamepad2 className={ICON} aria-hidden="true" /> },
  reserved: { label: 'Dipesan', tone: 'accent', icon: <CalendarClock className={ICON} aria-hidden="true" /> },
  maintenance: { label: 'Perawatan', tone: 'warning', icon: <Wrench className={ICON} aria-hidden="true" /> },
};

export const SESSION_STATUS: Record<SessionStatus, StatusMeta> = {
  active: { label: 'Berjalan', tone: 'cyan', icon: <Timer className={ICON} aria-hidden="true" /> },
  overdue: { label: 'Lewat Waktu', tone: 'danger', icon: <TriangleAlert className={ICON} aria-hidden="true" /> },
  finished: { label: 'Selesai', tone: 'neutral', icon: <CircleCheck className={ICON} aria-hidden="true" /> },
  void: { label: 'Dibatalkan', tone: 'muted', icon: <Ban className={ICON} aria-hidden="true" /> },
};

export const BOOKING_STATUS: Record<BookingStatus, StatusMeta> = {
  pending: { label: 'Menunggu', tone: 'warning', icon: <Hourglass className={ICON} aria-hidden="true" /> },
  confirmed: { label: 'Dikonfirmasi', tone: 'cyan', icon: <CalendarCheck className={ICON} aria-hidden="true" /> },
  checked_in: { label: 'Check-in', tone: 'success', icon: <LogIn className={ICON} aria-hidden="true" /> },
  completed: { label: 'Selesai', tone: 'neutral', icon: <CircleCheck className={ICON} aria-hidden="true" /> },
  cancelled: { label: 'Dibatalkan', tone: 'muted', icon: <XCircle className={ICON} aria-hidden="true" /> },
};

// DESIGN.md §7 computed status — additive, BOOKING_STATUS stays the verbatim API map.
export type EffectiveBookingStatus = BookingStatus | 'expired';

export const EFFECTIVE_BOOKING_STATUS: Record<EffectiveBookingStatus, StatusMeta> = {
  ...BOOKING_STATUS,
  expired: { label: 'Kedaluwarsa', tone: 'danger', icon: <CalendarX className={ICON} aria-hidden="true" /> },
};

/** A confirmed slot whose start has passed reads as expired, not confirmed. */
export function effectiveBookingStatus(booking: Pick<Booking, 'status' | 'isExpired'>): EffectiveBookingStatus {
  if (booking.isExpired === true && booking.status === 'confirmed') return 'expired';
  return booking.status;
}

// No icons in §7 for transactions — StatusBadge falls back to the tone icon.
export const TX_STATUS: Record<TxStatus, StatusMeta> = {
  completed: { label: 'Selesai', tone: 'neutral' },
  void: { label: 'Dibatalkan', tone: 'danger' },
};

export const PAYMENT_STATUS: Record<PaymentStatus, StatusMeta> = {
  paid: { label: 'Lunas', tone: 'success' },
  unpaid: { label: 'Belum Bayar', tone: 'warning' },
  void: { label: 'Dibatalkan', tone: 'danger' },
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Tunai',
  transfer: 'Transfer',
  qris: 'QRIS',
};

export const PLATFORM_LABEL: Record<GamePlatform, string> = {
  PS4: 'PS4',
  PS5: 'PS5',
  both: 'PS4 & PS5',
};

/**
 * Effective session status for display: a live 'active' session past its
 * `endsAt` is overdue even before the backend sweep catches up.
 */
export function effectiveSessionStatus(session: Pick<RentalSession, 'status' | 'endsAt'>): SessionStatus {
  if (session.status === 'active' && Date.parse(session.endsAt) < Date.now()) return 'overdue';
  return session.status;
}
