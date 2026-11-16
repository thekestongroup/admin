import { currentLocale, t } from '../i18n'
import type { BulkResult } from './api'

/**
 * New users' (or reset) details, to hand out: as a CSV file, or printed.
 * Name, email and, when they each have their own, password.
 */
function rows(results: BulkResult[]) {
  const withPasswords = results.some((r) => r.password)
  const header = withPasswords ? [t('common.name'), t('common.email'), t('password.label')] : [t('common.name'), t('common.email')]
  return [header, ...results.map((r) => (withPasswords ? [r.name, r.email, r.password ?? ''] : [r.name, r.email]))]
}

/** Saves them as a CSV. */
export function downloadUserDetails(results: BulkResult[]) {
  // Quoted when needed, and never starting like a spreadsheet formula.
  const cell = (v: string) => (/[",\n\r]/.test(v) || /^[=+\-@]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const blob = new Blob([rows(results).map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `user-details-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

/** Prints them as a plain table (passwords shown), from a hidden frame. */
export function printUserDetails(results: BulkResult[], title: string) {
  const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
  const [header, ...body] = rows(results)
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    body { font: 12pt system-ui, sans-serif; margin: 2cm; color: #000 }
    h1 { font-size: 16pt; margin: 0 0 4pt } p { margin: 0 0 12pt; color: #444 }
    table { border-collapse: collapse; width: 100% }
    th, td { border: 1px solid #999; padding: 6pt 8pt; text-align: left }
    td:nth-child(3) { font-family: ui-monospace, monospace }
    tr { break-inside: avoid }
  </style></head><body><h1>${esc(title)}</h1><p>${esc(t('userDetails.printed', { date: new Date().toLocaleString(currentLocale()) }))}</p>
  <table><thead><tr>${header.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${body
    .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table></body></html>`
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden'
  document.body.append(frame)
  const doc = frame.contentDocument!
  doc.open()
  doc.write(html)
  doc.close()
  const win = frame.contentWindow!
  win.addEventListener('afterprint', () => frame.remove())
  setTimeout(() => {
    win.focus()
    win.print()
  }, 50)
}
