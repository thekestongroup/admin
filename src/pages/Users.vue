<script setup lang="ts">
import { Ban, CircleCheck, KeyRound, ListFilter, Lock, ShieldCheck, TriangleAlert, Users } from '@lucide/vue'
import {
  Badge,
  Card,
  EmptyState,
  Menu,
  type MenuItem,
  PageHeader,
  type PageHeaderAction,
  Select,
  formatDateTime,
  Table,
  type TableColumn,
  type TableSort,
  useNotifications,
} from '@thekestongroup/ui'
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import AddUserSlideover from '../components/AddUserSlideover.vue'
import BulkActions from '../components/BulkActions.vue'
import FilterCard from '../components/FilterCard.vue'
import { useListQuery } from '../lib/listQuery'
import { api, type UserListQuery, loadMe, type Group, type Organisation, type PermissionId, type Product, type User, type AdminRole } from '../lib/api'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

/**
 * An organisation's users: add, reset a password, disable or enable; tick
 * several for bulk actions. Deleted users are on their own page.
 */
const route = useRoute()
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
const orgId = route.params.orgId as string
const path = route.path
const { notify } = useNotifications()

const org = ref<Organisation>()
const users = ref<User[]>([])
const myId = ref<string>()
const iAmGlobalAdmin = ref(false)
const iAmPlatformAdmin = ref(false)
const loading = ref(true)
const has = (p: PermissionId) => !!org.value?.permissions?.includes(p)

const loadError = ref<string>()

// ── Filters and sort: in the URL, applied by Keston ID ───────────────────────

const ALL = 'all'
const list = useListQuery(
  { q: 'one', role: 'many', status: 'many', licence: 'many', group: 'many', mfa: 'one', sort: 'one', dir: 'one' },
  ['sort', 'dir', 'q'],
)
const filters = list.values
const filterCount = computed(() => list.active.value + (filters.value.q ? 1 : 0))
const showFilters = ref(filterCount.value > 0 || !!filters.value.sort)
const filtered = computed(() => filterCount.value > 0)

const query = computed<UserListQuery>(() => ({
  q: filters.value.q as string | undefined,
  role: filters.value.role as string[],
  status: filters.value.status as UserListQuery['status'],
  licence: filters.value.licence as string[],
  group: filters.value.group as string[],
  mfa: filters.value.mfa as UserListQuery['mfa'],
  sort: filters.value.sort as UserListQuery['sort'],
  dir: filters.value.dir as UserListQuery['dir'],
}))

// The table's column sort is the same ?sort=&dir= (created has no column).
const tableSort = computed<TableSort | null>(() =>
  filters.value.sort ? { key: filters.value.sort as string, direction: filters.value.dir === 'desc' ? 'desc' : 'asc' } : null,
)
function setTableSort(s: TableSort | null) {
  list.set({ sort: s?.key, dir: s && s.direction === 'desc' ? 'desc' : undefined })
}

const roleOptions = computed(() => [
  { label: t('users.roleUser'), value: 'user' },
  { label: t('users.globalAdmin'), value: 'global_admin' },
  ...(iAmPlatformAdmin.value || filters.value.role?.includes('tkg_admin') ? [{ label: t('users.tkgAdmin'), value: 'tkg_admin' }] : []),
  ...roleCatalogue.value.map((r) => ({ label: r.label, value: r.id })),
])
const statusOptions = computed(() => ['active', 'locked', 'disabled'].map((v) => ({ label: t(`users.status.${v}`), value: v })))
const licenceOptions = computed(() => [
  ...products.value.map((p) => ({ label: p.name, value: p.id })),
  { label: t('users.noLicence'), value: 'none' },
])
const groupOptions = computed(() => groups.value.map((g) => ({ label: g.name, value: g.id })))
const mfaOptions = computed(() => [
  { label: t('users.mfaAny'), value: ALL },
  { label: t('users.mfaOn'), value: 'on' },
  { label: t('users.mfaOff'), value: 'off' },
])
const sortOptions = computed(() => [
  { label: t('users.columns.name'), value: 'name' },
  { label: t('users.columns.email'), value: 'email' },
  { label: t('users.columns.role'), value: 'role' },
  { label: t('users.columns.status'), value: 'status' },
  { label: t('users.columns.created'), value: 'created' },
])

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

// Filters change the URL, and so reload the users (the latest answer wins).
let latest = 0
async function load() {
  const n = ++latest
  const list = await api.users(orgId, query.value)
  if (n !== latest) return
  users.value = list
  const ids = new Set(users.value.filter(selectable).map((u) => u.id))
  selected.value = selected.value.filter((id) => ids.has(id))
}

onMounted(async () => {
  try {
    const [o, me] = await Promise.all([api.organisation(orgId), loadMe()])
    org.value = o
    myId.value = me.user.id
    iAmGlobalAdmin.value = me.user.role === 'global_admin' && me.organisation.id === orgId
    iAmPlatformAdmin.value = me.platformAdmin
    await Promise.all([load(), api.groups(orgId).then((g) => (groups.value = g))])
  } catch (e) {
    loadError.value = message(e)
  } finally {
    loading.value = false
  }
})

// ── Selecting users, for bulk actions ───────────────────────────────────────

const bulkPerms: PermissionId[] = ['users.reset_password', 'users.status', 'users.delete', 'groups.manage', 'permissions.assign']
const canBulk = computed(() => bulkPerms.some(has))
/** Only users you can change can be ticked. */
const selectable = (u: User) => !!u.canChange && !u.support
const selected = ref<string[]>([])
const groups = ref<Group[]>([])
const selectedUsers = computed(() => users.value.filter((u) => selected.value.includes(u.id)))
async function bulkDone() {
  selected.value = []
  await load()
}

const columns = computed<TableColumn<User>[]>(() => [
  { key: 'name', label: t('users.columns.name'), rowHeader: true, sortable: true },
  { key: 'email', label: t('users.columns.email'), sortable: true },
  { key: 'role', label: t('users.columns.role'), sortable: true },
  { key: 'licences', label: t('users.columns.licences') },
  { key: 'status', label: t('users.columns.status'), sortable: true },
  { key: 'actions', label: t('common.actions'), hideLabel: true, align: 'end' },
])

// ── Add a user ──────────────────────────────────────────────────────────

const adding = ref(false)
const bulk = ref<InstanceType<typeof BulkActions>>()

// Role names, for the Role column.
const roleCatalogue = ref<AdminRole[]>([])
const roleName = (id: string) => roleCatalogue.value.find((r) => r.id === id)?.label ?? id
onMounted(async () => {
  roleCatalogue.value = await api.roles(orgId).catch(() => [])
})

// Product names, for the Licences column.
const products = ref<Product[]>([])
const productName = (id: string) => products.value.find((p) => p.id === id)?.name ?? id
onMounted(async () => {
  products.value = await api.products(orgId).catch(() => [])
})

/** The action bar: filter and sort, then add users, or what can be done to the selection. */
const toolbar = computed<PageHeaderAction[]>(() => [
  {
    label: filterCount.value ? t('listFilters.filterAndSortCount', { count: filterCount.value }) : t('listFilters.filterAndSort'),
    icon: ListFilter,
    onSelect: () => (showFilters.value = !showFilters.value),
  },
  ...(bulk.value?.actions ?? []),
])

// ── Block or unblock sign-in ────────────────────────────────────────────────

/** A row's menu: what you can do to them. */
function rowActions(row: User): MenuItem[] {
  const out: MenuItem[] = []
  if (has('users.reset_password')) out.push({ label: t('users.resetPassword'), icon: KeyRound, onSelect: () => bulk.value?.open('reset-password', row) })
  if (row.id !== myId.value && has('users.status'))
    out.push(
      row.status === 'active'
        ? { label: t('users.blockSignIn'), icon: Ban, onSelect: () => toggle(row) }
        : { label: t('users.unblockSignIn'), icon: CircleCheck, onSelect: () => toggle(row) },
    )
  return out
}

async function toggle(a: User) {
  const status = a.status === 'active' ? 'disabled' : 'active'
  try {
    await api.setStatus(orgId, a.id, status)
    await load()
    notify({
      type: 'success',
      title: status === 'disabled' ? t('users.signInBlocked') : t('users.signInUnblocked'),
      description: status === 'disabled' ? t('users.signInBlockedDescription', { name: a.name }) : t('users.signInUnblockedDescription', { name: a.name }),
    })
  } catch (e) {
    notify({ type: 'error', title: t('users.couldntChange'), description: message(e) })
  }
}
</script>

<template>
  <div class="flex flex-col gap-3 p-4 sm:p-6">
    <PageHeader :title="t('users.title')" :toolbar="toolbar" :link-component="RouterLink">
      <template v-if="bulk?.count" #toolbar-start>{{ bulk.count }}</template>
    </PageHeader>
    <BulkActions
      v-if="!loadError"
      ref="bulk"
      :org-id="orgId"
      :selected="selectedUsers"
      :groups="groups"
      :can="has"
      @add="adding = true"
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
      :search-label="t('users.search')"
      @update:q="list.set({ q: $event })"
      @update:sort="list.set({ sort: $event })"
      @update:dir="list.set({ dir: $event === 'asc' ? undefined : $event })"
      @clear="list.clear(); list.set({ q: undefined })"
    >
      <Select :model-value="filters.role" multiple :label="t('users.columns.role')" :placeholder="t('users.anyRole')" :options="roleOptions" @update:model-value="list.set({ role: $event as string[] })" />
      <Select :model-value="filters.status" multiple :label="t('users.columns.status')" :placeholder="t('users.anyStatus')" :options="statusOptions" @update:model-value="list.set({ status: $event as string[] })" />
      <Select :model-value="filters.licence" multiple :label="t('users.columns.licences')" :placeholder="t('users.anyLicence')" :options="licenceOptions" @update:model-value="list.set({ licence: $event as string[] })" />
      <Select v-if="groupOptions.length" :model-value="filters.group" multiple searchable :label="t('users.group')" :placeholder="t('users.anyGroup')" :options="groupOptions" @update:model-value="list.set({ group: $event as string[] })" />
      <Select :model-value="filters.mfa ?? ALL" :label="t('users.mfa')" :options="mfaOptions" @update:model-value="list.set({ mfa: $event === ALL ? undefined : String($event) })" />
    </FilterCard>

    <Card v-if="loadError">
      <EmptyState :icon="TriangleAlert" :title="t('users.couldntLoad')" :description="loadError" />
    </Card>

    <Card v-if="!loadError" padding="none">
      <Table
        :columns="columns"
        :rows="users"
        row-key="id"
        :loading="loading"
        :caption="t('users.title')"
        :row-link="(row: User) => `/organisations/${orgId}/users/${row.id}`"
        :link-component="RouterLink"
        :selectable="canBulk && selectable"
        :row-label="(row: User) => t('users.select', { name: row.name })"
        v-model:selected="selected"
        manual-sort
        :sort="tableSort"
        @update:sort="setTableSort"
      >
        <template #cell-name="{ row }">
          {{ row.name }}
          <Badge v-if="row.support" size="sm" color="blue" class="ml-1">{{ t('users.kestonSupport') }}</Badge>
          <span v-if="row.id === myId" class="text-black/65"> {{ t('users.you') }}</span>
        </template>
        <template #cell-role="{ row }">
          <Badge v-if="row.role === 'global_admin'" color="primary" size="sm">
            <template #leading><ShieldCheck /></template>
            {{ row.platformAdmin ? t('users.tkgAdmin') : t('users.globalAdmin') }}
          </Badge>
          <span v-else-if="row.roles?.length">{{ row.roles.map(roleName).join(', ') }}</span>
          <span v-else class="text-black/65">{{ t('users.roleUser') }}</span>
        </template>
        <template #cell-licences="{ row }">
          <span v-if="row.licences?.length">{{ row.licences.map(productName).join(', ') }}</span>
          <span v-else class="text-black/65">{{ t('common.none') }}</span>
        </template>
        <template #cell-status="{ row }">
          <Badge v-if="row.status === 'disabled'" color="basic" size="sm">{{ t('users.status.disabled') }}</Badge>
          <Badge v-else-if="row.locked" color="yellow" size="sm">
            <template #leading><Lock /></template>
            {{ t('users.status.locked') }}
          </Badge>
          <Badge v-else color="green" size="sm">{{ t('users.status.active') }}</Badge>
        </template>
        <template #cell-actions="{ row }">
          <span v-if="row.support" class="text-xs text-black/65">{{ t('users.until', { date: formatDateTime(row.expiresAt!) }) }}</span>
          <Menu
            v-else-if="row.canChange && rowActions(row).length"
            :items="rowActions(row)"
            :label="t('common.actionsFor', { name: row.name })"
            size="sm"
          />
        </template>
        <template #empty>
          <EmptyState
            size="sm"
            :icon="Users"
            :title="filtered ? t('users.noMatch') : t('users.none')"
            :description="filtered ? t('users.noMatchDescription') : t('users.noneDescription')"
            class="p-0"
          />
        </template>
      </Table>
    </Card>


    <!-- Add a user -->
    <AddUserSlideover
      v-model:open="adding"
      :org-id="orgId"
      :org="org"
      :global-admin="iAmGlobalAdmin"
      :platform-admin="iAmPlatformAdmin"
      :can-assign-licences="has('users.licences')"
      :can-assign-roles="iAmGlobalAdmin || has('permissions.assign')"
      :my-permissions="org?.permissions ?? []"
      @added="load"
    />

  </div>
</template>
