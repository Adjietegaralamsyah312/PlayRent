// DB row -> API shape mappers. Keeps controllers thin and field names frozen.

const parseJson = (s, fallback) => {
  try { return JSON.parse(s) } catch { return fallback }
}

export const mapUser = (r) => ({
  id: r.id,
  username: r.username,
  fullName: r.full_name,
  role: r.role,
  isActive: !!r.is_active,
  phone: r.phone ?? null,
  createdAt: r.created_at,
})

/** Console view for a plain customer: no internal notes, no session data. */
export const mapConsolePublic = (r) => ({
  id: r.id,
  code: r.code,
  consoleType: r.console_type,
  roomType: r.room_type,
  controllers: r.controllers,
  hourlyRate: r.hourly_rate,
  status: r.status,
  isActive: !!r.is_active,
})

export const mapConsole = (r) => ({
  id: r.id,
  code: r.code,
  consoleType: r.console_type,
  roomType: r.room_type,
  controllers: r.controllers,
  hourlyRate: r.hourly_rate,
  status: r.status,
  conditionNote: r.condition_note,
  isActive: !!r.is_active,
  createdAt: r.created_at,
})

export const mapSession = (r) => ({
  id: r.id,
  consoleId: r.console_id,
  consoleCode: r.console_code ?? null,
  customerName: r.customer_name,
  customerContact: r.customer_contact,
  status: r.status,
  startedAt: r.started_at,
  endsAt: r.ends_at,
  plannedMinutes: r.planned_minutes,
  billedMinutes: r.billed_minutes,
  extensions: parseJson(r.extensions_json, []),
  notes: r.notes,
  rateSnapshot: r.rate_snapshot,
  createdBy: r.created_by,
  finishedAt: r.finished_at,
  transactionId: r.transaction_id,
})

export const mapTransaction = (r) => ({
  id: r.id,
  number: r.number,
  sessionId: r.session_id,
  consoleCode: r.console_code,
  customerName: r.customer_name,
  cashierName: r.cashier_name,
  createdAt: r.created_at,
  subtotal: r.subtotal,
  extraCharge: r.extra_charge,
  discount: r.discount,
  discountReason: r.discount_reason,
  total: r.total,
  paymentMethod: r.payment_method,
  paymentStatus: r.payment_status,
  amountPaid: r.amount_paid,
  changeDue: r.change_due,
  status: r.status,
  voidReason: r.void_reason,
  voidBy: r.void_by,
  voidedAt: r.voided_at,
})

export const mapBooking = (r, now = Date.now()) => ({
  id: r.id,
  consoleId: r.console_id,
  customerName: r.customer_name,
  customerContact: r.customer_contact,
  bookingDate: r.booking_date,
  startTime: r.start_time,
  durationMinutes: r.duration_minutes,
  status: r.status,
  notes: r.notes,
  discount: r.discount,
  isExpired: r.status === 'confirmed' && r.ends_at_epoch < now,
})

export const mapGame = (r) => ({
  id: r.id,
  title: r.title,
  platform: r.platform,
  genre: r.genre,
  recommendedControllers: r.recommended_controllers,
  availabilityNote: r.availability_note,
  isActive: !!r.is_active,
})

export const mapPackage = (r) => ({
  id: r.id,
  name: r.name,
  durationMinutes: r.duration_minutes,
  price: r.price,
  consoleType: r.console_type,
  isActive: !!r.is_active,
  createdAt: r.created_at,
})

/** A session row joined with its console code, mapped for the API. */
export function sessionById(db, id) {
  const r = db.prepare(
    `SELECT s.*, c.code AS console_code
       FROM rental_sessions s JOIN consoles c ON c.id = s.console_id
      WHERE s.id = ?`,
  ).get(id)
  return r ? mapSession(r) : null
}

export function transactionById(db, id) {
  const r = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id)
  return r ? mapTransaction(r) : null
}
