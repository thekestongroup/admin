import type { PasswordPolicy } from './api'

/** What an organisation sets: the rules, without the banned phrases. */
export type PolicyRules = Pick<PasswordPolicy, 'minLength' | 'minUppercase' | 'minLowercase' | 'minDigits' | 'minSpecial'>
export type RuleKey = keyof PolicyRules
export type PresetId = 'baseline' | 'recommended' | 'strict'

export const BASELINE_MIN = 8
export const MAX_LENGTH = 128
export const MAX_COUNT = 32

/** The kinds of character that can be required. */
export const KINDS = ['minUppercase', 'minLowercase', 'minDigits', 'minSpecial'] as const

/** Presets set the rules only, never the banned phrases. */
export const PRESETS: Record<PresetId, PolicyRules> = {
  baseline: { minLength: 8, minUppercase: 0, minLowercase: 0, minDigits: 0, minSpecial: 0 },
  recommended: { minLength: 12, minUppercase: 0, minLowercase: 0, minDigits: 1, minSpecial: 0 },
  strict: { minLength: 14, minUppercase: 1, minLowercase: 1, minDigits: 1, minSpecial: 1 },
}

/** The characters the kinds required add up to. */
export const requiredTotal = (p: PolicyRules) => KINDS.reduce((sum, k) => sum + (p[k] || 0), 0)

/**
 * The shortest password that can meet the policy: at least the minimum
 * length, the baseline, and as many characters as the requirements add up
 * to (e.g. 2 + 2 + 2 + 2 can't be done in fewer than 8). The server applies
 * the same rule when saving.
 */
export const effectiveMinLength = (p: PolicyRules) =>
  Math.min(MAX_LENGTH, Math.max(p.minLength || 0, BASELINE_MIN, requiredTotal(p)))

/** The preset these rules are exactly, or custom. Banned phrases don't count. */
export function matchPreset(p: PolicyRules): PresetId | 'custom' {
  const eff = { ...p, minLength: effectiveMinLength(p) }
  for (const [id, preset] of Object.entries(PRESETS) as [PresetId, PolicyRules][]) {
    if ((Object.keys(preset) as RuleKey[]).every((k) => eff[k] === preset[k])) return id
  }
  return 'custom'
}

/** Trimmed, no blanks, no repeats (ignoring capitals), in the order typed. */
export function parsePhrases(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const line of text.split(/\r?\n/)) {
    const phrase = line.trim()
    if (phrase && !seen.has(phrase.toLowerCase())) {
      seen.add(phrase.toLowerCase())
      out.push(phrase)
    }
  }
  return out
}

/** Phrases as the server keeps them (lowercase, unique), for telling whether the list changed. */
export const phraseKey = (phrases: string[]) =>
  [...new Set(phrases.map((p) => p.trim().toLowerCase()).filter(Boolean))].sort().join('\n')

export interface Counts {
  length: number
  upper: number
  lower: number
  digits: number
  special: number
}

/** The same counting as the server: letters by case, digits, anything else but spaces is special. */
export function count(password: string): Counts {
  const c: Counts = { length: 0, upper: 0, lower: 0, digits: 0, special: 0 }
  for (const ch of password) {
    c.length++
    if (/\p{Lu}/u.test(ch)) c.upper++
    else if (/\p{Ll}/u.test(ch)) c.lower++
    else if (/\p{Nd}/u.test(ch)) c.digits++
    else if (!/\s/u.test(ch)) c.special++
  }
  return c
}

/**
 * Whether the password is one of the organisation's banned phrases, as the
 * server checks: the whole password, or with numbers and symbols taken off
 * the end ("Wessex2024!" is "wessex"). Ignores capitals.
 */
export function bannedPhrase(password: string, phrases: string[]): string | undefined {
  const lower = password.trim().toLowerCase()
  const stem = lower.replace(/[^\p{L}]+$/u, '')
  const list = phrases.map((p) => p.trim().toLowerCase())
  for (const candidate of [lower, stem]) {
    if (candidate && list.includes(candidate)) return candidate
  }
  return undefined
}
