// business_settings row <-> API mapping. Single source for rules + business identity.
import { DEFAULT_RULES } from './pricing.js'

/**
 * The one settings row the app needs (id = 1).
 *
 * Shared by the v4 migration and the seeder so a migrated DB and a seeded DB
 * hold the exact same defaults — `INSERT OR IGNORE` then never has to decide
 * which one wins. Values are identical to the ones the demo seeder used.
 */
export const DEFAULT_SETTINGS_ROW = {
  business_name: 'PlayRent',
  address: 'Jl. Merdeka No. 45, Bandung, Jawa Barat',
  phone: '0812-3456-7890',
  receipt_footer: 'Terima kasih telah bermain di PlayRent!',
  tax_note: 'Harga sudah termasuk pajak.',
  min_duration_minutes: 30,
  rounding_minutes: 15,
  overtime_rate_per_hour: 12000,
  overtime_grace_minutes: 5,
  default_hourly_rate: 15000,
  warn_minutes_json: '[10,5,1]',
  payment_methods_json: '["cash","transfer","qris"]',
}

/** Every writable column of business_settings, in insert order. */
const SETTINGS_COLUMNS = [
  'business_name', 'address', 'phone', 'receipt_footer', 'tax_note',
  'min_duration_minutes', 'rounding_minutes', 'overtime_rate_per_hour',
  'overtime_grace_minutes', 'default_hourly_rate', 'warn_minutes_json',
  'payment_methods_json', 'updated_at',
]

/**
 * Last-resort defaults for a DB whose settings row is missing.
 * Built from DEFAULT_RULES so the money path still has sane tariffs.
 */
export function defaultSettingsRow() {
  return {
    id: 1,
    business_name: 'PlayRent',
    address: '',
    phone: '',
    receipt_footer: '',
    tax_note: '',
    min_duration_minutes: DEFAULT_RULES.minDurationMinutes,
    rounding_minutes: DEFAULT_RULES.roundingMinutes,
    overtime_rate_per_hour: DEFAULT_RULES.overtimeRatePerHour,
    overtime_grace_minutes: DEFAULT_RULES.overtimeGraceMinutes,
    default_hourly_rate: DEFAULT_RULES.defaultHourlyRate,
    warn_minutes_json: JSON.stringify(DEFAULT_RULES.warnMinutes),
    payment_methods_json: '["cash","transfer","qris"]',
    updated_at: new Date().toISOString(),
  }
}

/**
 * The settings row, or the defaults when the row is missing.
 * Never throws: a missing row used to surface as a TypeError -> 500 on every
 * money path (BE-001).
 */
export function getSettingsRow(db) {
  const row = db.prepare('SELECT * FROM business_settings WHERE id = 1').get()
  return row ?? defaultSettingsRow()
}

/**
 * Write the settings row, creating it when it does not exist yet.
 * `patch` is a partial row keyed by column name; missing columns keep their
 * current (or default) value. The UPSERT is what makes an admin save on a
 * row-less DB actually stick instead of silently updating zero rows.
 */
export function updateSettingsRow(db, patch) {
  const next = { ...getSettingsRow(db), ...patch }
  const placeholders = SETTINGS_COLUMNS.map(() => '?').join(', ')
  const assignments = SETTINGS_COLUMNS.map((c) => `${c} = excluded.${c}`).join(', ')
  db.prepare(
    `INSERT INTO business_settings (id, ${SETTINGS_COLUMNS.join(', ')})
     VALUES (1, ${placeholders})
     ON CONFLICT(id) DO UPDATE SET ${assignments}`,
  ).run(...SETTINGS_COLUMNS.map((c) => next[c]))
  return getSettingsRow(db)
}

const parseJson = (s, fallback) => {
  try { return JSON.parse(s) } catch { return fallback }
}

export function rulesFromRow(row) {
  return {
    minDurationMinutes: row.min_duration_minutes,
    roundingMinutes: row.rounding_minutes,
    overtimeRatePerHour: row.overtime_rate_per_hour,
    overtimeGraceMinutes: row.overtime_grace_minutes,
    defaultHourlyRate: row.default_hourly_rate,
    warnMinutes: parseJson(row.warn_minutes_json, [10, 5, 1]),
  }
}

export function settingsToApi(row) {
  return {
    business: {
      name: row.business_name,
      address: row.address,
      phone: row.phone,
      receiptFooter: row.receipt_footer,
      taxNote: row.tax_note,
    },
    rules: rulesFromRow(row),
    payments: { methods: parseJson(row.payment_methods_json, ['cash', 'transfer', 'qris']) },
  }
}

/**
 * Customer-facing subset: what a renter may know. Drops `payments` and the
 * internal overtime tariff (rate + grace) — those are operator numbers.
 */
export function settingsToPublicApi(row) {
  return {
    business: {
      name: row.business_name,
      address: row.address,
      phone: row.phone,
      receiptFooter: row.receipt_footer,
      taxNote: row.tax_note,
    },
    rules: {
      minDurationMinutes: row.min_duration_minutes,
      roundingMinutes: row.rounding_minutes,
      defaultHourlyRate: row.default_hourly_rate,
      warnMinutes: parseJson(row.warn_minutes_json, [10, 5, 1]),
    },
  }
}
