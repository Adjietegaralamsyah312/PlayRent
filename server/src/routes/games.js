import { Router } from 'express'
import { z } from 'zod'
import { AppError, ok, created } from '../lib/errors.js'
import { parse, idParam, likePattern } from '../lib/validate.js'
import { mapGame } from '../lib/mappers.js'
import { requireAuth, requireSuperAdmin } from '../lib/auth.js'
import { logAudit } from '../lib/audit.js'

const createSchema = z.object({
  title: z.string().min(2, 'Judul game minimal 2 karakter').max(120, 'Judul game maksimal 120 karakter'),
  platform: z.enum(['PS4', 'PS5', 'both'], { message: 'Pilih platform' }),
  genre: z.string().min(1, 'Isi genre game').max(40, 'Genre maksimal 40 karakter'),
  recommendedControllers: z.coerce.number().int().min(1).max(4).optional().nullable(),
  availabilityNote: z.string().max(60, 'Catatan maksimal 60 karakter').optional().nullable(),
  isActive: z.boolean().optional(),
}).strict()

const updateSchema = createSchema.partial().strict()

export default function gamesRoutes(db) {
  const r = Router()
  r.use(requireAuth)

  r.get('/', (req, res) => {
    const { platform, genre, q, includeInactive } = req.query
    const where = []
    const params = []
    if (!(includeInactive === 'true' || includeInactive === '1')) where.push('is_active = 1')
    if (['PS4', 'PS5', 'both'].includes(platform)) { where.push('platform = ?'); params.push(platform) }
    if (genre) { where.push('genre = ?'); params.push(genre) }
    if (q) { where.push("title LIKE ? ESCAPE '\\'"); params.push(likePattern(String(q).toLowerCase())) }
    const sql = `SELECT * FROM game_catalog ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY title ASC`
    return ok(res, { items: db.prepare(sql).all(...params).map(mapGame) })
  })

  r.post('/', requireSuperAdmin, (req, res) => {
    const body = parse(createSchema, req.body)
    const now = new Date().toISOString()
    const info = db.prepare(
      `INSERT INTO game_catalog
       (title, platform, genre, recommended_controllers, availability_note, is_active, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    ).run(body.title, body.platform, body.genre, body.recommendedControllers ?? null,
      body.availabilityNote ?? null, body.isActive === false ? 0 : 1, now, now)
    const g = db.prepare('SELECT * FROM game_catalog WHERE id = ?').get(Number(info.lastInsertRowid))
    logAudit(db, {
      actorId: req.user.id, actorName: req.user.full_name, action: 'game_created',
      entity: 'game_catalog', entityId: g.id, description: `Game "${g.title}" berhasil ditambahkan`,
    })
    return created(res, { game: mapGame(g) })
  })

  r.patch('/:id', requireSuperAdmin, (req, res) => {
    const id = parse(idParam, req.params.id)
    const body = parse(updateSchema, req.body)
    const g = db.prepare('SELECT * FROM game_catalog WHERE id = ?').get(id)
    if (!g) throw new AppError(404, 'GAME_NOT_FOUND')
    const map = {
      title: 'title', platform: 'platform', genre: 'genre',
      recommendedControllers: 'recommended_controllers', availabilityNote: 'availability_note',
      isActive: 'is_active',
    }
    const sets = []
    const params = []
    for (const [k, col] of Object.entries(map)) {
      if (body[k] !== undefined) {
        sets.push(`${col} = ?`)
        params.push(k === 'isActive' ? (body.isActive ? 1 : 0) : body[k])
      }
    }
    if (sets.length) {
      sets.push('updated_at = ?'); params.push(new Date().toISOString(), id)
      db.prepare(`UPDATE game_catalog SET ${sets.join(', ')} WHERE id = ?`).run(...params)
    }
    const updated = db.prepare('SELECT * FROM game_catalog WHERE id = ?').get(id)
    logAudit(db, {
      actorId: req.user.id, actorName: req.user.full_name, action: 'game_updated',
      entity: 'game_catalog', entityId: id, description: `Perubahan pada "${updated.title}" tersimpan`,
    })
    return ok(res, { game: mapGame(updated) })
  })

  r.delete('/:id', requireSuperAdmin, (req, res) => {
    const id = parse(idParam, req.params.id)
    const g = db.prepare('SELECT * FROM game_catalog WHERE id = ?').get(id)
    if (!g) throw new AppError(404, 'GAME_NOT_FOUND')
    db.prepare('UPDATE game_catalog SET is_active = 0, updated_at = ? WHERE id = ?')
      .run(new Date().toISOString(), id)
    logAudit(db, {
      actorId: req.user.id, actorName: req.user.full_name, action: 'game_deactivated',
      entity: 'game_catalog', entityId: id, description: `"${g.title}" dinonaktifkan`,
    })
    return ok(res, { game: mapGame(db.prepare('SELECT * FROM game_catalog WHERE id = ?').get(id)) })
  })

  return r
}
