// Central error taxonomy + envelope middleware.
// Errors never leak stack traces or raw driver messages to the client.

export const ERRORS = {
  INTERNAL_ERROR: { status: 500, message: 'Terjadi kesalahan pada server' },
  NOT_FOUND: { status: 404, message: 'Endpoint tidak ditemukan' },
  UNAUTHENTICATED: { status: 401, message: 'Anda belum masuk' },
  SESSION_EXPIRED: { status: 401, message: 'Sesi telah berakhir. Silakan masuk kembali' },
  INVALID_CREDENTIALS: { status: 401, message: 'Username atau kata sandi salah' },
  RATE_LIMITED: { status: 429, message: 'Terlalu banyak percobaan masuk. Coba lagi nanti' },
  FORBIDDEN: { status: 403, message: 'Anda tidak memiliki izin untuk tindakan ini' },
  CSRF_ORIGIN_MISMATCH: { status: 403, message: 'Permintaan ditolak dari origin yang tidak dikenal' },
  VALIDATION_ERROR: { status: 400, message: 'Data tidak valid' },
  DURATION_BELOW_MINIMUM: { status: 400, message: 'Durasi di bawah minimum' },
  UNIT_OCCUPIED: { status: 409, message: 'Unit sedang dipakai' },
  SESSION_NOT_ACTIVE: { status: 409, message: 'Sesi ini sudah tidak berjalan' },
  SESSION_ALREADY_FINISHED: { status: 409, message: 'Sesi ini sudah dibayar sebelumnya' },
  INSUFFICIENT_PAYMENT: { status: 400, message: 'Uang diterima kurang dari total tagihan' },
  BOOKING_CONFLICT: { status: 409, message: 'Jadwal unit sudah terisi' },
  BOOKING_NOT_CONFIRMED: { status: 409, message: 'Booking belum dikonfirmasi' },
  DUPLICATE_CODE: { status: 409, message: 'Kode unit sudah dipakai' },
  DUPLICATE_USERNAME: { status: 409, message: 'Username sudah dipakai' },
  CANNOT_DELETE_SELF: { status: 409, message: 'Anda tidak dapat menonaktifkan akun sendiri' },
  LAST_ADMIN: { status: 409, message: 'Tidak dapat menonaktifkan admin terakhir' },
  ALREADY_VOID: { status: 409, message: 'Data ini sudah dibatalkan' },
  CONSOLE_NOT_FOUND: { status: 404, message: 'Unit tidak ditemukan' },
  USER_NOT_FOUND: { status: 404, message: 'Pengguna tidak ditemukan' },
  SESSION_NOT_FOUND: { status: 404, message: 'Sesi tidak ditemukan' },
  BOOKING_NOT_FOUND: { status: 404, message: 'Booking tidak ditemukan' },
  TRANSACTION_NOT_FOUND: { status: 404, message: 'Transaksi tidak ditemukan' },
  GAME_NOT_FOUND: { status: 404, message: 'Game tidak ditemukan' },
  PACKAGE_NOT_FOUND: { status: 404, message: 'Paket tidak ditemukan' },
}

/** True when a node:sqlite error is a UNIQUE violation (optionally on `table`). */
export function isUniqueViolation(err, table) {
  const code = err?.errcode ?? err?.code
  if (code === 2067) {
    return !table || String(err?.message || '').includes(table)
  }
  const m = String(err?.message || '')
  return /UNIQUE constraint failed/.test(m) && (!table || m.includes(table))
}

export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message || ERRORS[code]?.message || 'Terjadi kesalahan')
    this.name = 'AppError'
    this.status = status || 500
    this.code = code || 'INTERNAL_ERROR'
    this.details = details
  }
}

/** Success envelope. `meta` is only attached when the caller passes it. */
export function ok(res, data, meta) {
  const body = { success: true, data }
  if (meta !== undefined) body.meta = meta
  return res.json(body)
}

export function created(res, data, meta) {
  const body = { success: true, data }
  if (meta !== undefined) body.meta = meta
  return res.status(201).json(body)
}

export function notFoundHandler(req, res) {
  return res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: ERRORS.NOT_FOUND.message },
  })
}

export function errorHandler(err, req, res, _next) {
  if (res.headersSent) return
  if (err instanceof AppError) {
    const body = { success: false, error: { code: err.code, message: err.message } }
    if (err.details !== undefined) body.error.details = err.details
    return res.status(err.status).json(body)
  }
  // express.json() body parse failure
  if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Format JSON pada permintaan tidak valid' },
    })
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Ukuran permintaan terlalu besar' },
    })
  }
  // Unknown: log server-side only, never leak the message.
  console.error('[error]', err)
  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: ERRORS.INTERNAL_ERROR.message },
  })
}
