<script setup lang="ts">
import { Building2, Plus, TriangleAlert } from '@lucide/vue'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Switch,
  type SwitchProps,
  Table,
  type TableColumn,
  formatDate,
} from '@thekestongroup/ui'
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { api, loadMe, type Organisation } from '../lib/api'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

/** Every organisation on Keston (platform admins). */
const orgs = ref<Organisation[]>([])
const loading = ref(true)
const loadError = ref<string>()

/** Platform-wide: new organisations need verifying (platform admins only). */
const requireVerification = ref(false)
const settingState = ref<{ status?: SwitchProps['status']; text?: string }>({})
const showSetting = ref(false)
const onlyAwaiting = ref(false)
const awaiting = computed(() => orgs.value.filter((o) => !o.verified))
const rows = computed(() => (onlyAwaiting.value ? awaiting.value : orgs.value))

async function saveSetting(on: boolean) {
  settingState.value = { status: 'loading', text: t('settings.saving') }
  try {
    requireVerification.value = (await api.savePlatformSettings({ requireOrganisationVerification: on })).requireOrganisationVerification
    settingState.value = { status: 'success', text: t('common.saved') }
    setTimeout(() => {
      if (settingState.value.status === 'success') settingState.value = {}
    }, 2000)
  } catch {
    requireVerification.value = !on
    settingState.value = { status: 'error', text: t('organisations.requireVerification.couldntSave') }
  }
}

onMounted(async () => {
  try {
    const [list, me] = await Promise.all([api.organisations(), loadMe()])
    orgs.value = list
    if (me.platformAdmin) {
      requireVerification.value = (await api.platformSettings()).requireOrganisationVerification
      showSetting.value = true
    }
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

    <Card
      v-if="showSetting"
      :title="t('organisations.requireVerification.title')"
      :description="t('organisations.requireVerification.description')"
    >
      <Switch
        v-model="requireVerification"
        :label="t('organisations.requireVerification.title')"
        :status="settingState.status"
        :status-text="settingState.text"
        @update:model-value="saveSetting"
      />
    </Card>

    <div v-if="awaiting.length" class="flex items-center gap-3">
      <Badge color="yellow">{{ t('organisations.awaitingVerification') }}: {{ awaiting.length }}</Badge>
      <Button size="sm" @click="onlyAwaiting = !onlyAwaiting">
        {{ onlyAwaiting ? t('organisations.showAll') : t('organisations.onlyAwaiting') }}
      </Button>
    </div>

    <Card v-if="loadError">
      <EmptyState :icon="TriangleAlert" :title="t('organisations.couldntLoad')" :description="loadError" />
    </Card>
    <Card v-else padding="none">
      <Table
        :columns="columns"
        :rows="rows"
        row-key="id"
        :loading="loading"
        :caption="t('nav.organisations')"
        :row-link="(row: Organisation) => `/organisations/${row.id}`"
        :link-component="RouterLink"
      >
        <template #cell-name="{ row }">
          {{ row.name }}
          <Badge v-if="!row.verified" color="yellow" class="ms-2">{{ t('organisations.awaitingVerification') }}</Badge>
        </template>
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
