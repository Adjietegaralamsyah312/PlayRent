// Throwaway smoke stub: replaces useAsync with a fixture-driven version so the
// SSR render exercises the LOADED / ERROR branches, not just the skeleton.
import type { Async } from '../src/lib/useAsync.ts';

const UNITS = {
  items: [
    { id: '1', code: 'PS5-01', consoleType: 'PS5', roomType: 'VIP', controllers: 4, hourlyRate: 25000, status: 'available', isActive: true },
    { id: '2', code: 'PS4-01', consoleType: 'PS4', roomType: 'Reguler', controllers: 2, hourlyRate: 8000, status: 'in_use', isActive: true },
  ],
};

const BOOKINGS = {
  items: [
    { id: '9', consoleId: '1', customerName: 'Budi Santoso', customerContact: '0812', bookingDate: '2099-10-25', startTime: '19:00', durationMinutes: 100, status: 'pending', notes: null, discount: 0, isExpired: false },
    { id: '10', consoleId: '2', customerName: 'Budi Santoso', customerContact: null, bookingDate: '2099-10-26', startTime: '10:00', durationMinutes: 60, status: 'confirmed', notes: null, discount: 0, isExpired: true },
    { id: '11', consoleId: '1', customerName: 'Budi Santoso', customerContact: null, bookingDate: '2099-10-20', startTime: '09:00', durationMinutes: 45, status: 'cancelled', notes: null, discount: 0, isExpired: false },
  ],
};

const SETTINGS_PUBLIC = {
  business: { name: 'PlayRent Gaming Lounge', address: 'Jl. Merdeka No. 45, Bandung', phone: '0812', receiptFooter: '', taxNote: '' },
  rules: { minDurationMinutes: 30, roundingMinutes: 15, defaultHourlyRate: 15000, warnMinutes: [10, 5, 1] },
};

const PACKAGES = {
  items: [
    { id: '1', name: 'Paket 1 Jam', durationMinutes: 60, price: 8000, consoleType: null, isActive: true, createdAt: '2026-01-01' },
    { id: '2', name: 'Paket Nonaktif', durationMinutes: 90, price: 9000, consoleType: 'PS5', isActive: false, createdAt: '2026-01-01' },
  ],
};

const GAMES = {
  items: [
    { id: '1', title: 'EA SPORTS FC 25', platform: 'PS5', genre: 'Sports', recommendedControllers: 2, availabilityNote: 'Rak A1', isActive: true },
    { id: '2', title: 'GTA V', platform: 'both', genre: 'Action', recommendedControllers: null, availabilityNote: null, isActive: true },
  ],
};

/** Mode is set by the smoke runner: 'data' | 'empty' | 'error' | 'loading'. */
export let mode: 'data' | 'empty' | 'error' | 'loading' = 'data';
export function setMode(m: typeof mode) { mode = m; }

function pick<T>(value: T, empty: T): T {
  if (mode === 'error') return value;
  if (mode === 'empty') return empty;
  return value;
}

export function useAsync<T>(fn: () => Promise<T>, _deps: unknown[] = []): Async<T> {
  const src = fn.toString();
  let data: unknown = null;
  if (src.includes('consoles.listPublic')) data = pick(UNITS, { items: [] });
  else if (src.includes('bookings.list')) data = pick(BOOKINGS, { items: [] });
  else if (src.includes('settings.getPublic')) data = pick(SETTINGS_PUBLIC, null);
  else if (src.includes('settings.packages')) data = pick(PACKAGES, { items: [] });
  else if (src.includes('games.list')) data = pick(GAMES, { items: [] });

  return {
    data: (mode === 'loading' ? null : data) as T | null,
    loading: mode === 'loading',
    error: mode === 'error' ? 'Gagal memuat data dari server.' : null,
    reload: async () => {},
    setData: () => {},
  };
}

export function errorMessage(): string { return 'Gagal memuat data dari server.'; }
export function errorCode(): string { return 'TEST'; }
export function errorDetails<T>(): T[] { return []; }
export function useDebounced<T>(value: T): T { return value; }
