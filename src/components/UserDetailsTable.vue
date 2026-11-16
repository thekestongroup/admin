<script setup lang="ts">
import { Download, Printer } from '@lucide/vue'
import { Button, Card, Link, Table, type TableColumn } from '@thekestongroup/ui'
import { computed, ref } from 'vue'
import type { BulkResult } from '../lib/api'
import { downloadUserDetails, printUserDetails } from '../lib/csv'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

/**
 * New (or reset) accounts' details to hand out: name, email and, when each
 * has their own, password, hidden until "Show". Print and download them.
 */
const props = defineProps<{
  results: BulkResult[]
  /** The card's title, and the printout's heading. */
  title: string
  description?: string
}>()

const withPasswords = computed(() => props.results.some((r) => r.password))
const shown = ref(false)
const columns = computed<TableColumn<BulkResult>[]>(() => [
  { key: 'name', label: t('common.name'), rowHeader: true },
  { key: 'email', label: t('common.email') },
  ...(withPasswords.value ? [{ key: 'password', label: t('password.label') }] : []),
])
</script>

<template>
  <Card :title="title" :description="description" padding="none">
    <template #actions>
      <div class="flex flex-wrap gap-2">
        <Button size="sm" @click="printUserDetails(results, title)">
          <template #leading><Printer /></template>
          {{ t('userDetails.print') }}
        </Button>
        <Button size="sm" @click="downloadUserDetails(results)">
          <template #leading><Download /></template>
          {{ t('userDetails.download') }}
        </Button>
      </div>
    </template>
    <Table inset :columns="columns" :rows="results" :row-key="(_r: BulkResult, i: number) => i" size="sm" :caption="title">
      <template #header-password>
        <span class="inline-flex items-center gap-2">
          {{ t('password.label') }}
          <Link as="button" class="font-normal" :aria-pressed="shown" @click="shown = !shown">{{ shown ? t('common.hide') : t('common.show') }}</Link>
        </span>
      </template>
      <template #cell-password="{ row }">
        <span v-if="shown" class="font-mono select-all">{{ row.password }}</span>
        <span v-else :aria-label="t('userDetails.hidden')">••••••••</span>
      </template>
    </Table>
  </Card>
</template>
