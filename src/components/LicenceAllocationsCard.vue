<script setup lang="ts">
import { Button, type ButtonStatus, Card, EmptyState, InputNumber, RadioGroup, Spinner, useNotifications } from '@thekestongroup/ui'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { api, type Product } from '../lib/api'
import { availability } from '../lib/licences'

const { t } = useI18n()

/**
 * How many licences an organisation has for each Keston product: unlimited
 * or a number of seats. TKG Admins edit them (Keston ID refuses anyone
 * else); the organisation's own admins see them and their use, read-only.
 * Seats can go below the licences in use: the organisation is then over its
 * allocation and can't assign more until it's under.
 */
const props = defineProps<{ orgId: string; canEdit: boolean }>()
const { notify } = useNotifications()

type Row = { mode: 'unlimited' | 'seats'; seats?: number }
const products = ref<Product[]>()
const rows = ref<Record<string, Row>>({})
const loadError = ref<string>()
const status = ref<ButtonStatus>('idle')

function load(list: Product[]) {
  products.value = list
  rows.value = Object.fromEntries(list.map((p) => [p.id, { mode: p.unlimited ? 'unlimited' : 'seats', seats: p.seats ?? undefined } as Row]))
}

onMounted(async () => {
  try {
    load(await api.products(props.orgId))
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
})

const modes = computed(() => [
  { label: t('licences.allocations.unlimited'), value: 'unlimited' },
  { label: t('licences.allocations.seatLimit'), value: 'seats' },
])
const seatsOf = (r: Row) => (r.mode === 'unlimited' ? null : (r.seats ?? 0))
const changed = computed(() => !!products.value?.some((p) => (seatsOf(rows.value[p.id]!) ?? null) !== p.seats))

async function save() {
  status.value = 'loading'
  try {
    load(await api.setAllocations(props.orgId, products.value!.map((p) => ({ product: p.id, seats: seatsOf(rows.value[p.id]!) }))))
    status.value = 'success'
  } catch (e) {
    status.value = 'idle'
    notify({ type: 'error', title: t('licences.allocations.couldntSave'), description: e instanceof Error ? e.message : String(e) })
  }
}
</script>

<template>
  <Card
    :title="t('licences.allocations.title')"
    :description="canEdit ? t('licences.allocations.description') : t('licences.allocations.readOnlyDescription')"
  >
    <EmptyState v-if="loadError" size="sm" :title="t('licences.couldntLoad')" :description="loadError" class="p-0" />
    <div v-else-if="!products" class="flex justify-center py-6"><Spinner :label="t('common.loading')" /></div>
    <EmptyState v-else-if="!products.length" size="sm" :title="t('licences.none')" class="p-0" />
    <ul v-else-if="!canEdit" class="flex flex-col divide-y divide-black/15">
      <li v-for="p in products" :key="p.id" class="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
        <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span class="font-bold">{{ p.name }}</span>
          <span class="text-sm">{{ availability(t, p) }}</span>
        </div>
        <span class="text-sm text-black/65">{{ t('licences.allocations.inUse', p.assigned) }}</span>
        <span v-if="p.overAllocated" class="text-sm text-red" role="alert">
          {{ t('licences.allocations.overAllocated', { used: p.assigned, seats: p.seats ?? 0 }) }}
        </span>
      </li>
    </ul>
    <div v-else class="flex flex-col gap-6">
      <div v-for="p in products" :key="p.id" class="flex flex-col gap-3">
        <RadioGroup
          v-model="rows[p.id]!.mode"
          :label="p.name"
          :helper="t('licences.allocations.inUse', p.assigned)"
          :options="modes"
        />
        <InputNumber
          v-if="rows[p.id]!.mode === 'seats'"
          v-model="rows[p.id]!.seats"
          :label="t('licences.allocations.seats', { name: p.name })"
          :min="0"
          :status="p.overAllocated ? 'error' : undefined"
          :status-text="p.overAllocated ? t('licences.allocations.overAllocated', { used: p.assigned, seats: p.seats ?? 0 }) : undefined"
          class="max-w-48"
        />
      </div>
    </div>
    <template v-if="products?.length && canEdit" #footer>
      <Button variant="primary" v-model:status="status" :disabled="!changed && status === 'idle'" :loading-text="t('common.saving')" :success-text="t('common.saved')" @click="save">
        {{ t('licences.save') }}
      </Button>
    </template>
  </Card>
</template>
