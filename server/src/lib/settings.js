// business_settings row <-> API mapping. Single source for rules + business identity.
export function getSettingsRow(db) {
  return db.prepare('SELECT * FROM business_settings WHERE id = 1').get()
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
