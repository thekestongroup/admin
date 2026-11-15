/**
 * Suggesting a new user's username from their name with their
 * organisation's formula (Settings → Username format). The same rules as
 * Keston ID (store/usernames.go):
 *   {first} {last}   their first or last name
 *   {first:2}        its first 2 characters
 *   {last:-3}        its last 3 characters
 * with letters, numbers, dots, dashes and underscores as they are.
 */
export const DEFAULT_FORMULA = '{first}.{last}'

const token = /\{(first|last)(?::(-?[1-9][0-9]?))?\}/g

/** A name in the characters a username allows: accents dropped, lowercase letters and numbers. */
const part = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')

/** e.g. ("{first:1}.{last}", "Zoë", "O'Brien") → "z.obrien". */
export function suggestUsername(formula: string | undefined, first: string, last: string): string {
  const parts: Record<string, string> = { first: part(first), last: part(last) }
  const out = (formula || DEFAULT_FORMULA).replace(token, (_m, which: string, n?: string) => {
    const v = parts[which] ?? ''
    if (!n) return v
    const k = Number(n)
    if (k > 0 && k < v.length) return v.slice(0, k)
    if (k < 0 && -k < v.length) return v.slice(k)
    return v
  })
  return out.replace(/[._-]{2,}/g, (s) => s[0]!).replace(/^[._-]+|[._-]+$/g, '')
}

/** What's wrong with a formula, or undefined if it's usable (as Keston ID checks it). */
export function checkFormula(f: string): string | undefined {
  if (!f.trim() || f.length > 100) return 'Enter a formula, e.g. {first}.{last}'
  if (!new RegExp(token.source).test(f)) return 'Use {first} or {last} at least once'
  const rest = f.replace(token, '')
  if (/[{}]/.test(rest)) return 'Use {first}, {last}, {first:2} (first 2 characters) or {last:-2} (last 2)'
  if (!/^[a-z0-9._-]*$/.test(rest)) return 'Between them, use only lowercase letters, numbers, dots, dashes or underscores'
  return undefined
}
