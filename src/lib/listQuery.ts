import { computed } from 'vue'
import { type LocationQueryValue, useRoute, useRouter } from 'vue-router'

/**
 * A list page's filters and sort, kept in the URL (?role=user,global_admin&sort=name&dir=desc)
 * so they survive a reload and can be linked to. Each filter is a single
 * value (a string) or several (a list, comma-separated in the URL).
 */
export type FilterKind = 'one' | 'many'

export function useListQuery<K extends string>(kinds: Record<K, FilterKind>, sortKeys: readonly string[] = []) {
  const route = useRoute()
  const router = useRouter()

  const first = (v: LocationQueryValue | LocationQueryValue[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? undefined

  /** What the URL says now. */
  const values = computed(() => {
    const out = {} as Record<K, string | string[] | undefined>
    for (const k of Object.keys(kinds) as K[]) {
      const raw = route.query[k]
      if (kinds[k] === 'many') {
        const all = (Array.isArray(raw) ? raw : [raw]).flatMap((v) => (v ?? '').split(','))
        out[k] = all.map((v) => v.trim()).filter(Boolean)
      } else out[k] = first(raw) || undefined
    }
    return out
  })

  /** Changes some of them (undefined, '' or an empty list clears one), keeping other query parameters. */
  function set(changes: Partial<Record<K, string | string[] | undefined>>) {
    const next: Record<string, unknown> = { ...route.query }
    for (const [k, v] of Object.entries(changes) as [string, string | string[] | undefined][]) {
      const value = Array.isArray(v) ? v.join(',') : v
      if (value === undefined || value === '') delete next[k]
      else next[k] = value
    }
    router.replace({ query: next as typeof route.query })
  }

  const filterKeys = (Object.keys(kinds) as K[]).filter((k) => !sortKeys.includes(k))

  /** Removes the filters (not the sort: sortKeys). */
  function clear() {
    set(Object.fromEntries(filterKeys.map((k) => [k, undefined])) as Partial<Record<K, undefined>>)
  }

  /** How many filters are set. */
  const active = computed(() => filterKeys.filter((k) => [values.value[k]].flat().filter(Boolean).length).length)

  return { values, set, clear, active }
}
