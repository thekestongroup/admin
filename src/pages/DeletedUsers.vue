<script setup lang="ts">
import { RotateCcw, Trash2, TriangleAlert } from '@lucide/vue'
import {
  Breadcrumb,
  Button,
  type ButtonStatus,
  Card,
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
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

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
  { label: org.value?.name ?? t('nav.organisation'), to: `/organisations/${orgId}` },
  { label: t('users.title'), to: `/organisations/${orgId}/users` },
  { label: t('deleted.title') },
])

async function load() {
  users.value = await api.deletedUsers(orgId)
  const ids = new Set(users.value.filter(selectable).map((u) => u.id))
  selected.value = selected.value.filter((id) => ids.has(id))
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
  { key: 'name', label: t('common.name'), rowHeader: true, sortable: true },
  { key: 'email', label: t('common.email'), sortable: true },
  { key: 'deletedAt', label: t('deleted.columns.deleted'), sortable: true },
  { key: 'purgeAfter', label: t('deleted.columns.removed'), sortable: true },
  ...(canRestore.value ? [{ key: 'actions', label: t('common.actions'), hideLabel: true, align: 'end' as const }] : []),
])

// ── Selecting and restoring ─────────────────────────────────────────────────

const selectable = (u: DeletedUser) => !!u.canChange
const selected = ref<string[]>([])

const restoring = ref<string>()
const status = ref<ButtonStatus>('idle')
const results = ref<BulkResult[]>([])
const summaryOpen = ref(false)

async function restore(ids: string[], one?: DeletedUser) {
  if (one) restoring.value = one.id
  else status.value = 'loading'
  try {
    const res = await api.restoreUsers(orgId, ids)
    selected.value = []
    await load()
    if (one && res.results[0]?.result === 'done') {
      notify({ type: 'success', title: t('deleted.restored'), description: t('deleted.restoredDescription', { name: one.name }) })
    } else {
      results.value = res.results
      summaryOpen.value = true
    }
  } catch (e) {
    notify({ type: 'error', title: t('deleted.couldntRestore'), description: message(e) })
  } finally {
    restoring.value = undefined
    status.value = 'idle'
  }
}
const count = computed(() => t('deleted.selected', selected.value.length))
</script>

<template>
  <div class="flex flex-col gap-6 p-4 sm:p-6">
    <Breadcrumb :items="trail" :link-component="RouterLink" />
    <PageHeader
      :title="t('deleted.title')"
      :description="t('deleted.description')"
    />

    <Card v-if="loadError">
      <EmptyState :icon="TriangleAlert" :title="t('deleted.couldntLoad')" :description="loadError" />
    </Card>
    <template v-else>
      <Card v-if="selected.length">
        <div class="flex flex-wrap items-center gap-2">
          <p class="mr-2 text-sm font-bold">{{ count }}</p>
          <Button size="sm" variant="primary" :status="status" :loading-text="t('deleted.restoring')" @click="restore(selected)">
            <template #leading><RotateCcw /></template>
            {{ t('deleted.restore') }}
          </Button>
        </div>
      </Card>

      <Card padding="none">
        <Table
          v-model:selected="selected"
          :columns="columns"
          :rows="users"
          row-key="id"
          :loading="loading"
          :caption="t('deleted.title')"
          :selectable="canRestore && selectable"
          :row-label="(row: DeletedUser) => t('users.select', { name: row.name })"
        >
          <template #cell-deletedAt="{ row }">
            {{ formatDate(row.deletedAt) }}<span v-if="row.deletedByName" class="text-black/65"> {{ t('deleted.by', { name: row.deletedByName }) }}</span>
          </template>
          <template #cell-purgeAfter="{ row }">{{ formatDate(row.purgeAfter) }}</template>
          <template #cell-actions="{ row }">
            <Button v-if="row.canChange" size="sm" :status="restoring === row.id ? 'loading' : 'idle'" @click="restore([row.id], row)">
              {{ t('deleted.restore') }}<span class="sr-only"> {{ row.name }}</span>
            </Button>
          </template>
          <template #empty>
            <EmptyState size="sm" :icon="Trash2" :title="t('deleted.none')" :description="t('deleted.noneDescription')" class="p-0" />
          </template>
        </Table>
      </Card>
    </template>

    <BulkSummary v-model:open="summaryOpen" :title="t('deleted.restore')" :results="results" />
  </div>
</template>
