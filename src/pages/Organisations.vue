<script setup lang="ts">
import { Building2, Plus, TriangleAlert } from '@lucide/vue'
import { Button, Card, EmptyState, PageHeader, Table, type TableColumn, formatDate } from '@thekestongroup/ui'
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { api, type Organisation } from '../lib/api'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

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

const columns = computed<TableColumn<Organisation>[]>(() => [
  { key: 'name', label: t('organisations.columns.organisation'), rowHeader: true, sortable: true },
  { key: 'domain', label: t('organisations.columns.domain'), sortable: true },
  { key: 'userCount', label: t('organisations.columns.users'), align: 'end', sortable: true },
  { key: 'createdAt', label: t('organisations.columns.created'), sortable: true, nowrap: true },
])
</script>

<template>
  <div class="flex flex-col gap-6 p-4 sm:p-6">
    <PageHeader
      :title="t('nav.organisations')"
      :description="t('organisations.description')"
    >
      <template #actions>
        <Button variant="primary" :as="RouterLink" to="/create-organisation">
          <template #leading><Plus /></template>
          {{ t('organisations.new') }}
        </Button>
      </template>
    </PageHeader>

    <Card v-if="loadError">
      <EmptyState :icon="TriangleAlert" :title="t('organisations.couldntLoad')" :description="loadError" />
    </Card>
    <Card v-else padding="none">
      <Table
        :columns="columns"
        :rows="orgs"
        row-key="id"
        :loading="loading"
        :caption="t('nav.organisations')"
        :row-link="(row: Organisation) => `/organisations/${row.id}`"
        :link-component="RouterLink"
      >
        <template #cell-createdAt="{ row }">{{ formatDate(row.createdAt) }}</template>
        <template #empty>
          <EmptyState
            size="sm"
            :icon="Building2"
            :title="t('organisations.none')"
            :description="t('organisations.noneDescription')"
            class="p-0"
          />
        </template>
      </Table>
    </Card>
  </div>
</template>
