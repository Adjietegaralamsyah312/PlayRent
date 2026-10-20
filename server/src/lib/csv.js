// RFC-4180 CSV with UTF-8 BOM so Excel reads Indonesian text correctly.

// OWASP: a cell that starts with one of these is executed as a formula by
// Excel/Sheets/LibreOffice when the file is opened. Customer names are
// attacker-controlled, so every exported string gets a leading apostrophe.
const FORMULA_START = /^[=+\-@\t\r]/

export function toCsv(rows, columns) {
  const escapeCell = (value) => {
    if (value == null) return ''
    // A real number is never a formula; only strings (and other text) are.
    const isNumber = typeof value === 'number' && Number.isFinite(value)
    let s = String(value)
    if (!isNumber && FORMULA_START.test(s)) s = `'${s}`
    if (/[",\n\r]/.test(s) || /^\s|\s$/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const valueOf = (col, row) => (typeof col.value === 'function' ? col.value(row) : row[col.key])
  const header = columns.map((c) => escapeCell(c.label)).join(',')
  const body = rows.map((row) => columns.map((c) => escapeCell(valueOf(c, row))).join(',')).join('\r\n')
  return `\uFEFF${header}\r\n${body ? `${body}\r\n` : ''}`
}
