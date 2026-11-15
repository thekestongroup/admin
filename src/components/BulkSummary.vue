<script setup lang="ts">
import { Button, Card, Slideover, Table, type TableColumn } from '@thekestongroup/ui'
import { computed } from 'vue'
import type { BulkResult } from '../lib/api'
import UserDetailsTable from './UserDetailsTable.vue'

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
</script>

<template>
  <Slideover v-model:open="open" :title="title" :description="description">
    <template #body>
      <div class="flex flex-col gap-6">
        <div v-if="withPasswords.length" class="flex flex-col gap-3">
          <p class="text-sm">
            Give each person their new password securely: print or download them now. They’re shown only once: once you
            close this, they’re gone.
          </p>
          <UserDetailsTable :results="withPasswords" title="New passwords" />
        </div>
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
