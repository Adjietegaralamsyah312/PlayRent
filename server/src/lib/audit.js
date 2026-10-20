// Operational audit trail — feeds GET /api/dashboard/activity.
import { nowIso } from './time.js'

// Keys that must never reach the audit trail: credentials and auth material.
// Compared on a normalised key (lower-case, alphanumerics only) so
// password_hash / passwordHash / PASSWORD all match.
const SECRET_KEYS = new Set([
  'password', 'passwd', 'pwd', 'pass', 'newpassword', 'currentpassword', 'oldpassword',
  'passwordhash', 'passwordsalt', 'hash', 'salt',
  'token', 'accesstoken', 'refreshtoken', 'sessiontoken', 'cookie', 'setcookie', 'authorization',
  'secret', 'clientsecret', 'apikey', 'privatekey', 'passphrase',
])

const normKey = (k) => String(k).toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * Recursively replace credential-ish values with '[redacted]'.
 * Applied to every audit meta before it is written — a caller cannot leak a
 * password into audit_logs by passing it as meta.
 */
export function sanitizeMeta(value, depth = 0) {
  if (depth > 6) return '[redacted]'
  if (Array.isArray(value)) return value.map((v) => sanitizeMeta(v, depth + 1))
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = SECRET_KEYS.has(normKey(k)) ? '[redacted]' : sanitizeMeta(v, depth + 1)
    }
    return out
  }
  return value
}

export function logAudit(db, {
  actorId = null, actorName = null, action, entity = null,
  entityId = null, description = null, meta = null,
} = {}) {
  const safeMeta = meta == null ? null : sanitizeMeta(meta)
  db.prepare(
    `INSERT INTO audit_logs
     (actor_id, actor_name, action, entity, entity_id, description, meta_json, created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
  ).run(
    actorId, actorName, action, entity, entityId, description,
    safeMeta == null ? null : JSON.stringify(safeMeta), nowIso(),
  )
}
