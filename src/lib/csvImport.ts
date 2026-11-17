import type { ProfileChanges } from './api'

/** Reads CSV text (quoted cells, "" for a quote, CRLF or LF) into rows of cells. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      cell = ''
      if (row.some((x) => x.trim())) rows.push(row)
      row = []
    } else cell += c
  }
  row.push(cell)
  if (row.some((x) => x.trim())) rows.push(row)
  return rows
}

export interface ImportedUser {
  first: string
  last: string
  username: string
  domain: string
  profile: ProfileChanges
}

const norm = (h: string) => h.trim().toLowerCase().replace(/[\s-]+/g, '_')

/** Header → built-in profile field. */
const FIELD: Record<string, 'jobTitle' | 'department' | 'office' | 'phone' | 'mobile' | 'employeeId' | 'managerEmail' | 'startDate'> = {
  job_title: 'jobTitle',
  title: 'jobTitle',
  department: 'department',
  office: 'office',
  location: 'office',
  phone: 'phone',
  mobile: 'mobile',
  employee_id: 'employeeId',
  staff_id: 'employeeId',
  manager: 'managerEmail',
  start_date: 'startDate',
}

/**
 * People from a CSV with a header row. Recognises first_name, last_name (or
 * name), username (or email), domain, the built-in profile columns above, and
 * any column whose heading is one of attributeKeys (a custom attribute).
 * Unknown columns are returned so they can be reported.
 */
export function usersFromCsv(text: string, attributeKeys: string[]): { users: ImportedUser[]; ignored: string[] } {
  const [head, ...body] = parseCsv(text)
  if (!head) return { users: [], ignored: [] }
  const cols = head.map(norm)
  const known = new Set([...Object.keys(FIELD), 'first_name', 'first', 'last_name', 'last', 'surname', 'name', 'username', 'email', 'domain', ...attributeKeys])
  const ignored = head.filter((_, i) => !known.has(cols[i]))
  const users = body.map((cells) => {
    const get = (...names: string[]) => {
      const i = cols.findIndex((c) => names.includes(c))
      return i < 0 ? '' : (cells[i] ?? '').trim()
    }
    let first = get('first_name', 'first')
    let last = get('last_name', 'last', 'surname')
    const full = get('name')
    if (!first && !last && full) [first, ...[last]] = [full.split(/\s+/)[0], full.split(/\s+/).slice(1).join(' ')]
    const email = get('email')
    const username = (get('username') || email.split('@')[0]).toLowerCase()
    const domain = (get('domain') || (email.includes('@') ? email.split('@')[1] : '')).toLowerCase()
    const profile: ProfileChanges = {}
    cols.forEach((c, i) => {
      const v = (cells[i] ?? '').trim()
      if (!v) return
      if (FIELD[c]) profile[FIELD[c]] = v
      else if (attributeKeys.includes(c)) (profile.attributes ??= {})[c] = v
    })
    return { first, last, username, domain, profile }
  })
  return { users, ignored }
}
