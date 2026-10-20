import { Router } from 'express'
import { z } from 'zod'
import { AppError, ok } from '../lib/errors.js'
import { parse, idParam, likePattern } from '../lib/validate.js'
import { mapTransaction, mapSession, mapConsole, mapUser } from '../lib/mappers.js'
import { requireAuth, requireSuperAdmin } from '../lib/auth.js'
import { logAudit } from '../lib/audit.js'
import { withTx } from '../db.js'
import { getSettingsRow } from '../lib/settings.js'
import { nowIso, jakartaDayRangeUtc, formatJakarta } from '../lib/time.js'

const voidSchema = z.object({ reason: z.string().min(5, 'Isi alasan pembatalan (minimal 5 karakter)').max(200) }).strict()

const rupiah = (n) => `Rp ${Number(n || 0).toLocaleString('id-ID')}`

// Canonical TransactionItem shape (fix-contract §1.2): {id, kind, description,
// qty, unitPrice, lineTotal}. `description` <-> label, `qty` <-> quantity,
// `lineTotal` <-> amount. The receipt renderer uses the same names.
function itemsFor(db, txId) {
  return db.prepare('SELECT * FROM transaction_items WHERE transaction_id = ? ORDER BY id ASC').all(txId)
    .map((r) => ({ id: r.id, kind: r.kind, description: r.label, qty: r.quantity, unitPrice: r.unit_price, lineTotal: r.amount }))
}

const METHOD_LABEL = { cash: 'Tunai', transfer: 'Transfer', qris: 'QRIS' }

function receiptRows(db, tx) {
  const settings = getSettingsRow(db)
  const session = tx.session_id ? db.prepare('SELECT * FROM rental_sessions WHERE id = ?').get(tx.session_id) : null
  return { settings, session, items: itemsFor(db, tx.id) }
}

function renderReceiptHtml(db, tx, { print }) {
  const { settings, session, items } = receiptRows(db, tx)
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  const line = (label, value, cls = '') => `<div class="row ${cls}"><span>${esc(label)}</span><span class="tnum">${esc(value)}</span></div>`
  const timeStr = formatJakarta(tx.created_at, { dateStyle: 'medium', timeStyle: 'short' })
  const rows = items.map((it) => (
    `<div class="item"><div class="item-label">${esc(it.description)}</div>` +
    `<div class="row"><span class="muted">${it.qty} x ${esc(rupiah(it.unitPrice))}</span>` +
    `<span class="tnum">${esc(rupiah(it.lineTotal))}</span></div></div>`
  )).join('')

  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Struk ${esc(tx.number)}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #fff; color: #000; font: 12px/1.45 ui-monospace, "SFMono-Regular", Menlo, monospace; }
  .receipt { width: 72mm; margin: 0 auto; padding: 4mm 0; }
  .center { text-align: center; }
  .biz { font-size: 15px; font-weight: 700; }
  .muted { color: #444; }
  .sep { border-top: 1px dashed #000; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; gap: 8px; }
  .item { margin: 4px 0; }
  .item-label { font-weight: 600; }
  .tnum { font-variant-numeric: tabular-nums; }
  .total { font-size: 14px; font-weight: 700; }
  .void { text-decoration: line-through; }
  @media print { body { width: 72mm; } .no-print { display: none !important; } }
</style>
</head>
<body${print ? ' onload="window.print()"' : ''}>
  <div class="receipt">
    <div class="center">
      <div class="biz">${esc(settings.business_name)}</div>
      ${settings.address ? `<div class="muted">${esc(settings.address)}</div>` : ''}
      ${settings.phone ? `<div class="muted">${esc(settings.phone)}</div>` : ''}
    </div>
    <div class="sep"></div>
    ${line('No. Struk', tx.number)}
    ${line('Waktu', timeStr)}
    ${line('Operator', tx.cashier_name || '-')}
    ${tx.customer_name ? line('Pelanggan', tx.customer_name) : ''}
    ${tx.console_code ? line('Unit', tx.console_code) : ''}
    ${session ? line('Durasi', `${session.billed_minutes ?? session.planned_minutes} menit`) : ''}
    <div class="sep"></div>
    ${rows}
    <div class="sep"></div>
    ${line('Subtotal', rupiah(tx.subtotal))}
    ${tx.overtime_amount ? line(`Overtime (${tx.overtime_minutes} mnt)`, rupiah(tx.overtime_amount)) : ''}
    ${tx.extra_charge ? line('Biaya tambahan', rupiah(tx.extra_charge)) : ''}
    ${tx.discount ? line(`Diskon${tx.discount_reason ? ` - ${tx.discount_reason}` : ''}`, `-${rupiah(tx.discount)}`) : ''}
    <div class="sep"></div>
    ${line('TOTAL', rupiah(tx.total), 'total')}
    ${line('Metode', METHOD_LABEL[tx.payment_method] || tx.payment_method)}
    ${line('Dibayar', rupiah(tx.amount_paid))}
    ${tx.payment_method === 'cash' ? line('Kembalian', rupiah(tx.change_due)) : ''}
    ${tx.status === 'void' ? `<div class="sep"></div><div class="center">** DIBATALKAN **</div><div class="center muted">${esc(tx.void_reason || '')}</div>` : ''}
    <div class="sep"></div>
    <div class="center muted">${esc(settings.receipt_footer || 'Terima kasih telah bermain!')}</div>
    ${settings.tax_note ? `<div class="center muted">${esc(settings.tax_note)}</div>` : ''}
  </div>
</body>
</html>`
}

function renderReceiptText(db, tx) {
  const { settings, session, items } = receiptRows(db, tx)
  const w = 32
  const center = (s) => s.padStart(Math.floor((w + s.length) / 2)).padEnd(w)
  const row = (l, r) => `${l}${' '.repeat(Math.max(1, w - l.length - r.length))}${r}`
  const out = []
  out.push(center(settings.business_name))
  if (settings.address) out.push(center(settings.address))
  if (settings.phone) out.push(center(settings.phone))
  out.push('-'.repeat(w))
  out.push(row('No', tx.number))
  out.push(row('Waktu', formatJakarta(tx.created_at, { dateStyle: 'short', timeStyle: 'short' })))
  out.push(row('Operator', tx.cashier_name || '-'))
  if (tx.customer_name) out.push(row('Pelanggan', tx.customer_name))
  if (tx.console_code) out.push(row('Unit', tx.console_code))
  if (session) out.push(row('Durasi', `${session.billed_minutes ?? session.planned_minutes} menit`))
  out.push('-'.repeat(w))
  for (const it of items) {
    out.push(it.description)
    out.push(row(`  ${it.qty} x ${rupiah(it.unitPrice)}`, rupiah(it.lineTotal)))
  }
  out.push('-'.repeat(w))
  out.push(row('Subtotal', rupiah(tx.subtotal)))
  if (tx.overtime_amount) out.push(row(`Overtime (${tx.overtime_minutes} mnt)`, rupiah(tx.overtime_amount)))
  if (tx.extra_charge) out.push(row('Biaya tambahan', rupiah(tx.extra_charge)))
  if (tx.discount) out.push(row('Diskon', `-${rupiah(tx.discount)}`))
  out.push(row('TOTAL', rupiah(tx.total)))
  out.push(row('Metode', METHOD_LABEL[tx.payment_method] || tx.payment_method))
  out.push(row('Dibayar', rupiah(tx.amount_paid)))
  if (tx.payment_method === 'cash') out.push(row('Kembalian', rupiah(tx.change_due)))
  out.push('-'.repeat(w))
  out.push(center(settings.receipt_footer || 'Terima kasih telah bermain!'))
  return out.join('\n')
}

export default function transactionsRoutes(db) {
  const r = Router()
  // Money history is operator-only.
  r.use(requireAuth, requireSuperAdmin)

  r.get('/', (req, res) => {
    const { from, to, method, status, q } = req.query
    const page = Math.max(1, parseInt(req.query.page, 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20))
    const where = []
    const params = []
    if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) { where.push('created_at >= ?'); params.push(jakartaDayRangeUtc(from).startIso) }
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) { where.push('created_at <= ?'); params.push(jakartaDayRangeUtc(to).endIso) }
    if (['cash', 'transfer', 'qris'].includes(method)) { where.push('payment_method = ?'); params.push(method) }
    if (status === 'void') where.push("status = 'void'")
    else if (status === 'completed') where.push("status = 'completed'")
    else if (status === 'unpaid') where.push("payment_status = 'unpaid'")
    else if (status === 'paid') where.push("payment_status = 'paid'")
    if (q) { where.push("(number LIKE ? ESCAPE '\\' OR customer_name LIKE ? ESCAPE '\\' OR console_code LIKE ? ESCAPE '\\')"); params.push(likePattern(q), likePattern(q), likePattern(q)) }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const aggParams = [...params]
    const agg = db.prepare(
      `SELECT COUNT(*) AS count,
              IFNULL(SUM(CASE WHEN status != 'void' THEN total ELSE 0 END), 0) AS gross,
              IFNULL(SUM(CASE WHEN status != 'void' AND payment_status = 'paid' THEN total ELSE 0 END), 0) AS paid,
              IFNULL(SUM(CASE WHEN status != 'void' AND payment_status = 'unpaid' THEN total ELSE 0 END), 0) AS outstanding
         FROM transactions ${whereSql}`,
    ).get(...aggParams)

    const total = agg.count
    const rows = db.prepare(
      `SELECT * FROM transactions ${whereSql} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    ).all(...params, limit, (page - 1) * limit)

    return ok(res, {
      items: rows.map(mapTransaction),
      totals: { count: agg.count, gross: agg.gross, paid: agg.paid, outstanding: agg.outstanding },
    }, { page, limit, total, totalPages: Math.ceil(total / limit) || 1 })
  })

  r.get('/:id', (req, res) => {
    const id = parse(idParam, req.params.id)
    const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id)
    if (!tx) throw new AppError(404, 'TRANSACTION_NOT_FOUND')
    const session = tx.session_id ? db.prepare('SELECT * FROM rental_sessions WHERE id = ?').get(tx.session_id) : null
    const consoleRow = tx.console_id ? db.prepare('SELECT * FROM consoles WHERE id = ?').get(tx.console_id) : null
    const cashier = tx.cashier_id ? db.prepare('SELECT * FROM users WHERE id = ?').get(tx.cashier_id) : null
    return ok(res, {
      transaction: mapTransaction(tx),
      items: itemsFor(db, id),
      session: session ? mapSession(session) : null,
      cashier: cashier ? mapUser(cashier) : null,
      console: consoleRow ? mapConsole(consoleRow) : null,
    })
  })

  r.get('/:id/receipt', (req, res) => {
    const id = parse(idParam, req.params.id)
    const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id)
    if (!tx) throw new AppError(404, 'TRANSACTION_NOT_FOUND')
    if (req.query.format === 'html') {
      res.type('html').send(renderReceiptHtml(db, tx, { print: req.query.print === '1' }))
      return
    }
    res.type('text/plain; charset=utf-8').send(renderReceiptText(db, tx))
  })

  r.post('/:id/void', (req, res) => {
    const id = parse(idParam, req.params.id)
    const body = parse(voidSchema, req.body)
    withTx(db, () => {
      const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id)
      if (!tx) throw new AppError(404, 'TRANSACTION_NOT_FOUND')
      if (tx.status === 'void') throw new AppError(409, 'ALREADY_VOID')
      const now = nowIso()
      db.prepare(
        `UPDATE transactions
            SET status = 'void', payment_status = 'void', void_reason = ?, void_by = ?, voided_at = ?
          WHERE id = ?`,
      ).run(body.reason, req.user.id, now, id)
      logAudit(db, {
        actorId: req.user.id, actorName: req.user.full_name, action: 'transaction_voided',
        entity: 'transactions', entityId: id,
        description: `Transaksi ${tx.number} dibatalkan - ${body.reason}`,
        meta: { reason: body.reason, total: tx.total },
      })
    })
    return ok(res, { transaction: mapTransaction(db.prepare('SELECT * FROM transactions WHERE id = ?').get(id)) })
  })

  return r
}
