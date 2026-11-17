<script setup lang="ts">
import { AppWindow, ListFilter, Plus, TriangleAlert } from '@lucide/vue'
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  type PageHeaderAction,
  Select,
  Table,
  type TableColumn,
  type TableSort,
} from '@thekestongroup/ui'
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import FilterCard from '../components/FilterCard.vue'
import RequestSettingsCard from '../components/RequestSettingsCard.vue'
import { api, type AppAccess, type AppInfo, type AppMode } from '../lib/api'
import { useListQuery } from '../lib/listQuery'

const { t } = useI18n()

/**
 * The organisation's apps: Keston's, other publishers' and its own, with the
 * organisation's default state for each (Enabled, Disabled or Forced).
 * Everything else about an app (who has it, rules, settings) is on the app's
 * own page. Filters and sort are in the URL and applied here (there are few
 * apps).
 */
const route = useRoute()
const orgId = route.params.orgId as string

const data = ref<AppAccess>()
const loading = ref(true)
const error = ref<string>()

onMounted(async () => {
  try {
    data.value = await api.apps(orgId)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
})

// ── Filters and sort: in the URL ─────────────────────────────────────────────

const list = useListQuery({ q: 'one', publisher: 'many', state: 'many', type: 'many', sort: 'one', dir: 'one' }, ['sort', 'dir', 'q'])
const filters = list.values
const many = (k: 'publisher' | 'state' | 'type') => (filters.value[k] as string[]) ?? []
const filterCount = computed(() => list.active.value + (filters.value.q ? 1 : 0))
const showFilters = ref(filterCount.value > 0 || !!filters.value.sort)

const UNSET = 'unset'
/** What the app is for the organisation: its default, or what it is without one. */
const stateOf = (a: AppInfo): AppMode | typeof UNSET => a.defaultMode || a.fallback || UNSET

const publisherOptions = computed(() => [
  { label: t('apps.publisher.keston'), value: 'keston' },
  { label: t('apps.publisher.organisation'), value: 'organisation' },
  { label: t('apps.publisher.other'), value: 'other' },
])
const stateOptions = computed(() => [
  { label: t('apps.mode.enabled'), value: 'enabled' },
  { label: t('apps.mode.disabled'), value: 'disabled' },
  { label: t('apps.mode.forced'), value: 'forced' },
  { label: t('apps.notSetShort'), value: UNSET },
])
const typeOptions = computed(() => [
  { label: t('apps.type.web'), value: 'web' },
  { label: t('apps.type.native'), value: 'native' },
  { label: t('apps.type.saml'), value: 'saml' },
])
const sortOptions = computed(() => [
  { label: t('apps.columns.app'), value: 'name' },
  { label: t('apps.columns.publisher'), value: 'publisher' },
  { label: t('apps.columns.type'), value: 'type' },
  { label: t('apps.columns.state'), value: 'state' },
  { label: t('apps.columns.rules'), value: 'rules' },
])

const STATE_ORDER: Record<string, number> = { forced: 0, enabled: 1, disabled: 2, [UNSET]: 3 }
const sortValue: Record<string, (a: AppInfo) => string | number> = {
  name: (a) => a.name.toLowerCase(),
  publisher: (a) => a.publisher.toLowerCase(),
  type: (a) => a.type,
  state: (a) => STATE_ORDER[stateOf(a)] ?? 9,
  rules: (a) => a.ruleCount,
}
const sortKey = computed(() => {
  const s = filters.value.sort as string | undefined
  return s && s in sortValue ? s : 'name'
})

const apps = computed(() => {
  const q = ((filters.value.q as string | undefined) ?? '').toLowerCase()
  const dir = filters.value.dir === 'desc' ? -1 : 1
  const get = sortValue[sortKey.value]!
  return (data.value?.apps ?? [])
    .filter(
      (a) =>
        (!q || a.name.toLowerCase().includes(q) || a.publisher.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)) &&
        (!many('publisher').length || many('publisher').includes(a.publisherKind)) &&
        (!many('state').length || many('state').includes(stateOf(a))) &&
        (!many('type').length || many('type').includes(a.type)),
    )
    .sort((x, y) => {
      const a = get(x)
      const b = get(y)
      return (a < b ? -1 : a > b ? 1 : x.name.localeCompare(y.name)) * dir
    })
})

// The table's own column sort is the same ?sort=&dir=.
const columnOf: Record<string, string> = { rules: 'ruleCount' }
const sortOf: Record<string, string> = { ruleCount: 'rules' }
const tableSort = computed<TableSort | null>(() => {
  const s = filters.value.sort as string | undefined
  return s ? { key: columnOf[s] ?? s, direction: filters.value.dir === 'desc' ? 'desc' : 'asc' } : null
})
function setTableSort(s: TableSort | null) {
  list.set({ sort: s ? (sortOf[s.key] ?? s.key) : undefined, dir: s && s.direction === 'desc' ? 'desc' : undefined })
}

const toolbar = computed<PageHeaderAction[]>(() => [
  {
    label: filterCount.value ? t('listFilters.filterAndSortCount', { count: filterCount.value }) : t('listFilters.filterAndSort'),
    icon: ListFilter,
    onSelect: () => (showFilters.value = !showFilters.value),
  },
  { label: t('apps.addApp'), icon: Plus, to: `/organisations/${orgId}/apps/new` },
  ...(data.value?.canManageKeston ? [{ label: t('apps.addKestonApp'), icon: Plus, to: `/organisations/${orgId}/apps/new/keston` }] : []),
])

const columns = computed<TableColumn<AppInfo>[]>(() => [
  { key: 'name', label: t('apps.columns.app'), rowHeader: true, sortable: true },
  { key: 'publisher', label: t('apps.columns.publisher'), sortable: true },
  { key: 'type', label: t('apps.columns.type'), sortable: true },
  { key: 'state', label: t('apps.columns.state'), sortable: true, sortValue: (a) => STATE_ORDER[stateOf(a)] ?? 9 },
  { key: 'ruleCount', label: t('apps.columns.rules'), align: 'end', sortable: true },
])

const stateColor = { forced: 'primary', enabled: 'green', disabled: 'red' } as const
</script>

<template>
  <div class="flex max-w-4xl flex-col gap-3 p-4 sm:p-6">
    <PageHeader :title="t('nav.apps')" :description="t('apps.description')" :toolbar="toolbar" :link-component="RouterLink" />

    <FilterCard
      v-if="showFilters && !error"
      :q="filters.q as string | undefined"
      :sort="filters.sort as string | undefined"
      :dir="filters.dir as string | undefined"
      :active="filterCount"
      :sort-options="sortOptions"
      :search-label="t('apps.search')"
      @update:q="list.set({ q: $event })"
      @update:sort="list.set({ sort: $event })"
      @update:dir="list.set({ dir: $event === 'asc' ? undefined : $event })"
      @clear="list.clear(); list.set({ q: undefined })"
    >
      <Select :model-value="many('publisher')" :label="t('apps.columns.publisher')" :options="publisherOptions" :placeholder="t('apps.anyPublisher')" multiple @update:model-value="list.set({ publisher: ($event as string[]) })" />
      <Select :model-value="many('state')" :label="t('apps.columns.state')" :options="stateOptions" :placeholder="t('apps.anyState')" multiple @update:model-value="list.set({ state: ($event as string[]) })" />
      <Select :model-value="many('type')" :label="t('apps.columns.type')" :options="typeOptions" :placeholder="t('apps.anyType')" multiple @update:model-value="list.set({ type: ($event as string[]) })" />
    </FilterCard>

    <RequestSettingsCard v-if="data" :org-id="orgId" :apps="data.apps" />

    <Card v-if="error">
      <EmptyState :icon="TriangleAlert" :title="t('apps.couldntLoad')" :description="error" />
    </Card>
    <Card v-else padding="none">
      <Table
        :columns="columns"
        :rows="apps"
        row-key="id"
        :loading="loading"
        :caption="t('nav.apps')"
        :row-link="(row: AppInfo) => `/organisations/${orgId}/apps/${row.id}`"
        :link-component="RouterLink"
        manual-sort
        :sort="tableSort"
        @update:sort="setTableSort"
      >
        <template #cell-name="{ row }">
          {{ (row as AppInfo).name }}
          <Badge v-if="(row as AppInfo).retired" size="sm" class="ml-1">{{ t('apps.retiredBadge') }}</Badge>
        </template>
        <template #cell-publisher="{ row }">{{ (row as AppInfo).publisher }}</template>
        <template #cell-type="{ row }">{{ t(`apps.type.${(row as AppInfo).type}`) }}</template>
        <template #cell-state="{ row }">
          <Badge v-if="stateOf(row as AppInfo) !== UNSET" size="sm" :color="stateColor[stateOf(row as AppInfo) as AppMode]">
            {{ t(`apps.mode.${stateOf(row as AppInfo)}`) }}
          </Badge>
          <span v-else class="text-black/65">{{ t('apps.notSetShort') }}</span>
        </template>
        <template #empty>
          <EmptyState
            size="sm"
            :icon="AppWindow"
            :title="filterCount ? t('apps.noMatch') : t('apps.none')"
            :description="filterCount ? t('apps.noMatchDescription') : t('apps.noneDescription')"
            class="p-0"
          />
        </template>
      </Table>
    </Card>
  </div>
</template>
