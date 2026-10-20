// Single typed fetch wrapper. Unwraps the {success,data,error,meta} envelope.
// Auth is an httpOnly cookie → credentials:'include' on every call.

import type {
  ActivityItem, Booking, BusyHour, ConsoleUnit, CustomerSettings, DashboardSummary, DurationPackage,
  EndingSoonItem, Game, List, Meta, Paginated, PaymentMethod, PublicConsoleUnit, Quote, RentalSession,
  ReportRow, ReportsSummary, RevenueBucket, Settings, Transaction, TransactionItem,
  UnitReport, User,
} from './types';

/**
 * An id in a URL path. The API speaks numbers, but a route param is a
 * string, so both are accepted and rendered into the path as-is.
 */
export type Id = number | string;

interface Envelope<T> { success: boolean; data: T; error?: { code: string; message: string; details?: unknown[] }; meta?: Meta }

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown[];
  constructor(status: number, code: string, message: string, details?: unknown[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// AuthProvider registers a handler so a 401 can flush auth state + redirect.
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) { onUnauthorized = fn; }

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Skip the global 401 → redirect behaviour (used by the login call itself). */
  skipAuthRedirect?: boolean;
}

function buildQuery(query?: RequestOptions['query']): string {
  if (!query) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, skipAuthRedirect } = opts;
  let res: Response;
  try {
    res = await fetch(`/api${path}${buildQuery(query)}`, {
      method,
      credentials: 'include',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Tidak dapat menghubungi server. Periksa koneksi lalu coba lagi.');
  }

  let json: Envelope<T> | null = null;
  const text = await res.text();
  if (text) {
    try { json = JSON.parse(text) as Envelope<T>; } catch { json = null; }
  }

  if (!res.ok) {
    const code = json?.error?.code ?? 'INTERNAL_ERROR';
    const message = json?.error?.message ?? 'Terjadi kesalahan pada server.';
    if (res.status === 401 && !skipAuthRedirect) onUnauthorized?.();
    throw new ApiError(res.status, code, message, json?.error?.details);
  }

  if (!json || json.data === undefined) {
    throw new ApiError(res.status, 'INVALID_RESPONSE', 'Respons server tidak dikenali.');
  }
  // The server keeps `meta` next to `data` in the envelope. Merge it into the
  // payload so a paginated list is always `{...data, meta}` — otherwise
  // `list.data.meta` is undefined and the pagination never renders (FE-001/008).
  const data = json.data as unknown;
  if (json.meta !== undefined && data !== null && typeof data === 'object' && !Array.isArray(data)) {
    return { ...(data as Record<string, unknown>), meta: json.meta } as unknown as T;
  }
  return json.data;
}

// ── Auth ────────────────────────────────────────────────────────────────────

export const auth = {
  login: (username: string, password: string) =>
    request<{ user: User }>('/auth/login', { method: 'POST', body: { username, password }, skipAuthRedirect: true }),
  /**
   * Public self-registration. The body carries NO `role` — the server decides
   * the role and rejects a body that tries to (400).
   */
  register: (body: { username: string; fullName: string; phone?: string; password: string }) =>
    request<{ user: User }>('/auth/register', { method: 'POST', body, skipAuthRedirect: true }),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),
  me: () => request<{ user: User }>('/auth/me', { skipAuthRedirect: true }),
  /** Own profile only — fullName and phone. */
  updateProfile: (body: { fullName?: string; phone?: string | null }) =>
    request<{ user: User }>('/auth/profile', { method: 'PATCH', body }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: true }>('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } }),
};

export const health = {
  get: () => request<{ status: string; version: string }>('/health', { skipAuthRedirect: true }),
};

// ── Users ───────────────────────────────────────────────────────────────────

export const users = {
  list: (q?: { q?: string; role?: string; isActive?: boolean }) => request<List<User>>('/users', { query: q }),
  create: (body: { username: string; fullName: string; password: string; role: string }) =>
    request<{ user: User }>('/users', { method: 'POST', body }),
  update: (id: Id, body: Partial<{ fullName: string; role: string; isActive: boolean; password: string }>) =>
    request<{ user: User }>(`/users/${id}`, { method: 'PATCH', body }),
  deactivate: (id: Id) => request<{ user: User }>(`/users/${id}`, { method: 'DELETE' }),
};

// ── Consoles ────────────────────────────────────────────────────────────────

export const consoles = {
  list: (q?: { status?: string; type?: string; roomType?: string; q?: string; includeInactive?: boolean }) =>
    request<List<ConsoleUnit>>('/consoles', { query: q as Record<string, string | boolean | undefined> }),
  /**
   * Customer view — same endpoint, fewer fields. The server drops the internal
   * condition note for a non-admin session.
   */
  listPublic: () => request<List<PublicConsoleUnit>>('/consoles'),
  get: (id: Id) => request<{ console: ConsoleUnit; currentSession: RentalSession | null }>(`/consoles/${id}`),
  create: (body: Partial<ConsoleUnit>) => request<{ console: ConsoleUnit }>('/consoles', { method: 'POST', body }),
  update: (id: Id, body: Partial<ConsoleUnit>) => request<{ console: ConsoleUnit }>(`/consoles/${id}`, { method: 'PATCH', body }),
  remove: (id: Id) => request<{ console: ConsoleUnit }>(`/consoles/${id}`, { method: 'DELETE' }),
};

// ── Sessions ────────────────────────────────────────────────────────────────

/**
 * Body of `POST /sessions/quote`.
 * - `sessionId` → preview of a RUNNING session: the server uses the session's
 *   rate snapshot and the real clock (overtime included). No client estimate.
 * - `consoleId` + `durationMinutes` → preview of a plan that has not started.
 * - `extraMinutes` → extra PLANNED minutes (an extension), never overtime.
 */
export interface QuoteRequest {
  sessionId?: number;
  consoleId?: number;
  durationMinutes?: number;
  startedAt?: string;
  extraMinutes?: number;
}

export const sessions = {
  quote: (body: QuoteRequest) =>
    request<Quote>('/sessions/quote', { method: 'POST', body }),
  list: (q?: { status?: string; consoleId?: Id; from?: string; to?: string; q?: string; page?: number; limit?: number }) =>
    request<Paginated<RentalSession>>('/sessions', { query: q }),
  active: () => request<List<RentalSession>>('/sessions/active'),
  get: (id: Id) => request<{ session: RentalSession; console: ConsoleUnit | null; transaction?: Transaction }>(`/sessions/${id}`),
  create: (body: { consoleId: number; customerName: string; customerContact?: string; durationMinutes: number; notes?: string; startedAt?: string }) =>
    request<{ session: RentalSession }>('/sessions', { method: 'POST', body }),
  extend: (id: Id, extraMinutes: number) =>
    request<{ session: RentalSession }>(`/sessions/${id}/extend`, { method: 'POST', body: { extraMinutes } }),
  finish: (id: Id, body: { paymentMethod: PaymentMethod; amountPaid: number; discount?: number; discountReason?: string; extraCharge?: number; notes?: string }) =>
    request<{ transaction: Transaction }>(`/sessions/${id}/finish`, { method: 'POST', body }),
  void: (id: Id, reason: string) =>
    request<{ session: RentalSession }>(`/sessions/${id}/void`, { method: 'POST', body: { reason } }),
};

// ── Bookings ────────────────────────────────────────────────────────────────

export const bookings = {
  list: (q?: { date?: string; from?: string; to?: string; status?: string; consoleId?: Id; q?: string; page?: number; limit?: number }) =>
    request<Paginated<Booking>>('/bookings', { query: q }),
  get: (id: Id) => request<{ booking: Booking }>(`/bookings/${id}`),
  create: (body: { consoleId: number; customerName: string; customerContact?: string; bookingDate: string; startTime: string; durationMinutes: number; notes?: string; discount?: number }) =>
    request<{ booking: Booking }>('/bookings', { method: 'POST', body }),
  update: (id: Id, body: Partial<Booking> & { contact?: string }) =>
    request<{ booking: Booking }>(`/bookings/${id}`, { method: 'PATCH', body }),
  checkIn: (id: Id, durationMinutes?: number) =>
    request<{ session: RentalSession }>(`/bookings/${id}/check-in`, { method: 'POST', body: durationMinutes ? { durationMinutes } : {} }),
  cancel: (id: Id, reason?: string) =>
    request<{ booking: Booking }>(`/bookings/${id}/cancel`, { method: 'POST', body: { reason } }),
};

// ── Transactions ────────────────────────────────────────────────────────────

export const transactions = {
  list: (q?: { from?: string; to?: string; method?: string; status?: string; q?: string; page?: number; limit?: number }) =>
    request<Paginated<Transaction> & { totals: { count: number; gross: number; paid: number; outstanding: number } }>('/transactions', { query: q }),
  get: (id: Id) =>
    request<{ transaction: Transaction; items: TransactionItem[]; session: RentalSession | null; cashier: User | null; console: ConsoleUnit | null }>(`/transactions/${id}`),
  void: (id: Id, reason: string) =>
    request<{ transaction: Transaction }>(`/transactions/${id}/void`, { method: 'POST', body: { reason } }),
  receiptUrl: (id: Id, opts?: { print?: boolean }) => `/api/transactions/${id}/receipt?format=html${opts?.print ? '&print=1' : ''}`,
};

// ── Dashboard ───────────────────────────────────────────────────────────────

export const dashboard = {
  summary: () => request<DashboardSummary>('/dashboard/summary'),
  activity: () => request<List<ActivityItem>>('/dashboard/activity'),
  endingSoon: () => request<List<EndingSoonItem>>('/dashboard/ending-soon'),
  revenueChart: (q?: { from?: string; to?: string; groupBy?: string }) =>
    request<{ buckets: RevenueBucket[] }>('/dashboard/revenue-chart', { query: q }),
  busyHours: (q?: { from?: string; to?: string }) => request<{ hours: BusyHour[] }>('/dashboard/busy-hours', { query: q }),
};

// ── Games ───────────────────────────────────────────────────────────────────

export const games = {
  list: (q?: { platform?: string; genre?: string; q?: string; includeInactive?: boolean }) =>
    request<List<Game>>('/games', { query: q as Record<string, string | boolean | undefined> }),
  create: (body: Partial<Game>) => request<{ game: Game }>('/games', { method: 'POST', body }),
  update: (id: Id, body: Partial<Game>) => request<{ game: Game }>(`/games/${id}`, { method: 'PATCH', body }),
  remove: (id: Id) => request<{ game: Game }>(`/games/${id}`, { method: 'DELETE' }),
};

// ── Reports ─────────────────────────────────────────────────────────────────

/** The CSV flavours the server accepts. An unknown type is a 400, never a silent fallback. */
export type ReportCsvType = 'sessions' | 'transactions' | 'units' | 'daily' | 'weekly' | 'monthly' | 'payments';

/** `GET /reports/payments` — the same Transaction shape as GET /transactions. */
export interface PaymentsReport {
  items: Transaction[];
  totals: {
    count: number;
    gross: number;
    paid: number;
    outstanding: number;
    /** COUNT of void transactions — not rupiah. */
    voided: number;
  };
}

export const reports = {
  summary: (q?: { from?: string; to?: string }) => request<ReportsSummary>('/reports/summary', { query: q }),
  daily: (q?: { from?: string; to?: string }) => request<{ items: ReportRow[] }>('/reports/daily', { query: q }),
  weekly: (q?: { from?: string; to?: string }) => request<{ items: ReportRow[] }>('/reports/weekly', { query: q }),
  monthly: (q?: { from?: string; to?: string }) => request<{ items: ReportRow[] }>('/reports/monthly', { query: q }),
  units: (q?: { from?: string; to?: string }) => request<{ items: UnitReport[] }>('/reports/units', { query: q }),
  payments: (q?: { from?: string; to?: string; method?: string; status?: string }) =>
    request<PaymentsReport>('/reports/payments', { query: q }),
  exportCsvUrl: (q: { type: ReportCsvType; from?: string; to?: string }) => `/api/reports/export.csv${buildQuery(q)}`,
};

// ── Settings + packages ─────────────────────────────────────────────────────

export const settings = {
  get: () => request<Settings>('/settings'),
  /** Customer view: the server trims the payment methods and the overtime tariff. */
  getPublic: () => request<CustomerSettings>('/settings'),
  update: (body: Settings) => request<Settings>('/settings', { method: 'PUT', body }),
  packages: () => request<List<DurationPackage>>('/packages'),
  createPackage: (body: Partial<DurationPackage>) => request<{ package: DurationPackage }>('/packages', { method: 'POST', body }),
  updatePackage: (id: Id, body: Partial<DurationPackage>) => request<{ package: DurationPackage }>(`/packages/${id}`, { method: 'PATCH', body }),
  removePackage: (id: Id) => request<{ package: DurationPackage }>(`/packages/${id}`, { method: 'DELETE' }),
};
