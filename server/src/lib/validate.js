// zod helpers + input sanitising. Every mutating body is validated server-side, always.
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

// BE-018b: a path id must be a plain positive integer. `z.coerce.number()`
// would also accept '1e2', '0x10' and ' 12 ' — silently pointing the request
// at a different row than the caller asked for.
export const idParam = z.preprocess(
  (v) => (typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v),
  z.number({ invalid_type_error: 'ID harus berupa angka bulat positif' })
    .int('ID harus berupa angka bulat positif')
    .positive('ID harus berupa angka bulat positif'),
)

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD')
export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format waktu harus HH:mm')
export const positiveInt = z.coerce.number().int().positive()
export const money = z.coerce.number().int().min(0, 'Jumlah tidak boleh negatif')

/**
 * BE-018a: escape the LIKE wildcards so a search term is matched literally.
 * `%` and `_` from the user must not act as wildcards ('%' must not return
 * the whole table). Pair with `ESCAPE '\'` in the SQL.
 */
export const likePattern = (term) => `%${String(term).replace(/[\\%_]/g, '\\$&')}%`
