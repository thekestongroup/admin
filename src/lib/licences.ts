import type { CheckboxOption } from '@thekestongroup/ui'
import type { Product } from './api'

type T = (key: string, named?: Record<string, unknown>) => string

/** No licences left for new users (full, or over allocation). Unlimited is never full. */
export const isFull = (p: Product) => !p.unlimited && (p.available ?? 0) <= 0

/** "2/4 licences available", "Unlimited licences available", or "0/4 available". */
export function availability(t: T, p: Product): string {
  if (p.unlimited || p.seats == null) return t('licences.availability.unlimited')
  if (isFull(p)) return t('licences.availability.full', { seats: p.seats })
  return t('licences.availability.some', { available: p.available ?? 0, seats: p.seats })
}

/** Why nothing more can be assigned ("" if something can). */
export function fullReason(t: T, p: Product): string {
  if (!isFull(p)) return ''
  return p.overAllocated ? t('licences.overAllocation', { used: p.assigned, seats: p.seats ?? 0 }) : t('licences.fullExplanation')
}

/**
 * A product as a checkbox: "From The Keston Group" and how many licences
 * are left. Disabled when there are none left to give, unless `keep` (they
 * have it already, so they can still be untoggled).
 */
export function licenceOption(t: T, p: Product, keep = false): CheckboxOption {
  const full = isFull(p) && !keep
  const parts = [t('licences.by', { publisher: p.publisher }), availability(t, p)]
  if (full) parts.push(fullReason(t, p))
  return { label: p.name, value: p.id, description: parts.join('. '), disabled: full }
}
