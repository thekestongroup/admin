<script setup lang="ts">
import { Button, type ButtonStatus, Card, Checkbox, EmptyState, Spinner, useNotifications } from '@thekestongroup/ui'
import { computed, onMounted, ref, watch } from 'vue'
import { api, type Product } from '../lib/api'

/**
 * The Keston products someone has a licence for, on their page. Without
 * one, they can't sign in to that product. Editable with "Assign licences".
 */
const props = defineProps<{ orgId: string; userId: string; name: string; canEdit: boolean }>()
const licences = defineModel<string[]>({ required: true })
const { notify } = useNotifications()

const products = ref<Product[]>()
const loadError = ref<string>()
const chosen = ref<string[]>([...licences.value])
const status = ref<ButtonStatus>('idle')

onMounted(async () => {
  try {
    products.value = await api.products(props.orgId)
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
})
watch(licences, (v) => (chosen.value = [...v]))

const changed = computed(() => [...chosen.value].sort().join() !== [...licences.value].sort().join())

function toggle(id: string, on: boolean) {
  chosen.value = on ? [...chosen.value, id] : chosen.value.filter((l) => l !== id)
}

async function save() {
  status.value = 'loading'
  try {
    licences.value = (await api.setLicences(props.orgId, props.userId, chosen.value)).licences
    status.value = 'success'
  } catch (e) {
    status.value = 'idle'
    notify({ type: 'error', title: 'Couldn’t save the licences', description: e instanceof Error ? e.message : String(e) })
  }
}
</script>

<template>
  <Card title="Licences" :description="`The Keston products ${name} can use. Without a licence, they can’t sign in to it.`">
    <EmptyState v-if="loadError" size="sm" title="Couldn’t load the products" :description="loadError" class="p-0" />
    <div v-else-if="!products" class="flex justify-center py-6"><Spinner label="Loading" /></div>
    <EmptyState v-else-if="!products.length" size="sm" title="No products yet" class="p-0" />
    <fieldset v-else class="flex flex-col gap-3">
      <legend class="sr-only">Licences</legend>
      <Checkbox
        v-for="p in products"
        :key="p.id"
        :model-value="chosen.includes(p.id)"
        :label="p.name"
        :description="`By ${p.publisher}`"
        :disabled="!canEdit"
        @update:model-value="toggle(p.id, !!$event)"
      />
    </fieldset>
    <template v-if="canEdit && products?.length" #footer>
      <Button
        variant="primary"
        v-model:status="status"
        :disabled="!changed && status === 'idle'"
        loading-text="Saving"
        success-text="Saved"
        @click="save"
      >
        Save licences
      </Button>
    </template>
  </Card>
</template>
