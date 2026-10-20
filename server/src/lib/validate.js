// zod helpers. Every mutating body is validated server-side, always.
import { z } from 'zod'
import { AppError } from './errors.js'

export function parse(schema, data) {
  const result = schema.safeParse(data)
  if (!result.success) {
    const issues = result.error.issues || []
    const first = issues[0]
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      first?.message || 'Data tidak valid',
      issues.map((i) => ({ path: (i.path || []).join('.'), message: i.message })),
    )
  }
  return result.data
}

export const idParam = z.coerce.number().int().positive()
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD')
export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format waktu harus HH:mm')
export const positiveInt = z.coerce.number().int().positive()
export const money = z.coerce.number().int().min(0, 'Jumlah tidak boleh negatif')
