<script setup lang="ts">
import { Badge, type BadgeProps, Card, EmptyState, Link, Spinner, Table, type TableColumn } from '@thekestongroup/ui'
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { api, type UserApp } from '../lib/api'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

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

const access = computed<Record<UserApp['access'], { label: string; color: BadgeProps['color'] }>>(() => ({
  forced: { label: t('userApps.access.forced'), color: 'green' },
  enabled: { label: t('userApps.access.enabled'), color: 'green' },
  disabled: { label: t('userApps.access.disabled'), color: 'basic' },
  no_licence: { label: t('userApps.access.noLicence'), color: 'yellow' },
}))
const columns = computed<TableColumn<UserApp>[]>(() => [
  { key: 'name', label: t('userApps.columns.app'), rowHeader: true },
  { key: 'publisher', label: t('userApps.columns.by') },
  { key: 'access', label: t('userApps.columns.access') },
])
</script>

<template>
  <Card
    :title="t('userApps.title')"
    :description="t('userApps.description', { name })"
    padding="none"
  >
    <template #actions>
      <Link :as="RouterLink" :to="`/organisations/${orgId}/apps`" class="text-sm">{{ t('userApps.appAccess') }}</Link>
    </template>
    <EmptyState v-if="error" size="sm" :title="t('userApps.couldntLoad')" :description="error" />
    <div v-else-if="!apps" class="flex justify-center py-6"><Spinner :label="t('common.loading')" /></div>
    <Table v-else :columns="columns" :rows="apps" row-key="id" size="sm" :caption="t('userApps.caption', { name })">
      <template #cell-access="{ row }">
        <Badge size="sm" :color="access[row.access].color">{{ access[row.access].label }}</Badge>
      </template>
      <template #empty>
        <EmptyState size="sm" :title="t('userApps.none')" :description="t('userApps.noneDescription')" class="p-0" />
      </template>
    </Table>
  </Card>
</template>
