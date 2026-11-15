<script setup lang="ts">
import { Building2, Plus, TriangleAlert } from '@lucide/vue'
import { Button, Card, EmptyState, PageHeader, Table, type TableColumn, formatDate } from '@thekestongroup/ui'
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { api, type Organisation } from '../lib/api'

/** Every organisation on Keston (platform admins). */
const orgs = ref<Organisation[]>([])
const loading = ref(true)
const loadError = ref<string>()

onMounted(async () => {
  try {
    orgs.value = await api.organisations()
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
})

const columns: TableColumn<Organisation>[] = [
  { key: 'name', label: 'Organisation', rowHeader: true, sortable: true },
  { key: 'domain', label: 'Domain', sortable: true },
  { key: 'userCount', label: 'Accounts', align: 'end', sortable: true },
  { key: 'createdAt', label: 'Created', sortable: true, nowrap: true },
]
</script>

<template>
  <div class="flex flex-col gap-6 p-4 sm:p-6">
    <PageHeader
      title="Organisations"
      description="Every school and organisation on Keston. Their accounts need support access, approved by one of their global admins."
    >
      <template #actions>
        <Button variant="primary" :as="RouterLink" to="/create-organisation">
          <template #leading><Plus /></template>
          New organisation
        </Button>
      </template>
    </PageHeader>

    <Card v-if="loadError">
      <EmptyState :icon="TriangleAlert" title="Couldn’t load the organisations" :description="loadError" />
    </Card>
    <Card v-else padding="none">
      <Table
        :columns="columns"
        :rows="orgs"
        row-key="id"
        :loading="loading"
        caption="Organisations"
        :row-link="(row: Organisation) => `/organisations/${row.id}`"
        :link-component="RouterLink"
      >
        <template #cell-createdAt="{ row }">{{ formatDate(row.createdAt) }}</template>
        <template #empty>
          <EmptyState
            size="sm"
            :icon="Building2"
            title="No organisations yet"
            description="Create one to give a school or organisation its Keston accounts."
            class="p-0"
          />
        </template>
      </Table>
    </Card>
  </div>
</template>
