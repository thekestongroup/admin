<script setup lang="ts">
import { Button, Card, Slideover, Table, type TableColumn } from '@thekestongroup/ui'
import { computed } from 'vue'
import type { BulkResult } from '../lib/api'
import UserDetailsTable from './UserDetailsTable.vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

/**
 * What a bulk action did: how many users it was done for, who was skipped
 * and why, and (resetting passwords) each new password, shown once, to
 * print or download.
 */
const props = defineProps<{
  title: string
  results: BulkResult[]
}>()
const open = defineModel<boolean>('open', { default: false })

const done = computed(() => props.results.filter((r) => r.result === 'done'))
const skipped = computed(() => props.results.filter((r) => r.result === 'skipped'))
const withPasswords = computed(() => done.value.filter((r) => r.password))

const description = computed(() =>
  [t('bulkSummary.doneFor', done.value.length), skipped.value.length ? t('bulkSummary.skipped', skipped.value.length) : '']
    .filter(Boolean)
    .join(' '),
)

const skippedColumns = computed<TableColumn<BulkResult>[]>(() => [
  { key: 'name', label: t('common.name'), rowHeader: true },
  { key: 'reason', label: t('bulkSummary.why'), nowrap: false },
])
</script>

<template>
  <Slideover v-model:open="open" :title="title" :description="description">
    <template #body>
      <div class="flex flex-col gap-6">
        <div v-if="withPasswords.length" class="flex flex-col gap-3">
          <p class="text-sm">
            {{ t('bulkSummary.passwordsOnce') }}
          </p>
          <UserDetailsTable :results="withPasswords" :title="t('bulkSummary.newPasswords')" />
        </div>
        <div v-if="skipped.length" class="flex flex-col gap-3">
          <p class="text-sm font-bold">{{ t('bulkSummary.skippedHeading') }}</p>
          <Card padding="none">
            <Table :columns="skippedColumns" :rows="skipped" row-key="id" size="sm" :caption="t('bulkSummary.skippedUsers')">
              <template #cell-name="{ row }">{{ row.name || t('bulkSummary.unknownUser') }}</template>
            </Table>
          </Card>
        </div>
      </div>
    </template>
    <template #footer="{ close }">
      <Button variant="primary" @click="close">{{ t('common.done') }}</Button>
    </template>
  </Slideover>
</template>
