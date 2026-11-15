/**
 * Suggesting a new user's username from their name, the way their
 * organisation chose (Settings → Username format).
 */
export type UsernameFormat = 'first.last' | 'firstlast' | 'f.last' | 'flast' | 'first.l' | 'last.first'

export const usernameFormats: { value: UsernameFormat; label: string; example: string }[] = [
  { value: 'first.last', label: 'First name, dot, last name', example: 'jo.bloggs' },
  { value: 'firstlast', label: 'First name and last name', example: 'jobloggs' },
  { value: 'f.last', label: 'First initial, dot, last name', example: 'j.bloggs' },
  { value: 'flast', label: 'First initial and last name', example: 'jbloggs' },
  { value: 'first.l', label: 'First name, dot, last initial', example: 'jo.b' },
  { value: 'last.first', label: 'Last name, dot, first name', example: 'bloggs.jo' },
]

/** A name part in the characters a username allows: accents dropped, lowercase letters and numbers. */
const part = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')

/** e.g. ("f.last", "Zoë", "O'Brien") → "z.obrien". Empty parts are left out. */
export function suggestUsername(format: UsernameFormat | undefined, first: string, last: string): string {
  const f = part(first)
  const l = part(last)
  const join = (...xs: string[]) => xs.filter(Boolean).join('.')
  switch (format) {
    case 'firstlast':
      return f + l
    case 'f.last':
      return join(f.slice(0, 1), l)
    case 'flast':
      return f.slice(0, 1) + l
    case 'first.l':
      return join(f, l.slice(0, 1))
    case 'last.first':
      return join(l, f)
    default:
      return join(f, l)
  }
}
