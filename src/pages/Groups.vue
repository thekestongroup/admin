<script setup lang="ts">
import { Plus, TriangleAlert, UsersRound } from '@lucide/vue'
import { Badge, Button, type ButtonStatus, Card, EmptyState, Input, PageHeader, Table, type TableColumn, useNotifications } from '@thekestongroup/ui'
import { onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { ApiError, api, type Group } from '../lib/api'

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

const columns: TableColumn<Group>[] = [
  { key: 'name', label: 'Group', rowHeader: true, sortable: true },
  { key: 'permissions', label: 'Permissions in Keston Admin' },
  { key: 'memberCount', label: 'Users', align: 'end', sortable: true },
]

// Creating a group, in line.
const name = ref('')
const nameError = ref<string>()
const status = ref<ButtonStatus>('idle')
async function create() {
  nameError.value = name.value.trim() ? undefined : 'Enter a name for the group'
  if (nameError.value) return
  status.value = 'loading'
  try {
    const g = await api.createGroup(orgId, name.value)
    notify({ type: 'success', title: `${g.name} created`, description: 'Add its users next.' })
    router.push(`/organisations/${orgId}/groups/${g.id}`)
  } catch (e) {
    status.value = 'idle'
    if (e instanceof ApiError && e.field === 'name') nameError.value = e.message
    else notify({ type: 'error', title: 'Couldn’t create the group', description: e instanceof Error ? e.message : String(e) })
  }
}
</script>

<template>
  <div class="flex max-w-4xl flex-col gap-6 p-4 sm:p-6">
    <PageHeader title="Groups" description="Sets of users, for giving them different app access and permissions in Keston Admin." />

    <Card v-if="canCreate" title="New group">
      <form class="flex items-start gap-2" novalidate @submit.prevent="create">
        <Input v-model="name" label="Name" placeholder="e.g. Teachers" :error-text="nameError" class="flex-1" />
        <Button type="submit" variant="primary" class="mt-6.5 shrink-0" :status="status" loading-text="Creating">
          <template #leading><Plus /></template>
          Create group
        </Button>
      </form>
    </Card>

    <Card v-if="loadError">
      <EmptyState :icon="TriangleAlert" title="Couldn’t load the groups" :description="loadError" />
    </Card>
    <Card v-else padding="none">
      <Table
        :columns="columns"
        :rows="groups"
        row-key="id"
        :loading="loading"
        caption="Groups"
        :row-link="(row: Group) => `/organisations/${orgId}/groups/${row.id}`"
        :link-component="RouterLink"
      >
        <template #cell-permissions="{ row }">
          <Badge v-if="(row as Group).permissions.length" color="primary" size="sm">
            {{ (row as Group).permissions.length }} {{ (row as Group).permissions.length === 1 ? 'permission' : 'permissions' }}
          </Badge>
          <span v-else class="text-black/65">None</span>
        </template>
        <template #empty>
          <EmptyState
            size="sm"
            :icon="UsersRound"
            title="No groups yet"
            description="Create one, e.g. Teachers or Office, to give its users different app access."
            class="p-0"
          />
        </template>
      </Table>
    </Card>
  </div>
</template>
