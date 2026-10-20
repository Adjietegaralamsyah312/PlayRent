// Pricing — pure, zero imports from db. Integer rupiah only.
import { AppError } from './errors.js'

export const DEFAULT_RULES = {
  minDurationMinutes: 30,
  roundingMinutes: 15,
  overtimeRatePerHour: 10000,
  overtimeGraceMinutes: 0,
  defaultHourlyRate: 10000,
  warnMinutes: [10, 5, 1],
}

const asInt = (n) => (Number.isFinite(Number(n)) ? Math.trunc(Number(n)) : 0)

export const roundUpMinutes = (value, step) => {
  const s = Number(step) > 0 ? Number(step) : 1
  return Math.ceil(asInt(value) / s) * s
}

export function validateDuration(durationMinutes, rules = DEFAULT_RULES) {
  const min = rules?.minDurationMinutes ?? DEFAULT_RULES.minDurationMinutes
  if (!Number.isFinite(Number(durationMinutes)) || Number(durationMinutes) < min) {
    throw new AppError(400, 'DURATION_BELOW_MINIMUM', `Durasi minimal ${min} menit`)
  }
  return true
}

/**
 * The single source of truth for money math. Every returned amount is an integer.
 * @returns {{durationMinutes:number,billableMinutes:number,hourlyRate:number,subtotal:number,
 *   overtimeMinutes:number,overtimeAmount:number,discount:number,total:number,currency:'IDR'}}
 */
export function quote({ durationMinutes, actualMinutes, hourlyRate, rules = DEFAULT_RULES, discount = 0, extraCharge = 0 }) {
  const planned = asInt(durationMinutes)
  const rate = asInt(hourlyRate)
  const extra = asInt(extraCharge)

  const billableMinutes = roundUpMinutes(planned, rules.roundingMinutes)
  const subtotal = Math.ceil((billableMinutes * rate) / 60)

  const actual = actualMinutes == null ? planned : asInt(actualMinutes)
  const grace = asInt(rules.overtimeGraceMinutes ?? 0)
  const overtimeMinutes = Math.max(0, actual - planned - grace)
  const overtimeAmount = Math.ceil((overtimeMinutes * asInt(rules.overtimeRatePerHour ?? 0)) / 60)

  const cappedDiscount = Math.min(Math.max(0, asInt(discount)), subtotal + overtimeAmount + extra)
  const total = Math.max(0, subtotal + overtimeAmount + extra - cappedDiscount)

  const out = {
    durationMinutes: planned,
    billableMinutes,
    hourlyRate: rate,
    subtotal,
    overtimeMinutes,
    overtimeAmount,
    discount: cappedDiscount,
    total,
    currency: 'IDR',
  }
  for (const k of ['billableMinutes', 'subtotal', 'overtimeMinutes', 'overtimeAmount', 'discount', 'total']) {
    if (!Number.isInteger(out[k])) throw new Error(`pricing: ${k} must be an integer`)
  }
  return out
}
