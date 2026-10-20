// RFC-4180 CSV with UTF-8 BOM so Excel reads Indonesian text correctly.
export function toCsv(rows, columns) {
  const escapeCell = (value) => {
    const s = value == null ? '' : String(value)
    if (/[",\n\r]/.test(s) || /^\s|\s$/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const valueOf = (col, row) => (typeof col.value === 'function' ? col.value(row) : row[col.key])
  const header = columns.map((c) => escapeCell(c.label)).join(',')
  const body = rows.map((row) => columns.map((c) => escapeCell(valueOf(c, row))).join(',')).join('\r\n')
  return `\uFEFF${header}\r\n${body ? `${body}\r\n` : ''}`
}
