<script setup lang="ts">
import { Badge, type BadgeProps, Card, EmptyState, Link, Spinner, Table, type TableColumn } from '@thekestongroup/ui'
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { api, type UserApp } from '../lib/api'

/**
 * The apps someone has, as their licences and the organisation's app access
 * settings work out for them.
 */
const props = defineProps<{ orgId: string; userId: string; name: string }>()

const apps = ref<UserApp[]>()
const error = ref<string>()
onMounted(async () => {
  try {
    apps.value = await api.userApps(props.orgId, props.userId)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
})

const access: Record<UserApp['access'], { label: string; color: BadgeProps['color'] }> = {
  forced: { label: 'Always on', color: 'green' },
  enabled: { label: 'On', color: 'green' },
  disabled: { label: 'Turned off', color: 'basic' },
  no_licence: { label: 'No licence', color: 'yellow' },
}
const columns: TableColumn<UserApp>[] = [
  { key: 'name', label: 'App', rowHeader: true },
  { key: 'publisher', label: 'By' },
  { key: 'access', label: 'Access' },
]
</script>

<template>
  <Card
    title="Apps"
    :description="`What ${name} can use, from their licences and app access (by default and through their groups).`"
    padding="none"
  >
    <template #actions>
      <Link :as="RouterLink" :to="`/organisations/${orgId}/apps`" class="text-sm">App access</Link>
    </template>
    <EmptyState v-if="error" size="sm" title="Couldn’t load their apps" :description="error" />
    <div v-else-if="!apps" class="flex justify-center py-6"><Spinner label="Loading" /></div>
    <Table v-else :columns="columns" :rows="apps" row-key="id" size="sm" :caption="`${name}’s apps`">
      <template #cell-access="{ row }">
        <Badge size="sm" :color="access[row.access].color">{{ access[row.access].label }}</Badge>
      </template>
      <template #empty>
        <EmptyState size="sm" title="No apps" description="Nothing is set for them, and they haven’t added any." class="p-0" />
      </template>
    </Table>
  </Card>
</template>
