<script setup lang="ts">
import { Plus, TriangleAlert, UsersRound } from '@lucide/vue'
import { Badge, Button, type ButtonStatus, Card, EmptyState, Input, PageHeader, Table, type TableColumn, useNotifications } from '@thekestongroup/ui'
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { ApiError, api, type Group } from '../lib/api'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

/** An organisation's groups, e.g. Teachers or Office: used to set app access per group. */
const route = useRoute()
const router = useRouter()
const orgId = route.params.orgId as string
const { notify } = useNotifications()

const groups = ref<Group[]>([])
const canCreate = ref(false)
const loading = ref(true)
const loadError = ref<string>()

onMounted(async () => {
  try {
    const [g, o] = await Promise.all([api.groups(orgId), api.organisation(orgId)])
    groups.value = g
    canCreate.value = !!o.permissions?.includes('groups.manage')
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
})

const columns = computed<TableColumn<Group>[]>(() => [
  { key: 'name', label: t('groups.columns.group'), rowHeader: true, sortable: true },
  { key: 'permissions', label: t('groups.columns.permissions') },
  { key: 'memberCount', label: t('groups.columns.users'), align: 'end', sortable: true },
])

// Creating a group, in line.
const name = ref('')
const nameError = ref<string>()
const status = ref<ButtonStatus>('idle')
async function create() {
  nameError.value = name.value.trim() ? undefined : t('groups.enterName')
  if (nameError.value) return
  status.value = 'loading'
  try {
    const g = await api.createGroup(orgId, name.value)
    notify({ type: 'success', title: t('groups.created', { name: g.name }), description: t('groups.createdDescription') })
    router.push(`/organisations/${orgId}/groups/${g.id}`)
  } catch (e) {
    status.value = 'idle'
    if (e instanceof ApiError && e.field === 'name') nameError.value = e.message
    else notify({ type: 'error', title: t('groups.couldntCreate'), description: e instanceof Error ? e.message : String(e) })
  }
}
</script>

<template>
  <div class="flex max-w-4xl flex-col gap-6 p-4 sm:p-6">
    <PageHeader :title="t('groups.title')" :description="t('groups.description')" />

    <Card v-if="canCreate" :title="t('groups.newGroup')">
      <form class="flex items-start gap-2" novalidate @submit.prevent="create">
        <Input v-model="name" :label="t('common.name')" :placeholder="t('groups.namePlaceholder')" :error-text="nameError" class="flex-1" />
        <Button type="submit" variant="primary" class="mt-6.5 shrink-0" :status="status" :loading-text="t('groups.creating')">
          <template #leading><Plus /></template>
          {{ t('groups.create') }}
        </Button>
      </form>
    </Card>

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
            :title="t('groups.none')"
            :description="t('groups.noneDescription')"
            class="p-0"
          />
        </template>
      </Table>
    </Card>
  </div>
</template>
