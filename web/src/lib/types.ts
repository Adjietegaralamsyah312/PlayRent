// API shapes — mirrors api-contract.md exactly. Nothing here is invented.
//
// Every `id` is a NUMBER: the server maps SQLite `INTEGER PRIMARY KEY` rows
// straight through (`id: r.id`), so the wire format is a JSON number. Typing
// them as string made `3 === "3"` comparisons silently false — the deep-link
// `/sesi/baru?consoleId=3` never preselected the unit (FE-FIX-3).

export type Role = 'superadmin' | 'user';

/** The only place a role is spelled out in Indonesian. */
export const ROLE_LABEL: Record<Role, string> = { superadmin: 'Super Admin', user: 'Pelanggan' };
export type ConsoleStatus = 'available' | 'in_use' | 'reserved' | 'maintenance';
export type SessionStatus = 'active' | 'overdue' | 'finished' | 'void';
export type BookingStatus = 'pending' | 'confirmed' | 'checked_in' | 'completed' | 'cancelled';
export type PaymentMethod = 'cash' | 'transfer' | 'qris';
export type PaymentStatus = 'paid' | 'unpaid' | 'void';
export type TxStatus = 'completed' | 'void';
export type ConsoleType = 'PS4' | 'PS5';
export type RoomType = 'Reguler' | 'VIP';
export type GamePlatform = 'PS4' | 'PS5' | 'both';

export interface User {
  id: number;
  username: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  phone: string | null;
  createdAt: string;
}

export interface ConsoleUnit {
  id: number;
  code: string;
  consoleType: ConsoleType;
  roomType: RoomType;
  controllers: number;
  hourlyRate: number;
  status: ConsoleStatus;
  conditionNote: string | null;
  isActive: boolean;
  createdAt: string;
}

/**
 * Customer view of a unit. The server drops `conditionNote` (an internal
 * note) and `createdAt` for a non-admin session, so the field simply is not
 * here — the customer page cannot render what it never receives.
 */
export interface PublicConsoleUnit {
  id: number;
  code: string;
  consoleType: ConsoleType;
  roomType: RoomType;
  controllers: number;
  hourlyRate: number;
  status: ConsoleStatus;
  isActive: boolean;
}

export interface SessionExtension {
  minutes: number;
  at: string;
  byUserId?: number;
}

export interface RentalSession {
  id: number;
  consoleId: number;
  consoleCode: string | null;
  customerName: string;
  customerContact: string | null;
  status: SessionStatus;
  startedAt: string;
  endsAt: string;
  plannedMinutes: number;
  /** Null while the session is still running — the server bills it on finish. */
  billedMinutes: number | null;
  extensions: SessionExtension[];
  notes: string | null;
  rateSnapshot: number;
  createdBy: number | null;
  finishedAt: string | null;
  transactionId: number | null;
}

export interface Quote {
  durationMinutes: number;
  billableMinutes: number;
  hourlyRate: number;
  subtotal: number;
  overtimeMinutes: number;
  overtimeAmount: number;
  discount: number;
  extraCharge?: number;
  total: number;
  currency: 'IDR';
}

export interface Transaction {
  id: number;
  number: string;
  sessionId: number;
  consoleCode: string;
  customerName: string;
  cashierName: string;
  createdAt: string;
  subtotal: number;
  extraCharge: number;
  discount: number;
  discountReason: string | null;
  total: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  amountPaid: number;
  changeDue: number;
  status: TxStatus;
  voidReason: string | null;
  voidBy: number | null;
  voidedAt: string | null;
}

/** The server's `transaction_items.kind` — the CHECK constraint allows exactly these. */
export type TransactionItemKind = 'rental' | 'overtime' | 'extra' | 'discount';

export interface TransactionItem {
  id: number;
  kind: TransactionItemKind;
  description: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Booking {
  id: number;
  consoleId: number;
  customerName: string;
  customerContact: string | null;
  bookingDate: string;
  startTime: string;
  durationMinutes: number;
  status: BookingStatus;
  notes: string | null;
  discount: number | null;
  isExpired: boolean;
}

export interface Game {
  id: number;
  title: string;
  platform: GamePlatform;
  genre: string;
  recommendedControllers: number | null;
  availabilityNote: string | null;
  isActive: boolean;
}

export interface DurationPackage {
  id: number;
  name: string;
  durationMinutes: number;
  price: number;
  consoleType: ConsoleType | null;
  isActive: boolean;
  createdAt: string;
}

export interface BusinessSettings {
  name: string;
  address: string;
  phone: string;
  receiptFooter: string;
  taxNote: string;
}

/** The rules every session receives — the public subset. */
export interface PublicPricingRules {
  minDurationMinutes: number;
  roundingMinutes: number;
  defaultHourlyRate: number;
  warnMinutes: number[];
}

/**
 * The admin rules: the public ones plus the internal overtime tariff. The
 * server sends the overtime tariff to a super admin only — a customer session
 * gets the public subset (see `CustomerSettings`).
 */
export interface PricingRules extends PublicPricingRules {
  overtimeRatePerHour: number;
  overtimeGraceMinutes: number;
}

export interface Settings {
  business: BusinessSettings;
  rules: PricingRules;
  /** Super Admin only — the server omits the payment methods for a customer session. */
  payments?: { methods: PaymentMethod[] };
}

/**
 * Customer view of the settings: the server drops the payment methods and the
 * internal overtime tariff for a non-admin session.
 */
export interface CustomerSettings {
  business: BusinessSettings;
  rules: PublicPricingRules;
  /** Present only for a super admin session — the server omits it for a customer. */
  payments?: { methods: PaymentMethod[] };
}

export interface DashboardSummary {
  units: { total: number; available: number; inUse: number; reserved: number; maintenance: number };
  today: { sessions: number; revenue: number; transactions: number };
  range: { revenueToday: number; revenueWeek: number; revenueMonth: number };
}

export interface ActivityItem {
  type: 'session_started' | 'session_finished' | 'booking_created' | 'transaction_voided';
  at: string;
  description: string;
  actor: string;
  refId: number | null;
}

export interface EndingSoonItem {
  sessionId: number;
  consoleCode: string;
  customerName: string;
  endsAt: string;
  remainingSeconds: number;
  severity: 'warn' | 'critical' | 'overdue';
}

export interface RevenueBucket { label: string; revenue: number; transactions: number }
export interface BusyHour { hour: number; sessions: number; revenue: number }

export interface ReportsSummary {
  revenueRecorded: number;
  revenueOutstanding: number;
  transactionCount: number;
  sessionsCount: number;
  totalMinutes: number;
  avgPerTransaction: number;
  voidedCount: number;
}

export interface ReportRow { date: string; revenue: number; transactions: number; sessions: number; minutes: number }
export interface UnitReport {
  consoleId: number; code: string; consoleType: ConsoleType; roomType: RoomType;
  sessions: number; minutes: number; revenue: number; utilizationPct: number;
}

export interface Meta { total: number; page: number; limit: number }
export interface List<T> { items: T[] }
export interface Paginated<T> extends List<T> { meta: Meta }
