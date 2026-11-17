<script setup lang="ts">
import { Button, Card, Slideover, Table, type TableColumn } from '@thekestongroup/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { BulkResult, GroupBulkResult } from '../lib/api'

const { t } = useI18n()

/**
 * What changing several groups' members did: for each group who joined and
 * who left (and how many users it has now), the groups left alone and why,
 * and the users left alone.
 */
const props = defineProps<{ groups: GroupBulkResult[]; skippedUsers: BulkResult[] }>()
const open = defineModel<boolean>('open', { default: false })

const changed = computed(() => props.groups.filter((g) => g.result === 'done'))
const unchanged = computed(() => props.groups.filter((g) => g.result === 'skipped'))
const added = computed(() => changed.value.reduce((n, g) => n + g.added.length, 0))
const removed = computed(() => changed.value.reduce((n, g) => n + g.removed.length, 0))
const description = computed(() =>
  [t('groupBulk.changedGroups', changed.value.length), t('groupBulk.addedRemoved', { added: added.value, removed: removed.value })].join(' '),
)

const names = (list: { name: string }[]) => list.map((u) => u.name).join(', ')

const changedColumns = computed<TableColumn<GroupBulkResult>[]>(() => [
  { key: 'name', label: t('groups.columns.group'), rowHeader: true, nowrap: false },
  { key: 'added', label: t('groupBulk.joined'), nowrap: false },
  { key: 'removed', label: t('groupBulk.left'), nowrap: false },
  { key: 'memberCount', label: t('groupBulk.usersNow'), align: 'end' },
])
const skippedGroupColumns = computed<TableColumn<GroupBulkResult>[]>(() => [
  { key: 'name', label: t('groups.columns.group'), rowHeader: true },
  { key: 'reason', label: t('bulkSummary.why'), nowrap: false },
])
const skippedUserColumns = computed<TableColumn<BulkResult>[]>(() => [
  { key: 'name', label: t('common.name'), rowHeader: true },
  { key: 'reason', label: t('bulkSummary.why'), nowrap: false },
])
</script>

<template>
  <Slideover v-model:open="open" :title="t('groupBulk.summaryTitle')" :description="description">
    <template #body>
      <div class="flex flex-col gap-6">
        <div v-if="changed.length" class="flex flex-col gap-3">
          <p class="text-sm font-bold">{{ t('groupBulk.changedHeading') }}</p>
          <Card padding="none">
            <Table :columns="changedColumns" :rows="changed" row-key="id" size="sm" :caption="t('groupBulk.changedHeading')">
              <template #cell-added="{ row }">{{ row.added.length ? names(row.added) : t('common.none') }}</template>
              <template #cell-removed="{ row }">{{ row.removed.length ? names(row.removed) : t('common.none') }}</template>
            </Table>
          </Card>
        </div>
        <div v-if="unchanged.length" class="flex flex-col gap-3">
          <p class="text-sm font-bold">{{ t('groupBulk.unchangedHeading') }}</p>
          <Card padding="none">
            <Table :columns="skippedGroupColumns" :rows="unchanged" row-key="id" size="sm" :caption="t('groupBulk.unchangedHeading')">
              <template #cell-name="{ row }">{{ row.name || t('groupBulk.unknownGroup') }}</template>
            </Table>
          </Card>
        </div>
        <div v-if="skippedUsers.length" class="flex flex-col gap-3">
          <p class="text-sm font-bold">{{ t('bulkSummary.skippedHeading') }}</p>
          <Card padding="none">
            <Table :columns="skippedUserColumns" :rows="skippedUsers" row-key="id" size="sm" :caption="t('bulkSummary.skippedUsers')">
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
