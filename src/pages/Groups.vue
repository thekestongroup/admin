<script setup lang="ts">
import { ListFilter, TriangleAlert, UsersRound } from '@lucide/vue'
import {
  Badge,
  Card,
  EmptyState,
  InputNumber,
  PageHeader,
  type PageHeaderAction,
  Select,
  Table,
  type TableColumn,
  type TableSort,
} from '@thekestongroup/ui'
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import FilterCard from '../components/FilterCard.vue'
import GroupBulkActions from '../components/GroupBulkActions.vue'
import NewGroupSlideover from '../components/NewGroupSlideover.vue'
import { api, type Group, type GroupListQuery, type PermissionId } from '../lib/api'
import { useListQuery } from '../lib/listQuery'

const { t } = useI18n()

/**
 * An organisation's groups, e.g. Sales or Office: used to set app access per
 * group. The action bar has New group, filter and sort; tick groups to change
 * who's in them all at once. Filters and sort are in the URL.
 */
const route = useRoute()
const orgId = route.params.orgId as string
const path = route.path
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

const groups = ref<Group[]>([])
const permissions = ref<PermissionId[]>([])
const loading = ref(true)
const loadError = ref<string>()
const has = (p: PermissionId) => permissions.value.includes(p)
const canCreate = computed(() => has('groups.manage'))
const canManage = computed(() => has('users.view') && (has('groups.manage') || has('permissions.assign')))

// ── Filters and sort: in the URL, applied by Keston ID ───────────────────────

const ALL = 'all'
const list = useListQuery({ q: 'one', members: 'one', permissions: 'one', sort: 'one', dir: 'one' }, ['sort', 'dir', 'q'])
const filters = list.values
const filterCount = computed(() => list.active.value + (filters.value.q ? 1 : 0))
const filtered = computed(() => filterCount.value > 0)
const showFilters = ref(filterCount.value > 0 || !!filters.value.sort)

const query = computed<GroupListQuery>(() => ({
  q: filters.value.q as string | undefined,
  members: filters.value.members as string | undefined,
  permissions: filters.value.permissions as GroupListQuery['permissions'],
  sort: filters.value.sort as GroupListQuery['sort'],
  dir: filters.value.dir as GroupListQuery['dir'],
}))

// Member count: a comparison and a number, ?members=gt:12.
const OPS = ['gt', 'gte', 'eq', 'lte', 'lt'] as const
const memberOps = computed(() => [
  { label: t('groups.anyCount'), value: ALL },
  ...OPS.map((op) => ({ label: t(`groups.ops.${op}`), value: op })),
])
const members = computed(() => {
  const [op, n] = ((filters.value.members as string | undefined) ?? '').split(':')
  return { op: OPS.includes(op as (typeof OPS)[number]) ? op : ALL, n: n === undefined || n === '' ? undefined : Number(n) }
})
function setMembers(op: string, n: number | undefined) {
  list.set({ members: op === ALL ? undefined : `${op}:${n ?? 0}` })
}

const permissionOptions = computed(() => [
  { label: t('groups.permissionsAny'), value: ALL },
  { label: t('groups.permissionsYes'), value: 'yes' },
  { label: t('groups.permissionsNo'), value: 'no' },
])
const sortOptions = computed(() => [
  { label: t('groups.columns.group'), value: 'name' },
  { label: t('groups.columns.users'), value: 'members' },
  { label: t('groups.columns.permissions'), value: 'permissions' },
  { label: t('groups.columns.created'), value: 'created' },
])

// The table's column sort is the same ?sort=&dir= (its keys: name, permissions, memberCount).
const columnOf: Record<string, string> = { members: 'memberCount' }
const sortOf: Record<string, string> = { memberCount: 'members' }
const tableSort = computed<TableSort | null>(() => {
  const s = filters.value.sort as string | undefined
  return s ? { key: columnOf[s] ?? s, direction: filters.value.dir === 'desc' ? 'desc' : 'asc' } : null
})
function setTableSort(s: TableSort | null) {
  list.set({ sort: s ? (sortOf[s.key] ?? s.key) : undefined, dir: s && s.direction === 'desc' ? 'desc' : undefined })
}

let latest = 0
async function load() {
  const n = ++latest
  const result = await api.groups(orgId, query.value)
  if (n !== latest) return
  groups.value = result
  const ids = new Set(result.map((g) => g.id))
  selected.value = selected.value.filter((id) => ids.has(id as string))
}

onMounted(async () => {
  try {
    const o = await api.organisation(orgId)
    permissions.value = o.permissions ?? []
    await load()
  } catch (e) {
    loadError.value = message(e)
  } finally {
    loading.value = false
  }
})

watch(query, async () => {
  if (route.path !== path) return // leaving the page
  loading.value = true
  try {
    await load()
    loadError.value = undefined
  } catch (e) {
    loadError.value = message(e)
  } finally {
    loading.value = false
  }
})

// ── Selecting groups, for bulk actions ──────────────────────────────────────

const selected = ref<(string | number)[]>([])
const selectedGroups = computed(() => groups.value.filter((g) => selected.value.includes(g.id)))
async function bulkDone() {
  selected.value = []
  await load()
}
// ?new=1 (the dashboard's New group) opens the form.
const creating = ref(route.query.new === '1')
const bulk = ref<InstanceType<typeof GroupBulkActions>>()

/** The action bar: filter and sort, then New group, or what can be done to the selection. */
const toolbar = computed<PageHeaderAction[]>(() => [
  {
    label: filterCount.value ? t('listFilters.filterAndSortCount', { count: filterCount.value }) : t('listFilters.filterAndSort'),
    icon: ListFilter,
    onSelect: () => (showFilters.value = !showFilters.value),
  },
  ...(bulk.value?.actions ?? []),
])

const columns = computed<TableColumn<Group>[]>(() => [
  { key: 'name', label: t('groups.columns.group'), rowHeader: true, sortable: true },
  { key: 'permissions', label: t('groups.columns.permissions'), sortable: true, sortValue: (g) => g.permissions.length },
  { key: 'memberCount', label: t('groups.columns.users'), align: 'end', sortable: true },
])
</script>

<template>
  <div class="flex max-w-4xl flex-col gap-3 p-4 sm:p-6">
    <PageHeader :title="t('groups.title')" :description="t('groups.description')" :toolbar="toolbar">
      <template v-if="bulk?.count" #toolbar-start>{{ bulk.count }}</template>
    </PageHeader>
    <GroupBulkActions
      v-if="!loadError"
      ref="bulk"
      :org-id="orgId"
      :selected="selectedGroups"
      :can-create="canCreate"
      :can-manage="canManage"
      @new="creating = true"
      @clear="selected = []"
      @done="bulkDone"
    />

    <FilterCard
      v-if="showFilters && !loadError"
      :q="filters.q as string | undefined"
      :sort="filters.sort as string | undefined"
      :dir="filters.dir as string | undefined"
      :active="filterCount"
      :sort-options="sortOptions"
      :search-label="t('groups.search')"
      @update:q="list.set({ q: $event })"
      @update:sort="list.set({ sort: $event })"
      @update:dir="list.set({ dir: $event === 'asc' ? undefined : $event })"
      @clear="list.clear(); list.set({ q: undefined })"
    >
      <Select :model-value="members.op" :label="t('groups.columns.users')" :options="memberOps" @update:model-value="setMembers(String($event), members.n)" />
      <InputNumber
        v-if="members.op !== ALL"
        :model-value="members.n"
        :label="t('groups.memberNumber')"
        :min="0"
        @update:model-value="setMembers(members.op, $event)"
      />
      <Select
        :model-value="(filters.permissions as string | undefined) ?? ALL"
        :label="t('groups.columns.permissions')"
        :options="permissionOptions"
        @update:model-value="list.set({ permissions: $event === ALL ? undefined : String($event) })"
      />
    </FilterCard>

    <Card v-if="loadError">
      <EmptyState :icon="TriangleAlert" :title="t('groups.couldntLoad')" :description="loadError" />
    </Card>
    <Card v-else padding="none">
      <Table
        :columns="columns"
        :rows="groups"
        row-key="id"
        :loading="loading"
        :caption="t('groups.title')"
        :row-link="(row: Group) => `/organisations/${orgId}/groups/${row.id}`"
        :link-component="RouterLink"
        :selectable="canManage"
        :row-label="(row: Group) => t('groups.select', { name: row.name })"
        v-model:selected="selected"
        manual-sort
        :sort="tableSort"
        @update:sort="setTableSort"
      >
        <template #cell-permissions="{ row }">
          <Badge v-if="(row as Group).permissions.length" color="primary" size="sm">
            {{ t('groups.permissionCount', (row as Group).permissions.length) }}
          </Badge>
          <span v-else class="text-black/65">{{ t('common.none') }}</span>
        </template>
        <template #empty>
          <EmptyState
            size="sm"
            :icon="UsersRound"
            :title="filtered ? t('groups.noMatch') : t('groups.none')"
            :description="filtered ? t('groups.noMatchDescription') : t('groups.noneDescription')"
            class="p-0"
          />
        </template>
      </Table>
    </Card>

    <NewGroupSlideover v-model:open="creating" :org-id="orgId" />
  </div>
</template>
