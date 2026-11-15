import type { BulkResult } from './api'

/** Saves name, email and new password for each user that has one, as a CSV. */
export function downloadCsv(results: BulkResult[]) {
  const cell = (v: string) => (/[",\n\r]/.test(v) || /^[=+\-@]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const rows = [['Name', 'Email', 'New password'], ...results.filter((r) => r.password).map((r) => [r.name, r.email, r.password!])]
  const blob = new Blob([rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `new-passwords-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
