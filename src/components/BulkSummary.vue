<script setup lang="ts">
import { Download } from '@lucide/vue'
import { Button, Card, Slideover, Table, type TableColumn } from '@thekestongroup/ui'
import { computed } from 'vue'
import type { BulkResult } from '../lib/api'
import { downloadCsv } from '../lib/csv'

/**
 * What a bulk action did: how many users it was done for, who was skipped
 * and why, and (resetting passwords) each new password, shown once, with a
 * CSV to download.
 */
const props = defineProps<{
  title: string
  results: BulkResult[]
  /** The passwords were downloaded as a CSV already, so they aren't shown. */
  downloaded?: boolean
}>()
const open = defineModel<boolean>('open', { default: false })

const done = computed(() => props.results.filter((r) => r.result === 'done'))
const skipped = computed(() => props.results.filter((r) => r.result === 'skipped'))
const withPasswords = computed(() => done.value.filter((r) => r.password))

const plural = (n: number) => `${n} ${n === 1 ? 'user' : 'users'}`
const description = computed(() =>
  [`Done for ${plural(done.value.length)}.`, skipped.value.length ? `${plural(skipped.value.length)} skipped.` : '']
    .filter(Boolean)
    .join(' '),
)

const skippedColumns: TableColumn<BulkResult>[] = [
  { key: 'name', label: 'Name', rowHeader: true },
  { key: 'reason', label: 'Why', nowrap: false },
]
const passwordColumns: TableColumn<BulkResult>[] = [
  { key: 'name', label: 'Name', rowHeader: true },
  { key: 'email', label: 'Email' },
  { key: 'password', label: 'New password' },
]
</script>

<template>
  <Slideover v-model:open="open" :title="title" :description="description">
    <template #body>
      <div class="flex flex-col gap-6">
        <div v-if="withPasswords.length && !downloaded" class="flex flex-col gap-3">
          <p class="text-sm">
            Give each person their new password securely. They’re shown only once: once you close this, they’re gone.
          </p>
          <div>
            <Button size="sm" @click="downloadCsv(results)">
              <template #leading><Download /></template>
              Download as CSV
            </Button>
          </div>
          <Card padding="none">
            <Table :columns="passwordColumns" :rows="withPasswords" row-key="id" size="sm" caption="New passwords">
              <template #cell-password="{ row }"><span class="font-mono select-all">{{ row.password }}</span></template>
            </Table>
          </Card>
        </div>
        <p v-else-if="withPasswords.length" class="text-sm">
          The new passwords are in the CSV you downloaded. Give them out securely, then delete the file.
        </p>
        <div v-if="skipped.length" class="flex flex-col gap-3">
          <p class="text-sm font-bold">Skipped</p>
          <Card padding="none">
            <Table :columns="skippedColumns" :rows="skipped" row-key="id" size="sm" caption="Skipped users">
              <template #cell-name="{ row }">{{ row.name || 'Unknown user' }}</template>
            </Table>
          </Card>
        </div>
      </div>
    </template>
    <template #footer="{ close }">
      <Button variant="primary" @click="close">Done</Button>
    </template>
  </Slideover>
</template>
