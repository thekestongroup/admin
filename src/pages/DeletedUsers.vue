<script setup lang="ts">
import { RotateCcw, Trash2, TriangleAlert } from '@lucide/vue'
import {
  Breadcrumb,
  Button,
  type ButtonStatus,
  Card,
  Checkbox,
  EmptyState,
  PageHeader,
  Table,
  type TableColumn,
  formatDate,
  useNotifications,
} from '@thekestongroup/ui'
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import BulkSummary from '../components/BulkSummary.vue'
import { api, type BulkResult, type DeletedUser, type Organisation } from '../lib/api'

/**
 * Users deleted in the last 30 days. Restoring brings them back as they were
 * (active or disabled), with their groups; after 30 days they're removed for
 * good.
 */
const route = useRoute()
const orgId = route.params.orgId as string
const { notify } = useNotifications()
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

const org = ref<Organisation>()
const users = ref<DeletedUser[]>([])
const loading = ref(true)
const loadError = ref<string>()
const canRestore = computed(() => !!org.value?.permissions?.includes('users.delete'))

const trail = computed(() => [
  { label: org.value?.name ?? 'Organisation', to: `/organisations/${orgId}` },
  { label: 'Users', to: `/organisations/${orgId}/users` },
  { label: 'Deleted users' },
])

async function load() {
  users.value = await api.deletedUsers(orgId)
  const ids = new Set(users.value.filter(selectable).map((u) => u.id))
  selected.value = new Set([...selected.value].filter((id) => ids.has(id)))
}

onMounted(async () => {
  try {
    org.value = await api.organisation(orgId)
    await load()
  } catch (e) {
    loadError.value = message(e)
  } finally {
    loading.value = false
  }
})

const columns = computed<TableColumn<DeletedUser>[]>(() => [
  ...(canRestore.value ? [{ key: 'select', label: 'Select', hideLabel: true, class: 'w-0' }] : []),
  { key: 'name', label: 'Name', rowHeader: true, sortable: true },
  { key: 'email', label: 'Email', sortable: true },
  { key: 'deletedAt', label: 'Deleted', sortable: true },
  { key: 'purgeAfter', label: 'Removed for good', sortable: true },
  ...(canRestore.value ? [{ key: 'actions', label: 'Actions', hideLabel: true, align: 'end' as const }] : []),
])

// ── Selecting and restoring ─────────────────────────────────────────────────

const selectable = (u: DeletedUser) => !!u.canChange
const selected = ref(new Set<string>())
const selectableCount = computed(() => users.value.filter(selectable).length)
const allSelected = computed<boolean | 'indeterminate'>(() =>
  !selected.value.size ? false : selected.value.size === selectableCount.value ? true : 'indeterminate',
)
function selectAll(on: boolean | 'indeterminate') {
  selected.value = new Set(on === true ? users.value.filter(selectable).map((u) => u.id) : [])
}
function selectRow(u: DeletedUser, on: boolean | 'indeterminate') {
  const next = new Set(selected.value)
  if (on === true) next.add(u.id)
  else next.delete(u.id)
  selected.value = next
}

const restoring = ref<string>()
const status = ref<ButtonStatus>('idle')
const results = ref<BulkResult[]>([])
const summaryOpen = ref(false)

async function restore(ids: string[], one?: DeletedUser) {
  if (one) restoring.value = one.id
  else status.value = 'loading'
  try {
    const res = await api.restoreUsers(orgId, ids)
    selected.value = new Set()
    await load()
    if (one && res.results[0]?.result === 'done') {
      notify({ type: 'success', title: 'User restored', description: `${one.name} is back, with their groups.` })
    } else {
      results.value = res.results
      summaryOpen.value = true
    }
  } catch (e) {
    notify({ type: 'error', title: 'Couldn’t restore', description: message(e) })
  } finally {
    restoring.value = undefined
    status.value = 'idle'
  }
}
const count = computed(() => `${selected.value.size} ${selected.value.size === 1 ? 'user' : 'users'}`)
</script>

<template>
  <div class="flex flex-col gap-6 p-4 sm:p-6">
    <Breadcrumb :items="trail" :link-component="RouterLink" />
    <PageHeader
      title="Deleted users"
      description="Users deleted in the last 30 days. Restoring brings them back as they were, with their groups. After 30 days they’re removed for good."
    />

    <Card v-if="loadError">
      <EmptyState :icon="TriangleAlert" title="Couldn’t load deleted users" :description="loadError" />
    </Card>
    <template v-else>
      <Card v-if="selected.size">
        <div class="flex flex-wrap items-center gap-2">
          <p class="mr-2 text-sm font-bold">{{ count }} selected</p>
          <Button size="sm" variant="primary" :status="status" loading-text="Restoring" @click="restore([...selected])">
            <template #leading><RotateCcw /></template>
            Restore
          </Button>
        </div>
      </Card>

      <Card padding="none">
        <Table :columns="columns" :rows="users" row-key="id" :loading="loading" caption="Deleted users">
          <template #header-select>
            <Checkbox
              v-if="selectableCount"
              :model-value="allSelected"
              label="Select every user you can restore"
              class="[&_label]:sr-only"
              @update:model-value="selectAll"
            />
          </template>
          <template #cell-select="{ row }">
            <Checkbox
              v-if="selectable(row)"
              :model-value="selected.has(row.id)"
              :label="`Select ${row.name}`"
              class="[&_label]:sr-only"
              @update:model-value="selectRow(row, $event)"
            />
          </template>
          <template #cell-deletedAt="{ row }">
            {{ formatDate(row.deletedAt) }}<span v-if="row.deletedByName" class="text-black/65"> by {{ row.deletedByName }}</span>
          </template>
          <template #cell-purgeAfter="{ row }">{{ formatDate(row.purgeAfter) }}</template>
          <template #cell-actions="{ row }">
            <Button v-if="row.canChange" size="sm" :status="restoring === row.id ? 'loading' : 'idle'" @click="restore([row.id], row)">
              Restore<span class="sr-only"> {{ row.name }}</span>
            </Button>
          </template>
          <template #empty>
            <EmptyState size="sm" :icon="Trash2" title="No deleted users" description="Users you delete stay here for 30 days." class="p-0" />
          </template>
        </Table>
      </Card>
    </template>

    <BulkSummary v-model:open="summaryOpen" title="Restore" :results="results" />
  </div>
</template>
